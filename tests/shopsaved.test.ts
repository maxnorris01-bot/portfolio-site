import assert from 'node:assert/strict'
import { afterEach, beforeEach, mock, test } from 'node:test'
import { createShopClient } from '../src/shop/api.ts'
import { ShopController } from '../src/shop/controller.ts'
import { fixtureItems, fixtureView } from '../src/shop/fixtures.ts'
import { ratingsReducer, ratingsFromView, type RatingsState } from '../src/shop/ratings.ts'
import { openTarget, readSavedOpen, savedLists, writeSavedOpen } from '../src/shop/saved.ts'
import { safeHref } from '../src/shop/state.ts'
import type { SavedRow } from '../src/shop/types.ts'

const old: SavedRow[] = [
  { ...fixtureItems[0], id: 'old-1', title: 'Earlier curtain', topic_label: 'boho curtains' },
  { ...fixtureItems[1], id: 'old-2', title: 'Earlier rug' },
]
const ids = (l: { id: string }[]) => l.map((i) => i.id)

test('saved lists: loved and liked from every search; tabs count them; dislikes and unrated are left out', () => {
  const ratings = ratingsFromView({ 'old-1': { rating: 'love', comment: '' }, 'old-2': { rating: 'like', comment: '' }, 'fx-1': { rating: 'love', comment: '' }, 'fx-2': { rating: 'dislike', comment: '' } })
  const { loved, liked } = savedLists(old, fixtureItems, ratings)
  assert.deepEqual(ids(loved).sort(), ['fx-1', 'old-1'])
  assert.deepEqual(ids(liked), ['old-2'])
  assert.equal(loved.find((i) => i.id === 'old-1')?.topic_label, 'boho curtains')
})

test('saved lists update with each rating change: add on Love or Like, move between tabs, remove on Dislike or clear', () => {
  let r: RatingsState = {}
  const lists = () => savedLists(old, fixtureItems, r)
  r = ratingsReducer(r, { type: 'choose', id: 'fx-3', rating: 'love', at: 10 })
  assert.deepEqual([ids(lists().loved), ids(lists().liked)], [['fx-3'], []])
  r = ratingsReducer(r, { type: 'choose', id: 'fx-3', rating: 'like', at: 11 })
  assert.deepEqual([ids(lists().loved), ids(lists().liked)], [[], ['fx-3']])
  r = ratingsReducer(r, { type: 'choose', id: 'fx-1', rating: 'like', at: 12 })
  assert.deepEqual(ids(lists().liked), ['fx-1', 'fx-3'], 'the newest change comes first')
  r = ratingsReducer(r, { type: 'choose', id: 'fx-3', rating: 'dislike', at: 13 })
  assert.deepEqual(ids(lists().liked), ['fx-1'])
  r = ratingsReducer(r, { type: 'choose', id: 'fx-1', rating: null, at: 14 })
  assert.deepEqual([ids(lists().loved), ids(lists().liked)], [[], []])
})

test('an item rated in this batch shows in Saved with this batch\'s data, even before the server list knows it', () => {
  const r = ratingsReducer({}, { type: 'choose', id: 'fx-2', rating: 'love', at: 1 })
  const { loved } = savedLists([], fixtureItems, r)
  assert.equal(loved[0].title, 'Sample Arc velvet sofa')
  assert.equal(loved[0].mine, 'love')
})

function fakeStorage(fail = false) {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => {
        if (fail) throw new Error('blocked')
        return store.get(k) ?? null
      },
      setItem: (k: string, v: string) => {
        if (fail) throw new Error('blocked')
        store.set(k, v)
      },
      removeItem: (k: string) => void store.delete(k),
    },
  })
  return store
}
afterEach(() => Reflect.deleteProperty(globalThis, 'sessionStorage'))

test('the Saved toggle is open by default and remembers hiding it', () => {
  fakeStorage()
  assert.equal(readSavedOpen(), true)
  writeSavedOpen(false)
  assert.equal(readSavedOpen(), false)
  writeSavedOpen(true)
  assert.equal(readSavedOpen(), true)
})

test('the Saved toggle works when storage throws: open, and no error', () => {
  fakeStorage(true)
  assert.equal(readSavedOpen(), true)
  assert.doesNotThrow(() => writeSavedOpen(false))
  Reflect.deleteProperty(globalThis, 'sessionStorage')
  assert.equal(readSavedOpen(), true, 'no storage at all')
})

test('Open target: the store link once resolved; else the result link, to be looked up on click when it is Google\'s page', () => {
  const google = { id: 'a', link: 'https://www.google.com/shopping/product/1', link_kind: 'google_panel' as const }
  assert.deepEqual(openTarget(google, undefined, safeHref), { href: 'https://www.google.com/shopping/product/1', needsResolve: true })
  assert.deepEqual(openTarget(google, { a: { status: 'resolved', link: 'https://store.example.com/p' } }, safeHref), { href: 'https://store.example.com/p', needsResolve: false })
  assert.deepEqual(openTarget(google, { a: { status: 'fallback', link: 'https://www.google.com/x' } }, safeHref), { href: 'https://www.google.com/shopping/product/1', needsResolve: true })
  assert.deepEqual(openTarget({ ...google, link_kind: 'retailer' }, undefined, safeHref), { href: google.link, needsResolve: false })
  assert.deepEqual(openTarget({ ...google, link_kind: 'none' }, undefined, safeHref), { href: null, needsResolve: false })
  assert.deepEqual(openTarget({ ...google, link: 'javascript:alert(1)' }, undefined, safeHref), { href: null, needsResolve: true })
})

// ---- resolve through the controller

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'] }))
afterEach(() => mock.timers.reset())

async function withResults(resolveHandler: () => Response) {
  fakeStorage()
  const calls: { path: string; body: unknown }[] = []
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'http://x').pathname.replace('/api/shop', '')
    calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : null })
    if (path === '/search') return json({ job_id: 'j' }, 202)
    if (path.startsWith('/job/')) return json({ state: 'done', result: fixtureView })
    if (path === '/auth/session') return json({ authenticated: false })
    if (path === '/resolve') return resolveHandler()
    throw new Error(`no route ${path}`)
  }) as typeof fetch
  const c = new ShopController(createShopClient(fetchFn))
  void c.search('couch')
  for (let i = 0; i < 6; i++) {
    mock.timers.tick(1000)
    for (let j = 0; j < 12; j++) await Promise.resolve()
  }
  return { c, calls }
}

test('resolve: sends the session and result id, returns the store link, and remembers it for the next Open', async () => {
  const { c, calls } = await withResults(() => json({ resolved: { result_id: 'fx-1', status: 'resolved', link: 'https://store.example.com/loft', link_kind: 'retailer' }, lookups_used: 1, lookups_cap: 12 }))
  assert.equal(await c.resolveLink('fx-1'), 'https://store.example.com/loft')
  assert.deepEqual(calls.find((x) => x.path === '/resolve')?.body, { session_id: 'fixture-session', result_id: 'fx-1' })
  const s = c.getState()
  assert.ok(s.status === 'done')
  assert.equal(s.view.resolved?.['fx-1']?.link, 'https://store.example.com/loft')
  assert.equal(await c.resolveLink('fx-1'), 'https://store.example.com/loft')
  assert.equal(calls.filter((x) => x.path === '/resolve').length, 1, 'the second Open does not look it up again')
})

test('resolve falls back to the result\'s own link when the lookup says fallback or fails (limit, error, network)', async () => {
  const fb = await withResults(() => json({ resolved: { result_id: 'fx-1', status: 'fallback', link: 'https://www.google.com/x' }, lookups_used: 1, lookups_cap: 12 }))
  assert.equal(await fb.c.resolveLink('fx-1'), null)
  const cap = await withResults(() => json({ error: { code: 'cap_reached', message: 'Lookup limit reached.', limit: 'session' } }, 429))
  assert.equal(await cap.c.resolveLink('fx-1'), null)
  const down = await withResults(() => json({ error: { code: 'server_error', message: 'x' } }, 502))
  assert.equal(await down.c.resolveLink('fx-2'), null)
})

test('simultaneous Opens of one result make one lookup', async () => {
  const { c, calls } = await withResults(() => json({ resolved: { result_id: 'fx-1', status: 'resolved', link: 'https://store.example.com/loft' }, lookups_used: 1, lookups_cap: 12 }))
  const [a, b] = await Promise.all([c.resolveLink('fx-1'), c.resolveLink('fx-1')])
  assert.deepEqual([a, b], ['https://store.example.com/loft', 'https://store.example.com/loft'])
  assert.equal(calls.filter((x) => x.path === '/resolve').length, 1)
})
