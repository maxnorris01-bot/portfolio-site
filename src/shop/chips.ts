import { priceChipLabel } from './price.ts'
import { formatPrice } from './state.ts'
import type { ClarifyAnswerChip, ContextKind, ParsedQuery, RefineChip } from './types.ts'

/** `dimension` (the clarifying questions' word for it) and `term` (the lower-case value) let an answer or a refinement replace the chip. */
export type RequestChip = { key: string; label: string; remove: { kind: ContextKind; value: string } | null; dimension?: string; term?: string }

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [])

/** Plain chips for what the server read from the request. Only some kinds have a remove route (POST /context/remove). */
export function requestChips(q: ParsedQuery | null | undefined): RequestChip[] {
  if (!q) return []
  const out: RequestChip[] = []
  const add = (key: string, label: string, kind: ContextKind | null, value?: string, dimension?: string) =>
    out.push({ key: `${key}:${value ?? label}`, label, remove: kind && value !== undefined ? { kind, value } : null, dimension, term: (value ?? label).trim().toLowerCase() })
  if (q.category) add('category', q.category, null)
  const min = formatPrice(q.price_min ?? null)
  const max = formatPrice(q.price_max ?? null)
  if (min && max) add('price', `${min} to ${max}`, null)
  else if (max) add('price', `Up to ${max}`, null)
  else if (min) add('price', `From ${min}`, null)
  for (const t of strings(q.style_terms)) add('style', t, null, undefined, 'style')
  for (const t of strings(q.material_terms)) add('material', `Material: ${t}`, 'material', t, 'material')
  for (const t of strings(q.color_terms)) add('color', `Colour: ${t}`, 'color_term', t, 'color')
  for (const t of strings(q.shape_terms)) add('shape', `Shape: ${t}`, 'shape_term', t, 'shape')
  for (const t of strings(q.must_have)) add('must', `Must have: ${t}`, null, undefined, 'feature')
  for (const t of strings(q.avoid)) add('avoid', `Avoid: ${t}`, 'avoid', t)
  for (const t of strings(q.context)) add('context', t, 'context', t)
  return out
}

/** One chip of the merged "What I'm searching for" row. `remove` says what its x does: nothing (a plain fact), drop a parsed term, or drop an answer or refinement (POST /refine/remove). */
export type MergedChip = {
  key: string
  label: string
  /** Tooltip and the remove button's detail (an answer's question). */
  title?: string
  /** A choice made in Refine search, applied on the next search (shown after the divider, never in the "+N more"). */
  choice?: boolean
  remove: { type: 'context'; kind: ContextKind; value: string } | { type: 'refine'; id: string } | { type: 'filter'; dimension: string } | { type: 'text' } | { type: 'price' } | null
}

/** The term a refinement is about: "no Walmart" and "avoid walmart" are walmart, "focus on cream" is cream. */
export function refineTerm(r: RefineChip): string {
  return (r.text ?? r.label)
    .trim()
    .toLowerCase()
    .replace(/^(no|not|avoid|without|focus on|more|only)\s+/, '')
}

/**
 * The one row of chips for the results page, in this order: the parsed facts (no x), the parsed terms you can remove, the answers from
 * the questions, the refinements. An answer replaces every parsed chip of its dimension (one chip per dimension; added when the parsed
 * query has none). A refinement replaces a parsed chip with the same term ("Avoid: walmart" and "No Walmart" show as "No Walmart").
 */
export function mergeChips(parsed: RequestChip[], answers: ClarifyAnswerChip[], refine: RefineChip[], hideBudget = false): MergedChip[] {
  const answered = new Set(answers.map((a) => a.dimension))
  const refined = new Set(refine.filter((r) => r.kind !== 'price').map(refineTerm))
  // A price range chosen in Refine search replaces the budget read from the request ("Up to $300"); it comes back when the range is cleared.
  const priced = hideBudget || refine.some((r) => r.kind === 'price')
  const kept = parsed.filter((c) => !(c.dimension && answered.has(c.dimension)) && !(c.term !== undefined && refined.has(c.term)) && !(priced && c.key.startsWith('price:')))
  const toMerged = (c: RequestChip): MergedChip => ({ key: c.key, label: c.label, remove: c.remove ? { type: 'context', ...c.remove } : null })
  return [
    ...kept.filter((c) => !c.remove).map(toMerged),
    ...kept.filter((c) => c.remove).map(toMerged),
    ...answers.map((a): MergedChip => ({ key: a.id, label: a.label, title: a.question, remove: { type: 'refine', id: a.id } })),
    // The price chip is a choice too, after the other choices.
    ...[...refine.filter((r) => r.kind !== 'price'), ...refine.filter((r) => r.kind === 'price')].map((r): MergedChip =>
      r.kind === 'price'
        ? { key: r.id, label: priceChipLabel(r), choice: true, remove: { type: 'refine', id: r.id } }
        : { key: r.id, label: r.kind !== 'filter' && r.approximate ? `${r.label} (approximate)` : r.label, choice: r.kind === 'filter' || undefined, remove: { type: 'refine', id: r.id } },
    ),
  ]
}

/** How many chips show before "+N more". */
export const CHIP_LIMIT = 8

/** The chips to show now, and how many are behind "+N more" (none when expanded or when they all fit). */
export function splitChips<T>(chips: T[], expanded: boolean, limit = CHIP_LIMIT): { shown: T[]; hidden: number } {
  if (expanded || chips.length <= limit) return { shown: chips, hidden: 0 }
  return { shown: chips.slice(0, limit), hidden: chips.length - limit }
}

/** The refine text as a choice chip: “text” cut to 28 characters (with …), the whole text as its title; null when there is none. */
export function refineTextChip(text: string): MergedChip | null {
  const t = text.trim()
  if (!t) return null
  const shown = t.length > 28 ? `${t.slice(0, 27).trimEnd()}…` : t
  return { key: 'refine-text', label: `“${shown}”`, title: t, choice: true, remove: { type: 'text' } }
}
