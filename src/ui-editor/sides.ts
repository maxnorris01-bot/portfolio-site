// Padding and margin (and border radius) as four sides: reading a computed shorthand, "mixed", and writing the whole shorthand back. The engine will not
// mix a shorthand with a longhand of the same property (padding then padding-top), so every write is the full four-value shorthand. Pure.

export type Sides = [number, number, number, number]
export type Side = 'top' | 'right' | 'bottom' | 'left'
export const SIDES: Side[] = ['top', 'right', 'bottom', 'left']

/** One to four computed lengths ("28px", "8px 16px") as top, right, bottom, left. Null when it is not four plain px lengths. */
export function expandSides(text: string): Sides | null {
  const parts = text.trim().split(/\s+/)
  if (parts.length < 1 || parts.length > 4) return null
  const n = parts.map((p) => (/^-?\d*\.?\d+px$/.test(p) ? parseFloat(p) : NaN))
  if (n.some(Number.isNaN)) return null
  const [t, r = t, b = t, l = r] = n
  return [t, r, b, l]
}

export const isMixed = (s: Sides): boolean => s.some((v) => v !== s[0])

/** What a collapsed (all four sides) field shows: the one value, or "mixed". */
export const showUniform = (s: Sides): string => (isMixed(s) ? 'mixed' : `${s[0]}px`)

const trim = (n: number) => String(Math.round(n * 100) / 100)

/** The shorthand that writes all four sides. */
export const sidesText = (s: Sides): string => s.map((v) => `${trim(v)}px`).join(' ')

/** One side changed to a value. */
export function withSide(s: Sides, side: Side, value: number): Sides {
  const next: Sides = [...s]
  next[SIDES.indexOf(side)] = value
  return next
}

/** Every side moved by the same amount, differences kept (the collapsed stepper on a mixed value), each held to a minimum (null: none). */
export function allSidesBy(s: Sides, delta: number, min: number | null): Sides {
  return s.map((v) => (min !== null && v + delta < min ? min : Math.round((v + delta) * 100) / 100)) as Sides
}
