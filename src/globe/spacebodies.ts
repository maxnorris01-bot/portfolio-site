// The Sun, Moon and planets as seen from the viewpoint satellite, in the
// satellite view's scene frame. Pure vector maths (no ephemeris, no three.js):
// planets.ts supplies geocentric vectors from astronomy-engine.
//
// The direction to a body from the satellite is its geocentric vector minus
// the satellite's position. For planets and the Sun that's the geocentric
// direction to within a few thousandths of a degree, but the Moon is only
// 384,000 km away and a low orbit is about 6,800 km from the Earth's centre,
// so its direction differs by up to about a degree (the Moon's parallax from
// the satellite), and its phase is the angle at the Moon between the Sun and
// the satellite, not the Earth's centre.

import { EARTH_RADIUS_KM } from './frames.ts'
import type { Vec3 } from './pov.ts'
import { limbDirection } from './skybodies.ts'
import { j2000ToScene, type Mat3 } from './stars.ts'

export const MOON_RADIUS_KM = 1737.4
export const SUN_RADIUS_KM = 695_700

/** A body's geocentric vector (km, J2000 equatorial axes) and apparent magnitude. */
export interface GeoBody {
  key: string
  vecKm: Vec3
  mag: number
  /** The Moon: growing toward full (from its geocentric elongation). */
  waxing?: boolean
}

export interface SpaceBodyView {
  key: string
  /** Unit direction from the satellite, scene axes. */
  dir: Vec3
  /** Distance from the satellite, km. */
  distKm: number
  mag: number
  /** Angular diameter from the satellite, degrees (Sun and Moon; planets are points). */
  angDiameterDeg: number
  /** The Moon: lit fraction as the satellite sees it, 0..1, and growing. */
  illuminated?: number
  waxing?: boolean
  /** The Moon: unit direction (scene axes) of the lit limb on the sky, from the Moon toward the Sun. */
  limb?: Vec3
  /** The Moon: angle between its direction from the satellite and from the Earth's centre, degrees. */
  parallaxDeg?: number
}

const DEG = 180 / Math.PI
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
const unit = (a: Vec3): Vec3 => {
  const n = len(a) || 1
  return [a[0] / n, a[1] / n, a[2] / n]
}
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const angleDeg = (a: Vec3, b: Vec3) => Math.acos(Math.max(-1, Math.min(1, dot(unit(a), unit(b))))) * DEG

/** The satellite's position in scene axes, km, from scene-frame Earth radii. */
export const sceneKm = (posEarthRadii: Vec3): Vec3 => [
  posEarthRadii[0] * EARTH_RADIUS_KM,
  posEarthRadii[1] * EARTH_RADIUS_KM,
  posEarthRadii[2] * EARTH_RADIUS_KM,
]

/** Every body as seen from `satKm` (scene axes, km); `j2000ToDate` is the precession rotation. */
export function bodiesFromSatellite(geo: readonly GeoBody[], satKm: Vec3, j2000ToDate: Mat3): SpaceBodyView[] {
  const scene = new Map<string, Vec3>()
  for (const g of geo) scene.set(g.key, j2000ToScene(g.vecKm, j2000ToDate))
  const sun = scene.get('sun')
  return geo.map((g) => {
    const p = scene.get(g.key)!
    const toBody = sub(p, satKm)
    const distKm = len(toBody)
    const dir = unit(toBody)
    const view: SpaceBodyView = { key: g.key, dir, distKm, mag: g.mag, angDiameterDeg: 0 }
    if (g.key === 'sun') view.angDiameterDeg = 2 * Math.asin(SUN_RADIUS_KM / distKm) * DEG
    if (g.key === 'moon') {
      view.angDiameterDeg = 2 * Math.asin(MOON_RADIUS_KM / distKm) * DEG
      view.waxing = g.waxing
      view.parallaxDeg = angleDeg(toBody, p)
      if (sun) {
        // Phase angle at the Moon between the Sun and the satellite.
        const toSun = sub(sun, p)
        const toSat = sub(satKm, p)
        view.illuminated = (1 + Math.cos((angleDeg(toSun, toSat) * Math.PI) / 180)) / 2
        view.limb = limbDirection(dir, unit(sub(sun, satKm)))
      }
    }
    return view
  })
}

/**
 * The Moon's direction as seen from the Earth's centre, for comparison:
 * what astronomy-engine's own geocentric result gives. The difference to
 * `bodiesFromSatellite`'s direction is the parallax from the satellite.
 */
export function geocentricDirection(geo: GeoBody, j2000ToDate: Mat3): Vec3 {
  return unit(j2000ToScene(geo.vecKm, j2000ToDate))
}

/** How big a body's sprite is on screen: its true size, but never under `minPx`. */
export function bodyPixels(angDiameterDeg: number, fovDeg: number, screenPx: number, minPx: number): number {
  const truePx = (angDiameterDeg / fovDeg) * screenPx
  return Math.max(minPx, truePx)
}

/**
 * Which body a tap or click picks: the nearest one whose disc, grown by
 * `tolerancePx`, contains the point (the Sky view's rule: inside a disc
 * first, then the nearest within the tolerance), or null.
 */
export function pickBody(
  px: number,
  py: number,
  bodies: readonly { key: string; x: number; y: number; r: number }[],
  tolerancePx: number,
): string | null {
  let best: string | null = null
  let bestD = Infinity
  for (const b of bodies) {
    const d = Math.hypot(px - b.x, py - b.y) - b.r
    // A disc the pointer is inside always wins over one it's merely near.
    const score = d <= 0 ? d - 1e6 : d
    if (d <= tolerancePx && score < bestD) {
      best = b.key
      bestD = score
    }
  }
  return best
}
