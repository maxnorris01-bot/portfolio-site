// The Sky view's Sun, Moon and planets: the list, how big and what colour each
// is drawn, which names show on a phone, the Moon's bright-limb direction, and
// the single-selection rules shared with satellites. No ephemeris here (that's
// planets.ts, loaded lazily), so this stays cheap to import and to test.

export type SkyBodyKind = 'star' | 'moon' | 'planet'

export interface SkyBodyDef {
  key: string
  name: string
  kind: SkyBodyKind
  /** Marker tint (sRGB). */
  color: string
}

export interface SkyBody extends SkyBodyDef {
  azDeg: number
  elDeg: number
  /** Apparent visual magnitude (lower is brighter). */
  mag: number
  distAu: number
  distKm: number
  /** The Moon's illuminated fraction, 0 (new) to 1 (full). */
  illuminated?: number
  /** For the Moon: growing toward full. */
  waxing?: boolean
}

export const KM_PER_AU = 149_597_870.7

// Stylized tints, all light enough to read on the capped day sky and the
// ground (checked in tests/skybodies.test.ts); the name label carries identity.
export const SKY_BODIES: readonly SkyBodyDef[] = [
  { key: 'sun', name: 'Sun', kind: 'star', color: '#fff1c4' },
  { key: 'moon', name: 'Moon', kind: 'moon', color: '#f2efe6' },
  { key: 'mercury', name: 'Mercury', kind: 'planet', color: '#e3dccf' },
  { key: 'venus', name: 'Venus', kind: 'planet', color: '#fff6dc' },
  { key: 'mars', name: 'Mars', kind: 'planet', color: '#ffb48f' },
  { key: 'jupiter', name: 'Jupiter', kind: 'planet', color: '#f6e6c8' },
  { key: 'saturn', name: 'Saturn', kind: 'planet', color: '#f0e2b6' },
  { key: 'uranus', name: 'Uranus', kind: 'planet', color: '#c3eef2' },
  { key: 'neptune', name: 'Neptune', kind: 'planet', color: '#b7cbff' },
]

/** Disc diameter in CSS px for a body: the Sun and Moon fixed, planets by magnitude. */
export function markerSizePx(kind: SkyBodyKind, mag: number): number {
  if (kind === 'star') return 30
  if (kind === 'moon') return 30
  // Venus (-4.5) 20 px, Jupiter (-2.5) 17, Mars/Saturn (~+1) 11, Uranus and
  // Neptune (+5.7/+7.8) the 6 px floor: still a little larger than a satellite.
  return Math.max(6, Math.min(20, Math.round(13 - 1.6 * mag)))
}

/**
 * Whether a body's name shows. On a phone (narrow stage) only the Sun, the
 * Moon, planets brighter than magnitude 1.5 and the selected body are
 * labelled, so the dome doesn't fill with names; on wider screens, all.
 */
export function showsLabel(
  body: Pick<SkyBody, 'kind' | 'mag' | 'key'>,
  narrow: boolean,
  selected: string | null,
): boolean {
  if (!narrow || body.key === selected || body.kind !== 'planet') return true
  return body.mag < 1.5
}

/** Bodies above the horizon, highest first (for the panel list). */
export function aboveHorizon<T extends Pick<SkyBody, 'elDeg'>>(bodies: readonly T[]): T[] {
  return bodies.filter((b) => b.elDeg > 0).sort((a, b) => b.elDeg - a.elDeg)
}

const DEG = Math.PI / 180
type Vec3 = [number, number, number]
const enu = (azDeg: number, elDeg: number): Vec3 => [
  Math.sin(azDeg * DEG) * Math.cos(elDeg * DEG),
  Math.cos(azDeg * DEG) * Math.cos(elDeg * DEG),
  Math.sin(elDeg * DEG),
]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const sub = (a: Vec3, b: Vec3, k: number): Vec3 => [a[0] - b[0] * k, a[1] - b[1] * k, a[2] - b[2] * k]
const unit = (a: Vec3): Vec3 => {
  const n = Math.hypot(...a) || 1
  return [a[0] / n, a[1] / n, a[2] / n]
}

/**
 * The unit direction on the sky from the Moon toward the Sun at the Moon's
 * position (the Sun's direction with its component along the Moon's
 * removed): the way the lit limb faces. Any frame, as long as both unit
 * vectors are in it (east/north/up, or the Sky scene's axes).
 */
export function limbDirection(m: Vec3, s: Vec3): Vec3 {
  return unit(sub(s, m, dot(s, m)))
}

/**
 * Which way the Moon's lit limb faces, as seen by the observer: the angle in
 * degrees from "up" (toward the zenith) turning toward the observer's right
 * (increasing azimuth), 0 to 360. The lit limb points along the great circle
 * from the Moon toward the Sun, so with the Sun straight below the Moon it's
 * 180 (lit from below). At the zenith "up" is taken as north.
 */
export function brightLimbAngle(moonAz: number, moonEl: number, sunAz: number, sunEl: number): number {
  const m = enu(moonAz, moonEl)
  const towardSun = limbDirection(m, enu(sunAz, sunEl))
  const zenith: Vec3 = [0, 0, 1]
  let up = sub(zenith, m, dot(zenith, m))
  if (Math.hypot(...up) < 1e-9) up = [0, 1, 0]
  up = unit(up)
  const right = cross(m, up)
  const deg = Math.atan2(dot(towardSun, right), dot(towardSun, up)) / DEG
  return (deg + 360) % 360
}

/** The Moon's phase name for an illuminated fraction and whether it's waxing. */
export function moonPhaseName(illuminated: number, waxing: boolean): string {
  if (illuminated < 0.02) return 'New moon'
  if (illuminated > 0.98) return 'Full moon'
  if (Math.abs(illuminated - 0.5) < 0.04) return waxing ? 'First quarter' : 'Last quarter'
  const shape = illuminated < 0.5 ? 'crescent' : 'gibbous'
  return `${waxing ? 'Waxing' : 'Waning'} ${shape}`
}

// One selection at a time across satellites and sky bodies.
export interface SkySelection {
  satellite: number | null
  body: string | null
}

export type SelectionEvent =
  | { type: 'pickSatellite'; index: number | null }
  | { type: 'pickBody'; key: string }
  | { type: 'deselect' }
  | { type: 'view'; mode: 'globe' | 'sky' }

/**
 * The selection after an event: a satellite pick (or an empty click, index
 * null) replaces any body; a body pick replaces any satellite; Deselect clears
 * both; switching to the Globe clears a body (bodies exist only in Sky) and
 * keeps a satellite.
 */
export function nextSelection(s: SkySelection, e: SelectionEvent): SkySelection {
  switch (e.type) {
    case 'pickSatellite':
      return { satellite: e.index, body: null }
    case 'pickBody':
      return { satellite: null, body: e.key }
    case 'deselect':
      return { satellite: null, body: null }
    case 'view':
      return e.mode === 'globe' ? { satellite: s.satellite, body: null } : s
  }
}
