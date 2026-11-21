// What a click on a ribbon stepper does: the step of each field, Shift times ten, the clamp, and the hold-to-repeat timing. Pure, so it runs under node
// (tests/uieditorround2.test.ts). A stepper click is one edit: the page asks the engine for one `set` or one `offset` per click (and per repeat).

export type StepKey = 'fontSize' | 'width' | 'height' | 'padding' | 'margin' | 'borderWidth' | 'borderRadius' | 'nudge'

/** Pixels (or points of percent, for a % width) per click. */
export const STEP: Record<StepKey, number> = { fontSize: 1, width: 4, height: 4, padding: 4, margin: 4, borderWidth: 1, borderRadius: 2, nudge: 1 }
/** A width in % steps by this many percentage points a click. */
export const PERCENT_STEP = 1
/** Shift held while clicking multiplies the step by this. */
export const SHIFT_TIMES = 10
/** Holding a stepper button repeats it: first after this many ms, then every HOLD_EVERY ms. */
export const HOLD_DELAY = 400
export const HOLD_EVERY = 80

/** The smallest value a field accepts from a stepper (null: it may go negative: a margin, a nudge). A font size is at least 1 px. */
export const MIN: Record<StepKey, number | null> = { fontSize: 1, width: 0, height: 0, padding: 0, margin: null, borderWidth: 0, borderRadius: 0, nudge: null }

export type Unit = 'px' | '%'

/** The size of one click for a field: its step (1 for a percent width), times ten with Shift. */
export function stepAmount(key: StepKey, shift: boolean, unit: Unit = 'px'): number {
  const base = key === 'width' && unit === '%' ? PERCENT_STEP : STEP[key]
  return shift ? base * SHIFT_TIMES : base
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** One click on Increase (dir 1) or Decrease (dir -1): the new value, to two decimals, never below the field's minimum. */
export function stepped(value: number, dir: 1 | -1, amount: number, min: number | null): number {
  const next = round2(value + dir * amount)
  return min !== null && next < min ? min : next
}
