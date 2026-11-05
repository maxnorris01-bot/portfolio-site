import assert from 'node:assert/strict'
import { after, afterEach, beforeEach, mock, test } from 'node:test'
import type { ComponentType } from 'react'
import { createShopClient } from '../src/shop/api.ts'
import { answersToPost, chosen, clarifyReduce, expectsPicture, NO_PREFERENCE, panelLocked, panelVisible, type ClarifyUi } from '../src/shop/clarify.ts'
import { ANSWER_DEBOUNCE_MS, ShopController } from '../src/shop/controller.ts'
import {
  CLARIFY_CHIP_PREFIX,
  CLARIFY_CLOSED,
  CLARIFY_FAILED,
  CLARIFY_NO_PREFERENCE,
  CLARIFY_SUB,
  CLARIFY_SUBMIT,
  CLARIFY_TITLE,
  PIPELINE_STAGES,
} from '../src/shop/copy.ts'
import { fixtureBundles, fixtureStates, fixtureView, makeClarify } from '../src/shop/fixtures.ts'
import { JobPoller, PICTURE_TAIL_POLLS, type PollHandlers } from '../src/shop/poller.ts'
import { shopReducer, type ShopState } from '../src/shop/state.ts'
import type { Clarify, JobStatus, SessionView } from '../src/shop/types.ts'
import type { ShopViewProps } from '../src/shop/viewprops.ts'
import { closeServer, loadModule, render } from './helpers/ssr.ts'

after(closeServer)
beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
  })
})
afterEach(() => {
  mock.timers.reset()
  Reflect.deleteProperty(globalThis, 'sessionStorage')
})

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const ui = (o: Parameters<typeof makeClarify>[0] = {}, selected: ClarifyUi['selected'] = {}): ClarifyUi => ({ server: makeClarify(o), selected, submitted: o.submitted ?? false, note: null })
const flush = async (ms = 0) => {
  mock.timers.tick(ms)
  for (let i = 0; i < 14; i++) await Promise.resolve()
}

// ---- types and parsing ----

test('the contract shape parses: a job with clarify, and old payloads without it still work', async () => {
  const c = makeClarify({ answers: [{ question_id: 'q_color', option_value: 'cream' }] })
  const job: JobStatus = { state: 'running', phase: 'search', steps: [], clarify: c }
  assert.equal(job.state === 'running' && job.clarify?.questions.length, 5)
  assert.deepEqual(Object.keys(c).sort(), ['answers', 'applied', 'deadline', 'no_preference_value', 'pictures_state', 'questions', 'state', 'submitted'])
  assert.deepEqual(Object.keys(c.deadline).sort(), ['idle_grace_s', 'max_wait_s', 'seconds_left', 'shown_s_ago', 'waiting'])
  const old: JobStatus = JSON.parse('{"state":"running","phase":"search","steps":[]}')
  assert.equal((old as { clarify?: Clarify }).clarify, undefined)
  assert.equal(makeClarify({ state: 'failed' }).questions.length, 0, 'questions are [] unless ready')
  assert.ok(makeClarify().questions.some((q) => q.options.some((o) => o.picture_url === null)), 'a null picture_url is in the fixtures')
})

test('postAnswers posts the contract body to /job/{id}/answers and returns the clarify object', async () => {
  const calls: { url: string; body: unknown }[] = []
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)) })
    return json({ clarify: makeClarify({ submitted: true }) })
  }) as typeof fetch
  const out = await createShopClient(fn).postAnswers('job 1', [{ question_id: 'q_color', option_value: 'cream' }], true, 'sess')
  assert.equal(calls[0].url, '/api/shop/job/job%201/answers')
  assert.deepEqual(calls[0].body, { answers: [{ question_id: 'q_color', option_value: 'cream' }], submit: true, session_id: 'sess' })
  assert.equal(out.clarify.submitted, true)
  await createShopClient(fn).postAnswers('j', [], false, null)
  assert.deepEqual(calls[1].body, { answers: [], submit: false }, 'no session id when there is none')
})

// ---- clarify state ----

test('server answers show until the visitor touches a question; a local choice wins; null is a local clear', () => {
  const u = ui({ answers: [{ question_id: 'q_color', option_value: 'cream' }] })
  assert.equal(chosen(u, 'q_color'), 'cream')
  assert.equal(chosen(u, 'q_style'), null)
  const picked = clarifyReduce(u, { type: 'select', id: 'q_color', value: 'navy' }) as ClarifyUi
  assert.equal(chosen(picked, 'q_color'), 'navy')
  const cleared = clarifyReduce(picked, { type: 'select', id: 'q_color', value: null }) as ClarifyUi
  assert.equal(chosen(cleared, 'q_color'), null)
  const refreshed = clarifyReduce(cleared, { type: 'server', clarify: makeClarify({ answers: [{ question_id: 'q_color', option_value: 'cream' }] }) }) as ClarifyUi
  assert.equal(chosen(refreshed, 'q_color'), null, 'a poll does not undo a local clear')
})

test('answers to post: every chosen question; a cleared one the server holds goes as no_preference; one it never had is left out', () => {
  const u = ui({ answers: [{ question_id: 'q_color', option_value: 'cream' }] }, { q_color: null, q_style: 'modern', q_shape: NO_PREFERENCE, q_size: null })
  assert.deepEqual(answersToPost(u, new Set()), [
    { question_id: 'q_color', option_value: NO_PREFERENCE },
    { question_id: 'q_shape', option_value: NO_PREFERENCE },
    { question_id: 'q_style', option_value: 'modern' },
  ].sort((a, b) => ['q_color', 'q_material', 'q_shape', 'q_style', 'q_size'].indexOf(a.question_id) - ['q_color', 'q_material', 'q_shape', 'q_style', 'q_size'].indexOf(b.question_id)))
  assert.deepEqual(answersToPost(ui({}, { q_size: null }), new Set(['q_size'])), [{ question_id: 'q_size', option_value: NO_PREFERENCE }], 'a cleared answer already posted is taken back')
})

test('the panel shows for ready questions only, and locks when applied, submitted or closed', () => {
  assert.equal(panelVisible(ui()), true)
  for (const state of ['pending', 'skipped', 'failed'] as const) assert.equal(panelVisible(ui({ state })), false, state)
  assert.equal(panelVisible(null), false)
  assert.equal(panelLocked(ui()), false)
  assert.equal(panelLocked(ui({ applied: true })), true)
  assert.equal(panelLocked(ui({ submitted: true })), true)
  assert.equal(panelLocked({ ...ui(), note: 'closed' }), true)
  assert.equal(panelLocked({ ...ui(), note: 'failed' }), false, 'a failed post leaves the tiles usable')
})

test('picture areas are reserved while pictures are pending, afterwards only for options that have one', () => {
  assert.equal(expectsPicture(makeClarify({ pictures: 'pending' }), null), true)
  assert.equal(expectsPicture(makeClarify({ pictures: 'done' }), null), false)
  assert.equal(expectsPicture(makeClarify({ pictures: 'done' }), 'https://x/y.jpg'), true)
})

test('the reducer keeps clarify on a search, ignores it on a Shop Again, and a new search clears it', () => {
  const running = (kind: 'search' | 'shop_again'): ShopState => ({ status: 'running', request: 'x', kind, batch: 1, steps: [], phase: '', startedAt: 0, slow: false, prev: null, clarify: null })
  const action = { type: 'clarify', action: { type: 'server', clarify: makeClarify() } } as const
  const s = shopReducer(running('search'), action)
  assert.ok(s.status === 'running' && s.clarify?.server.state === 'ready')
  const again = shopReducer(running('shop_again'), action)
  assert.ok(again.status === 'running' && !again.clarify)
  const next = shopReducer(s, { type: 'submit', request: 'y', kind: 'search', batch: 1, now: 0 })
  assert.ok(next.status === 'running' && next.clarify === null)
  assert.equal(shopReducer({ status: 'idle', restoring: false }, action).status, 'idle')
})

// ---- the poller ----

function pollerSetup(script: (n: number) => JobStatus) {
  const log: string[] = []
  let n = 0
  const poller = new JobPoller({ pollJob: async () => script(++n) })
  const handlers: PollHandlers = {
    onProgress: () => log.push('progress'),
    onDone: () => log.push('done'),
    onError: (e) => log.push(`error:${e.code}`),
    onSlow: () => log.push('slow'),
    onClarify: (c) => log.push(`clarify:${c.state}/${c.pictures_state}`),
  }
  return { poller, log, handlers, polls: () => n }
}
const run = (clarify?: Clarify): JobStatus => ({ state: 'running', phase: 'search', steps: [], ...(clarify ? { clarify } : {}) })

test('poller: every poll with clarify reaches onClarify; without it nothing changes', async () => {
  const a = pollerSetup((n) => (n < 3 ? run(makeClarify({ pictures: n === 1 ? 'pending' : 'done' })) : { state: 'done', result: fixtureView }))
  a.poller.start('j', null, a.handlers)
  for (let i = 0; i < 6; i++) await flush(1000)
  assert.deepEqual(a.log, ['clarify:ready/pending', 'progress', 'clarify:ready/done', 'progress', 'done'])
  const b = pollerSetup((n) => (n < 3 ? run() : { state: 'done', result: fixtureView }))
  b.poller.start('j', null, b.handlers)
  for (let i = 0; i < 6; i++) await flush(1000)
  assert.deepEqual(b.log, ['progress', 'progress', 'done'])
  assert.equal(b.polls(), 3)
})

test('poller: after the job is done it keeps polling while pictures are pending, then stops', async () => {
  const s = pollerSetup((n) => ({ state: 'done', result: fixtureView, clarify: makeClarify({ applied: true, pictures: n < 4 ? 'pending' : 'done' }) }))
  s.poller.start('j', null, s.handlers)
  for (let i = 0; i < 10; i++) await flush(1000)
  assert.equal(s.polls(), 4)
  assert.equal(s.log.filter((l) => l === 'done').length, 1, 'the result is delivered once, at the first done')
  assert.equal(s.log[0], 'clarify:ready/pending')
})

test('poller: the picture tail is bounded', async () => {
  const s = pollerSetup(() => ({ state: 'done', result: fixtureView, clarify: makeClarify({ applied: true, pictures: 'pending' }) }))
  s.poller.start('j', null, s.handlers)
  for (let i = 0; i < PICTURE_TAIL_POLLS + 6; i++) await flush(1000)
  assert.equal(s.polls(), PICTURE_TAIL_POLLS + 1)
})

test('poller: a done job without pending pictures stops at once (stop conditions unchanged)', async () => {
  const s = pollerSetup(() => ({ state: 'done', result: fixtureView, clarify: makeClarify({ applied: true }) }))
  s.poller.start('j', null, s.handlers)
  for (let i = 0; i < 4; i++) await flush(1000)
  assert.equal(s.polls(), 1)
})

// ---- the controller ----

type Call = { method: string; path: string; body: Record<string, unknown> | null }
function setup(opts: { clarify?: Clarify | (() => Clarify); answers?: (c: Call) => Response | Promise<Response>; view?: SessionView; hold?: boolean }) {
  const calls: Call[] = []
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://x')
    const path = url.pathname.replace('/api/shop', '')
    const call: Call = { method: init?.method ?? 'GET', path, body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null }
    calls.push(call)
    if (path === '/search' || path === '/shop-again') return json({ job_id: 'j1' }, 202)
    if (path === '/job/j1/answers') return opts.answers ? opts.answers(call) : json({ clarify: makeClarify({ answers: (call.body?.answers as Clarify['answers']) ?? [], submitted: call.body?.submit === true }) })
    if (path === '/job/j1') {
      const clarify = typeof opts.clarify === 'function' ? opts.clarify() : opts.clarify
      return opts.hold ? json({ state: 'running', phase: 'search', steps: [], ...(clarify ? { clarify } : {}) }) : json({ state: 'done', result: opts.view ?? fixtureView, ...(clarify ? { clarify } : {}) })
    }
    if (path === '/refine/remove') return json({ refine: [], clarify_answers: [] })
    if (path === '/auth/session') return json({ authenticated: true })
    throw new Error(`no route ${path}`)
  }) as typeof fetch
  return { controller: new ShopController(createShopClient(fetchFn)), calls }
}
const answerCalls = (calls: Call[]) => calls.filter((c) => c.path === '/job/j1/answers')
const asking = async (t: ReturnType<typeof setup>) => {
  void t.controller.search('modern couch under $1000')
  for (let i = 0; i < 6; i++) await flush(1000)
  const s = t.controller.getState()
  assert.ok(s.status === 'running' && panelVisible(s.clarify), 'the questions are showing')
}
const uiOf = (t: ReturnType<typeof setup>) => {
  const s = t.controller.getState()
  assert.equal(s.status, 'running')
  return (s as Extract<ShopState, { status: 'running' }>).clarify as ClarifyUi
}

test('controller: questions from a poll are shown while the search runs', async () => {
  const t = setup({ clarify: makeClarify({ pictures: 'pending', text: true }), hold: true })
  await asking(t)
  assert.equal(uiOf(t).server.pictures_state, 'pending')
})

test('controller: rapid clicks are sent together after a pause, and the last choice wins', async () => {
  const t = setup({ clarify: makeClarify(), hold: true })
  await asking(t)
  t.controller.selectAnswer('q_color', 'cream')
  t.controller.selectAnswer('q_color', 'navy')
  t.controller.selectAnswer('q_style', 'modern')
  await flush(ANSWER_DEBOUNCE_MS - 10)
  assert.equal(answerCalls(t.calls).length, 0, 'nothing is sent mid-burst')
  await flush(20)
  assert.equal(answerCalls(t.calls).length, 1)
  assert.deepEqual(answerCalls(t.calls)[0].body, {
    answers: [{ question_id: 'q_color', option_value: 'navy' }, { question_id: 'q_style', option_value: 'modern' }],
    submit: false,
  })
})

test('controller: a click while a post is in flight is sent after it (one request at a time)', async () => {
  let release: (r: Response) => void = () => {}
  let n = 0
  const t = setup({ clarify: makeClarify(), hold: true, answers: (c) => (++n === 1 ? new Promise<Response>((r) => (release = r)) : json({ clarify: makeClarify({ answers: c.body?.answers as Clarify['answers'] }) })) })
  await asking(t)
  t.controller.selectAnswer('q_color', 'cream')
  await flush(ANSWER_DEBOUNCE_MS + 10)
  t.controller.selectAnswer('q_color', 'navy')
  await flush(ANSWER_DEBOUNCE_MS + 10)
  assert.equal(answerCalls(t.calls).length, 1, 'the second waits for the first')
  release(json({ clarify: makeClarify({ answers: [{ question_id: 'q_color', option_value: 'cream' }] }) }))
  await flush(0)
  assert.equal(answerCalls(t.calls).length, 2)
  assert.deepEqual(answerCalls(t.calls)[1].body?.answers, [{ question_id: 'q_color', option_value: 'navy' }])
  assert.equal(chosen(uiOf(t), 'q_color'), 'navy')
})

test('controller: choosing again clears it (no_preference is sent to take back what was sent); Show results sends submit now', async () => {
  const t = setup({ clarify: makeClarify(), hold: true })
  await asking(t)
  t.controller.selectAnswer('q_color', 'cream')
  await flush(ANSWER_DEBOUNCE_MS + 10)
  t.controller.selectAnswer('q_color', null)
  await flush(ANSWER_DEBOUNCE_MS + 10)
  assert.deepEqual(answerCalls(t.calls).at(-1)?.body?.answers, [{ question_id: 'q_color', option_value: NO_PREFERENCE }])
  await t.controller.submitAnswers()
  const last = answerCalls(t.calls).at(-1)
  assert.equal(last?.body?.submit, true)
  assert.equal(uiOf(t).submitted, true)
  t.controller.selectAnswer('q_style', 'modern')
  await flush(ANSWER_DEBOUNCE_MS + 10)
  assert.equal(answerCalls(t.calls).length, 3, 'after Show results the tiles are locked')
})

test('controller: a failed post never breaks the search: a quiet note, the choice stays, and Retry sends it again', async () => {
  let n = 0
  const t = setup({ clarify: makeClarify(), hold: true, answers: (c) => (++n === 1 ? json({ error: { code: 'server_error', message: 'x' } }, 500) : json({ clarify: makeClarify({ answers: c.body?.answers as Clarify['answers'] }) })) })
  await asking(t)
  t.controller.selectAnswer('q_color', 'cream')
  await flush(ANSWER_DEBOUNCE_MS + 10)
  assert.equal(uiOf(t).note, 'failed')
  assert.equal(chosen(uiOf(t), 'q_color'), 'cream')
  assert.equal(t.controller.getState().status, 'running', 'the search is still running')
  await t.controller.retryAnswers()
  assert.equal(uiOf(t).note, null)
  assert.equal(answerCalls(t.calls).length, 2)
})

test('controller: 409 closes the panel quietly, 429 stops posting but keeps the choice, 400 is a quiet note', async () => {
  const statuses = new Map([[409, 'closed'], [429, 'limit'], [400, 'failed']] as const)
  for (const [status, note] of statuses) {
    const t = setup({ clarify: makeClarify(), hold: true, answers: () => json({ error: { code: 'bad_request', message: 'x' } }, status) })
    await asking(t)
    t.controller.selectAnswer('q_color', 'cream')
    await flush(ANSWER_DEBOUNCE_MS + 10)
    assert.equal(uiOf(t).note, note, String(status))
    assert.equal(chosen(uiOf(t), 'q_color'), 'cream')
    if (status === 429) {
      t.controller.selectAnswer('q_style', 'modern')
      await flush(ANSWER_DEBOUNCE_MS + 10)
      assert.equal(answerCalls(t.calls).length, 1, 'no more posts after the limit')
      assert.equal(chosen(uiOf(t), 'q_style'), 'modern')
    }
  }
  const t = setup({ clarify: makeClarify(), hold: true, answers: () => json({ error: { code: 'not_found', message: 'x' } }, 409) })
  await asking(t)
  t.controller.selectAnswer('q_color', 'cream')
  await flush(ANSWER_DEBOUNCE_MS + 10)
  assert.equal(panelLocked(uiOf(t)), true)
})

test('controller: a new search resets the questions and the answer queue; a Shop Again shows none', async () => {
  const t = setup({ clarify: makeClarify(), hold: true })
  await asking(t)
  t.controller.selectAnswer('q_color', 'cream')
  void t.controller.search('boho curtains')
  await flush(ANSWER_DEBOUNCE_MS + 10)
  assert.equal(answerCalls(t.calls).length, 0, 'the old pending post was dropped')
  const s = t.controller.getState()
  assert.ok(s.status === 'running' && (!s.clarify || s.clarify.selected.q_color === undefined))
  const t2 = setup({ clarify: makeClarify(), view: { ...fixtureView, session_id: 'fixture-session' } })
  void t2.controller.search('x')
  for (let i = 0; i < 4; i++) await flush(1000)
  assert.equal(t2.controller.getState().status, 'done')
  void t2.controller.shopAgain('')
  await flush(0)
  const again = t2.controller.getState()
  assert.ok(again.status !== 'running' || !again.clarify)
})

test('controller: with no clarify object (flag off) nothing is posted and the search finishes as before', async () => {
  const t = setup({})
  void t.controller.search('modern couch')
  for (let i = 0; i < 4; i++) await flush(1000)
  assert.equal(t.controller.getState().status, 'done')
  t.controller.selectAnswer('q_color', 'cream')
  await t.controller.submitAnswers()
  assert.equal(answerCalls(t.calls).length, 0)
})

test('controller: deleting an answer chip posts answer:<qid> to /refine/remove and updates the chips', async () => {
  const t = setup({ view: { ...fixtureView, clarify_answers: [{ id: 'answer:q_color', question: 'Which colour do you like?', label: 'Cream', dimension: 'color' }] } })
  void t.controller.search('x')
  for (let i = 0; i < 4; i++) await flush(1000)
  await t.controller.removeRefine('answer:q_color')
  assert.deepEqual(t.calls.find((c) => c.path === '/refine/remove')?.body, { session_id: 'fixture-session', id: 'answer:q_color' })
  const s = t.controller.getState()
  assert.ok(s.status === 'done')
  assert.deepEqual(s.view.clarify_answers, [])
})

// ---- the view ----

const noop = () => {}
const props = (state: ShopViewProps['state'], over: Partial<ShopViewProps> = {}): ShopViewProps => ({
  state, value: '', onChange: noop, onSubmit: noop, onExample: noop, onRetry: noop, refineText: '', onRefineChange: noop, onShopAgain: noop,
  onRate: noop, onComment: noop, onCommentBlur: noop, onRetryRating: noop, onRemoveRefine: noop, onRemoveContext: noop,
  onAnswer: noop, onSubmitAnswers: noop, onRetryAnswers: noop,
  meta: { usage: null, blocked: { search: false, again: false }, maintenance: false },
  savedOpen: true, onToggleSaved: noop, savedTab: 'love', onSavedTab: noop, onResolve: async () => null, ...over,
})
const view = async (key: string, over: Partial<ShopViewProps> = {}) => {
  const { default: View } = await loadModule<{ default: ComponentType<ShopViewProps> }>('/src/shop/ShopView.tsx')
  return render(View, props(fixtureBundles[key].state, { meta: fixtureBundles[key].meta, ...over }))
}

test('view: questions pending, skipped and failed show nothing new (the steps stay)', async () => {
  for (const key of ['askpending', 'askskipped', 'askfailed']) {
    const html = await view(key)
    assert.ok(!html.includes('class="clarify'), key)
    assert.ok(!html.includes(CLARIFY_TITLE), key)
    assert.match(html, /class="shop-steps"/, key)
  }
})

test('view: the ready panel has the heading, the sub-line, a card per question, the steps above it and the Show results button', async () => {
  const html = await view('asktext')
  assert.ok(html.includes(`>${CLARIFY_TITLE}</h2>`))
  assert.ok(html.includes(CLARIFY_SUB))
  assert.equal(html.match(/class="card clarify-q"/g)?.length, 5)
  assert.ok(html.indexOf('shop-steps') < html.indexOf('class="clarify'), 'the progress steps stay above the questions')
  assert.match(html, new RegExp(`<button type="button" class="btn btn-primary clarify-submit">${CLARIFY_SUBMIT}</button>`))
  assert.equal(CLARIFY_SUBMIT, 'Show results')
  assert.equal(CLARIFY_NO_PREFERENCE, 'No preference')
  assert.equal(html.match(new RegExp(`>${CLARIFY_NO_PREFERENCE}</button>`, 'g'))?.length, 5, 'a No preference chip per question')
})

test('view: while pictures are pending every tile reserves its picture area and none has an image; when done only picture tiles do', async () => {
  const pending = await view('asktext')
  assert.equal(pending.match(/class="clarify-pic"/g)?.length, 15, 'all 15 options reserve the area')
  assert.ok(!/<img[^>]*clarify|clarify-pic"[^>]*><img/.test(pending))
  const done = await view('askpics')
  const imgs = done.match(/<img src="data:image\/svg\+xml[^"]*" alt="[^"]+"/g) ?? []
  assert.equal(imgs.length, 11, 'the eleven options with a picture show it')
  assert.equal(done.match(/class="clarify-tile has-pic/g)?.length, 11)
  assert.equal(done.match(/class="clarify-tile(?: is-on)?"/g)?.length, 4, 'text-only tiles are compact (no picture area)')
  assert.ok(done.includes('alt="Cream"'), 'the alt text is the option label')
  assert.doesNotMatch(done, /loading="lazy"[^>]*clarify|clarify[^>]*loading="lazy"/)
  assert.doesNotMatch(done.slice(done.indexOf('class="clarify')), /loading="lazy"/, 'pictures are visible at once: no lazy loading')
})

test('view: a11y: a radio group per question named by its heading, checked state, roving tab stop, a polite live region, labelled section', async () => {
  const html = await view('askpartial')
  assert.equal(html.match(/role="radiogroup"/g)?.length, 5)
  assert.match(html, /<h3 id="([^"]+)" class="clarify-q-title">Which colour do you like\?<\/h3><div class="clarify-options" role="radiogroup" aria-labelledby="\1"/)
  assert.ok(html.includes('role="radio" aria-checked="true"'), 'the chosen option is checked')
  assert.match(html, /<section class="clarify[^"]*" aria-labelledby="[^"]+"/)
  assert.match(html, /role="status" aria-live="polite">5 quick questions are ready below/)
  const colour = html.slice(html.indexOf('Which colour do you like?'), html.indexOf('What should it be made of?'))
  assert.equal(colour.match(/tabindex="0"/g)?.length, 1, 'one tab stop in a group')
  assert.match(colour, /aria-checked="true" tabindex="0"[^>]*class="clarify-tile is-on[^"]*"[^>]*><span class="clarify-pic"[^>]*>(?:<img[^>]*>)?<\/span><span class="clarify-label">Walnut or brown/)
  const style = html.slice(html.indexOf('Which look do you prefer?'), html.indexOf('How big should it be?'))
  assert.match(style, /class="chip clarify-nopref is-on"/, 'no_preference from the server shows on the chip')
})

test('view: submitted and closed lock the tiles and say so quietly', async () => {
  const sub = await view('asksubmitted')
  assert.match(sub, /class="btn btn-primary clarify-submit" disabled/)
  assert.ok(sub.includes('Thanks. Your results are on the way.'))
  assert.match(sub, /role="radio"[^>]*disabled/)
  const closed = await view('askclosed')
  assert.ok(closed.includes(CLARIFY_CLOSED))
  assert.match(closed, /role="radio"[^>]*disabled/)
})

test('view: a failed post shows a quiet note with a retry', async () => {
  const { default: View } = await loadModule<{ default: ComponentType<ShopViewProps> }>('/src/shop/ShopView.tsx')
  const base = fixtureStates.askpics as Extract<ShopState, { status: 'running' }>
  const html = render(View, props({ ...base, clarify: { ...(base.clarify as ClarifyUi), note: 'failed' } }))
  assert.ok(html.includes(CLARIFY_FAILED.replace('Try again, or skip it.', '')))
  assert.match(html, /class="shop-link">Try again<\/button>/)
})

test('view: results show the answers as deletable "You chose" chips next to the others, with the question as the tooltip', async () => {
  const html = await view('askchips')
  assert.ok(html.includes(`>${CLARIFY_CHIP_PREFIX}</p>`))
  assert.equal(CLARIFY_CHIP_PREFIX, 'You chose')
  assert.match(html, /<li class="chip shop-understood" title="Which colour do you like\?">Walnut or brown<button[^>]*aria-label="Remove Walnut or brown \(Which colour do you like\?\)"/)
  assert.ok(html.indexOf('What I understood') < html.indexOf(`>${CLARIFY_CHIP_PREFIX}</p>`) && html.indexOf(`>${CLARIFY_CHIP_PREFIX}</p>`) < html.indexOf('Your refinements'))
  assert.ok(!html.includes('class="clarify'), 'the panel is gone once results show')
  const none = await view('results')
  assert.ok(!none.includes(CLARIFY_CHIP_PREFIX), 'no clarify_answers (flag off): no new chips')
})

test('view: clicking a chip x asks to remove answer:<qid>', async () => {
  const removed: string[] = []
  const html = await view('askchips', { onRemoveRefine: (id) => removed.push(id) })
  assert.match(html, /shop-chip-x/)
  assert.equal(removed.length, 0)
})

test('view: the pipeline has six stages with Ask between Search and Tag, and the caption', async () => {
  const html = await view('empty')
  assert.deepEqual(PIPELINE_STAGES.map((s) => s.name), ['Request', 'Search', 'Ask', 'Tag', 'Rank', 'Results'])
  assert.equal(html.match(/class="card shop-stage"/g)?.length, 6)
  assert.ok(html.includes('<h4>Ask</h4><p>Up to five quick questions come from the first results, with a photo for each choice.</p>'))
  assert.ok(html.indexOf('<h4>Search</h4>') < html.indexOf('<h4>Ask</h4>') && html.indexOf('<h4>Ask</h4>') < html.indexOf('<h4>Tag</h4>'))
})

test('view: with the flag off (no clarify anywhere) a running search renders as before', async () => {
  const html = await view('running')
  assert.ok(!html.includes('clarify'))
})
