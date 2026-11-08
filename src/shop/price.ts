// Refine search: the price range (min and max, either may be empty). Pure helpers for the contract's chip target ("price:50-200",
// "price:-200", "price:50-"), the label, the typed inputs, the request body and the "current results" count. Whole dollars show without cents.
import type { RefineChip, ShopItem } from './types.ts'

export type PriceRange = { min: number | null; max: number | null }
/** The request's `price`: `{}` clears it. */
export type PriceBody = { min?: number | null; max?: number | null }

export const NO_PRICE: PriceRange = { min: null, max: null }
export const PRICE_ERROR_NUMBER = 'Enter a price of $0 or more'
export const PRICE_ERROR_ORDER = 'Max must be at least the min'

export const hasPrice = (p: PriceRange | null | undefined): p is PriceRange => !!p && (p.min !== null || p.max !== null)
export const samePrice = (a: PriceRange | null | undefined, b: PriceRange | null | undefined) => (a?.min ?? null) === (b?.min ?? null) && (a?.max ?? null) === (b?.max ?? null)

/** "$50", "$12.50", "$1,200": whole dollars without cents. */
export function money(n: number): string {
  return Number.isInteger(n) ? `$${n.toLocaleString('en-US')}` : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** The range in a chip target: "price:50-200", "price:-200" (under), "price:50-" (over); null when it is not a price target. */
export function parsePriceTarget(target: string | null | undefined): PriceRange | null {
  const m = /^price:(\d+(?:\.\d+)?)?-(\d+(?:\.\d+)?)?$/.exec((target ?? '').trim())
  if (!m) return null
  const range = { min: m[1] === undefined ? null : Number(m[1]), max: m[2] === undefined ? null : Number(m[2]) }
  return hasPrice(range) ? range : null
}

export function priceTarget(p: PriceRange): string {
  return `price:${p.min ?? ''}-${p.max ?? ''}`
}

/** "Price: $50-$200", "Under $200", "Over $50"; '' for no range. */
export function priceLabel(p: PriceRange): string {
  if (p.min !== null && p.max !== null) return `Price: ${money(p.min)}-${money(p.max)}`
  if (p.max !== null) return `Under ${money(p.max)}`
  if (p.min !== null) return `Over ${money(p.min)}`
  return ''
}

/** The price the server holds, from the `price` chip of the refine list (null when it has none or its target cannot be read). */
export function serverPrice(refine: readonly RefineChip[] | undefined): PriceRange | null {
  const chip = (refine ?? []).find((r) => r.kind === 'price')
  return chip ? parsePriceTarget(chip.target) : null
}

/** The chip's words: the server's label when it sends one, else built from the target. */
export function priceChipLabel(chip: Pick<RefineChip, 'label' | 'target'>): string {
  return chip.label?.trim() || priceLabel(parsePriceTarget(chip.target) ?? NO_PRICE)
}

export type PriceCheck = { range: PriceRange; errors: { min?: string; max?: string } }

const parseOne = (text: string): number | null | 'bad' => {
  const t = text.trim().replace(/^\$/, '').replace(/,/g, '')
  if (t === '') return null
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return 'bad'
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : 'bad'
}

/** The typed Min and Max as a range, with an inline message per field: not a number of $0 or more, or max below min. */
export function checkPrice(minText: string, maxText: string): PriceCheck {
  const a = parseOne(minText)
  const b = parseOne(maxText)
  const errors: PriceCheck['errors'] = {}
  if (a === 'bad') errors.min = PRICE_ERROR_NUMBER
  if (b === 'bad') errors.max = PRICE_ERROR_NUMBER
  const min = a === 'bad' ? null : a
  const max = b === 'bad' ? null : b
  if (!errors.min && !errors.max && min !== null && max !== null && max < min) errors.max = PRICE_ERROR_ORDER
  return { range: { min, max }, errors }
}

/** The text a number takes in its input. */
export const priceInputText = (n: number | null): string => (n === null ? '' : String(n))

/** The `price` of POST /refine: both ends (null for an open end), or `{}` to clear. */
export function priceBody(p: PriceRange): PriceBody {
  return hasPrice(p) ? { min: p.min, max: p.max } : {}
}

/** Inclusive bounds; an item with no price does not match a range. */
export function inPriceRange(item: Pick<ShopItem, 'price'>, p: PriceRange | null | undefined): boolean {
  if (!hasPrice(p)) return true
  if (item.price === null || item.price === undefined || !Number.isFinite(item.price)) return false
  return (p.min === null || item.price >= p.min) && (p.max === null || item.price <= p.max)
}

/** The muted line under the headline when a Shop Again was limited by price (null when it was not). */
export function priceNote(f: { min?: number | null; max?: number | null; removed?: number | null } | null | undefined): string | null {
  const p = { min: f?.min ?? null, max: f?.max ?? null }
  if (!hasPrice(p)) return null
  const range = p.min !== null && p.max !== null ? `${money(p.min)}-${money(p.max)}` : p.max !== null ? `under ${money(p.max)}` : `over ${money(p.min as number)}`
  const n = f?.removed ?? 0
  return `Prices limited to ${range}${n > 0 ? ` (${n} result${n === 1 ? '' : 's'} left out)` : ''}.`
}
