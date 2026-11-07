import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import type { ComponentType } from 'react'
import { activeCount, applyFilters, cleanSelection, fewLine, filterChips, matchesSelection, refineTextFor, toggleOption, trapTab, unknownLine, viewFacets, type Selection } from '../src/shop/filters.ts'
import { fixtureBundles, fixtureFilters, fixtureFiltersFew, fixtureFiltersFewSelection, fixtureStates, filterItemsFixture } from '../src/shop/fixtures.ts'
import { filtersFew } from '../src/shop/copy.ts'
import type { ShopViewProps } from '../src/shop/viewprops.ts'
import { closeServer, loadModule, render } from './helpers/ssr.ts'

after(closeServer)

// The dialog's props, as far as the test sets them (the component's own type lives in a .tsx file the test project does not compile).
type FiltersModalProps = { facets: typeof facets; unknown?: Record<string, number>; selection: Selection; matching: number; onToggle: () => void; onClear: () => void; onClose: () => void; few: string | null; again: { block: string | null; onSearch: () => void } | null; returnFocus: { current: null } }
const facets = viewFacets(fixtureFilters).facets
const items = filterItemsFixture

test('fixture: askfilters has 12 results with attrs, facets in the contract shape, and an unknown count', () => {
  assert.equal(items.length, 12)
  assert.ok(items.every((i) => i.attrs && ['color', 'material', 'shape', 'style', 'size', 'feature'].every((k) => Array.isArray(i.attrs?.[k]))))
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

test('filter logic: OR within a dimension, AND across dimensions', () => {
  const gray: Selection = { color: ['gray'] }
  assert.equal(applyFilters(items, gray).length, 4)
  assert.equal(applyFilters(items, { color: ['gray', 'blue'] }).length, 6) // OR within colour (item 1 is both)
  const both = applyFilters(items, { color: ['gray', 'blue'], style: ['vintage'] })
  assert.deepEqual(both.map((i) => i.id), ['ft-1', 'ft-5', 'ft-7']) // AND across
  assert.equal(applyFilters(items, {}).length, 12)
})

test('filter logic: an item with an empty list for a filtered dimension is hidden; one with no attrs at all too', () => {
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

test('live count follows the selection; toggling adds and removes; an emptied dimension is dropped', () => {
  let sel: Selection = {}
  sel = toggleOption(sel, 'color', 'gray')
  assert.equal(applyFilters(items, sel).length, 4)
  sel = toggleOption(sel, 'color', 'blue')
  assert.equal(applyFilters(items, sel).length, 6)
  sel = toggleOption(sel, 'style', 'vintage')
  assert.equal(activeCount(sel), 3)
  assert.equal(applyFilters(items, sel).length, 3)
  sel = toggleOption(toggleOption(sel, 'color', 'gray'), 'color', 'blue')
  assert.deepEqual(sel, { style: ['vintage'] })
  assert.deepEqual(toggleOption(sel, 'style', 'vintage'), {})
})

test('chips: "Colour: Gray" per chosen option in the facets\' order; removing one is a toggle; stale values are ignored', () => {
  const sel: Selection = { style: ['vintage'], color: ['gray', 'blue'] }
  assert.deepEqual(filterChips(sel, facets).map((c) => c.label), ['Colour: Gray', 'Colour: Blue', 'Style: Vintage'])
  const first = filterChips(sel, facets)[0]
  assert.deepEqual(toggleOption(sel, first.dimension, first.value), { style: ['vintage'], color: ['blue'] })
  assert.deepEqual(cleanSelection({ color: ['gray', 'teal'], material: ['unobtainium'] }, facets), { color: ['gray'] })
})

test('few matches: fewer than 4 with something chosen; not for none, for enough, or for zero', () => {
  assert.equal(fewLine(2, { color: ['gray'] }), filtersFew(2))
  assert.equal(filtersFew(2), 'Only 2 match.')
  assert.equal(fewLine(3, { color: ['gray'] }), 'Only 3 match.')
  assert.equal(fewLine(4, { color: ['gray'] }), null)
  assert.equal(fewLine(2, {}), null)
  assert.equal(fewLine(0, { color: ['gray'] }), null) // the empty state handles it
})

test('refinement text: options of a dimension joined with "or", dimensions with commas, in the facets\' order', () => {
  assert.equal(refineTextFor({ color: ['gray', 'blue'], style: ['vintage'] }, facets), 'gray or blue, vintage')
  assert.equal(refineTextFor({ style: ['vintage'], material: ['wool'] }, facets), 'wool, vintage')
  assert.equal(refineTextFor({}, facets), '')
  assert.ok(refineTextFor({ color: facets[0].options.map((o) => o.value) }, facets).length <= 200)
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
  onRate: noop, onComment: noop, onCommentBlur: noop, onRetryRating: noop, onRemoveRefine: noop, onRemoveContext: noop,
  onAnswer: noop, onSubmitAnswers: noop, onRetryAnswers: noop, onSearchFilters: noop,
  meta: { usage: null, blocked: { search: false, again: false }, maintenance: false },
  savedOpen: true, onToggleSaved: noop, savedTab: 'love', onSavedTab: noop, onResolve: async () => null, ...over,
})
const view = async (key: string, over: Partial<ShopViewProps> = {}) => {
  const { default: View } = await loadModule<{ default: ComponentType<ShopViewProps> }>('/src/shop/ShopView.tsx')
  return render(View, props(fixtureBundles[key].state, { meta: fixtureBundles[key].meta, ...over }))
}

test('view: the Filters button is on the results header when there are facets, hidden without them', async () => {
  const withFacets = await view('askfilters')
  assert.match(withFacets, /<button[^>]*class="btn btn-secondary filters-button"[^>]*aria-haspopup="dialog"[^>]*>Filters<\/button>/)
  assert.match(withFacets, /12 results for/)
  for (const key of ['results', 'rated', 'batch2']) assert.doesNotMatch(await view(key), /filters-button/, key)
})

test('view: the Filters button shows for facets at the top level of the view too (older shape)', async () => {
  const batch = viewFacets(fixtureFilters)
  const top = { ...fixtureFilters, search: { ...fixtureFilters.search!, facets: undefined, facets_unknown: undefined }, facets: batch.facets, facets_unknown: batch.unknown }
  const { default: View } = await loadModule<{ default: ComponentType<ShopViewProps> }>('/src/shop/ShopView.tsx')
  const html = render(View, props({ ...fixtureStates.askfilters, view: top } as typeof fixtureStates.askfilters, { meta: fixtureBundles.askfilters.meta }))
  assert.match(await html, /filters-button/)
})

test('view: active filters show a count on the button, chips after the existing ones, fewer results in the grid', async () => {
  const html = await view('askfilters', { initialFilters: { color: ['gray'], style: ['vintage'] } })
  assert.match(html, /Filters<span class="filters-badge">2<span class="visually-hidden"> active<\/span><\/span>/)
  assert.match(html, /2 of 12 results for/)
  assert.equal(html.match(/class="shop-card"/g)?.length, 2)
  assert.ok(html.includes('Colour: Gray') && html.includes('Style: Vintage'))
  assert.match(html, /aria-label="Remove Colour: Gray"/)
})

test('view: the chip row overflows like the others: filter chips count towards the "+N more"', async () => {
  const html = await view('askfilters', { initialFilters: { color: ['gray', 'blue', 'cream'], material: ['wool'], style: ['vintage', 'modern'], shape: ['runner'], feature: ['washable'] } })
  assert.match(html, /\+\d+ more/)
})

test('view: a filter that hides everything says so and offers Clear filters, never a blank grid', async () => {
  const html = await view('askfilters', { initialFilters: { color: ['cream'], style: ['vintage'] } })
  assert.ok(html.includes('No results match these filters.'))
  assert.match(html, />Clear filters<\/button>/)
  assert.doesNotMatch(html, /class="shop-grid"/)
})

test('view: few matches show the line under the grid with the Search again button (Shop Again\'s own block applies)', async () => {
  const html = await view('askfiltersfew', { initialFilters: fixtureFiltersFewSelection })
  assert.ok(html.includes('Only 2 match.'))
  assert.match(html, /<button type="button" class="shop-link"[^>]*>Search again with these filters<\/button>/)
  assert.doesNotMatch(html.slice(html.indexOf('Only 2 match.')), /Rate at least one result first/) // one result is rated in the fixture
  // Nothing rated: the button is off and says why, the existing words.
  const { default: View } = await loadModule<{ default: ComponentType<ShopViewProps> }>('/src/shop/ShopView.tsx')
  const unrated = render(View, props({ ...(fixtureStates.askfiltersfew as Extract<ShopViewProps['state'], { status: 'done' }>), ratings: {} }, { initialFilters: fixtureFiltersFewSelection }))
  assert.match(unrated, /shop-link"[^>]*disabled=""[^>]*>Search again with these filters<\/button><span class="filters-why"> \(Rate at least one result first\.\)/)
  // Enough matches, or nothing chosen: no line.
  assert.ok(!(await view('askfiltersfew')).includes('Only '))
  assert.ok(!(await view('askfilters', { initialFilters: { color: ['gray'] } })).includes('Only '))
  assert.equal(fixtureFiltersFew.search?.results.length, 5)
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

test('modal: role dialog, aria-modal, labelled by its title; sections in the facets\' order; tiles are toggles with "Gray (4)"', async () => {
  const { FiltersDialog } = await loadModule<{ FiltersDialog: ComponentType<{ p: FiltersModalProps; titleId: string }> }>('/src/shop/FiltersModal.tsx')
  const p: FiltersModalProps = { facets, unknown: viewFacets(fixtureFilters).unknown, selection: { color: ['gray'] }, matching: 4, onToggle: noop, onClear: noop, onClose: noop, few: null, again: null, returnFocus: { current: null } }
  const html = render(FiltersDialog, { p, titleId: 'ttl' })
  assert.match(html, /role="dialog" aria-modal="true" aria-labelledby="ttl"/)
  assert.match(html, /<h2 id="ttl" class="filters-title">Filter results<\/h2>/)
  const sections = [...html.matchAll(/<h3 class="filters-section-title">([^<]+)<\/h3>/g)].map((m) => m[1])
  assert.deepEqual(sections, facets.map((f) => f.title))
  assert.match(html, /aria-pressed="true"><span class="filter-pic is-swatch"[^]*?Gray <span class="filter-count">\(4\)<\/span>/)
  assert.match(html, /aria-pressed="false"/)
  assert.ok(html.includes('1 has no colour info'))
  assert.ok(html.includes('Show 4 results') && html.includes('Clear all') && html.includes('>Close<'))
  assert.doesNotMatch(html, /filters-few/)
  // Few matches: the line and the button, off with Shop Again's reason when it is blocked.
  const few = render(FiltersDialog, { p: { ...p, few: 'Only 2 match.', again: { block: 'Rate at least one result first.', onSearch: noop } }, titleId: 'ttl' })
  assert.match(few, /Only 2 match\. <button type="button" class="shop-link" disabled="">Search again with these filters<\/button><span class="filters-why"> \(Rate at least one result first\.\)/)
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
