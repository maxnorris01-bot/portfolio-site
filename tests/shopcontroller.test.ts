import assert from 'node:assert/strict'
import { afterEach, beforeEach, mock, test } from 'node:test'
import { createShopClient } from '../src/shop/api.ts'
import { ShopController } from '../src/shop/controller.ts'
import { fixtureBatch2, fixtureView } from '../src/shop/fixtures.ts'
import type { ShopState } from '../src/shop/state.ts'
import type { SessionView } from '../src/shop/types.ts'

type Call = { method: string; path: string; search: string; body: unknown }
type Handler = (call: Call) => Response | Promise<Response>

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

function setup(routes: Record<string, Handler | Handler[]>) {
  const calls: Call[] = []
  const counts = new Map<string, number>()
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://x')
    const path = url.pathname.replace('/api/shop', '')
    const call: Call = { method: init?.method ?? 'GET', path, search: url.search, body: init?.body ? JSON.parse(String(init.body)) : null }
    calls.push(call)
    const key = `${call.method} ${path.startsWith('/job/') ? '/job' : path}`
    const h = routes[key]
    if (!h) throw new Error(`no route for ${key}`)
    const n = counts.get(key) ?? 0
    counts.set(key, n + 1)
    const fn = Array.isArray(h) ? h[Math.min(n, h.length - 1)] : h
    return fn(call)
  }) as typeof fetch
  const controller = new ShopController(createShopClient(fetchFn))
  return { controller, calls }
}

const flush = async (ms = 0) => {
  mock.timers.tick(ms)
  for (let i = 0; i < 12; i++) await Promise.resolve()
}
const settle = async (c: ShopController, until: (s: ShopState) => boolean) => {
  for (let i = 0; i < 20 && !until(c.getState()); i++) await flush(1000)
}

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

const done = (view: SessionView) => () => json({ state: 'done', result: view })
const searchRoutes = (view: SessionView) => ({ 'POST /search': () => json({ job_id: 'j1' }, 202), 'GET /job': done(view) })

async function withResults(extra: Record<string, Handler | Handler[]> = {}, view: SessionView = fixtureView) {
  const t = setup({ ...searchRoutes(view), ...extra })
  void t.controller.search('modern couch under $1000')
  await settle(t.controller, (s) => s.status === 'done')
  assert.equal(t.controller.getState().status, 'done')
  return t
}

test('a search keeps the session id from its result for the later calls (and sessionStorage)', async () => {
  const t = await withResults({ 'POST /rate': () => json({ result_id: 'fx-1', rating: 'love', comment: '' }) })
  await t.controller.rate('fx-1', 'love')
  assert.equal((t.calls.find((c) => c.path === '/rate')?.body as { session_id: string }).session_id, 'fixture-session')
  assert.equal(globalThis.sessionStorage.getItem('shop.session'), 'fixture-session')
})

test('rating: choosing sends the rating alone and marks Saved; clicking it again clears with rating null', async () => {
  const t = await withResults({ 'POST /rate': (c) => json({ result_id: 'fx-1', rating: (c.body as { rating: string | null }).rating, comment: '' }) })
  await t.controller.rate('fx-1', 'love')
  const s = t.controller.getState()
  assert.equal(s.status === 'done' && s.ratings['fx-1'].save, 'saved')
  await t.controller.rate('fx-1', null)
  const rates = t.calls.filter((c) => c.path === '/rate').map((c) => c.body)
  assert.deepEqual(rates, [
    { session_id: 'fixture-session', result_id: 'fx-1', rating: 'love' },
    { session_id: 'fixture-session', result_id: 'fx-1', rating: null },
  ])
})

test('comments are saved on blur (not on each keystroke), alone, and only when changed', async () => {
  const t = await withResults({ 'POST /rate': (c) => json({ result_id: 'fx-1', rating: 'love', comment: (c.body as { comment?: string }).comment ?? '' }) })
  await t.controller.rate('fx-1', 'love')
  t.controller.setComment('fx-1', 'L')
  t.controller.setComment('fx-1', 'Lovely')
  await flush(2000)
  assert.equal(t.calls.filter((c) => c.path === '/rate').length, 1, 'typing sends nothing')
  await t.controller.commentBlur('fx-1')
  assert.deepEqual(t.calls.filter((c) => c.path === '/rate').at(-1)?.body, { session_id: 'fixture-session', result_id: 'fx-1', comment: 'Lovely' })
  await t.controller.commentBlur('fx-1')
  assert.equal(t.calls.filter((c) => c.path === '/rate').length, 2, 'a blur with nothing new sends nothing')
})

test('a failed save keeps the local choice, shows the reason, and Retry sends it again', async () => {
  const t = await withResults({
    'POST /rate': [() => json({ error: { code: 'server_error', message: 'Could not save right now.' } }, 500), () => json({ result_id: 'fx-1', rating: 'dislike', comment: '' })],
  })
  await t.controller.rate('fx-1', 'dislike')
  let s = t.controller.getState()
  assert.ok(s.status === 'done')
  assert.deepEqual([s.ratings['fx-1'].rating, s.ratings['fx-1'].save, s.ratings['fx-1'].error], ['dislike', 'failed', 'Could not save right now.'])
  await t.controller.retryRating('fx-1')
  s = t.controller.getState()
  assert.ok(s.status === 'done')
  assert.deepEqual([s.ratings['fx-1'].rating, s.ratings['fx-1'].save], ['dislike', 'saved'])
  assert.deepEqual(t.calls.filter((c) => c.path === '/rate').at(-1)?.body, { session_id: 'fixture-session', result_id: 'fx-1', rating: 'dislike' })
})

test('a rating while an earlier save of the same card is slow: only the newest result updates the mark', async () => {
  let release: (r: Response) => void = () => {}
  const t = await withResults({
    'POST /rate': [() => new Promise<Response>((r) => (release = r)), () => json({ result_id: 'fx-1', rating: 'like', comment: '' })],
  })
  const first = t.controller.rate('fx-1', 'love')
  await t.controller.rate('fx-1', 'like')
  release(json({ error: { code: 'server_error', message: 'old failure' } }, 500))
  await first
  const s = t.controller.getState()
  assert.ok(s.status === 'done')
  assert.deepEqual([s.ratings['fx-1'].rating, s.ratings['fx-1'].save], ['like', 'saved'])
})

test('restore after a refresh: results, ratings, comments and the batch number come back from GET /session', async () => {
  globalThis.sessionStorage.setItem('shop.session', 'fixture-session')
  globalThis.sessionStorage.setItem('shop.batch', '3')
  const restored: SessionView = { ...fixtureView, ratings: { 'fx-1': { rating: 'love', comment: 'Great colour' } } }
  const t = setup({ 'GET /session': () => json(restored) })
  await t.controller.restore()
  const s = t.controller.getState()
  assert.ok(s.status === 'done')
  assert.equal(s.batch, 3)
  assert.deepEqual([s.ratings['fx-1'].rating, s.ratings['fx-1'].comment], ['love', 'Great colour'])
  assert.equal(s.fresh, false, 'a restore does not scroll')
  assert.deepEqual([t.calls[0].path, t.calls[0].search], ['/session', '?id=fixture-session'])
})

test('Shop Again sends the session id and null without refine text, or the trimmed text with it', async () => {
  const t = await withResults({ 'POST /shop-again': () => json({ job_id: 'j2' }, 202) })
  await t.controller.shopAgain('')
  await t.controller.shopAgain('  more wood, no glass  ')
  const bodies = t.calls.filter((c) => c.path === '/shop-again').map((c) => c.body)
  assert.deepEqual(bodies, [
    { session_id: 'fixture-session', refine_text: null },
    { session_id: 'fixture-session', refine_text: 'more wood, no glass' },
  ])
})

test('Shop Again polls the job like a search, then replaces the grid and counts the batch (a new search resets it)', async () => {
  const jobs: Handler[] = [done(fixtureView), () => json({ state: 'running', steps: [{ id: 'rank', label: 'Ranking', state: 'active', done_count: null, total: null }] }), done(fixtureBatch2)]
  const t = await withResults({ 'POST /shop-again': () => json({ job_id: 'j2' }, 202), 'GET /job': jobs })
  void t.controller.shopAgain('more wood')
  await flush()
  let s = t.controller.getState()
  assert.ok(s.status === 'running' && s.kind === 'shop_again' && s.batch === 2)
  await settle(t.controller, (x) => x.status === 'done')
  s = t.controller.getState()
  assert.ok(s.status === 'done')
  assert.equal(s.batch, 2)
  assert.equal(s.fresh, true)
  assert.equal(s.view.search?.results[0].id, 'fx-5')
  assert.equal(globalThis.sessionStorage.getItem('shop.batch'), '2')
  const polls = t.calls.filter((c) => c.path.startsWith('/job/j2'))
  assert.ok(polls.length >= 2)
  assert.ok(polls.every((c) => c.search === '?session=fixture-session'))
  void t.controller.search('boho curtains')
  await flush()
  const r = t.controller.getState()
  assert.ok(r.status === 'running' && r.batch === 1 && r.kind === 'search')
})

test('cap_reached on Shop Again keeps the earlier results and shows the message with its reset time', async () => {
  const t = await withResults({
    'POST /shop-again': () => json({ error: { code: 'cap_reached', message: 'You have used all of your Shop Again searches for today.', limit: 'shop_agains', resets_at: '2026-11-01T00:00:00+00:00' } }, 429),
  })
  await t.controller.shopAgain('')
  const s = t.controller.getState()
  assert.ok(s.status === 'done')
  assert.equal(s.view.search?.results.length, 4, 'the grid is still there')
  assert.equal(s.batch, 1)
  assert.deepEqual(s.banner, { message: 'You have used all of your Shop Again searches for today.', retryAfterS: null, resetsAt: '2026-11-01T00:00:00+00:00', code: 'cap_reached', limit: 'shop_agains' })
})

test('rate_limited on Shop Again keeps the results and carries Retry-After', async () => {
  const t = await withResults({ 'POST /shop-again': () => json({ error: { code: 'rate_limited', message: 'Slow down a little.' } }, 429, { 'Retry-After': '20' }) })
  await t.controller.shopAgain('')
  const s = t.controller.getState()
  assert.ok(s.status === 'done')
  assert.deepEqual(s.banner, { message: 'Slow down a little.', retryAfterS: 20, resetsAt: null, code: 'rate_limited', limit: null })
})

test('a Shop Again job that fails puts the earlier batch back with the reason', async () => {
  const jobs: Handler[] = [done(fixtureView), () => json({ state: 'error', status: 500, error: 'The search failed. Please try again.' })]
  const t = await withResults({ 'POST /shop-again': () => json({ job_id: 'j2' }, 202), 'GET /job': jobs })
  void t.controller.shopAgain('')
  await settle(t.controller, (x) => x.status !== 'running')
  const s = t.controller.getState()
  assert.ok(s.status === 'done' && s.banner?.message === 'The search failed. Please try again.' && s.batch === 1)
})

test('session_required on rate and Shop Again starts a visit once and retries', async () => {
  const gone = () => json({ error: { code: 'session_required', message: 'Start a visit first.' } }, 401)
  const t = await withResults({
    'POST /rate': [gone, () => json({ result_id: 'fx-1', rating: 'love', comment: '' })],
    'POST /shop-again': [gone, () => json({ job_id: 'j2' }, 202)],
    'POST /auth/start': () => json({ ok: true }),
  })
  await t.controller.rate('fx-1', 'love')
  await t.controller.shopAgain('')
  const paths = t.calls.map((c) => `${c.method} ${c.path.split('?')[0]}`)
  assert.equal(paths.filter((p) => p === 'POST /auth/start').length, 2)
  assert.equal(paths.filter((p) => p === 'POST /rate').length, 2)
  assert.equal(paths.filter((p) => p === 'POST /shop-again').length, 2)
})

test('chips: removing a refine chip or a request chip patches what is shown; a failure shows a banner', async () => {
  const t = await withResults({
    'POST /refine/remove': () => json({ refine: [{ id: 'rf-2', label: 'Focus on cream' }] }),
    'POST /context/remove': [() => json({ query: { avoid: [] }, removed: 'walmart' }), () => json({ error: { code: 'not_found', message: 'No such chip.' } }, 404)],
  })
  await t.controller.removeRefine('rf-1')
  await t.controller.removeContext('avoid', 'walmart')
  let s = t.controller.getState()
  assert.ok(s.status === 'done')
  assert.deepEqual(s.view.refine?.map((c) => c.id), ['rf-2'])
  assert.deepEqual(s.view.search?.query, { avoid: [] })
  assert.deepEqual(t.calls.filter((c) => c.path === '/refine/remove').map((c) => c.body), [{ session_id: 'fixture-session', id: 'rf-1' }])
  assert.deepEqual(t.calls.filter((c) => c.path === '/context/remove')[0].body, { session_id: 'fixture-session', kind: 'avoid', value: 'walmart' })
  await t.controller.removeContext('avoid', 'x')
  s = t.controller.getState()
  assert.ok(s.status === 'done' && s.banner?.message === 'No such chip.')
})
