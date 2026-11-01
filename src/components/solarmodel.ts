// The solar system's geometry and timing, apart from the drawing (so it can be tested).

export const CX = 200
export const CY = 200
export const TILT = -18

/** Tilted elliptical orbits (SVG units). */
export const ORBITS = [
  { rx: 70, ry: 42 },
  { rx: 120, ry: 70 },
  { rx: 175, ry: 100 },
]

export type PlanetId = 'background' | 'site'

export type Body = {
  key: string
  orbit: number
  /** Where it starts on its orbit, and where it rests when motion is reduced (degrees). */
  phase: number
  /** Seconds for one trip round its orbit. */
  period: number
  /** Set for the two planets you can choose. */
  select?: { id: PlanetId; label: string; labelDx: number; labelDy: number }
}

export const BODIES: Body[] = [
  { key: 'a', orbit: 0, phase: 210, period: 44 },
  { key: 'b', orbit: 0, phase: 35, period: 62 },
  { key: 'c', orbit: 1, phase: 150, period: 92 },
  { key: 'd', orbit: 2, phase: 320, period: 118 },
  { key: 'e', orbit: 2, phase: 100, period: 74 },
  { key: 'background', orbit: 1, phase: 20, period: 76, select: { id: 'background', label: 'Background', labelDx: 0, labelDy: -21 } },
  { key: 'site', orbit: 2, phase: 215, period: 104, select: { id: 'site', label: 'Site Info', labelDx: 0, labelDy: -21 } },
]

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
