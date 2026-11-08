import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import type { ComponentType } from 'react'
import { activeCount, filterChips, filterChoices, matchCount, matchesSelection, sameSelection, serverSelection, toggleOption, trapTab, unknownLine, viewFacets, type Selection } from '../src/shop/filters.ts'
import { fixtureBundles, fixtureFilters, fixtureRefine, fixtureRefineMatch, fixtureStates, filterItemsFixture, refineChips } from '../src/shop/fixtures.ts'
import type { ShopViewProps } from '../src/shop/viewprops.ts'
import { closeServer, loadModule, render } from './helpers/ssr.ts'

after(closeServer)

// The dialog's props, as far as the test sets them (the component's own type lives in a .tsx file the test project does not compile).
type FiltersModalProps = { facets: typeof facets; unknown?: Record<string, number>; selection: Selection; refineText: string; onRefineChange: () => void; matchText: string | null; priceMin: string; priceMax: string; onPriceChange: () => void; priceErrors: { min?: string; max?: string }; onToggle: () => void; onClear: () => void; onClose: () => void; onSearch: () => void; block: string | null; returnFocus: { current: null } }
const facets = viewFacets(fixtureFilters).facets
const items = filterItemsFixture

test('fixture: askfilters has 12 results with attrs, facets in the contract shape, and an unknown count', () => {
  assert.equal(items.length, 12)
  assert.ok(items.every((i: (typeof items)[number]) => i.attrs && ['color', 'material', 'shape', 'style', 'size', 'feature'].every((k) => Array.isArray(i.attrs?.[k]))))
  assert.deepEqual(facets.map((f) => f.dimension), ['color', 'material', 'style', 'shape', 'feature'])
  const gray = facets[0].options.find((o) => o.value === 'gray')
  assert.deepEqual(gray, { value: 'gray', label: 'Gray', count: 4, icon: null, swatches: ['#8C8C8C'] })
  assert.deepEqual(viewFacets(fixtureFilters).unknown?.color, 1)
  assert.ok(facets.every((f) => f.options.length >= 2 && f.options.length <= 10 && f.options.every((o) => o.count >= 1)))
})

test('facets: read from view.search (real shape) first, falling back to the top level', async () => {
  const batch = viewFacets(fixtureFilters)
  assert.ok(fixtureFilters.search?.facets?.length && !fixtureFilters.facets)
  assert.equal(batch.facets.length, 5)
  const top = { ...fixtureFilters, search: { ...fixtureFilters.search!, facets: undefined, facets_unknown: undefined }, facets: batch.facets, facets_unknown: batch.unknown }
  assert.deepEqual(viewFacets(top), batch)
  const both = { ...top, search: { ...fixtureFilters.search!, facets: batch.facets.slice(0, 1), facets_unknown: {} } }
  assert.equal(viewFacets(both).facets.length, 1)
  assert.deepEqual(viewFacets({ search: null }), { facets: [], unknown: undefined })
})

test('match count: OR within a dimension, AND across; nothing chosen counts nothing', () => {
  assert.equal(matchCount(items, { color: ['gray'] }), 4)
  assert.equal(matchCount(items, { color: ['gray', 'blue'] }), 6) // OR within colour (item 1 is both)
  assert.equal(matchCount(items, { color: ['gray', 'blue'], style: ['vintage'] }), 3) // AND across
  assert.equal(matchCount(items, {}), 0)
})

test('match logic: an item with an empty list for a chosen dimension does not match; one with no attrs at all neither', () => {
  const unknown = items[10] // no listed details
  assert.equal(matchesSelection(unknown, { color: ['gray'] }), false)
  assert.equal(matchesSelection({}, { style: ['modern'] }), false)
  assert.equal(matchesSelection(unknown, {}), true)
  assert.equal(matchesSelection({ attrs: { color: ['gray'], style: [] } }, { color: ['gray'], style: ['modern'] }), false)
})

test('unknown line: "3 have no colour info", singular for one, nothing for zero', () => {
  const color = facets[0]
  assert.equal(unknownLine(color, { color: 3 }), '3 have no colour info')
  assert.equal(unknownLine(color, { color: 1 }), '1 has no colour info')
  assert.equal(unknownLine(color, { color: 0 }), null)
  assert.equal(unknownLine(color, undefined), null)
})

test('toggling adds and removes; an emptied dimension is dropped; the live count follows', () => {
  let sel: Selection = {}
  sel = toggleOption(sel, 'color', 'gray')
  assert.equal(matchCount(items, sel), 4)
  sel = toggleOption(sel, 'color', 'blue')
  sel = toggleOption(sel, 'style', 'vintage')
  assert.equal(activeCount(sel), 3)
  assert.equal(matchCount(items, sel), 3)
  sel = toggleOption(toggleOption(sel, 'color', 'gray'), 'color', 'blue')
  assert.deepEqual(sel, { style: ['vintage'] })
  assert.deepEqual(toggleOption(sel, 'style', 'vintage'), {})
})

test('chips: one per dimension, "Colour: Gray or blue" (no "Next search" prefix), in the facets\' order; a value the batch no longer offers still shows', () => {
  const sel: Selection = { style: ['vintage'], color: ['gray', 'blue'] }
  assert.deepEqual(filterChips(sel, facets).map((c) => c.label), ['Colour: Gray or blue', 'Style: Vintage'])
  assert.deepEqual(filterChips(sel, facets).map((c) => c.key), ['filter:color', 'filter:style'])
  assert.deepEqual(filterChips({ color: ['teal'] }, facets).map((c) => c.label), ['Colour: Teal'])
  assert.deepEqual(filterChips({}, facets), [])
})

test('the request\'s filters list: a dimension and its values, empty dimensions left out', () => {
  assert.deepEqual(filterChoices({ color: ['gray', 'blue'], style: ['vintage'], shape: [] }), [
    { dimension: 'color', values: ['gray', 'blue'] },
    { dimension: 'style', values: ['vintage'] },
  ])
  assert.deepEqual(filterChoices({}), [])
})

test('server choices: read from the refine list\'s filter chips (id filter:<dimension>, target "dimension:v1,v2"), null when there are none', () => {
  assert.deepEqual(serverSelection(refineChips), { color: ['gray', 'blue'], style: ['vintage'] })
  assert.equal(serverSelection([{ id: 'answer:q_color', label: 'Walnut' }]), null)
  assert.equal(serverSelection(undefined), null)
  assert.deepEqual(serverSelection([{ id: 'filter:color', kind: 'filter', label: 'Colour: gray', target: 'color:gray' }]), { color: ['gray'] })
  assert.deepEqual(serverSelection([{ id: 'filter:color', kind: 'filter', label: 'x' }]), {}, 'no target: skipped')
  assert.ok(sameSelection({ color: ['blue', 'gray'] }, { color: ['gray', 'blue'] }))
  assert.ok(!sameSelection({ color: ['gray'] }, {}))
})

test('focus trap: Tab on the last control wraps to the first, Shift+Tab on the first to the last; elsewhere the browser moves on', () => {
  assert.equal(trapTab(4, 5, false), 0)
  assert.equal(trapTab(0, 5, true), 4)
  assert.equal(trapTab(2, 5, false), null)
  assert.equal(trapTab(2, 5, true), null)
  assert.equal(trapTab(-1, 5, false), 0)
  assert.equal(trapTab(-1, 5, true), 4)
})

// ---- the view ----

const noop = () => {}
const props = (state: ShopViewProps['state'], over: Partial<ShopViewProps> = {}): ShopViewProps => ({
  state, value: '', onChange: noop, onSubmit: noop, onExample: noop, onRetry: noop, refineText: '', onRefineChange: noop, onShopAgain: noop,
  onRate: noop, onRetryRating: noop, onRemoveRefine: noop, onRemoveContext: noop,
  onAnswer: noop, onSubmitAnswers: noop, onRetryAnswers: noop, onSearchFilters: noop, onSaveFilters: noop,
  meta: { usage: null, blocked: { search: false, again: false }, maintenance: false },
  savedOpen: true, onToggleSaved: noop, savedTab: 'love', onSavedTab: noop, onResolve: async () => null, ...over,
})
const againButton = (html: string) => html.match(/<button type="button" class="btn btn-primary shop-again-button"[^>]*>Shop Again/)?.[0] ?? 'NO BUTTON'
const view = async (key: string, over: Partial<ShopViewProps> = {}) => {
  const { default: View } = await loadModule<{ default: ComponentType<ShopViewProps> }>('/src/shop/ShopView.tsx')
  return render(View, props(fixtureBundles[key].state, { meta: fixtureBundles[key].meta, ...over }))
}

test('view: the Refine search button is on the results header (text entry lives in its dialog, so it shows without facets too)', async () => {
  const withFacets = await view('askfilters')
  assert.match(withFacets, /<button[^>]*class="filters-button"[^>]*aria-haspopup="dialog"[^>]*><svg class="filters-icon" width="18" height="18"[^>]*aria-hidden="true"[^>]*>.*<\/svg>Refine search<\/button>/)
  assert.match(withFacets, /12 results for/)
  for (const key of ['results', 'rated', 'batch2']) assert.match(await view(key), /class="filters-button"/, key)
})

test('view: the button shows for facets at the top level of the view too (older shape)', async () => {
  const batch = viewFacets(fixtureFilters)
  const top = { ...fixtureFilters, search: { ...fixtureFilters.search!, facets: undefined, facets_unknown: undefined }, facets: batch.facets, facets_unknown: batch.unknown }
  const { default: View } = await loadModule<{ default: ComponentType<ShopViewProps> }>('/src/shop/ShopView.tsx')
  const html = await render(View, props({ ...fixtureStates.askfilters, view: top } as typeof fixtureStates.askfilters, { meta: fixtureBundles.askfilters.meta }))
  assert.match(html, /filters-button/)
})

test('view: the grid never shrinks, whatever is chosen; the count and the cards stay at 12', async () => {
  const choices: Selection[] = [{ color: ['gray'], style: ['vintage'] }, { color: ['cream'], style: ['vintage'] }, { material: ['unobtainium'] }]
  for (const initialFilters of choices) {
    const html = await view('askfilters', { initialFilters })
    assert.match(html, /12 results for/)
    assert.doesNotMatch(html, / of 12 results for/)
    assert.equal(html.match(/class="shop-card"/g)?.length, 12)
    assert.doesNotMatch(html, /No results match|Clear filters/)
  }
})

test('view: local choices (a service with no filter chips) show a count on the button and one choice chip per dimension (no prefix)', async () => {
  const html = await view('askfilters', { initialFilters: { color: ['gray', 'blue'], style: ['vintage'] } })
  assert.match(html, /Refine search<span class="filters-badge">3<span class="visually-hidden"> chosen<\/span><\/span>/)
  assert.match(html, /<li class="chip shop-understood is-choice">Colour: Gray or blue<button[^>]*aria-label="Remove Colour: Gray or blue"/)
  assert.ok(html.includes('Style: Vintage'))
  assert.doesNotMatch(html, /Next search/)
  assert.doesNotMatch(html, /Search again with these choices|shop-few/, 'the line under the grid is gone: the header has Shop Again')
})

test('view: nothing chosen: no chips, no count', async () => {
  const html = await view('askfilters')
  assert.doesNotMatch(html, /Next search|apply on next search|is-choice|Search again with these choices|filters-badge/)
})

test('view: choice chips are never folded into "+N more": only the other chips overflow, the choices stay visible after the divider', async () => {
  const none = await view('askchipsmany')
  const html = await view('askchipsmany', { initialFilters: { color: ['gray'], material: ['wool'], style: ['vintage'] } })
  assert.match(none, /\+2 more/)
  assert.match(html, /\+2 more/, 'the same two chips behind the button, whatever is chosen')
  assert.doesNotMatch(html, /\+5 more/)
  assert.equal(html.match(/class="chip shop-understood"/g)?.length, 8)
  assert.equal(html.match(/class="chip shop-understood is-choice"/g)?.length, 3)
  const [neutral, choices] = html.split('shop-choices-divider')
  assert.ok(neutral.includes('shop-chip-more') && !neutral.includes('is-choice'))
  assert.ok(choices.includes('Colour: Gray') && choices.includes('Material: Wool') && choices.includes('Style: Vintage') && !choices.includes('shop-chip-more'))
})

test('view: the divider and the "apply on next search" label show only when there are choice chips', async () => {
  const none = await view('askfilters')
  assert.doesNotMatch(none, /shop-choices|apply on next search/)
  const html = await view('askfilters', { initialFilters: { color: ['gray', 'blue'] } })
  assert.match(html, /<div class="shop-choices"><span class="shop-choices-divider" aria-hidden="true"><\/span><span class="shop-choices-label">apply on next search<\/span><ul class="chip-list" aria-label="Choices for the next search">/)
  assert.doesNotMatch(html, /WHAT I|What I&#x27;m searching for<\/p>|Changes here apply/)
})

test('view: askrefine: the backend\'s filter chips are the chips (with an x through /refine/remove), the count is 3, the grid is whole', async () => {
  const html = await view('askrefine')
  assert.ok(html.includes('Colour: gray or blue') && html.includes('Style: vintage'))
  assert.doesNotMatch(html, /Next search/)
  assert.equal(html.match(/Colour: gray or blue/g)?.length, 2) // the chip text and its Remove label, never a second local chip
  assert.equal(html.match(/class="chip shop-understood is-choice"/g)?.length, 2)
  assert.match(html, /aria-label="Remove Style: vintage"/)
  assert.match(html, /Refine search<span class="filters-badge">3</)
  assert.equal(html.match(/class="shop-card"/g)?.length, 12)
})

test('view: Shop Again is enabled with no ratings and has the hint as its title; the old rating rule is gone', async () => {
  const html = await view('askrefine')
  assert.doesNotMatch(againButton(html), /disabled/)
  assert.ok(againButton(html).includes('title="Rate results to steer the next batch, or just search again."'))
  assert.doesNotMatch(html, /<p[^>]*>Rate results to steer/, 'no permanent hint line on the page')
  assert.doesNotMatch(html, /Rate at least one result first/)
  assert.equal(fixtureRefine.search?.results.length, 12)
  assert.deepEqual(fixtureRefine.ratings ?? {}, {})
})

test('view: after a batch with choices, a muted line says how many match all of them; "None" at zero; nothing when absent', async () => {
  const withMatch = await view('askrefinematch')
  assert.match(withMatch, /<p class="shop-match">5 match all your choices<\/p>/)
  assert.doesNotMatch(await view('askrefine'), /match all your choices/)
  const { default: View } = await loadModule<{ default: ComponentType<ShopViewProps> }>('/src/shop/ShopView.tsx')
  const none = { ...fixtureRefineMatch, search: { ...fixtureRefineMatch.search!, filters_match: { satisfied_all: 0, shown: 12 } } }
  const html = await render(View, props({ ...(fixtureStates.askrefinematch as Extract<ShopViewProps['state'], { status: 'done' }>), view: none }))
  assert.match(html, /<p class="shop-match">None match all your choices<\/p>/)
})

test('view: the results header is one card: headline, Batch pill, match line on the left; usage chip, Refine search and Shop Again on the right; then the chips', async () => {
  const html = await view('askrefinematch')
  const head = html.match(/<header class="shop-head">.*?<\/header>/s)?.[0] ?? ''
  assert.ok(head, 'one header card')
  assert.match(head, /<div class="shop-head-left"><p class="shop-count" role="status" aria-live="polite">12 results for “[^<]*”<\/p><span class="shop-batch">Batch 2<\/span><p class="shop-match">5 match all your choices<\/p><\/div>/)
  assert.match(head, /<div class="shop-head-right"><div class="shop-head-cluster"><span class="usage">.*<button type="button" class="filters-button".*<button type="button" class="btn btn-primary shop-again-button"[^>]*>Shop Again<\/button>/s)
  assert.ok(head.indexOf('shop-head-top') < head.indexOf('class="shop-chips"'), 'the chips are line 2')
  assert.doesNotMatch(html, /Changes here apply|shop-chips-title/)
  assert.doesNotMatch(html, /<p class="shop-usage"/, 'the usage line under the form is replaced by the chip')
})

test('view: the Refine search button shows the count of chosen options as a coral badge only when above zero', async () => {
  assert.doesNotMatch(await view('askfilters'), /filters-badge/)
  const html = await view('askfilters', { initialFilters: { color: ['gray', 'blue'], style: ['vintage'] } })
  assert.match(html, /Refine search<span class="filters-badge">3<span class="visually-hidden"> chosen<\/span><\/span><\/button>/)
  const { readFileSync } = await import('node:fs')
  const css = readFileSync(new URL('../src/shop/Filters.css', import.meta.url), 'utf8')
  const button = css.match(/\.filters-button \{[^}]*\}/)?.[0] ?? ''
  for (const part of ['background: var(--color-navy)', 'color: #fff', 'var(--font-heading)', 'font-size: 14px', 'font-weight: 600', 'border-radius: 8px', 'padding: 9px 16px', 'white-space: nowrap']) assert.ok(button.includes(part), part)
  assert.match(css, /\.filters-button:hover \{\s*background: #1c3358/)
  assert.match(css, /\.filters-button:focus-visible \{\s*outline: 2px solid/)
  const badge = css.match(/\.filters-badge \{[^}]*\}/)?.[0] ?? ''
  for (const part of ['min-width: 20px', 'height: 20px', 'background: var(--color-accent)', 'color: #fff', 'var(--font-mono)', 'font-size: 12px', 'font-weight: 600']) assert.ok(badge.includes(part), part)
})

test('view: Shop Again is off with its own reasons (cap reached), shown as a note under the header cluster, not for missing ratings', async () => {
  const { default: View } = await loadModule<{ default: ComponentType<ShopViewProps> }>('/src/shop/ShopView.tsx')
  const st = fixtureStates.askrefine as Extract<ShopViewProps['state'], { status: 'done' }>
  const capped = await render(View, props({ ...st, view: { ...st.view, shop_agains_used: 25, shop_agains_cap: 25 } }))
  assert.match(againButton(capped), /disabled=""/)
  const why = againButton(capped).match(/aria-describedby="([^"]+)"/)?.[1]
  assert.ok(why)
  assert.ok(capped.includes(`<p id="${why}" class="shop-head-why">You have used every Shop Again for this visit.</p>`))
})

test('view: the old Ask tile and the clarifying panel are gone; a running search shows the wait panel', async () => {
  const html = await view('running')
  assert.doesNotMatch(html, /clarify|<h4>Ask<\/h4>/)
  assert.match(html, /<section class="card wait-panel"/)
  assert.match(html, /<canvas class="wait-canvas" aria-hidden="true"/)
  assert.match(html, /Results appear here as soon as they are ready\./)
  assert.match(html, /class="shop-steps"/)
  assert.equal(html.match(/class="shop-steps"/g)?.length, 1)
  assert.equal(html.match(/class="shop-timer"/g)?.length, 1)
  // A ready clarify object no longer renders a panel.
  const asking = await view('askpics')
  assert.doesNotMatch(asking, /class="card clarify|clarify-q-title/)
  assert.match(asking, /wait-panel/)
})

test('view: wide puts the steps in the right column, narrow stacks them below the animation; narrow keeps the sentence (clamped to two lines by the stylesheet)', async () => {
  const wide = await view('running', { wide: true })
  assert.match(wide, /wait-panel has-side/)
  assert.match(wide, /<span class="shop-caps">Searching<\/span>/)
  const narrow = await view('running', { wide: false })
  assert.doesNotMatch(narrow, /has-side/)
  assert.match(narrow, /Searching for “modern couch under \$1000”/)
  assert.match(await view('again', { wide: true }), /<span class="shop-caps">Finding batch 2<\/span>/)
})

// ---- the modal ----

test('modal: role dialog, aria-modal, labelled by its title; the intro line; sections in the facets\' order; tiles are toggles with "Gray (4)"', async () => {
  const { FiltersDialog } = await loadModule<{ FiltersDialog: ComponentType<{ p: FiltersModalProps; titleId: string }> }>('/src/shop/FiltersModal.tsx')
  const p: FiltersModalProps = { facets, unknown: viewFacets(fixtureFilters).unknown, selection: { color: ['gray'] }, refineText: '', onRefineChange: noop, matchText: '4 of the current results match', priceMin: '', priceMax: '', onPriceChange: noop, priceErrors: {}, onToggle: noop, onClear: noop, onClose: noop, onSearch: noop, block: null, returnFocus: { current: null } }
  const html = await render(FiltersDialog, { p, titleId: 'ttl' })
  assert.match(html, /role="dialog" aria-modal="true" aria-labelledby="ttl"/)
  assert.match(html, /<h2 id="ttl" class="filters-title">Refine search<\/h2>/)
  assert.ok(html.includes('Your choices are used the next time you search again. Your current results stay as they are.'))
  const sections = [...html.matchAll(/<h3 class="filters-section-title">([^<]+)<\/h3>/g)].map((m) => m[1])
  assert.deepEqual(sections, facets.map((f) => f.title))
  assert.match(html, /aria-pressed="true"><span class="filter-pic is-swatch"[^]*?Gray <span class="filter-count">\(4\)<\/span>/)
  assert.match(html, /aria-pressed="false"/)
  assert.ok(html.includes('1 has no colour info'))
  // The footer: the live match text, Clear all, Close and the primary Shop Again with these (no "Show N results").
  assert.match(html, /<p class="filters-match" role="status">4 of the current results match<\/p>/)
  assert.match(html, /btn btn-primary filters-show"[^>]*>Shop Again with these<\/button>/)
  assert.ok(html.includes('Clear all') && html.includes('>Close<'))
  assert.doesNotMatch(html, /Show \d+ result|filters-few/)
  assert.doesNotMatch(html.match(/btn btn-primary filters-show"[^>]*>/)?.[0] ?? '', /disabled/)
  // Nothing chosen: no match text. Blocked: the button is off and the reason shows.
  const none = await render(FiltersDialog, { p: { ...p, selection: {}, matchText: null }, titleId: 'ttl' })
  assert.doesNotMatch(none, /filters-match/)
  const blocked = await render(FiltersDialog, { p: { ...p, block: 'You have used every Shop Again for this visit.' }, titleId: 'ttl' })
  assert.match(blocked, /btn btn-primary filters-show" disabled=""[^>]*>Shop Again with these<\/button>/)
  assert.ok(blocked.includes('You have used every Shop Again for this visit.'))
})

test('modal: the source wires Esc to close, the Tab trap, focus in on open and back to the button, aria-modal, an 80vh cap and a sheet under 700px', async () => {
  const { readFileSync } = await import('node:fs')
  const tsx = readFileSync(new URL('../src/shop/FiltersModal.tsx', import.meta.url), 'utf8')
  assert.match(tsx, /e\.key === 'Escape'[^}]*onClose\(\)/s)
  assert.match(tsx, /trapTab\(/)
  assert.match(tsx, /rootRef\.current\?\.focus\(\)/)
  assert.match(tsx, /back\?\.focus\(\)/)
  const css = readFileSync(new URL('../src/shop/Filters.css', import.meta.url), 'utf8')
  assert.match(css, /\.filters-dialog \{[^}]*max-height: 80vh/s)
  assert.match(css, /@media \(max-width: 699px\) \{[^@]*\.filters-dialog \{[^}]*max-height: none/s)
  assert.match(css, /\.filters-body \{[^}]*overflow-y: auto/s)
})
