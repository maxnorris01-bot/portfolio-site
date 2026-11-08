import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, test } from 'node:test'
import type { ComponentType } from 'react'
import { refineTextChip } from '../src/shop/chips.ts'
import { fixtureBundles, fixtureFilters, fixtureStates } from '../src/shop/fixtures.ts'
import { viewFacets } from '../src/shop/filters.ts'
import type { ShopViewProps } from '../src/shop/viewprops.ts'
import { closeServer, loadModule, render } from './helpers/ssr.ts'

after(closeServer)

const noop = () => {}
const props = (state: ShopViewProps['state'], over: Partial<ShopViewProps> = {}): ShopViewProps => ({
  state, value: '', onChange: noop, onSubmit: noop, onExample: noop, onRetry: noop, refineText: '', onRefineChange: noop, onShopAgain: noop,
  onRate: noop, onRetryRating: noop, onRemoveRefine: noop, onRemoveContext: noop,
  onAnswer: noop, onSubmitAnswers: noop, onRetryAnswers: noop, onSearchFilters: noop, onSaveFilters: noop,
  meta: { usage: null, blocked: { search: false, again: false }, maintenance: false },
  savedOpen: false, onToggleSaved: noop, savedTab: 'love', onSavedTab: noop, onResolve: async () => null, ...over,
})
const view = async (key: string, over: Partial<ShopViewProps> = {}) => {
  const { default: View } = await loadModule<{ default: ComponentType<ShopViewProps> }>('/src/shop/ShopView.tsx')
  return render(View, props(fixtureBundles[key].state, { meta: fixtureBundles[key].meta, ...over }))
}
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const header = (html: string) => html.match(/<header class="shop-head">.*?<\/header>/s)?.[0] ?? ''

test('header: Refine search then Shop Again, in the right cluster after the usage chip; the old bottom bar and "Search again" line are gone', async () => {
  const html = await view('askrefine')
  const head = header(html)
  const at = (s: string) => head.indexOf(s)
  assert.ok(at('usage-chip') > -1 && at('usage-chip') < at('class="filters-button"') && at('class="filters-button"') < at('shop-again-button'), 'usage chip, Refine search, Shop Again')
  assert.match(head, /<button type="button" class="btn btn-primary shop-again-button"[^>]*>Shop Again<\/button>/)
  assert.doesNotMatch(html, /class="shop-again"|shop-few|Search again|placeholder="more wood, no glass"/)
  assert.ok(html.indexOf('class="shop-grid"') > html.indexOf('</header>'))
})

test('Shop Again: sends the refine text through the existing flow (the page passes refineText; the controller sends refine_text)', () => {
  const page = read('../src/pages/Shop.tsx')
  assert.match(page, /onShopAgain=\{\(\) => \{\s*void shop\.shopAgain\(refineText\)/)
  assert.match(page, /void shop\.searchAgain\(refineText, filters, price\)/)
  assert.match(read('../src/shop/api.ts'), /refine_text: refineText/)
  const ui = read('../src/shop/ShopView.tsx')
  assert.match(ui, /onClick=\{props\.onShopAgain\}/)
})

test('blocked reason: the note shows only while blocked, tied to the button with aria-describedby; never otherwise', async () => {
  const { default: View } = await loadModule<{ default: ComponentType<ShopViewProps> }>('/src/shop/ShopView.tsx')
  const st = fixtureStates.askrefine as Extract<ShopViewProps['state'], { status: 'done' }>
  const open = await render(View, props(st))
  assert.doesNotMatch(open, /shop-head-why/)
  assert.doesNotMatch(open, /aria-describedby="[^"]*"[^>]*>Shop Again/)
  const reasons: [Partial<ShopViewProps>, ShopViewProps['state'], string][] = [
    [{}, { ...st, view: { ...st.view, shop_agains_used: 25, shop_agains_cap: 25 } }, 'You have used every Shop Again for this visit.'],
    [{ meta: { usage: null, blocked: { search: false, again: true }, maintenance: false } }, st, 'Shop Again is not available right now.'],
    [{}, { ...st, ratings: { 'fx-1': { rating: 'love', save: 'saving', error: null, touched: 1 } } }, 'Saving your ratings…'],
  ]
  for (const [over, state, text] of reasons) {
    const html = await render(View, props(state, over))
    const id = html.match(/class="btn btn-primary shop-again-button"[^>]*aria-describedby="([^"]+)"/)?.[1] ?? html.match(/aria-describedby="([^"]+)"[^>]*class="btn btn-primary shop-again-button"/)?.[1]
    assert.ok(id, text)
    assert.ok(html.includes(`<p id="${id}" class="shop-head-why">${text}</p>`), text)
    assert.match(html, /shop-again-button"[^>]*disabled=""|disabled=""[^>]*shop-again-button/)
  }
})

test('refine text chip: “text” truncated to 28 characters, coral choice chip with an x that clears it, counted in the badge', async () => {
  assert.equal(refineTextChip('   '), null)
  assert.equal(refineTextChip('more wood')?.label, '“more wood”')
  const long = 'a very long wish about wood and glass and metal'
  const c = refineTextChip(long)
  assert.ok(c && c.label.length <= 28 + 2 && c.label.endsWith('…”') && c.title === long)
  assert.equal(refineTextChip('x'.repeat(28))?.label, `“${'x'.repeat(28)}”`)
  const html = await view('askfilters', { refineText: 'more wood' })
  assert.match(html, /<li class="chip shop-understood is-choice" title="more wood">“more wood”<button[^>]*aria-label="Remove “more wood” \(more wood\)"/)
  assert.match(html, /Refine search<span class="filters-badge">1<span class="visually-hidden"> chosen/)
  const withChoices = await view('askfilters', { refineText: 'more wood', initialFilters: { color: ['gray'], style: ['vintage'] } })
  assert.match(withChoices, /filters-badge">3</, 'two chosen dimensions plus the text')
  const none = await view('askfilters', { refineText: '   ' })
  assert.doesNotMatch(none, /filters-badge|is-choice/)
  assert.match(read('../src/shop/ShopView.tsx'), /remove\.type === 'text' \? props\.onRefineChange\(''\)/)
})

test('Saved row: above the grid under the header, always shown (also with nothing saved), tabs with counts, compact items, Show all toggle', async () => {
  const html = await view('saved')
  assert.ok(html.indexOf('</header>') < html.indexOf('class="card shop-saved"') && html.indexOf('class="card shop-saved"') < html.indexOf('class="shop-grid"'))
  assert.match(html, /Loved \(2\)/)
  assert.match(html, /Liked \(2\)/)
  assert.match(html, /<li class="shop-mini"><a class="shop-mini-link"[^>]*><span class="shop-mini-thumb">.*?<span class="shop-mini-title">[^<]+<\/span><span class="shop-mini-price">\$[\d.,]+<\/span>/s)
  assert.match(html, /Show all ›/)
  const empty = await view('savedempty')
  assert.match(empty, /class="card shop-saved"/)
  assert.match(empty, /<p class="shop-saved-empty">Love or like results to see them here\.<\/p>/)
  assert.match(await view('results'), /class="card shop-saved"/, 'shown on every results page')
  const css = read('../src/pages/Shop.css')
  assert.match(css.match(/\.shop-saved-strip \{[^}]*\}/)?.[0] ?? '', /overflow-x: auto/)
  assert.match(css.match(/\.shop-mini-thumb \.shop-thumb \{[^}]*\}/)?.[0] ?? '', /width: 40px;\s*height: 40px/)
  assert.match(css.match(/\.shop-mini-title \{[^}]*\}/)?.[0] ?? '', /text-overflow: ellipsis;\s*white-space: nowrap/)
})

test('Refine dialog: text box under the subtitle (label, maxLength 200, no autocomplete, placeholder, hint), footer "Shop Again with these", Clear all clears the text too', async () => {
  const { FiltersDialog } = await loadModule<{ FiltersDialog: ComponentType<{ p: Record<string, unknown>; titleId: string }> }>('/src/shop/FiltersModal.tsx')
  const facets = viewFacets(fixtureFilters).facets
  const p = { facets, selection: {}, refineText: 'more wood', onRefineChange: noop, matchText: null, priceMin: '', priceMax: '', onPriceChange: noop, priceErrors: {}, onToggle: noop, onClear: noop, onClose: noop, onSearch: noop, block: null, returnFocus: { current: null } }
  const html = await render(FiltersDialog, { p, titleId: 'ttl' })
  assert.ok(html.indexOf('filters-intro') < html.indexOf('>Refine your search</label>') && html.indexOf('>Refine your search</label>') < html.indexOf('filters-body'))
  assert.match(html, /<input id="ttl-text" class="shop-input" type="text" maxLength="200" autoComplete="off" placeholder="more wood, no glass"[^>]*value="more wood"/)
  assert.match(html, /<p id="ttl-text-hint" class="filters-hint">Rate results to steer the next batch, or just search again\.<\/p>/)
  assert.match(html, /filters-show"[^>]*>Shop Again with these<\/button>/)
  assert.doesNotMatch(html, /Search again/)
  // Clear all is on with only text typed, off with neither.
  assert.doesNotMatch(html.match(/<button[^>]*>Clear all<\/button>/)?.[0] ?? '', /disabled/)
  const none = await render(FiltersDialog, { p: { ...p, refineText: '' }, titleId: 'ttl' })
  assert.match(none.match(/<button[^>]*>Clear all<\/button>/)?.[0] ?? '', /disabled/)
  const modal = read('../src/shop/FiltersModal.tsx')
  assert.match(modal, /e\.key !== 'Enter'[^]*?search\(\)/, 'Enter in the text box does what the footer button does (a bad price focuses its field instead)')
  const ui = read('../src/shop/ShopView.tsx')
  assert.match(ui, /const clear = \(\) => \{\s*onSelection\(\{\}\)\s*props\.onRefineChange\(''\)\s*setPriceDraft/)
  assert.match(ui, /refineText=\{props\.refineText\}\s*onRefineChange=\{props\.onRefineChange\}/, 'the dialog is bound to the same state as the chip')
  assert.match(ui, /changed \|\| priceChanged \? props\.onSearchFilters\(sendFilters, sendPrice\) : props\.onShopAgain\(\)/, 'save what changed (tiles, price), then Shop Again')
})

test('screensaver: no progress-driven change reaches the canvas (the wait panel passes nothing)', () => {
  assert.doesNotMatch(read('../src/shop/ShopView.tsx'), /stepProgress|progress=\{/)
  assert.doesNotMatch(read('../src/shop/WaitScreensaver.tsx'), /progress/i)
})
