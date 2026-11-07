// Refine search: the pure logic behind the Refine dialog. A selection is dimension -> chosen option values. It does not hide anything: it is
// sent with Shop Again as `filters` and applies to the NEXT search. The dialog only counts how many of the current results already match
// (OR within a dimension, AND across), from their attrs.
import { CHIP_NEXT, filtersUnknown } from './copy.ts'
import type { Facet, FilterChoice, RefineChip, SessionView, ShopItem } from './types.ts'

export type Selection = Readonly<Record<string, readonly string[]>>
export const NO_FILTERS: Selection = {}

/** The batch's facets and unknown counts: from view.search first (the real shape), else the top level of the view. */
export function viewFacets(view: Pick<SessionView, 'search' | 'facets' | 'facets_unknown'>): { facets: Facet[]; unknown: Record<string, number> | undefined } {
  const s = view.search
  return { facets: s?.facets ?? view.facets ?? [], unknown: s?.facets_unknown ?? view.facets_unknown }
}

/** How many options are chosen across every dimension. */
export function activeCount(sel: Selection): number {
  return Object.values(sel).reduce((n, v) => n + v.length, 0)
}

/** Choose or un-choose one option; a dimension left with nothing is dropped. */
export function toggleOption(sel: Selection, dimension: string, value: string): Selection {
  const have = sel[dimension] ?? []
  const next = have.includes(value) ? have.filter((v) => v !== value) : [...have, value]
  const { [dimension]: _old, ...rest } = sel
  void _old
  return next.length ? { ...rest, [dimension]: next } : rest
}

export function matchesSelection(item: Pick<ShopItem, 'attrs'>, sel: Selection): boolean {
  for (const [dimension, wanted] of Object.entries(sel)) {
    if (wanted.length === 0) continue
    const have = item.attrs?.[dimension] ?? []
    if (!wanted.some((v) => have.includes(v))) return false
  }
  return true
}

/** How many of the items already match the selection (nothing chosen: 0, the dialog then shows no line). */
export function matchCount(items: readonly Pick<ShopItem, 'attrs'>[], sel: Selection): number {
  return activeCount(sel) === 0 ? 0 : items.filter((i) => matchesSelection(i, sel)).length
}

const TITLES: Record<string, string> = { color: 'Colour', material: 'Material', style: 'Style', shape: 'Shape', size: 'Size', feature: 'Feature' }
const nice = (v: string) => v.charAt(0).toUpperCase() + v.slice(1)

export type FilterChip = { key: string; label: string; dimension: string }

/** One chip per chosen dimension, "Next search: Colour: Gray or blue", in the facets' order then any others (a value the batch no longer offers still shows). */
export function filterChips(sel: Selection, facets: readonly Facet[]): FilterChip[] {
  const dims = [...facets.map((f) => f.dimension), ...Object.keys(sel).filter((d) => !facets.some((f) => f.dimension === d))]
  const out: FilterChip[] = []
  for (const d of dims) {
    const values = sel[d] ?? []
    if (values.length === 0) continue
    const facet = facets.find((f) => f.dimension === d)
    const labels = values.map((v, i) => {
      const l = facet?.options.find((o) => o.value === v)?.label ?? nice(v)
      return i === 0 ? l : l.toLowerCase()
    })
    out.push({ key: `filter:${d}`, label: `${CHIP_NEXT}${facet?.title ?? TITLES[d] ?? nice(d)}: ${labels.join(' or ')}`, dimension: d })
  }
  return out
}

/** The selection as the request's `filters` list. */
export function filterChoices(sel: Selection): FilterChoice[] {
  return Object.entries(sel)
    .filter(([, v]) => v.length > 0)
    .map(([dimension, values]) => ({ dimension, values: [...values] }))
}

const same = (a: readonly string[] | undefined, b: readonly string[] | undefined) => (a ?? []).length === (b ?? []).length && (a ?? []).every((v) => (b ?? []).includes(v))
export function sameSelection(a: Selection, b: Selection): boolean {
  const dims = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...dims].every((d) => same(a[d], b[d]))
}

/** The choices the backend holds, from the `filter` chips of the refine list (null when it has none). Dimension and values are parsed from `target` ("dimension:v1,v2"); a chip without a readable target is skipped. */
export function serverSelection(refine: readonly RefineChip[] | undefined): Selection | null {
  const chips = (refine ?? []).filter((r) => r.kind === 'filter')
  if (chips.length === 0) return null
  const out: Record<string, string[]> = {}
  for (const c of chips) {
    const at = (c.target ?? '').indexOf(':')
    if (at < 1) continue
    const values = c.target!.slice(at + 1).split(',').filter((v) => v !== '')
    if (values.length) out[c.target!.slice(0, at)] = values
  }
  return out
}

/** "3 have no colour info" for a dimension, or null when every result has a value. */
export function unknownLine(facet: Facet, unknown: Record<string, number> | undefined): string | null {
  const n = unknown?.[facet.dimension] ?? 0
  return n > 0 ? filtersUnknown(n, facet.title) : null
}

/** Where Tab goes inside a trapped dialog: the index to move to when the key would leave the dialog, or null to let the browser move on. */
export function trapTab(activeIndex: number, count: number, shift: boolean): number | null {
  if (count === 0) return 0
  if (shift && activeIndex <= 0) return count - 1
  if (!shift && activeIndex === count - 1) return 0
  return activeIndex === -1 ? 0 : null
}
