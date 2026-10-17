// The view offset behind the overlay panel: the map's canvas is full width,
// the controls panel sits over its left part, and the camera's projection
// centre moves into the free area so the Earth, the focus and the compass sit
// where they can be seen. Pure maths and a small animator (the engine applies
// the result with PerspectiveCamera.setViewOffset), tested.
//
// Terms: the canvas is `width` px wide; `insetPx` is how much of its left side
// the panel covers; the shift is how far the projection centre moves right
// (half the inset: the middle of the free area is `inset / 2` right of the
// middle of the canvas). "Canvas NDC" is -1..1 across the canvas as drawn;
// "centred NDC" is the same point measured from the projection centre, which
// is what the engine's ray and zoom maths (fov and aspect only) expect.

import { easeInOut } from './descend.ts'

/** How long the view takes to move when the panel opens, closes or changes width. */
export const VIEW_SHIFT_MS = 300

/** The panel never takes more than this share of the canvas into account (a narrow window keeps the middle of the map free). */
export const MAX_INSET_SHARE = 0.6

/** The projection centre's shift in px for a panel covering `insetPx` of a `widthPx` canvas. */
export function insetToShiftPx(insetPx: number, widthPx: number): number {
  if (!(widthPx > 0) || !(insetPx > 0)) return 0
  return Math.min(insetPx, widthPx * MAX_INSET_SHARE) / 2
}

/** A canvas-NDC x (as the pointer gives it) as the same point measured from the shifted projection centre. */
export function toCentredNdcX(canvasNx: number, shiftPx: number, widthPx: number): number {
  return widthPx > 0 ? canvasNx - (2 * shiftPx) / widthPx : canvasNx
}

/** The inverse: a centred NDC x as canvas NDC (for the camera's own projection, which includes the offset). */
export function toCanvasNdcX(centredNx: number, shiftPx: number, widthPx: number): number {
  return widthPx > 0 ? centredNx + (2 * shiftPx) / widthPx : centredNx
}

/**
 * The shift as it moves toward its target: eased over VIEW_SHIFT_MS, or at once
 * (reduced motion, the first value, a zero duration). A new target mid-way
 * starts from where the view is now.
 */
export class ViewShift {
  private from = 0
  private to = 0
  private start = 0
  private dur = 0

  /** Where the view is heading. */
  get target(): number {
    return this.to
  }

  /** Move toward `px`. `now` in ms (performance.now()); `instant` skips the animation. */
  set(px: number, now: number, instant = false): void {
    if (px === this.to) return
    this.from = this.value(now)
    this.to = px
    this.start = now
    this.dur = instant ? 0 : VIEW_SHIFT_MS
  }

  /** The shift at time `now`. */
  value(now: number): number {
    if (this.dur <= 0) return this.to
    const t = (now - this.start) / this.dur
    if (t >= 1) {
      this.dur = 0
      return this.to
    }
    return this.from + (this.to - this.from) * easeInOut(t)
  }

  /** Has it arrived? */
  settled(now: number): boolean {
    return this.value(now) === this.to
  }
}
