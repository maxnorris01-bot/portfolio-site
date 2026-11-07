// Filters F1: the pure logic behind the Filters modal. A selection is dimension -> chosen option values. A result passes when, for every
// dimension with chosen values, its attrs for that dimension share at least one of them (OR within a dimension, AND across). A result with
// no values for a filtered dimension is hidden. All of it runs in the browser on the batch on screen.
import { filtersFew, filtersUnknown } from './copy.ts'
import type { Facet, SessionView, ShopItem } from './types.ts'

export type Selection = Readonly<Record<string, readonly string[]>>
export const NO_FILTERS: Selection = {}

/** The batch's facets and unknown counts: from view.search first (the real shape), else the top level of the view. */
export function viewFacets(view: Pick<SessionView, 'search' | 'facets' | 'facets_unknown'>): { facets: Facet[]; unknown: Record<string, number> | undefined } {
  const s = view.search
  return { facets: s?.facets ?? view.facets ?? [], unknown: s?.facets_unknown ?? view.facets_unknown }
}

/** Fewer matches than this and the page offers to search again with the selection. */
export const FEW_LIMIT = 4

/** The refine box's own limit (ShopView's input maxLength). */
const REFINE_MAX = 200

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

export function applyFilters<T extends Pick<ShopItem, 'attrs'>>(items: readonly T[], sel: Selection): T[] {
  return activeCount(sel) === 0 ? [...items] : items.filter((i) => matchesSelection(i, sel))
}

/** The selection limited to what the facets offer (a stale value from another batch is ignored). */
export function cleanSelection(sel: Selection, facets: readonly Facet[]): Selection {
  const out: Record<string, string[]> = {}
  for (const f of facets) {
    const keep = (sel[f.dimension] ?? []).filter((v) => f.options.some((o) => o.value === v))
    if (keep.length) out[f.dimension] = keep
  }
  return out
}

export type FilterChip = { key: string; label: string; dimension: string; value: string }

/** One chip per chosen option, "Colour: Gray", in the facets' order. */
export function filterChips(sel: Selection, facets: readonly Facet[]): FilterChip[] {
  const out: FilterChip[] = []
  for (const f of facets)
    for (const o of f.options) if ((sel[f.dimension] ?? []).includes(o.value)) out.push({ key: `filter:${f.dimension}:${o.value}`, label: `${f.title}: ${o.label}`, dimension: f.dimension, value: o.value })
  return out
}

/** "3 have no colour info" for a dimension, or null when every result has a value. */
export function unknownLine(facet: Facet, unknown: Record<string, number> | undefined): string | null {
  const n = unknown?.[facet.dimension] ?? 0
  return n > 0 ? filtersUnknown(n, facet.title) : null
}

/** The few-matches line, or null (nothing chosen, nothing hidden everything, or enough matches). */
export function fewLine(matching: number, sel: Selection): string | null {
  return activeCount(sel) > 0 && matching > 0 && matching < FEW_LIMIT ? filtersFew(matching) : null
}

/** The selection as the words of a text refinement: "gray or blue, vintage" (options of a dimension joined with "or", dimensions with commas). */
export function refineTextFor(sel: Selection, facets: readonly Facet[]): string {
  const parts: string[] = []
  for (const f of facets) {
    const labels = f.options.filter((o) => (sel[f.dimension] ?? []).includes(o.value)).map((o) => o.label.toLowerCase())
    if (labels.length) parts.push(labels.join(' or '))
  }
  return parts.join(', ').slice(0, REFINE_MAX)
}

/** Where Tab goes inside a trapped dialog: the index to move to when the key would leave the dialog, or null to let the browser move on. */
export function trapTab(activeIndex: number, count: number, shift: boolean): number | null {
  if (count === 0) return 0
  if (shift && activeIndex <= 0) return count - 1
  if (!shift && activeIndex === count - 1) return 0
  return activeIndex === -1 ? 0 : null
}
