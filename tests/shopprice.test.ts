import assert from 'node:assert/strict'
import { afterEach, beforeEach, mock, test, after } from 'node:test'
import type { ComponentType } from 'react'
import { createShopClient } from '../src/shop/api.ts'
import { mergeChips, requestChips } from '../src/shop/chips.ts'
import { ShopController } from '../src/shop/controller.ts'
import { matchCount } from '../src/shop/filters.ts'
import { fixtureBundles, fixtureItems, fixturePrice, fixtureRefine } from '../src/shop/fixtures.ts'
import { checkPrice, hasPrice, inPriceRange, money, parsePriceTarget, priceBody, priceChipLabel, priceLabel, priceNote, serverPrice } from '../src/shop/price.ts'
import type { ShopViewProps } from '../src/shop/viewprops.ts'
import { closeServer, loadModule, render } from './helpers/ssr.ts'

after(closeServer)

test('chip target: price:50-200, price:-200 (under), price:50- (over), cents; anything else is not a price', () => {
  assert.deepEqual(parsePriceTarget('price:50-200'), { min: 50, max: 200 })
  assert.deepEqual(parsePriceTarget('price:-200'), { min: null, max: 200 })
  assert.deepEqual(parsePriceTarget('price:50-'), { min: 50, max: null })
  assert.deepEqual(parsePriceTarget('price:12.5-20.75'), { min: 12.5, max: 20.75 })
  for (const bad of ['price:-', 'price:', 'color:gray', 'price:a-b', '', null, undefined]) assert.equal(parsePriceTarget(bad), null, String(bad))
})

test('label: "Price: $50-$200", "Under $200", "Over $50"; whole dollars without cents; the server label wins when present', () => {
  assert.equal(priceLabel({ min: 50, max: 200 }), 'Price: $50-$200')
  assert.equal(priceLabel({ min: null, max: 200 }), 'Under $200')
  assert.equal(priceLabel({ min: 50, max: null }), 'Over $50')
  assert.equal(priceLabel({ min: 12.5, max: 1200 }), 'Price: $12.50-$1,200')
  assert.equal(money(99), '$99')
  assert.equal(priceChipLabel({ label: 'Price: $50-$200', target: 'price:50-200' }), 'Price: $50-$200')
  assert.equal(priceChipLabel({ label: '', target: 'price:-200' }), 'Under $200', 'built from the target when the server sends no label')
  assert.equal(priceChipLabel({ label: '  ', target: 'price:50-' }), 'Over $50')
})

test('the price the server holds comes from the price chip of the refine list', () => {
  assert.deepEqual(serverPrice(fixturePrice.refine), { min: 50, max: 200 })
  assert.equal(serverPrice(fixtureRefine.refine), null)
  assert.equal(serverPrice(undefined), null)
  assert.equal(serverPrice([{ id: 'price', kind: 'price', target: 'garbage', label: 'x' }]), null)
})

test('validation: negative or non-numeric -> "Enter a price of $0 or more"; max below min -> "Max must be at least the min"; empty and cents are fine', () => {
  assert.deepEqual(checkPrice('', ''), { range: { min: null, max: null }, errors: {} })
  assert.deepEqual(checkPrice('50', '200'), { range: { min: 50, max: 200 }, errors: {} })
  assert.deepEqual(checkPrice('12.50', '$20'), { range: { min: 12.5, max: 20 }, errors: {} })
  assert.deepEqual(checkPrice('-5', '').errors, { min: 'Enter a price of $0 or more' })
  assert.deepEqual(checkPrice('', 'abc').errors, { max: 'Enter a price of $0 or more' })
  assert.deepEqual(checkPrice('1e3', '').errors, { min: 'Enter a price of $0 or more' })
  assert.deepEqual(checkPrice('200', '50').errors, { max: 'Max must be at least the min' })
  assert.deepEqual(checkPrice('50', '50').errors, {}, 'equal is allowed')
  assert.deepEqual(checkPrice('0', '').errors, {})
})

test('the request body: both ends, one open end, or {} to clear', () => {
  assert.deepEqual(priceBody({ min: 50, max: 200 }), { min: 50, max: 200 })
  assert.deepEqual(priceBody({ min: null, max: 200 }), { min: null, max: 200 })
  assert.deepEqual(priceBody({ min: null, max: null }), {})
  assert.equal(hasPrice({ min: null, max: null }), false)
})

test('the current-results count respects the range (inclusive; no price does not match) with and without choices', () => {
  const items = [{ price: 40 }, { price: 50 }, { price: 120 }, { price: 200 }, { price: 201 }, { price: null }].map((i) => ({ ...i, attrs: {} as Record<string, string[]> }))
  assert.equal(matchCount(items, {}, { min: 50, max: 200 }), 3)
  assert.equal(matchCount(items, {}, { min: null, max: 100 }), 2)
  assert.equal(matchCount(items, {}, { min: 200, max: null }), 2)
  assert.equal(matchCount(items, {}, null), 0, 'nothing chosen: no line')
  const withAttrs = [{ price: 100, attrs: { color: ['gray'] } }, { price: 300, attrs: { color: ['gray'] } }, { price: 100, attrs: { color: ['blue'] } }]
  assert.equal(matchCount(withAttrs, { color: ['gray'] }, { min: null, max: 200 }), 1, 'AND with the tiles')
  assert.equal(matchCount(withAttrs, { color: ['gray'] }), 2, 'no price: as before')
  assert.equal(inPriceRange({ price: null }, { min: null, max: null }), true)
})

test('the result note: the range, "(N results left out)" only when N > 0, nothing without a price filter', () => {
  assert.equal(priceNote({ min: 50, max: 200, removed: 4 }), 'Prices limited to $50-$200 (4 results left out).')
  assert.equal(priceNote({ min: 50, max: 200, removed: 1 }), 'Prices limited to $50-$200 (1 result left out).')
  assert.equal(priceNote({ min: 50, max: 200, removed: 0 }), 'Prices limited to $50-$200.')
  assert.equal(priceNote({ min: 50, max: 200 }), 'Prices limited to $50-$200.')
  assert.equal(priceNote({ min: null, max: 200, removed: 2 }), 'Prices limited to under $200 (2 results left out).')
  assert.equal(priceNote({ min: 50, max: null }), 'Prices limited to over $50.')
  assert.equal(priceNote({ min: null, max: null, removed: 3 }), null)
  assert.equal(priceNote(null), null)
  assert.equal(priceNote(undefined), null)
})

test('chips: the price chip is a coral choice after the other choices; the budget parsed from the request is hidden while it exists and returns without it', () => {
  const q = { category: 'rug', price_max: 300, style_terms: ['modern'] }
  const withPrice = mergeChips(requestChips(q), [], fixturePrice.refine!)
  assert.deepEqual(withPrice.map((c) => c.label), ['rug', 'modern', 'Colour: gray or blue', 'Style: vintage', 'Price: $50-$200'])
  assert.ok(!withPrice.some((c) => c.label.startsWith('Up to')))
  const price = withPrice.at(-1)!
  assert.equal(price.choice, true)
  assert.deepEqual(price.remove, { type: 'refine', id: 'price' }, 'the x uses the same /refine/remove path as the other chips')
  assert.ok(mergeChips(requestChips(q), [], fixtureRefine.refine!).some((c) => c.label === 'Up to $300'), 'back when the price is cleared')
  // A chip with no label is built from its target; a price chip listed before the filters still sorts last.
  const reordered = mergeChips(requestChips(q), [], [{ id: 'price', kind: 'price', target: 'price:-200', label: '' }, ...fixtureRefine.refine!])
  assert.equal(reordered.at(-1)?.label, 'Under $200')
  // A local (unsaved) price hides the parsed budget too.
  assert.ok(!mergeChips(requestChips(q), [], [], true).some((c) => c.label === 'Up to $300'))
})

// ---- the request: price only when changed, {} to clear ----

type Call = { path: string; body: unknown }
beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) } })
})
afterEach(() => {
  mock.timers.reset()
  Reflect.deleteProperty(globalThis, 'sessionStorage')
})

async function session() {
  const calls: Call[] = []
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'http://x').pathname.replace('/api/shop', '')
    calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : null })
    if (path === '/search') return reply({ job_id: 'j1' }, 202)
    if (path.startsWith('/job/')) return reply({ state: 'done', result: fixtureBundles.results.state.status === 'done' ? fixtureBundles.results.state.view : {} })
    if (path === '/refine') return reply({ refine: [{ id: 'price', kind: 'price', target: 'price:50-200', label: 'Price: $50-$200' }] })
    if (path === '/shop-again') return reply({ job_id: 'j2' }, 202)
    throw new Error(`no route for ${path}`)
  }) as typeof fetch
  const controller = new ShopController(createShopClient(fetchFn))
  void controller.search('rug')
  for (let i = 0; i < 20 && controller.getState().status !== 'done'; i++) {
    mock.timers.tick(1000)
    for (let j = 0; j < 12; j++) await Promise.resolve()
  }
  return { controller, refines: () => calls.filter((c) => c.path === '/refine').map((c) => c.body), calls }
}

test('POST /refine: price alone when only the price changed, with filters when both did, {} to clear; filters stay out when unchanged', async () => {
  const t = await session()
  await t.controller.saveFilters(undefined, { min: 50, max: 200 })
  await t.controller.saveFilters([{ dimension: 'color', values: ['gray'] }], { min: null, max: 150 })
  await t.controller.saveFilters(undefined, {})
  await t.controller.saveFilters([])
  const sid = 'fixture-session'
  assert.deepEqual(t.refines(), [
    { session_id: sid, price: { min: 50, max: 200 } },
    { session_id: sid, filters: [{ dimension: 'color', values: ['gray'] }], price: { min: null, max: 150 } },
    { session_id: sid, price: {} },
    { session_id: sid, filters: [] },
  ])
})

test('Shop Again with these saves the price with POST /refine, then Shop Again without price or filters', async () => {
  const t = await session()
  await t.controller.searchAgain('', undefined, { min: 50, max: null })
  assert.deepEqual(t.refines(), [{ session_id: 'fixture-session', price: { min: 50, max: null } }])
  assert.deepEqual(t.calls.filter((c) => c.path === '/shop-again').map((c) => c.body), [{ session_id: 'fixture-session', refine_text: null }])
})

// ---- the view ----

const noop = () => {}
const props = (key: string, over: Partial<ShopViewProps> = {}): ShopViewProps => ({
  state: fixtureBundles[key].state, value: '', onChange: noop, onSubmit: noop, onExample: noop, onRetry: noop, refineText: '', onRefineChange: noop, onShopAgain: noop,
  onRate: noop, onComment: noop, onCommentBlur: noop, onRetryRating: noop, onRemoveRefine: noop, onRemoveContext: noop,
  onAnswer: noop, onSubmitAnswers: noop, onRetryAnswers: noop, onSearchFilters: noop, onSaveFilters: noop,
  meta: fixtureBundles[key].meta, savedOpen: true, onToggleSaved: noop, savedTab: 'love', onSavedTab: noop, onResolve: async () => null, ...over,
})
const view = async (key: string, over: Partial<ShopViewProps> = {}) => {
  const { default: View } = await loadModule<{ default: ComponentType<ShopViewProps> }>('/src/shop/ShopView.tsx')
  return render(View, props(key, over))
}

test('results page: the price chip with its x, the budget chip hidden, the note under the headline, the badge counts the price as one', async () => {
  const html = await view('askprice')
  assert.match(html, /Price: \$50-\$200<button type="button" class="shop-chip-x" aria-label="Remove Price: \$50-\$200"/)
  assert.doesNotMatch(html, /Up to \$300/)
  assert.match(html, /<p class="shop-price-note">Prices limited to \$50-\$200 \(4 results left out\)\.<\/p>/)
  // Three chosen options (gray, blue, vintage) and the price as one: 4.
  assert.match(html, /filters-badge">4<span class="visually-hidden"> chosen/)
  // Without a price chip: the budget is back, no note, two choices.
  const plain = await view('askpolish')
  assert.match(plain, /Up to \$300/)
  assert.doesNotMatch(plain, /shop-price-note|Price: /)
})

test('the dialog: a Price row under the text box with Min and Max ($ prefix, decimal keyboard, step 1, min 0, placeholders) pre-filled from the server chip', async () => {
  const { FiltersDialog } = await loadModule<{ FiltersDialog: ComponentType<Record<string, unknown>> }>('/src/shop/FiltersModal.tsx')
  const p = { facets: [], selection: {}, refineText: '', onRefineChange: noop, matchText: null, priceMin: '50', priceMax: '200', onPriceChange: noop, priceErrors: {}, onToggle: noop, onClear: noop, onClose: noop, onSearch: noop, block: null, returnFocus: { current: null } }
  const html = render(FiltersDialog, { p, titleId: 'ttl' })
  assert.ok(html.indexOf('filters-text') < html.indexOf('filters-price') && html.indexOf('filters-price') < html.indexOf('filters-body'))
  assert.match(html, /<label class="filters-price-label" for="ttl-price-min">Min<\/label>/)
  assert.match(html, /<label class="filters-price-label" for="ttl-price-max">Max<\/label>/)
  assert.equal(html.match(/>\$<\/span>/g)?.length, 2)
  assert.match(html, /<input[^>]*id="ttl-price-min"[^>]*type="number"[^>]*inputMode="decimal"[^>]*step="1"[^>]*min="0"[^>]*placeholder="No min"[^>]*value="50"/)
  assert.match(html, /<input[^>]*id="ttl-price-max"[^>]*placeholder="No max"[^>]*value="200"/)
  assert.doesNotMatch(html, /filters-error/)
  // Pre-filled by the page from the server chip (the page test above reads the same fixture): the dialog opens with 50 and 200.
  const bad = render(FiltersDialog, { p: { ...p, priceMin: '50', priceMax: '20', priceErrors: { max: 'Max must be at least the min' } }, titleId: 'ttl' })
  assert.match(bad, /aria-invalid="true"[^>]*aria-describedby="ttl-price-max-error"/)
  assert.match(bad, /<p id="ttl-price-max-error" class="filters-error" role="alert">Max must be at least the min<\/p>/)
  // Clear all is on with only a price typed.
  assert.doesNotMatch(html.match(/<button[^>]*>Clear all<\/button>/)?.[0] ?? '', /disabled/)
  const none = render(FiltersDialog, { p: { ...p, priceMin: '', priceMax: '' }, titleId: 'ttl' })
  assert.match(none.match(/<button[^>]*>Clear all<\/button>/)?.[0] ?? '', /disabled/)
})

test('the dialog (source): an invalid price keeps Shop Again enabled but sends nothing and focuses the first bad field; the page sends only what changed', async () => {
  const { readFileSync } = await import('node:fs')
  const modal = readFileSync(new URL('../src/shop/FiltersModal.tsx', import.meta.url), 'utf8')
  assert.match(modal, /p\.priceErrors\.min \? minRef\.current : p\.priceErrors\.max \? maxRef\.current : null/)
  assert.match(modal, /disabled=\{p\.block !== null\} onClick=\{search\}/, 'enabled whatever the price says')
  const ui = readFileSync(new URL('../src/shop/ShopView.tsx', import.meta.url), 'utf8')
  assert.match(ui, /const priceChanged = priceValid && !samePrice\(/)
  assert.match(ui, /const sendPrice = priceChanged \? priceBody\(priceCheck\.range\) : undefined/)
  assert.match(ui, /const sendFilters = changed \? filterChoices\(selection\) : undefined/)
})

test('fixture askprice is the dev state for this: the price chip, the note and a parsed budget that is hidden', () => {
  assert.ok(fixtureBundles.askprice)
  assert.equal(fixturePrice.search?.price_filter?.removed, 4)
  assert.equal(fixturePrice.search?.query?.price_max, 300)
  assert.ok(fixtureItems.length > 0)
})
