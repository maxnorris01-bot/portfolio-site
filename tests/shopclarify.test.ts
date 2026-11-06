import assert from 'node:assert/strict'
import { after, afterEach, beforeEach, mock, test } from 'node:test'
import type { ComponentType } from 'react'
import { createShopClient } from '../src/shop/api.ts'
import {
  ADVANCE_MS,
  answersToPost,
  choiceOutcome,
  chosen,
  clampStep,
  clarifyReduce,
  expectsPicture,
  firstUnanswered,
  nextStep,
  NO_PREFERENCE,
  panelLocked,
  panelVisible,
  picks,
  roveTo,
  SCROLL_BOTTOM_MARGIN,
  shouldAutoScroll,
  type ClarifyUi,
} from '../src/shop/clarify.ts'
import { ANSWER_DEBOUNCE_MS, ShopController } from '../src/shop/controller.ts'
import {
  CLARIFY_CHIP_PREFIX,
  CLARIFY_CLOSED,
  CLARIFY_FAILED,
  CLARIFY_NO_PREFERENCE,
  CLARIFY_PICKS_EMPTY,
  CLARIFY_PICKS_LABEL,
  CLARIFY_SIDE_NOTE,
  CLARIFY_SIDE_PROGRESS,
  CLARIFY_SUB,
  clarifyAny,
  CLARIFY_SUBMIT,
  CLARIFY_TITLE,
  PIPELINE_STAGES,
  STEP_LABELS,
  stepLabel,
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

test('view: the ready panel shows ONE question: heading, sub-line, "1 of 5", five dots, the steps above, Show results; no Back on question 1', async () => {
  const html = await view('askpics')
  assert.ok(html.includes(`>${CLARIFY_TITLE}</h2>`))
  assert.ok(html.includes(CLARIFY_SUB))
  assert.equal(html.match(/class="clarify-q-title"/g)?.length, 1, 'one question at a time')
  assert.ok(html.includes('Which colour do you like?') && !html.includes('What should it be made of?'))
  assert.match(html, /<span class="clarify-count">1 of 5<\/span>|<span class="clarify-count">1<!-- --> of <!-- -->5<\/span>/)
  assert.equal(html.match(/class="clarify-dot[^"]*" aria-label="Question \d of 5"/g)?.length, 5)
  assert.ok(html.includes('aria-label="Question 2 of 5"'))
  assert.equal(html.match(/aria-current="step"/g)?.length, 1 + 0 + (html.match(/shop-step is-active/g)?.length ?? 0), 'one current dot (plus the active progress step)')
  assert.ok(html.indexOf('shop-steps') < html.indexOf('class="card clarify'), 'the progress steps stay above the questions')
  assert.match(html, /class="clarify-back is-hidden" disabled=""/)
  assert.match(html, new RegExp(`<button type="button" class="btn btn-primary clarify-submit">${CLARIFY_SUBMIT}</button>`))
  assert.equal(CLARIFY_SUBMIT, 'Show results')
  assert.equal(CLARIFY_NO_PREFERENCE, 'No preference')
  assert.equal(html.match(new RegExp(`>${CLARIFY_NO_PREFERENCE}</button>`, 'g'))?.length, 1, 'one No preference chip (for the visible question)')
  assert.ok(!html.includes('clarify-grid') && !html.includes('clarify-q"'), 'the grid of cards is gone')
})

test('view: pending pictures show a quiet skeleton with the label below and no image; done shows pictures, and a null picture becomes a text tile', async () => {
  const pending = await view('asktext')
  assert.equal(pending.match(/class="clarify-pic is-pending"/g)?.length, 4)
  assert.ok(!pending.includes('<img'))
  assert.equal(pending.match(/<span class="clarify-label">/g)?.length, 4, 'labels below the picture area')
  const done = await view('askpics')
  const imgs = done.match(/<img src="data:image\/svg\+xml[^"]*" alt="[^"]+"/g) ?? []
  assert.equal(imgs.length, 4)
  assert.ok(done.includes('alt="Cream"'), 'the alt text is the option label')
  assert.ok(!done.includes('is-text'))
  const mixed = await view('askmixed')
  assert.equal((mixed.match(/<img src="data:image/g) ?? []).length, 3, 'three picture options')
  assert.match(mixed, /<span class="clarify-pic is-text"><span class="clarify-label">Leather<\/span><\/span>/, 'the text-only option puts its label inside the picture area')
  assert.doesNotMatch(mixed.slice(mixed.indexOf('class="card clarify')), /loading="lazy"/, 'pictures are visible at once: no lazy loading')
  assert.match(mixed, /style="--clarify-n:4"/)
})

test('view: the mixed fixture has one text-only option among pictures, and a question with two options', () => {
  const c = makeClarify({ mixed: true })
  assert.equal(c.questions[0].options.filter((o) => o.picture_url === null).length, 1)
  assert.equal(c.questions[0].options.length, 4)
  assert.equal(c.questions[1].options.length, 2)
  assert.ok('askmixed' in fixtureStates)
})

test('view: partial answers: the first question without an answer shows (question 3), the answered dots are filled, back is available', async () => {
  const html = await view('askpartial')
  assert.ok(html.includes('Which shape do you want?') && !html.includes('Which colour do you like?'))
  assert.match(html, /clarify-count">3(?:<!-- -->)? of (?:<!-- -->)?5</)
  assert.equal(html.match(/clarify-dot is-answered/g)?.length, 2)
  assert.equal(html.match(/clarify-dot is-current/g)?.length, 1)
  assert.match(html, /class="clarify-back"(?! disabled)/)
  assert.ok(!html.includes('clarify-back is-hidden'))
})

test('view: a11y: radio group named by the question, roving tab stop, focusable heading, polite announcement, labelled section, dot names', async () => {
  const html = await view('askpartial')
  assert.equal(html.match(/role="radiogroup"/g)?.length, 1)
  assert.match(html, /<h3 id="([^"]+)" tabindex="-1" class="clarify-q-title">Which shape do you want\?<\/h3><div class="clarify-options" role="radiogroup" aria-labelledby="\1"/)
  assert.match(html, /<section class="card clarify[^"]*" aria-labelledby="[^"]+"/)
  assert.match(html, /role="status" aria-live="polite">Question 3 of 5: Which shape do you want\?<\/p>|role="status" aria-live="polite">Question <!-- -->3<!-- --> of <!-- -->5<!-- -->: <!-- -->Which shape do you want\?/)
  assert.match(html, /role="status" aria-live="polite">5 quick questions are ready below/)
  const group = html.slice(html.indexOf('role="radiogroup"'), html.indexOf('clarify-foot'))
  assert.equal(group.match(/tabindex="0"/g)?.length, 1, 'one tab stop in the group')
  assert.equal(group.match(/role="radio"/g)?.length, 2)
  assert.match(html, /class="chip clarify-nopref" aria-pressed="false"/)
  assert.ok(html.includes('aria-label="Question 3 of 5"'))
  const chosenView = await view('askpartial')
  assert.ok(chosenView.includes('aria-current="step"'))
  const first = await view('askpics')
  assert.match(first, /role="radio" aria-checked="false" tabindex="0"/, 'with no choice the first tile is the tab stop')
})

test('view: the chosen no_preference shows on the chip', async () => {
  const html = render(
    (await loadModule<{ default: ComponentType<ShopViewProps> }>('/src/shop/ShopView.tsx')).default,
    props(fixtureStates.askpartial),
  )
  assert.ok(!html.includes('is-on'), 'question 3 has no answer yet')
  // everything answered: the panel opens on question 1, whose chip is on
  const { default: Panel } = await loadModule<{ default: ComponentType<{ ui: ClarifyUi } & Record<string, unknown>> }>('/src/shop/ClarifyPanel.tsx')
  const q = fixtureStates.askpartial as Extract<ShopState, { status: 'running' }>
  let ui2 = q.clarify as ClarifyUi
  for (const id of ['q_color', 'q_material', 'q_shape', 'q_style', 'q_size']) ui2 = clarifyReduce(ui2, { type: 'select', id, value: NO_PREFERENCE }) as ClarifyUi
  const out = render(Panel, { ui: ui2, onAnswer: noop, onSubmit: noop, onRetry: noop })
  assert.match(out, /class="chip clarify-nopref is-on" aria-pressed="true"/)
})

// ---- the stepper's logic (pure) ----

test('stepper: the first question to show is the first unanswered one', () => {
  assert.equal(firstUnanswered(ui()), 0)
  assert.equal(firstUnanswered(ui({ answers: [{ question_id: 'q_color', option_value: 'cream' }, { question_id: 'q_material', option_value: 'velvet' }] })), 2)
  const all = makeClarify().questions.map((q) => ({ question_id: q.id, option_value: NO_PREFERENCE }))
  assert.equal(firstUnanswered(ui({ answers: all })), 0, 'everything answered: back to the first')
  assert.equal(firstUnanswered(ui({}, { q_color: 'cream' })), 1, 'a local choice counts')
})

test('stepper: auto-advance goes to the next unanswered question, skips answered ones, and not past the last', () => {
  assert.equal(nextStep(ui(), 0), 1)
  assert.equal(nextStep(ui({}, { q_material: 'velvet' }), 0), 2, 'question 2 is answered: on to 3')
  assert.equal(nextStep(ui(), 4), null, 'the last question: stay, Show results is already there')
  assert.equal(nextStep(ui({}, { q_shape: 'curved', q_style: 'modern', q_size: 'x' }), 1), null, 'nothing unanswered after it')
  assert.equal(ADVANCE_MS, 250)
})

test('stepper: choosing records and advances; choosing the chosen option again clears and stays; the last question never advances', () => {
  assert.deepEqual(choiceOutcome(ui(), 0, 'cream'), { answer: 'cream', advanceTo: 1 })
  assert.deepEqual(choiceOutcome(ui({}, { q_color: 'cream' }), 0, 'cream'), { answer: null, advanceTo: null })
  assert.deepEqual(choiceOutcome(ui({ answers: [{ question_id: 'q_color', option_value: 'cream' }] }), 0, 'cream'), { answer: null, advanceTo: null }, "the server's answer clears too")
  assert.deepEqual(choiceOutcome(ui(), 0, NO_PREFERENCE), { answer: NO_PREFERENCE, advanceTo: 1 })
  assert.deepEqual(choiceOutcome(ui(), 4, 'under 70 in'), { answer: 'under 70 in', advanceTo: null })
  assert.equal(clampStep(7, 5), 4)
  assert.equal(clampStep(-1, 5), 0)
  assert.equal(clampStep(3, 2), 1, 'fewer questions than the step: clamp')
})

test('stepper: back and the dots reach any question (clamped); the dot state follows the answers', () => {
  const u = ui({ answers: [{ question_id: 'q_color', option_value: 'cream' }] }, { q_shape: 'curved' })
  const qs = u.server.questions
  assert.deepEqual(qs.map((q) => chosen(u, q.id) !== null), [true, false, true, false, false])
  assert.equal(clampStep(2 - 1, qs.length), 1, 'Back from question 3')
  assert.equal(clampStep(0 - 1, qs.length), 0, 'Back never goes before question 1')
})

test('keyboard: the arrows move (and wrap) without choosing; Home and End jump; Space and Enter are the buttons\' own click', () => {
  assert.equal(roveTo('ArrowRight', 0, 4), 1)
  assert.equal(roveTo('ArrowDown', 3, 4), 0, 'wraps')
  assert.equal(roveTo('ArrowLeft', 0, 4), 3, 'wraps')
  assert.equal(roveTo('ArrowUp', 2, 4), 1)
  assert.equal(roveTo('Home', 2, 4), 0)
  assert.equal(roveTo('End', 0, 4), 3)
  assert.equal(roveTo(' ', 1, 4), null)
  assert.equal(roveTo('Enter', 1, 4), null)
  assert.equal(roveTo('Tab', 1, 4), null)
})

test('auto-scroll: when the panel arrives below or across the window bottom and the visitor has not scrolled', () => {
  assert.equal(SCROLL_BOTTOM_MARGIN, 120)
  const at = (panelTop: number, h: number, viewportHeight: number, scrolled = false) => shouldAutoScroll({ panelTop, panelBottom: panelTop + h, viewportHeight, scrolled })
  assert.equal(at(663, 400, 720), true, '1280x720: starts below the bottom minus 120')
  assert.equal(at(601, 400, 720), true)
  assert.equal(at(666, 407, 900), true, '1440x900: top is above the margin but the panel runs past the bottom')
  assert.equal(at(100, 400, 900), false, 'fully in view')
  assert.equal(at(300, 420, 720), false, 'bottom exactly at the window edge: in view')
  assert.equal(at(300, 421, 720), true, 'one pixel past the edge')
  assert.equal(at(900, 400, 720, true), false, 'the visitor scrolled: never take the page from them')
  assert.equal(at(100, 400, 900, true), false)
})

test('view: submitted and closed lock the tiles and say so quietly', async () => {
  const sub = await view('asksubmitted')
  assert.match(sub, /class="btn btn-primary clarify-submit" disabled/)
  assert.ok(sub.includes('Thanks. Your results are on the way.'))
  assert.match(sub, /role="radio"[^>]*disabled/)
  assert.match(sub, /class="chip clarify-nopref"[^>]*disabled/)
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

test('view: the pipeline has six stages with Ask between Search and Check photos, and the caption', async () => {
  const html = await view('empty')
  assert.deepEqual(PIPELINE_STAGES.map((s) => s.name), ['Understand', 'Search', 'Ask', 'Check photos', 'Rank', 'Results'])
  assert.equal(html.match(/class="card shop-stage"/g)?.length, 6)
  assert.ok(html.includes('<h4>Ask</h4><p>Up to five quick questions come from the first results, with a photo for each choice.</p>'))
  assert.ok(html.indexOf('<h4>Search</h4>') < html.indexOf('<h4>Ask</h4>') && html.indexOf('<h4>Ask</h4>') < html.indexOf('<h4>Check photos</h4>'))
})

test('view: with the flag off (no clarify anywhere) a running search renders as before', async () => {
  const html = await view('running')
  assert.ok(!html.includes('clarify'))
})

// ---- plain-language labels ----

test('copy: the progress row shows plain labels for the service\'s step labels; an unknown one falls back to the service\'s own', () => {
  assert.deepEqual(STEP_LABELS, { Searching: 'Finding products', Tagging: 'Checking photos', Ranking: 'Picking the best', 'Checking style': 'Checking style' })
  for (const [service, shown] of [['Searching', 'Finding products'], ['Tagging', 'Checking photos'], ['Ranking', 'Picking the best'], ['Checking style', 'Checking style']]) assert.equal(stepLabel(service), shown, service)
  assert.equal(stepLabel('Something new'), 'Something new')
  assert.ok(!('Ask' in STEP_LABELS) && !('Asking' in STEP_LABELS), 'no Ask step in the progress row')
})

test('view: the running page shows the plain labels, never the old words, and no Ask step; the service\'s step ids are untouched', async () => {
  for (const key of ['running', 'slow', 'askpics', 'again']) {
    const html = await view(key)
    const steps = html.slice(html.indexOf('class="shop-steps"'), html.indexOf('</ol>', html.indexOf('class="shop-steps"')))
    assert.match(steps, /Finding products/, key)
    assert.doesNotMatch(steps, /Searching|Tagging|Ranking|>Ask</, key)
    assert.match(steps, /Checking style \(skipped\)/, key)
  }
  assert.match(await view('running'), /Checking photos 12\/40/)
  const running = fixtureStates.running as Extract<ShopState, { status: 'running' }>
  assert.deepEqual(running.steps.map((x) => x.id), ['searching', 'tagging', 'ranking', 'checking style'])
  assert.equal(running.phase, 'tagging', 'code identifiers stay')
})

test('copy: the pipeline tiles are Understand, Search, Ask, Check photos, Rank, Results with their captions and step numbers', async () => {
  assert.deepEqual(PIPELINE_STAGES.map((x) => x.name), ['Understand', 'Search', 'Ask', 'Check photos', 'Rank', 'Results'])
  assert.equal(PIPELINE_STAGES[0].caption, 'A small AI model reads your words into a search.')
  const html = await view('empty')
  PIPELINE_STAGES.forEach((x, i) => assert.ok(html.includes(`>0${i + 1}</span><h4>${x.name}</h4><p>${x.caption}</p>`), x.name))
})

// ---- the two-column panel (from 1280px): progress, picks, note ----

const stepsCount = (html: string) => html.match(/class="shop-steps"/g)?.length ?? 0

test('placement: wide and a ready panel: the steps are in the panel\'s right column, once; narrow: above the panel, once', async () => {
  const wide = await view('askpics', { wide: true })
  assert.equal(stepsCount(wide), 1)
  assert.ok(wide.indexOf('class="card clarify has-side"') < wide.indexOf('class="shop-steps"'), 'inside the panel')
  assert.ok(wide.indexOf('class="clarify-side"') < wide.indexOf('class="shop-steps"'))
  assert.equal(wide.match(/class="shop-timer"/g)?.length, 1, 'one timer')
  assert.match(wide, /class="shop-caps">Searching<\/span>/)
  assert.equal(CLARIFY_SIDE_PROGRESS, 'Searching')
  assert.doesNotMatch(wide, /Searching for “/, 'the compact head has the label, not the sentence')
  const narrow = await view('askpics', { wide: false })
  assert.equal(stepsCount(narrow), 1)
  assert.ok(narrow.indexOf('class="shop-steps"') < narrow.indexOf('class="card clarify'), 'above the panel')
  assert.ok(!narrow.includes('clarify-side') && !narrow.includes('has-side'), 'no right column below 1280px')
  assert.match(narrow, /Searching for “modern couch under \$1000”/)
  assert.equal(narrow.match(/class="shop-timer"/g)?.length, 1)
})

test('placement: with no panel (pending, skipped, failed, a plain running search, Shop Again) the steps stay above at any width, once', async () => {
  for (const key of ['askpending', 'askskipped', 'askfailed', 'running', 'slow', 'again']) {
    for (const wide of [true, false]) {
      const html = await view(key, { wide })
      assert.equal(stepsCount(html), 1, `${key} ${wide}`)
      assert.ok(!html.includes('clarify-side'), `${key} ${wide}`)
      assert.match(html, /Searching for “|Finding batch|Still working/, `${key} ${wide}: the sentence head`)
    }
  }
})

test('placement: a locked panel (submitted, applied) keeps its steps inside on a wide window, still once', async () => {
  for (const key of ['asksubmitted', 'askclosed']) {
    const html = await view(key, { wide: true })
    assert.equal(stepsCount(html), 1, key)
    assert.ok(html.indexOf('class="clarify-side"') < html.indexOf('class="shop-steps"'), key)
  }
})

test('the slow message replaces the SEARCHING label in the right column (the status stays a polite live region)', async () => {
  const base = fixtureStates.askpics as Extract<ShopState, { status: 'running' }>
  const { default: View } = await loadModule<{ default: ComponentType<ShopViewProps> }>('/src/shop/ShopView.tsx')
  const html = render(View, props({ ...base, slow: true }, { wide: true }))
  assert.match(html, /<p class="shop-progress-head" role="status" aria-live="polite"><span class="shop-spinner" aria-hidden="true"><\/span><span>Still working/)
  assert.equal(stepsCount(html), 1)
})

test('picks: the answers so far in question order, as the chosen option\'s label, "Any <dimension>" for No preference', () => {
  assert.deepEqual(picks(ui()), [])
  const u = ui({ answers: [{ question_id: 'q_color', option_value: 'walnut' }, { question_id: 'q_material', option_value: NO_PREFERENCE }] }, { q_style: 'modern' })
  assert.deepEqual(picks(u), [
    { id: 'q_color', question: 'Which colour do you like?', label: 'Walnut or brown' },
    { id: 'q_material', question: 'What should it be made of?', label: 'Any material' },
    { id: 'q_style', question: 'Which look do you prefer?', label: 'Modern' },
  ])
  assert.equal(clarifyAny('color'), 'Any colour')
  assert.equal(clarifyAny('size'), 'Any size')
  assert.deepEqual(picks(clarifyReduce(u, { type: 'select', id: 'q_color', value: null }) as ClarifyUi).map((x) => x.id), ['q_material', 'q_style'], 'clearing removes the pick')
})

test('picks column: empty text, the label, the chips with a remove button per answer, and the note at the end', async () => {
  const empty = await view('askpics', { wide: true })
  assert.ok(empty.includes(`>${CLARIFY_PICKS_LABEL}</h3>`) && CLARIFY_PICKS_LABEL === 'Your picks so far')
  assert.ok(empty.includes(`<p class="clarify-picks-empty">${CLARIFY_PICKS_EMPTY}</p>`) && CLARIFY_PICKS_EMPTY === 'Your choices will show here.')
  assert.ok(!empty.includes('aria-label="Your picks so far"'), 'no chip list while empty')
  const part = await view('askpartial', { wide: true })
  assert.match(part, /<ul class="chip-list" aria-label="Your picks so far"><li class="chip shop-understood" title="Which colour do you like\?">Walnut or brown<button type="button" class="shop-chip-x" aria-label="Remove Walnut or brown \(Which colour do you like\?\)">×<\/button><\/li><li class="chip shop-understood" title="What should it be made of\?">Any material<button/)
  assert.ok(!part.includes('Your choices will show here.'))
  assert.ok(part.endsWith('</div></div></section>') || part.includes(`<p class="clarify-side-note">${CLARIFY_SIDE_NOTE}</p></div></section>`), 'the note closes the right column')
  assert.ok(part.indexOf('class="shop-steps"') < part.indexOf('clarify-picks'), 'steps, then picks, then the note')
  assert.ok(part.indexOf('clarify-picks') < part.indexOf('clarify-side-note'))
  const locked = await view('asksubmitted', { wide: true })
  assert.match(locked, /class="shop-chip-x" aria-label="Remove [^"]+" disabled=""/, 'a locked panel cannot clear picks')
})

test('copy: the side note and labels are as briefed (DRAFT)', () => {
  assert.equal(CLARIFY_SIDE_NOTE, 'Your picks narrow the search: the colours, materials and sizes you choose are used when the results are ranked. Skip any question you like.')
})

test('layout: the wide width is 1280px in the hook and the stylesheet', async () => {
  const { WIDE_PX } = await loadModule<{ WIDE_PX: number }>('/src/shop/wide.ts')
  assert.equal(WIDE_PX, 1280)
  const css = (await import('node:fs')).readFileSync('src/shop/ClarifyPanel.css', 'utf8')
  assert.match(css, /\.clarify\.has-side \{[^}]*grid-template-columns: 3fr 2fr/)
  assert.match(css, /@media \(min-width: 1280px\)/)
  assert.match(css, /data-n='4'\] \{\s*--clarify-max: 260px/)
  assert.match(css, /data-n='3'\][\s\S]*--clarify-max: 290px/)
})
