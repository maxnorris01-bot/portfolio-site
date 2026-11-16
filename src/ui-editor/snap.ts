// The grid and snapping (round 3). Pure, so it runs under node (tests/uieditorround3.test.ts). Everything is in the preview's DOCUMENT coordinates in CSS
// px: the element's rectangle in the preview plus the preview's scroll. Snap rounds to the NEAREST line (not down); Alt, held during a drag, turns it off for that
// drag (the page asks `snaps` with the Alt state); the 100% snap to the parent's width of round 2 is decided before the grid is asked (units.ts).
import type { Box, Handle } from './geometry.ts'

/** The distance between grid lines when the page opens (CSS px). The other choices are listed in src/data/uiEditor.ts. */
export const DEFAULT_SPACING = 8

/** The nearest grid line to a coordinate; a tie goes to the larger one (Math.round). */
export const nearestLine = (v: number, spacing: number): number => Math.round(v / spacing) * spacing

/** The lines the overlay draws over an extent: its background repeats every `spacing` px from 0, so the lines are 0, spacing, 2 x spacing and so on (up to and including the extent). */
export function gridLines(extent: number, spacing: number): number[] {
  const out: number[] = []
  if (!(spacing > 0) || !(extent >= 0)) return out
  for (let v = 0; v <= extent + 1e-9; v += spacing) out.push(Math.round(v * 1e6) / 1e6)
  return out
}

/** Whether a drag snaps: Snap is on, the element is HTML (an SVG has its own units) and Alt is not held. */
export const snaps = (o: { snapOn: boolean; html: boolean; alt: boolean }): boolean => o.snapOn && o.html && !o.alt

/** The engine writes at most four decimals of a px, so offsets are given to four decimals. */
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4

/**
 * A move that has gone (dx, dy) from where the element's top-left is (document coordinates): the offset that puts the top-left on the nearest grid lines.
 * The offset is fractional when the element sits between lines (the engine accepts fractional px, so the position is reached exactly).
 */
export function snapMove(o: { left: number; top: number; dx: number; dy: number; spacing: number }): { dx: number; dy: number } {
  return {
    dx: round4(nearestLine(o.left + o.dx, o.spacing) - o.left),
    dy: round4(nearestLine(o.top + o.dy, o.spacing) - o.top),
  }
}

/** The box (document coordinates) of a resize with the DRAGGED edges put on grid lines; the edges that did not move stay where they are. A size never goes below 1 px. */
export function snapBox(box: Box, handle: Handle, spacing: number): Box {
  let { left, top, width, height } = box
  const right = left + width
  const bottom = top + height
  if (handle.includes('e')) width = Math.max(1, nearestLine(right, spacing) - left)
  if (handle.includes('w')) {
    const l = Math.min(nearestLine(left, spacing), right - 1)
    width = right - l
    left = l
  }
  if (handle.includes('s')) height = Math.max(1, nearestLine(bottom, spacing) - top)
  if (handle.includes('n')) {
    const t = Math.min(nearestLine(top, spacing), bottom - 1)
    height = bottom - t
    top = t
  }
  return { left, top, width, height }
}
