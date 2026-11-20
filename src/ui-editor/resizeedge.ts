// Resizing from the WEST or NORTH edge (round 5): the dragged edge follows the pointer and the opposite edge stays. The cheapest exact way with the engine
// (docs/ui-editor-baseline-round5.md, the probe) is the new width (height) plus a compensating margin-left (margin-top) that keeps the margin box the same size, so
// neighbours stay put. The page tries it on a scratch preview first and keeps it only when the dragged edge landed where it should and nothing else moved; otherwise
// the old behaviour (the opposite edge moves) is used and one plain line says so. Pure, so it runs under node (tests/uieditorround5.test.ts).
import type { Handle } from './geometry.ts'

const round2 = (n: number): number => Math.round(n * 100) / 100

export interface Measures {
  /** The element's current CSS width and height (px), the ones the engine's width and height act on. */
  width: number
  height: number
  marginLeft: number
  marginTop: number
}

/** The properties of the compensated edit: the new size and the margin that keeps the margin box the same size. Only the axes of the handle are touched. */
export function compensated(handle: Handle, now: Measures, next: { width: number; height: number }): Record<string, string> {
  const out: Record<string, string> = {}
  if (handle.includes('w')) {
    out.width = `${next.width}px`
    out['margin-left'] = `${round2((Number.isFinite(now.marginLeft) ? now.marginLeft : 0) - (next.width - now.width))}px`
  }
  if (handle.includes('n')) {
    out.height = `${next.height}px`
    out['margin-top'] = `${round2((Number.isFinite(now.marginTop) ? now.marginTop : 0) - (next.height - now.height))}px`
  }
  return out
}

/** Left, top, right, bottom of one element's border box. */
export type Edges = [number, number, number, number]

export interface Trial {
  before: Edges[]
  after: Edges[]
  /** The target's index, and for every element whether it lies inside the target (its descendants may move). */
  target: number
  inside: boolean[]
  handle: Handle
  /** How far each moving edge must have moved: the new box's edge less the old (CSS px). */
  dLeft: number
  dTop: number
}

export const EDGE_TOL = 1.5
export const OTHER_TOL = 1

/** Whether the trial put the dragged edges where the pointer wanted them, kept the opposite edges, and moved no other element. */
export function trialOk(t: Trial): boolean {
  const b = t.before[t.target], a = t.after[t.target]
  if (!b || !a) return false
  if (t.handle.includes('w') && (Math.abs(a[0] - b[0] - t.dLeft) > EDGE_TOL || Math.abs(a[2] - b[2]) > OTHER_TOL)) return false
  if (t.handle.includes('n') && (Math.abs(a[1] - b[1] - t.dTop) > EDGE_TOL || Math.abs(a[3] - b[3]) > OTHER_TOL)) return false
  return t.before.every((e, i) => i === t.target || t.inside[i] || e.every((v, k) => Math.abs(v - t.after[i][k]) <= OTHER_TOL))
}
