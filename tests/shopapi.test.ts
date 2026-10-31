import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ShopError, createShopClient, errorFromResponse, isAbort, parseRetryAfter } from '../src/shop/api.ts'

type Call = { url: string; method: string; body: string | null; signal: AbortSignal | null | undefined }

function fakeFetch(handlers: ((call: Call) => Response)[]) {
  const calls: Call[] = []
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), method: init?.method ?? 'GET', body: (init?.body as string | undefined) ?? null, signal: init?.signal }
    calls.push(call)
    const next = handlers[calls.length - 1]
    if (!next) throw new Error(`unexpected call ${calls.length}: ${call.url}`)
    return next(call)
  }) as typeof fetch
  return { fn, calls }
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
const sessionRequired = () => json({ error: { code: 'session_required', message: 'Start a visit first.' } }, 401)

test('search posts the request as JSON to /api/shop/search and returns the job id', async () => {
  const { fn, calls } = fakeFetch([() => json({ job_id: 'j1' }, 202)])
  const out = await createShopClient(fn).startSearch(null, 'boho curtains')
  assert.deepEqual(out, { job_id: 'j1' })
  assert.equal(calls[0].url, '/api/shop/search')
  assert.equal(calls[0].method, 'POST')
  assert.deepEqual(JSON.parse(calls[0].body ?? ''), { session_id: null, request: 'boho curtains' })
})

test('session_required starts a visit, then retries the request once', async () => {
  const { fn, calls } = fakeFetch([sessionRequired, () => json({ ok: true }), () => json({ job_id: 'j2' }, 202)])
  const out = await createShopClient(fn).startSearch('s1', 'a couch')
  assert.deepEqual(out, { job_id: 'j2' })
  assert.deepEqual(calls.map((c) => `${c.method} ${c.url}`), ['POST /api/shop/search', 'POST /api/shop/auth/start', 'POST /api/shop/search'])
  assert.equal(calls[1].body, null)
})

test('a second session_required is shown, not retried again', async () => {
  const { fn, calls } = fakeFetch([sessionRequired, () => json({ ok: true }), sessionRequired])
  await assert.rejects(createShopClient(fn).startSearch(null, 'x'), (e: unknown) => e instanceof ShopError && e.code === 'session_required')
  assert.equal(calls.length, 3)
})

test('a visit that cannot start (429 rate_limited) surfaces that message', async () => {
  const { fn } = fakeFetch([sessionRequired, () => json({ error: { code: 'rate_limited', message: 'Slow down.' } }, 429, { 'Retry-After': '30' })])
  await assert.rejects(createShopClient(fn).startSearch(null, 'x'), (e: unknown) => e instanceof ShopError && e.code === 'rate_limited' && e.message === 'Slow down.' && e.retryAfterS === 30)
})

test('restoring a session never starts a visit', async () => {
  const { fn, calls } = fakeFetch([sessionRequired])
  await assert.rejects(createShopClient(fn).loadSession('old'), (e: unknown) => e instanceof ShopError && e.code === 'session_required')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/api/shop/session?id=old')
})

test('poll URL carries the session, empty for a first search, and encodes ids', async () => {
  const { fn, calls } = fakeFetch([() => json({ state: 'running' }), () => json({ state: 'running' })])
  const c = createShopClient(fn)
  await c.pollJob('j 1', null)
  await c.pollJob('j1', 'a&b')
  assert.equal(calls[0].url, '/api/shop/job/j%201?session=')
  assert.equal(calls[1].url, '/api/shop/job/j1?session=a%26b')
})

test('error shape: the server message and code are kept; 429 reads Retry-After', () => {
  const e = errorFromResponse(429, { error: { code: 'cap_reached', message: 'Daily limit reached.', limit: 'ip_day' } }, '120')
  assert.equal(e.code, 'cap_reached')
  assert.equal(e.message, 'Daily limit reached.')
  assert.equal(e.status, 429)
  assert.equal(e.retryAfterS, 120)
  assert.equal(parseRetryAfter('abc'), null)
  assert.equal(parseRetryAfter(null), null)
})

test('a body that is not the error shape falls back to a plain sentence, never raw text', () => {
  for (const [status, code] of [[401, 'session_required'], [403, 'forbidden'], [404, 'not_found'], [429, 'rate_limited'], [503, 'maintenance'], [400, 'bad_request'], [500, 'server_error'], [502, 'server_error']] as const) {
    const e = errorFromResponse(status, '<html>Traceback (most recent call last)</html>', null)
    assert.equal(e.code, code, String(status))
    assert.doesNotMatch(e.message, /<|Traceback|\{/)
  }
  assert.equal(errorFromResponse(500, { error: { code: 'weird', message: 'Oops, try later.' } }, null).code, 'server_error')
})

test('a network failure becomes a readable error; an abort stays an abort', async () => {
  const down = createShopClient((async () => { throw new TypeError('Failed to fetch') }) as typeof fetch)
  await assert.rejects(down.authSession(), (e: unknown) => e instanceof ShopError && e.code === 'network')

  const controller = new AbortController()
  const { fn, calls } = fakeFetch([(call) => { assert.equal(call.signal, controller.signal); throw new DOMException('aborted', 'AbortError') }])
  controller.abort()
  await assert.rejects(createShopClient(fn).pollJob('j', null, controller.signal), (e: unknown) => isAbort(e))
  assert.equal(calls.length, 1)
})
