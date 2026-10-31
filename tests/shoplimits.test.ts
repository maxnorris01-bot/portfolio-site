import assert from 'node:assert/strict'
import { afterEach, beforeEach, mock, test } from 'node:test'
import { createShopClient } from '../src/shop/api.ts'
import { ShopController } from '../src/shop/controller.ts'
import { fixtureView } from '../src/shop/fixtures.ts'
import { isLimit, limitBlocks, limitText, localTime, usageFrom, usageLine, type LimitInfo } from '../src/shop/limits.ts'
import { shortfallLine } from '../src/shop/state.ts'
import { fixtureShortWarnings } from '../src/shop/fixtures.ts'

const info = (code: LimitInfo['code'], limit: string | null = null, extra: Partial<LimitInfo> = {}): LimitInfo => ({ message: 'The server says no.', retryAfterS: null, resetsAt: null, code, limit, ...extra })
const RESET = '2026-11-01T00:00:00+00:00'

test('local time: the reset in the visitor\'s time zone, 12-hour, no date', () => {
  assert.equal(localTime(RESET, 'UTC'), '12:00 AM')
  assert.equal(localTime(RESET, 'America/Los_Angeles'), '5:00 PM')
  assert.equal(localTime(null), null)
  assert.equal(localTime('nonsense'), null)
})

test('each limit type has its own sentence; the server text is only the fallback', () => {
  assert.equal(limitText(info('cap_reached', 'searches')), 'You have used all of your searches for this visit.')
  assert.equal(limitText(info('cap_reached', 'shop_agains')), 'You have used all of your Shop Agains for this visit.')
  assert.equal(limitText(info('cap_reached', 'session')), 'You have reached the limit for this visit.')
  assert.equal(limitText(info('cap_reached', 'ip_day', { resetsAt: RESET }), 'America/Los_Angeles'), 'You have reached your limit for today. It resets at 5:00 PM.')
  assert.equal(limitText(info('cap_reached', 'global_day', { resetsAt: RESET }), 'America/Los_Angeles'), 'The site has reached its limit for today. It resets at 5:00 PM.')
  assert.equal(limitText(info('cap_reached', 'global_day')), 'The site has reached its limit for today.')
  assert.equal(limitText(info('maintenance')), 'Shop Mode is paused right now. Please try again later.')
  assert.equal(limitText(info('cap_reached', 'something_new')), 'The server says no.')
  assert.equal(limitText(info('rate_limited')), 'The server says no.')
  assert.equal(limitText(info('bad_request')), 'The server says no.')
})

test('each limit type turns off the right buttons', () => {
  assert.deepEqual(limitBlocks(info('cap_reached', 'searches')), { search: true, again: false })
  assert.deepEqual(limitBlocks(info('cap_reached', 'shop_agains')), { search: false, again: true })
  for (const l of ['session', 'ip_day', 'global_day']) assert.deepEqual(limitBlocks(info('cap_reached', l)), { search: true, again: true }, l)
  assert.deepEqual(limitBlocks(info('maintenance')), { search: true, again: true })
  assert.deepEqual(limitBlocks(info('rate_limited')), { search: false, again: false })
  assert.deepEqual(limitBlocks(info('cap_cap' as never)), { search: false, again: false })
  assert.ok(isLimit(info('cap_reached', 'searches')) && isLimit(info('maintenance')) && !isLimit(info('rate_limited')))
})

test('usage line: searches (recorded searches minus Shop Agains), Shop Agains, the reset in local time; no dollars', () => {
  const usage = { maxSearches: 8, maxShopAgains: 25, resetsAt: RESET }
  assert.equal(usageLine(usage, { searchCount: 3, shopAgainsUsed: 1 }, 'America/Los_Angeles'), 'Searches used: 2 of 8 · Shop Agains: 1 of 25 · Daily limit resets at 5:00 PM')
  assert.equal(usageLine(usage, null, 'UTC'), 'Searches used: 0 of 8 · Shop Agains: 0 of 25 · Daily limit resets at 12:00 AM')
  assert.equal(usageLine({ ...usage, resetsAt: null }, { searchCount: 0, shopAgainsUsed: 0 }), 'Searches used: 0 of 8 · Shop Agains: 0 of 25')
  assert.equal(usageLine(usage, { searchCount: 0, shopAgainsUsed: 2 }, 'UTC')?.startsWith('Searches used: 0 of 8'), true, 'never negative')
  assert.equal(usageLine(null, null), null)
})

test('the usage block of /auth/session: only per-visit limits and the reset are kept; dollar figures are dropped', () => {
  const auth = { authenticated: true, usage: { ip_day: { used_usd: 0.4, cap_usd: 2 }, session: { cap_usd: 1, max_searches: 8, max_shop_agains: 25 }, resets_at: RESET } }
  assert.deepEqual(usageFrom(auth), { maxSearches: 8, maxShopAgains: 25, resetsAt: RESET })
  assert.equal(usageFrom({ authenticated: false }), null)
  assert.equal(usageFrom({ authenticated: true }), null)
  assert.ok(!JSON.stringify(usageFrom(auth)).includes('usd'))
})

test('shortfall line: from the quota sentence only; the other notices are never used', () => {
  const search = (warnings: string[]) => ({ request: 'x', results: [], warnings })
  assert.equal(shortfallLine(search(fixtureShortWarnings)), 'Only 14 of 24 results match your finish warm wood. That is all the stores had.')
  assert.equal(shortfallLine(search(['Only 14 of 24 results match your color navy: the pool had 20 that do.'])), 'Only 14 of 24 results match your color navy.', 'the pool had more: no claim about the stores')
  assert.equal(shortfallLine(search(['Not mixing shape: off.', 'Could not keep color under 80%: mostly black.', 'A few sellers dominate this pool.'])), null)
  const two = ['Only 10 of 24 results match your material oak: the pool had 10 that do.', 'Only 5 of 24 results match your color red: the pool had 5 that do.']
  assert.equal(shortfallLine(search(two)), 'Only 10 of 24 results match your material oak. That is all the stores had.', 'the first shortfall only')
  assert.equal(shortfallLine(null), null)
  assert.equal(shortfallLine(fixtureView.search), null)
})

// ---- the controller: usage and limits through a fake fetch

type Handler = (body: unknown) => Response
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function make(routes: Record<string, Handler | Handler[]>) {
  const counts = new Map<string, number>()
  const calls: string[] = []
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://x')
    const key = `${init?.method ?? 'GET'} ${url.pathname.replace('/api/shop', '').replace(/^\/job\/.*/, '/job')}`
    calls.push(key)
    const h = routes[key]
    if (!h) throw new Error(`no route ${key}`)
    const n = counts.get(key) ?? 0
    counts.set(key, n + 1)
    return (Array.isArray(h) ? h[Math.min(n, h.length - 1)] : h)(init?.body ? JSON.parse(String(init.body)) : null)
  }) as typeof fetch
  return { c: new ShopController(createShopClient(fetchFn)), calls }
}

beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'] }))
afterEach(() => mock.timers.reset())
const flush = async (ms = 0) => {
  mock.timers.tick(ms)
  for (let i = 0; i < 12; i++) await Promise.resolve()
}

const authed = { authenticated: true, usage: { session: { max_searches: 8, max_shop_agains: 25 }, resets_at: RESET } }

test('usage loads on page load without starting a visit; a visitor with no visit has no line', async () => {
  const a = make({ 'GET /auth/session': () => json(authed) })
  await a.c.loadUsage()
  assert.deepEqual(a.c.getMeta().usage, { maxSearches: 8, maxShopAgains: 25, resetsAt: RESET })
  const b = make({ 'GET /auth/session': () => json({ authenticated: false, contact_email: null }) })
  await b.c.loadUsage()
  assert.equal(b.c.getMeta().usage, null)
  assert.deepEqual(b.calls, ['GET /auth/session'], 'no /auth/start')
})

test('usage refreshes after each finished search and Shop Again', async () => {
  const { c, calls } = make({
    'GET /auth/session': () => json(authed),
    'POST /search': () => json({ job_id: 'j1' }, 202),
    'POST /shop-again': () => json({ job_id: 'j2' }, 202),
    'GET /job': () => json({ state: 'done', result: fixtureView }),
  })
  await c.loadUsage()
  void c.search('couch')
  for (let i = 0; i < 6; i++) await flush(1000)
  assert.equal(calls.filter((x) => x === 'GET /auth/session').length, 2)
  void c.shopAgain('')
  for (let i = 0; i < 6; i++) await flush(1000)
  assert.equal(calls.filter((x) => x === 'GET /auth/session').length, 3)
})

test('a refused search turns off the right buttons and the banner text is by limit type', async () => {
  const refuse = (limit: string) => () => json({ error: { code: 'cap_reached', message: 'raw server text', limit, resets_at: limit === 'ip_day' ? RESET : null } }, 429)
  for (const [limit, want] of [['searches', { search: true, again: false }], ['shop_agains', { search: false, again: true }], ['ip_day', { search: true, again: true }], ['global_day', { search: true, again: true }], ['session', { search: true, again: true }]] as const) {
    const { c } = make({ 'POST /search': refuse(limit) })
    await c.search('couch')
    const s = c.getState()
    assert.ok(s.status === 'error' && s.code === 'cap_reached' && s.limit === limit, limit)
    assert.deepEqual(c.getMeta().blocked, want, limit)
  }
})

test('maintenance on page load turns off search and Shop Again; a 503 maintenance does too', async () => {
  const a = make({ 'GET /auth/session': () => json({ authenticated: false, maintenance: true }) })
  await a.c.loadUsage()
  assert.deepEqual([a.c.getMeta().maintenance, a.c.getMeta().blocked], [true, { search: true, again: true }])
  const b = make({ 'POST /search': () => json({ error: { code: 'maintenance', message: 'down' } }, 503) })
  await b.c.search('couch')
  assert.deepEqual([b.c.getMeta().maintenance, b.c.getMeta().blocked], [true, { search: true, again: true }])
})

test('rate_limited is shown but does not turn anything off', async () => {
  const { c } = make({ 'POST /search': () => json({ error: { code: 'rate_limited', message: 'Slow down.' } }, 429) })
  await c.search('couch')
  assert.deepEqual(c.getMeta().blocked, { search: false, again: false })
})
