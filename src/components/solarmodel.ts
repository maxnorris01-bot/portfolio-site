// The solar system's geometry and timing, apart from the drawing (so it can be tested).
import type { HomePanelId } from '../content/home.ts'

export type PlanetId = HomePanelId

export const CX = 200
export const CY = 200
export const TILT = -18

/** The drawing's box (SVG units): it starts at the leftmost orbit line, so the picture lines up with the text above it. */
export const VIEW = { x: -6, y: 26, w: 412, h: 336 }

/** Tilted elliptical orbits (SVG units). */
export const ORBITS = [
  { rx: 70, ry: 42 },
  { rx: 118, ry: 70 },
  { rx: 165, ry: 97 },
  { rx: 212, ry: 124 },
]

export type Body = {
  key: string
  orbit: number
  /** Where it starts on its orbit, and where it rests when motion is reduced (degrees). */
  phase: number
  /** Seconds for one trip round its orbit. */
  period: number
  /**
   * Set for the five planets you can choose, in reading order. `go` planets lead to a page (their card has a link),
   * `info` planets only show text.
   */
  select?: { id: PlanetId; label: string; kind: 'info' | 'go' }
}

export const BODIES: Body[] = [
  { key: 'a', orbit: 1, phase: 200, period: 92 },
  { key: 'b', orbit: 2, phase: 105, period: 64 },
  { key: 'c', orbit: 3, phase: 335, period: 70 },
  { key: 'd', orbit: 0, phase: 330, period: 61 },
  { key: 'background', orbit: 1, phase: 20, period: 76, select: { id: 'background', label: 'Background', kind: 'info' } },
  { key: 'site', orbit: 3, phase: 215, period: 104, select: { id: 'site', label: 'Site Info', kind: 'info' } },
  { key: 'satpov', orbit: 2, phase: 290, period: 88, select: { id: 'satpov', label: 'SatPOV', kind: 'go' } },
  { key: 'shopai', orbit: 3, phase: 75, period: 118, select: { id: 'shopai', label: 'ShopAI', kind: 'go' } },
  { key: 'resume', orbit: 0, phase: 140, period: 52, select: { id: 'resume', label: 'Résumé', kind: 'go' } },
]

export const CHOSEN = BODIES.filter((b) => b.select)

/** A point on a tilted orbit at an angle (degrees round the ellipse). */
export function place(orbit: number, angleDeg: number) {
  const { rx, ry } = ORBITS[orbit]
  const t = (angleDeg * Math.PI) / 180
  const r = (TILT * Math.PI) / 180
  const x = rx * Math.cos(t)
  const y = ry * Math.sin(t)
  return { x: CX + x * Math.cos(r) - y * Math.sin(r), y: CY + x * Math.sin(r) + y * Math.cos(r) }
}

/** Where a body is after `elapsed` seconds of motion (still at its resting place when motion is reduced). */
export function positionAt(body: Body, elapsed: number, reducedMotion: boolean) {
  return place(body.orbit, body.phase + (reducedMotion ? 0 : (elapsed / body.period) * 360))
}

export type MotionFlags = { reducedMotion: boolean; hover: boolean; focus: boolean; hidden: boolean }

/** The planets move only when nothing asks them to stand still. */
export const shouldMove = (f: MotionFlags) => !f.reducedMotion && !f.hover && !f.focus && !f.hidden

/** Seconds of motion after a frame `dtMs` later; a stalled frame never makes a jump. */
export const advance = (elapsed: number, dtMs: number) => elapsed + Math.min(0.1, Math.max(0, dtMs) / 1000)

// ---- labels ----

/** Label type size (SVG units) and an estimate of a character's width in it (the selected label is bold, so wider). */
export const LABEL_SIZE = 13
const CHAR_W = 7.3
export const labelWidth = (label: string, selected: boolean) => label.length * (selected ? CHAR_W + 0.7 : CHAR_W) + 6
/**
 * The places a label can sit, as the baseline's offset from its planet's centre: just above (the usual), just below,
 * then a second row above and a second row below, for when two planets are close together.
 */
export const LABEL_SLOTS = [-21, 33, -39, 51] as const
export const LABEL_ABOVE = LABEL_SLOTS[0]

type Box = { x0: number; x1: number; y0: number; y1: number }
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

export type LabelInput = { x: number; y: number; w: number }
export type LabelPlacement = { dx: number; slot: number }

const boxFor = (it: LabelInput, dx: number, slot: number, pad = 0): Box => {
  const base = it.y + LABEL_SLOTS[slot]
  return { x0: it.x + dx - it.w / 2 - pad, x1: it.x + dx + it.w / 2 + pad, y0: base - LABEL_SIZE - pad, y1: base + 4 + pad }
}

/**
 * Where each label goes. A label sits above its planet, slid sideways (never past the drawing's edges), and moves to
 * another place (below, or a second row) only when it would overlap a label already placed; the earlier items in
 * `order` win (the chosen planet first). It goes back to the usual place once that is clear with a little room to
 * spare, and otherwise stays where it was, so labels do not flap.
 */
export function layoutLabels(items: LabelInput[], was: number[], order: number[]): LabelPlacement[] {
  const out: LabelPlacement[] = items.map(() => ({ dx: 0, slot: 0 }))
  const placed: Box[] = []
  for (const i of order) {
    const it = items[i]
    const cx = Math.min(Math.max(it.x, VIEW.x + it.w / 2 + 2), VIEW.x + VIEW.w - it.w / 2 - 2)
    const dx = cx - it.x
    const fits = (slot: number) => {
      const b = boxFor(it, dx, slot)
      return b.y0 >= VIEW.y && b.y1 <= VIEW.y + VIEW.h
    }
    const free = (slot: number, pad = 0) => fits(slot) && placed.every((p) => !overlaps(p, boxFor(it, dx, slot, pad)))
    const current = was[i] ?? 0
    let slot = current
    if (free(0, current === 0 ? 0 : 5)) slot = 0
    else if (!free(current)) slot = LABEL_SLOTS.findIndex((_, k) => free(k))
    if (slot < 0) slot = current
    placed.push(boxFor(it, dx, slot))
    out[i] = { dx, slot }
  }
  return out
}

/** Whether any two of the labels, as laid out, overlap. */
export function labelsOverlap(items: LabelInput[], layout: LabelPlacement[]) {
  const boxes = items.map((it, i) => boxFor(it, layout[i].dx, layout[i].slot))
  return boxes.some((a, i) => boxes.slice(i + 1).some((b) => overlaps(a, b)))
}
