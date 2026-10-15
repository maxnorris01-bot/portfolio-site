// Constellations on the satellite view's sky: the figure and boundary files'
// readers, how figures are tied to the stars we draw, and the rules for the
// toggle, the labels and tap priority. Pure (no three.js, no DOM), so it is
// tested; the drawing lives in constellationlayer.ts.
//
// The figures are lists of Hipparcos numbers (scripts/build-constellations.mjs),
// so they attach to whatever star file the catalogue is. The boundaries are
// the IAU's, as polylines in J2000.

import type { Vec3 } from './pov.ts'

/** One constellation in constellations.json. */
export interface FigureRecord {
  /** IAU three-letter abbreviation. */
  a: string
  /** IAU name (Latin). */
  n: string
  /** Hipparcos number of the figure's brightest star. */
  b: number
  /** Area on the sky, square degrees. */
  s: number
  /** Polylines of Hipparcos numbers. */
  l: number[][]
}

export interface FigureFile {
  /** Leading star-file entries whose HIP numbers cover every figure star. */
  stars: number
  constellations: FigureRecord[]
}

export interface BoundsFile {
  /** Degrees per stored unit. */
  unit: number
  /** Abbreviations, indexed by the pair numbers in `chains`. */
  abbr: string[]
  /** [constellation, neighbouring constellation, flat lon,lat,lon,lat... in `unit`s] */
  chains: [number, number, number[]][]
}

export function readFigureFile(json: unknown): FigureFile {
  const f = json as FigureFile
  if (!f || !Array.isArray(f.constellations) || typeof f.stars !== 'number') throw new Error('not a constellation file')
  for (const c of f.constellations) {
    if (typeof c.a !== 'string' || !Array.isArray(c.l)) throw new Error('bad constellation record')
  }
  return f
}

export function readBoundsFile(json: unknown): BoundsFile {
  const f = json as BoundsFile
  if (!f || !Array.isArray(f.chains) || !Array.isArray(f.abbr) || typeof f.unit !== 'number') {
    throw new Error('not a constellation boundary file')
  }
  return f
}

/**
 * The first `n` Hipparcos numbers of a star details file ("HIPD", written by
 * scripts/build-hipparcos.mjs): a 32-byte header, then a u24 per star in the
 * star file's order (brightest first), so the leading entries are the ones
 * the figures need and no more of the file has to be fetched.
 */
export function readHipPrefix(buffer: ArrayBuffer, n: number): Uint32Array {
  const bytes = new Uint8Array(buffer)
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])
  if (magic !== 'HIPD') throw new Error('not a star details file')
  const total = new DataView(buffer).getUint32(8, true)
  const count = Math.min(n, total, Math.floor((bytes.length - 32) / 3))
  const out = new Uint32Array(count)
  for (let i = 0; i < count; i++) {
    const o = 32 + i * 3
    out[i] = bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16)
  }
  return out
}

/** A figure tied to catalogue indices. */
export interface ResolvedFigure {
  index: number
  abbr: string
  name: string
  areaSqDeg: number
  brightestHip: number
  /** Catalogue index of the brightest star (-1 when it isn't in the loaded tier). */
  brightestIndex: number
  /** Pairs of catalogue indices, one pair per line segment, deduplicated. */
  segments: number[]
  /** The distinct stars of the figure (catalogue indices). */
  stars: number[]
  /** Hipparcos numbers that aren't in the loaded catalogue (a smaller tier). */
  missing: number[]
}

/** Tie each figure to catalogue indices through the HIP numbers of the catalogue. */
export function resolveFigures(file: FigureFile, hipToIndex: ReadonlyMap<number, number>): ResolvedFigure[] {
  return file.constellations.map((c, index) => {
    const seen = new Set<string>()
    const segments: number[] = []
    const stars = new Set<number>()
    const missing = new Set<number>()
    for (const line of c.l) {
      for (let k = 0; k < line.length - 1; k++) {
        const a = hipToIndex.get(line[k])
        const b = hipToIndex.get(line[k + 1])
        if (a === undefined) missing.add(line[k])
        if (b === undefined) missing.add(line[k + 1])
        if (a === undefined || b === undefined || a === b) continue
        const key = a < b ? `${a},${b}` : `${b},${a}`
        if (seen.has(key)) continue
        seen.add(key)
        segments.push(a, b)
        stars.add(a)
        stars.add(b)
      }
    }
    return {
      index,
      abbr: c.a,
      name: c.n,
      areaSqDeg: c.s,
      brightestHip: c.b,
      brightestIndex: hipToIndex.get(c.b) ?? -1,
      segments,
      stars: [...stars],
      missing: [...missing],
    }
  })
}

// ---- geometry ----

const DEG = Math.PI / 180

/** The direction at the middle of a set of unit vectors (their normalised mean) and the largest angle from it. */
export function figureCentre(dirs: readonly Vec3[]): { centre: Vec3; extentDeg: number } {
  let x = 0
  let y = 0
  let z = 0
  for (const d of dirs) {
    x += d[0]
    y += d[1]
    z += d[2]
  }
  const len = Math.hypot(x, y, z) || 1
  const centre: Vec3 = [x / len, y / len, z / len]
  let widest = 0
  for (const d of dirs) {
    const c = Math.min(1, Math.max(-1, d[0] * centre[0] + d[1] * centre[1] + d[2] * centre[2]))
    widest = Math.max(widest, Math.acos(c))
  }
  return { centre, extentDeg: widest / DEG }
}

/**
 * The vertical field of view that fits a figure of angular radius
 * `extentDeg` in the shorter side of a screen of this aspect (width/height),
 * with a margin. Clamped to the lens range of the Out view.
 */
export function fitFov(extentDeg: number, aspect: number, minFov = 4, maxFov = 120): number {
  const half = Math.tan(Math.min(80, extentDeg * 1.3) * DEG)
  // The vertical half-extent is `half`; in portrait the width is the short side.
  const needV = aspect < 1 ? half / aspect : half
  const fov = (2 * Math.atan(needV)) / DEG
  return Math.min(maxFov, Math.max(minFov, fov))
}

// ---- the toggle ----

export interface ConstellationToggle {
  /** The master "Constellations" switch. */
  on: boolean
  /** Names, only drawn with the master switch on. */
  names: boolean
  /** IAU boundaries, only drawn with the master switch on. */
  boundaries: boolean
}

export const CONSTELLATIONS_OFF: ConstellationToggle = { on: false, names: false, boundaries: false }

/**
 * What to draw, as target opacities (0..1) that the layer eases toward.
 * With the switch off nothing is drawn but the selected star's figure
 * (`highlight`), which is shown while that star's card is on screen.
 */
export function layerTargets(t: ConstellationToggle, highlight: boolean) {
  return {
    lines: t.on ? 1 : 0,
    names: t.on && t.names ? 1 : 0,
    boundaries: t.on && t.boundaries ? 1 : 0,
    /** The highlighted figure, drawn brighter than the rest (and shown even with the switch off). */
    highlight: highlight ? 1 : 0,
  }
}

/** Ease `current` toward `target` over about `seconds`, jumping at once when motion is reduced. */
export function easeOpacity(current: number, target: number, dtSec: number, reducedMotion: boolean, seconds = 0.35): number {
  if (reducedMotion || seconds <= 0) return target
  const k = 1 - Math.exp(-dtSec / (seconds / 3))
  const next = current + (target - current) * k
  return Math.abs(next - target) < 0.004 ? target : next
}

// ---- labels ----

/** Don't label a figure when the view is narrower than this share of its radius: it would name nothing in sight. */
export const LABEL_MIN_FOV_SHARE = 0.6

export function labelAllowedAtFov(extentDeg: number, fovDeg: number): boolean {
  return fovDeg >= extentDeg * LABEL_MIN_FOV_SHARE
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface LabelCandidate extends Rect {
  key: string
  /** Higher is placed first. */
  priority: number
}

const overlaps = (a: Rect, b: Rect, pad: number) =>
  a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad

/**
 * Greedy label placement: candidates in priority order, each kept unless it
 * runs off the screen or overlaps an obstacle (a star or body label already
 * on screen) or a label placed before it. Returns the kept keys.
 */
export function placeLabels(
  candidates: readonly LabelCandidate[],
  obstacles: readonly Rect[],
  widthPx: number,
  heightPx: number,
  pad = 4,
  margin = 6,
): Set<string> {
  const placed: Rect[] = []
  const kept = new Set<string>()
  const order = [...candidates].sort((a, b) => b.priority - a.priority || (a.key < b.key ? -1 : 1))
  for (const c of order) {
    if (c.x < margin || c.y < margin || c.x + c.w > widthPx - margin || c.y + c.h > heightPx - margin) continue
    if (obstacles.some((o) => overlaps(c, o, pad))) continue
    if (placed.some((o) => overlaps(c, o, pad))) continue
    placed.push(c)
    kept.add(c.key)
  }
  return kept
}

/** Larger constellations are placed first; the selected figure beats all. */
export function labelPriority(areaSqDeg: number, selected: boolean): number {
  return (selected ? 1e6 : 0) + areaSqDeg
}

// ---- taps ----

export type TapTarget =
  | { kind: 'body'; key: string }
  | { kind: 'star'; index: number }
  | { kind: 'constellation'; index: number }
  | { kind: 'none' }

/** A star at least this bright still takes a tap that also lands on a constellation's name. */
export const LABEL_YIELD_MAG = 4.5

/**
 * What a tap selects: a Sun, Moon or planet disc first, then a star, then a
 * constellation's name label. Figure lines are never a target, so a line
 * passing over a star can't take its tap. The one softening is for names:
 * with tens of thousands of stars on screen some faint one is always within
 * a finger of any label, so a tap inside a label picks the constellation
 * unless the star under it is brighter than LABEL_YIELD_MAG.
 */
export function resolveTap(body: string | null, star: number, label: number, starMag = 0): TapTarget {
  if (body) return { kind: 'body', key: body }
  if (label >= 0 && (star < 0 || starMag > LABEL_YIELD_MAG)) return { kind: 'constellation', index: label }
  if (star >= 0) return { kind: 'star', index: star }
  return { kind: 'none' }
}

/** The label under a tap, if any (smallest first wins on a tie of overlap). */
export function pickLabel(x: number, y: number, labels: readonly (Rect & { index: number })[], slopPx = 6): number {
  let best = -1
  let bestArea = Infinity
  for (const l of labels) {
    if (x >= l.x - slopPx && x <= l.x + l.w + slopPx && y >= l.y - slopPx && y <= l.y + l.h + slopPx) {
      const a = l.w * l.h
      if (a < bestArea) {
        bestArea = a
        best = l.index
      }
    }
  }
  return best
}

// ---- the small card ----

export interface ConstellationCardInput {
  name: string
  abbr: string
  areaSqDeg: number
  brightestName: string | null
  /** Number of stars joined in the figure. */
  stars: number
}

export interface CardRow {
  label: string
  value: string
}

export function constellationCardRows(c: ConstellationCardInput): CardRow[] {
  const rows: CardRow[] = [{ label: 'IAU abbreviation', value: c.abbr }]
  if (c.brightestName) rows.push({ label: 'Brightest star', value: c.brightestName })
  rows.push({ label: 'Area', value: `${Math.round(c.areaSqDeg).toLocaleString('en-US')} square degrees` })
  if (c.stars > 0) rows.push({ label: 'Figure', value: `${c.stars} stars joined` })
  return rows
}
