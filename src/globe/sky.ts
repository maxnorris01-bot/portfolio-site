// Geometry for the overhead Sky view (Phase 1, satellite-conjunction-screening
// working notes 2026-10-04). Pure functions, no three.js or satellite.js, so
// the test can check them against satellite.js's own look angles.
//
// Positions are in the globe's scene frame: Earth radii, with inertial (TEME)
// x, y, z mapped to scene (x, z, -y), as in frames.ts. The observer stands on
// the WGS84 ellipsoid (altitude 0) and rotates with the Earth by GMST, the
// same angle the globe uses to rotate its Earth mesh.

import { EARTH_RADIUS_KM } from './frames.ts'

const WGS84_A = 6378.137
const WGS84_B = 6356.7523142
const WGS84_E2 = 1 - (WGS84_B / WGS84_A) ** 2

type Vec3 = [number, number, number]

export interface ObserverFrame {
  /** Observer position (scene units). */
  pos: Vec3
  /** Local unit vectors (scene frame): east, north, up (geodetic vertical). */
  east: Vec3
  north: Vec3
  up: Vec3
}

// Inertial (x, y, z) -> scene (x, z, -y)
const toScene = (x: number, y: number, z: number): Vec3 => [x, z, -y]

/**
 * The observer's position and local east/north/up axes in the scene frame at
 * the moment whose Greenwich sidereal angle is `gmst` (radians).
 */
export function observerFrame(latDeg: number, lonDeg: number, gmst: number): ObserverFrame {
  const lat = (latDeg * Math.PI) / 180
  const theta = (lonDeg * Math.PI) / 180 + gmst // local sidereal angle
  const sLat = Math.sin(lat)
  const cLat = Math.cos(lat)
  const sTh = Math.sin(theta)
  const cTh = Math.cos(theta)
  const n = WGS84_A / Math.sqrt(1 - WGS84_E2 * sLat * sLat)
  const r = EARTH_RADIUS_KM
  return {
    pos: toScene((n * cLat * cTh) / r, (n * cLat * sTh) / r, (n * (1 - WGS84_E2) * sLat) / r),
    east: toScene(-sTh, cTh, 0),
    north: toScene(-sLat * cTh, -sLat * sTh, cLat),
    up: toScene(cLat * cTh, cLat * sTh, sLat),
  }
}

/** East, north, up components (scene units) of the vector observer -> p. */
export function toEnu(f: ObserverFrame, px: number, py: number, pz: number): Vec3 {
  const dx = px - f.pos[0]
  const dy = py - f.pos[1]
  const dz = pz - f.pos[2]
  return [
    dx * f.east[0] + dy * f.east[1] + dz * f.east[2],
    dx * f.north[0] + dy * f.north[1] + dz * f.north[2],
    dx * f.up[0] + dy * f.up[1] + dz * f.up[2],
  ]
}

/** Azimuth (degrees, 0 = north, clockwise through east) and elevation (degrees). */
export function lookAngles(f: ObserverFrame, p: Vec3): { azDeg: number; elDeg: number; rangeKm: number } {
  const [e, n, u] = toEnu(f, p[0], p[1], p[2])
  const az = (Math.atan2(e, n) * 180) / Math.PI
  return {
    azDeg: (az + 360) % 360,
    elDeg: (Math.atan2(u, Math.hypot(e, n)) * 180) / Math.PI,
    rangeKm: Math.hypot(e, n, u) * EARTH_RADIUS_KM,
  }
}

/**
 * Where an east/north/up direction sits in the Sky scene: east = +x, up = +y,
 * north = -z. A camera facing north (-z) with +y up has +x on its RIGHT, so
 * east is on the right, as for a person standing there looking up (a flat sky
 * chart, viewed from below, puts east on the left; the dome must not).
 */
export function enuToSky(e: number, n: number, u: number): Vec3 {
  return [e, u, -n]
}

/** Unit direction in the Sky scene for an azimuth/elevation (degrees). */
export function skyDirection(azDeg: number, elDeg: number): Vec3 {
  const az = (azDeg * Math.PI) / 180
  const el = (elDeg * Math.PI) / 180
  return enuToSky(Math.sin(az) * Math.cos(el), Math.cos(az) * Math.cos(el), Math.sin(el))
}

/** Radius of the Sky scene's dome (arbitrary scene units). */
export const DOME_RADIUS = 100

/**
 * Writes every object's dome position (Sky scene, DOME_RADIUS) into `out` and
 * returns how many shown objects are above the horizon. Positions come from
 * the frame-sliced propagation, so each object is first moved forward by its
 * velocity over its slice's staleness (`sliceDtSec[k]`, slices split the
 * catalog as floor(k*n/slices)); that keeps points from jumping every few
 * frames at 50x. Pure arithmetic, no per-object propagation or allocation.
 * Objects with `valid(i) === false` (failed propagation) go straight down,
 * under the ground; below-horizon objects sit where they are, below the
 * horizon, and the ground hides them.
 */
export function writeDome(
  out: Float32Array,
  positions: Float32Array,
  velocities: Float32Array,
  sliceDtSec: ArrayLike<number>,
  f: ObserverFrame,
  valid: (i: number) => boolean,
  shown: (i: number) => boolean,
): number {
  const n = positions.length / 3
  const slices = sliceDtSec.length
  const [ox, oy, oz] = f.pos
  const [ex, ey, ez] = f.east
  const [nx, ny, nz] = f.north
  const [ux, uy, uz] = f.up
  let above = 0
  for (let k = 0; k < slices; k++) {
    const from = Math.floor((k * n) / slices)
    const to = Math.floor(((k + 1) * n) / slices)
    const dt = sliceDtSec[k]
    for (let i = from; i < to; i++) {
      const j = i * 3
      if (!valid(i)) {
        out[j] = 0
        out[j + 1] = -DOME_RADIUS
        out[j + 2] = 0
        continue
      }
      const dx = positions[j] + velocities[j] * dt - ox
      const dy = positions[j + 1] + velocities[j + 1] * dt - oy
      const dz = positions[j + 2] + velocities[j + 2] * dt - oz
      const e = dx * ex + dy * ey + dz * ez
      const no = dx * nx + dy * ny + dz * nz
      const u = dx * ux + dy * uy + dz * uz
      const s = DOME_RADIUS / Math.hypot(e, no, u)
      // enuToSky: east = +x, up = +y, north = -z
      out[j] = e * s
      out[j + 1] = u * s
      out[j + 2] = -no * s
      if (u > 0 && shown(i)) above++
    }
  }
  return above
}

/**
 * Azimuth and elevation (degrees) of a direction given in the scene frame,
 * such as the Sun's (sunDirectionScene), seen from an observer: the direction
 * projected on the observer's east/north/up axes. A direction, not a point,
 * so it ignores the observer's offset from the Earth's centre (parallax),
 * which is negligible for the Sun.
 */
export function directionLookAngles(f: ObserverFrame, d: Vec3): { azDeg: number; elDeg: number } {
  const dot = (a: Vec3) => a[0] * d[0] + a[1] * d[1] + a[2] * d[2]
  const e = dot(f.east)
  const n = dot(f.north)
  const u = dot(f.up)
  const az = (Math.atan2(e, n) * 180) / Math.PI
  return { azDeg: (az + 360) % 360, elDeg: (Math.atan2(u, Math.hypot(e, n)) * 180) / Math.PI }
}
