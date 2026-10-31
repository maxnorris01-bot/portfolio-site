import { formatPrice } from './state.ts'
import type { ContextKind, ParsedQuery } from './types.ts'

export type RequestChip = { key: string; label: string; remove: { kind: ContextKind; value: string } | null }

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [])

/** Plain chips for what the server read from the request. Only some kinds have a remove route (POST /context/remove). */
export function requestChips(q: ParsedQuery | null | undefined): RequestChip[] {
  if (!q) return []
  const out: RequestChip[] = []
  const add = (key: string, label: string, kind: ContextKind | null, value?: string) =>
    out.push({ key: `${key}:${value ?? label}`, label, remove: kind && value !== undefined ? { kind, value } : null })
  if (q.category) add('category', q.category, null)
  const min = formatPrice(q.price_min ?? null)
  const max = formatPrice(q.price_max ?? null)
  if (min && max) add('price', `${min} to ${max}`, null)
  else if (max) add('price', `Up to ${max}`, null)
  else if (min) add('price', `From ${min}`, null)
  for (const t of strings(q.style_terms)) add('style', t, null)
  for (const t of strings(q.material_terms)) add('material', `Material: ${t}`, 'material', t)
  for (const t of strings(q.color_terms)) add('color', `Colour: ${t}`, 'color_term', t)
  for (const t of strings(q.shape_terms)) add('shape', `Shape: ${t}`, 'shape_term', t)
  for (const t of strings(q.must_have)) add('must', `Must have: ${t}`, null)
  for (const t of strings(q.avoid)) add('avoid', `Avoid: ${t}`, 'avoid', t)
  for (const t of strings(q.context)) add('context', t, 'context', t)
  return out
}
