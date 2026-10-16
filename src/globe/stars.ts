// The satellite view's star field: the catalogue interface, the binary
// reader, the frame transform and how stars look at a given field of view.
// Pure (no three.js), so it is tested; the drawing lives in space.ts.
//
// Stars are at infinity: no parallax, fixed in the inertial frame,
// independent of the viewpoint satellite and of the Earth's rotation. The
// catalogue's positions are ICRS (J2000 axes); the scene's inertial frame is
// the satellites' TEME (true equator of date), so each star is turned by the
// J2000-to-date precession and nutation rotation (from astronomy-engine,
// passed in) and then mapped to scene axes the way frames.ts maps satellites
// (x, z, -y). TEME and the true equator and equinox of date differ only by
// the equation of the equinoxes (about 1 arcsecond), well below a pixel.

import type { Vec3 } from './pov.ts'

/** A star catalogue, whatever file it came from (so the file can be swapped). */
export interface StarCatalog {
  count: number
  /** Unit vectors, ICRS / J2000 axes (x to RA 0, z to the north pole), 3 per star. */
  dirJ2000: Float32Array
  /** Johnson V magnitude per star. */
  mag: Float32Array
  /** B-V colour index per star. */
  bv: Float32Array
  /** The Julian year the positions are for (proper motion applied). */
  epoch: number
  /** Stars are sorted brightest first. */
  sortedByMagnitude: true
}

/**
 * Read the catalogue file written by scripts/build-hipparcos.mjs ("HIPS"
 * version 1), keeping only stars at or brighter than `maxMag` (they're
 * sorted brightest first, so this is a cut, not a scan).
 */
export function readStarCatalog(buffer: ArrayBuffer, maxMag = Infinity): StarCatalog {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])
  if (magic !== 'HIPS' || view.getUint16(4, true) !== 1) throw new Error('not a version 1 star catalogue')
  const total = view.getUint32(8, true)
  const epoch = view.getFloat32(12, true)
  const raAt = 32
  const decAt = raAt + total * 3
  const magAt = decAt + total * 3
  const bvAt = magAt + total
  if (bytes.length < bvAt + total) throw new Error('star catalogue is truncated')
  let count = total
  for (let i = 0; i < total; i++) {
    if (bytes[magAt + i] / 16 - 2 > maxMag) {
      count = i
      break
    }
  }
  const dir = new Float32Array(count * 3)
  const mag = new Float32Array(count)
  const bv = new Float32Array(count)
  const u24 = (o: number) => bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16)
  for (let i = 0; i < count; i++) {
    const ra = (u24(raAt + i * 3) / 2 ** 24) * 2 * Math.PI
    const dec = (u24(decAt + i * 3) / (2 ** 24 - 1)) * Math.PI - Math.PI / 2
    const c = Math.cos(dec)
    dir[i * 3] = c * Math.cos(ra)
    dir[i * 3 + 1] = c * Math.sin(ra)
    dir[i * 3 + 2] = Math.sin(dec)
    mag[i] = bytes[magAt + i] / 16 - 2
    bv[i] = bytes[bvAt + i] / 80 - 0.5
  }
  return { count, dirJ2000: dir, mag, bv, epoch, sortedByMagnitude: true }
}

/** A row-major 3x3 rotation (astronomy-engine's RotationMatrix.rot is column-major: transpose it). */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number]

/** RA/Dec (degrees, J2000) to a unit vector on J2000 axes. */
export function raDecToJ2000(raDeg: number, decDeg: number): Vec3 {
  const ra = (raDeg * Math.PI) / 180
  const dec = (decDeg * Math.PI) / 180
  return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)]
}

/**
 * A J2000 direction in scene axes: rotated to the true equator of date by
 * `j2000ToDate` (row-major) and mapped like frames.ts's writeInertial.
 */
export function j2000ToScene(d: Vec3, j2000ToDate: Mat3): Vec3 {
  const m = j2000ToDate
  const x = m[0] * d[0] + m[1] * d[1] + m[2] * d[2]
  const y = m[3] * d[0] + m[4] * d[1] + m[5] * d[2]
  const z = m[6] * d[0] + m[7] * d[1] + m[8] * d[2]
  return [x, z, -y]
}

/** The identity rotation (no precession): for tests and before the ephemeris loads. */
export const NO_ROTATION: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1]

/**
 * A star's colour from its B-V index: B-V to temperature (Ballesteros 2012),
 * then an approximate blackbody RGB, normalised so the brightest channel is
 * 1. Blue-white for hot stars (B-V near 0), orange-red for cool ones.
 */
export function starColor(bv: number): [number, number, number] {
  const b = Math.max(-0.4, Math.min(2.0, bv))
  const t = 4600 * (1 / (0.92 * b + 1.7) + 1 / (0.92 * b + 0.62))
  const k = t / 100
  let r: number, g: number, bl: number
  if (k <= 66) {
    r = 255
    g = 99.47 * Math.log(k) - 161.12
    bl = k <= 19 ? 0 : 138.52 * Math.log(k - 10) - 305.04
  } else {
    r = 329.7 * (k - 60) ** -0.1332
    g = 288.12 * (k - 60) ** -0.0755
    bl = 255
  }
  const c = [r, g, bl].map((v) => Math.max(0, Math.min(255, v)) / 255) as [number, number, number]
  const m = Math.max(...c)
  return [c[0] / m, c[1] / m, c[2] / m]
}

/**
 * The faintest magnitude shown at a vertical field of view: about the naked
 * eye (6.5) at a normal 60 degrees, a magnitude deeper for each 2.5x of zoom
 * (as a telescope's aperture would), up to the catalogue's own limit.
 */
export function limitingMagnitude(fovDeg: number, catalogLimit = 12): number {
  const deeper = 2.5 * Math.log10(60 / Math.max(fovDeg, 1e-3))
  return Math.min(catalogLimit, Math.max(5, 6.5 + deeper))
}

/**
 * The star shader's inputs at a field of view (space.ts uses these, and
 * starAppearance below applies them per star, so the two can't disagree):
 * the limiting magnitude; how much every star is enlarged by zooming in (a
 * little, up to 2.5x); and the dimming at very narrow fields (under 0.2
 * degrees the points soften rather than grow into blobs, since there's no
 * finer detail to show).
 */
export function starUniforms(fovDeg: number, catalogLimit = 12): { limitMag: number; grow: number; narrow: number } {
  const zoom = Math.max(0, Math.log2(60 / Math.max(fovDeg, 1e-3)))
  return {
    limitMag: limitingMagnitude(fovDeg, catalogLimit),
    grow: 1 + Math.min(1.5, 0.12 * zoom),
    narrow: fovDeg < 0.2 ? 0.55 + 0.45 * (fovDeg / 0.2) : 1,
  }
}

/** The most a star's point grows to, CSS px. */
export const STAR_MAX_PX = 9

/**
 * How a star of magnitude `mag` is drawn at that field of view: point size
 * (CSS px) and brightness 0..1. Brighter stars are bigger and brighter; ones
 * near the limit fade in. The same formula runs per star in the shader.
 */
export function starAppearance(mag: number, fovDeg: number, catalogLimit = 12): { sizePx: number; alpha: number } {
  const u = starUniforms(fovDeg, catalogLimit)
  const above = u.limitMag - mag
  if (above <= 0) return { sizePx: 0, alpha: 0 }
  const sizePx = Math.min(STAR_MAX_PX, (1.2 + 0.55 * above) * u.grow)
  const fadeIn = Math.min(1, above / 1.5)
  const alpha = Math.min(1, (0.35 + 0.15 * above) * fadeIn) * u.narrow
  return { sizePx, alpha }
}

/**
 * The narrowest field of view when looking out at space (not at the Earth):
 * 0.01 degrees (36 arcseconds across). Hipparcos ends near magnitude 12, so
 * there's rarely a star in a view that narrow; it's for examining one.
 */
export const SPACE_FOV_MIN = 0.01

/** Where the sky is drawn, in scene units from the camera (inside the far plane, beyond the Earth from GEO). */
export const SKY_RADIUS = 15

/** Pick radius around a click or tap, CSS px (mouse, touch). */
export const STAR_PICK_PX = { mouse: 12, touch: 20 } as const

/**
 * The star a click or tap selects: among stars shown at this field of view
 * (brighter than the limiting magnitude) within `radiusPx` of the pointer's
 * ray, the one with the lowest score of distance in px plus 1.5 px per
 * magnitude (so a star a magnitude brighter wins from 1.5 px farther away,
 * and brighter ones are preferred when several are close). Returns the
 * catalogue index, or -1.
 *
 * `dirs` are unit-direction multiples (3 per star, any common scale) in the
 * same frame as `ray`; `fovDeg` and `screenPx` give the angle per pixel.
 */
export function pickStarScored(
  dirs: Float32Array,
  mags: Float32Array,
  count: number,
  ray: Vec3,
  fovDeg: number,
  screenPx: number,
  radiusPx: number,
  scale = 1,
  catalogLimit = 12,
): { index: number; score: number } {
  const degPerPx = fovDeg / Math.max(1, screenPx)
  const maxRad = (Math.min(radiusPx * degPerPx, 89) * Math.PI) / 180
  // Chord lengths, not cosines: at a 0.01 degree field the pick radius is a
  // few microradians, which 1 - cos() can't resolve in float precision.
  const maxChord2 = (2 * Math.sin(maxRad / 2)) ** 2
  const limit = limitingMagnitude(fovDeg, catalogLimit)
  let best = -1
  let bestScore = Infinity
  for (let i = 0; i < count; i++) {
    if (mags[i] > limit) continue
    const dx = dirs[i * 3] / scale - ray[0]
    const dy = dirs[i * 3 + 1] / scale - ray[1]
    const dz = dirs[i * 3 + 2] / scale - ray[2]
    const c2 = dx * dx + dy * dy + dz * dz
    if (c2 > maxChord2) continue
    const px = ((2 * Math.asin(Math.min(1, Math.sqrt(c2) / 2)) * 180) / Math.PI) / degPerPx
    const score = px + 1.5 * mags[i]
    if (score < bestScore) {
      bestScore = score
      best = i
    }
  }
  return { index: best, score: bestScore }
}

/** pickStar's choice alone: the catalogue index, or -1. */
export function pickStar(
  dirs: Float32Array,
  mags: Float32Array,
  count: number,
  ray: Vec3,
  fovDeg: number,
  screenPx: number,
  radiusPx: number,
  scale = 1,
  catalogLimit = 12,
): number {
  return pickStarScored(dirs, mags, count, ray, fovDeg, screenPx, radiusPx, scale, catalogLimit).index
}
