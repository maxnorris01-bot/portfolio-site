// The satellite view's descend zoom: pure camera maths, shared by the engine
// and the tests. Two modes:
// - locked: the camera rides the satellite (pov.ts), and zooming narrows the
//   field of view toward the pointer, down to DESCEND_FOV;
// - detached: past that, or on a double-click, the camera leaves the
//   satellite and holds over a ground point, fixed to the Earth's surface (so
//   it turns with the Earth and the spot never drifts), looking straight
//   down. Zooming then changes its altitude toward the pointer, with a soft
//   stop at the finest imagery level; dragging pans the ground.
//
// Orientation: "heading up" (the default) keeps the satellite's point of
// view: on detaching, the direction that was up on screen is carried over as
// the held view's heading, so nothing swings; "north up" turns north to the
// top. Near the poles, where north has no direction at the pole itself, the
// held view stays at least 0.5 degrees (about 55 km) away, and north there is
// the way toward the pole along the camera's meridian.
//
// Vectors are Earth-fixed (the globe mesh's own axes, as in gibs.ts:
// longitude 0 on +x, 90 E on -z, north on +y), in Earth radii.

import { applyLook, POV_FOV_MAX, type Vec3 } from './pov.ts'

const EARTH_RADIUS_KM = 6378.137
const DEG = Math.PI / 180

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const unit = (a: Vec3): Vec3 => scale(a, 1 / (len(a) || 1))
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

/** Zooming in past this field of view (degrees) descends toward the surface. */
export const DESCEND_FOV = 30
/** A view change (double-click zoom, detach, return, preset) takes this long. */
export const TRANSITION_MS = 500
/** Each double-click or double-tap zooms in by this factor. */
export const DOUBLE_CLICK_ZOOM = 0.4
/** How close to the imagery limit (as a ratio of altitudes) zooming starts to slow. */
export const SOFT_LIMIT_RATIO = 2.5
/** Latitude is kept off the poles, where "north-up" has no direction. */
const MAX_LAT = 89.5

export interface SurfaceCam {
  /** The ground point straight below the camera. */
  latDeg: number
  lonDeg: number
  /** Camera altitude above that point, km. */
  altKm: number
  /**
   * The ground direction that is up on screen, degrees clockwise from north
   * (0 = north up). Missing means north up.
   */
  headingDeg?: number
}

/** Which way is up on screen: the satellite's heading (default) or north. */
export type Orientation = 'heading' | 'north'

export interface Pose {
  /** Camera position, Earth radii. */
  pos: Vec3
  /** Unit view direction and screen-up. */
  look: Vec3
  up: Vec3
}

export function latLonToUnit(latDeg: number, lonDeg: number): Vec3 {
  const la = latDeg * DEG
  const lo = lonDeg * DEG
  return [Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)]
}

export function unitToLatLon(v: Vec3): { latDeg: number; lonDeg: number } {
  const u = unit(v)
  return { latDeg: Math.asin(Math.max(-1, Math.min(1, u[1]))) / DEG, lonDeg: Math.atan2(-u[2], u[0]) / DEG }
}

/** The local north direction (tangent, unit) at a ground point. */
function northAt(latDeg: number, lonDeg: number): Vec3 {
  const la = latDeg * DEG
  const lo = lonDeg * DEG
  return [-Math.sin(la) * Math.cos(lo), Math.cos(la), Math.sin(la) * Math.sin(lo)]
}

/**
 * The local frame at a ground point: outward normal, north and east (unit,
 * tangent). Latitude is held within 0.5 degrees of the poles, so north is
 * always defined: near a pole it points toward it along the meridian.
 */
export function tangentFrame(latDeg: number, lonDeg: number): { n: Vec3; north: Vec3; east: Vec3 } {
  const lat = Math.max(-MAX_LAT, Math.min(MAX_LAT, latDeg))
  const n = latLonToUnit(lat, lonDeg)
  const north = northAt(lat, lonDeg)
  return { n, north, east: cross(north, n) }
}

/** The ground direction at a heading (degrees clockwise from north). */
function headingDir(f: { north: Vec3; east: Vec3 }, headingDeg: number): Vec3 {
  const h = headingDeg * DEG
  return add(scale(f.north, Math.cos(h)), scale(f.east, Math.sin(h)))
}

/** A tangent direction's heading, degrees clockwise from north in 0..360. */
function headingOfDir(f: { north: Vec3; east: Vec3 }, d: Vec3): number {
  const h = Math.atan2(dot(d, f.east), dot(d, f.north)) / DEG
  const r = ((h % 360) + 360) % 360
  return r >= 360 ? 0 : r // -1e-15 would wrap to 360
}

/**
 * The surface camera's pose: above its ground point, looking straight down,
 * with its heading up on screen (north up when it has none).
 */
export function surfacePose(s: SurfaceCam): Pose {
  const f = tangentFrame(s.latDeg, s.lonDeg)
  return { pos: scale(f.n, 1 + s.altKm / EARTH_RADIUS_KM), look: scale(f.n, -1), up: headingDir(f, s.headingDeg ?? 0) }
}

/** The camera as shown: north up drops the heading; heading up keeps it. */
export function oriented(s: SurfaceCam, orientation: Orientation): SurfaceCam {
  return orientation === 'north' ? { ...s, headingDeg: 0 } : s
}

/**
 * Which ground direction is up on screen in any view: from the ground point
 * at the centre of the screen toward the one just above it (or away from the
 * one just below, near the horizon), as a heading at the centre point.
 * Null when the centre of the screen is sky.
 */
export function screenUpHeading(p: Pose, fovDeg: number, aspect: number): number | null {
  const g = groundAt(p, fovDeg, aspect, 0, 0)
  if (!g) return null
  const { latDeg, lonDeg } = unitToLatLon(g)
  const f = tangentFrame(latDeg, lonDeg)
  const above = groundAt(p, fovDeg, aspect, 0, 0.02)
  const below = above ? null : groundAt(p, fovDeg, aspect, 0, -0.02)
  const d = above ? sub(above, g) : below ? sub(g, below) : null
  if (!d) return null
  const t = sub(d, scale(f.n, dot(d, f.n)))
  if (len(t) < 1e-15) return null
  return headingOfDir(f, t)
}

/**
 * The satellite's ground-track heading: its velocity's direction along the
 * ground below it, degrees clockwise from north (Earth-fixed pos and vel).
 */
export function groundTrackHeading(pos: Vec3, vel: Vec3): number {
  const { latDeg, lonDeg } = unitToLatLon(pos)
  return headingOfDir(tangentFrame(latDeg, lonDeg), vel)
}

/**
 * North up for a view looking at the ground (riding the satellite): the
 * screen-up direction that puts north at the top, perpendicular to `look`.
 * Null when looking (nearly) along the north direction itself.
 */
export function northUpFor(p: Pose, fovDeg: number, aspect: number): Vec3 | null {
  const g = groundAt(p, fovDeg, aspect, 0, 0)
  const at = g ?? p.pos
  const { latDeg, lonDeg } = unitToLatLon(at)
  const north = tangentFrame(latDeg, lonDeg).north
  const u = sub(north, scale(p.look, dot(north, p.look)))
  return len(u) < 1e-6 ? null : unit(u)
}

/**
 * Where north points on screen, as an angle clockwise from screen-up
 * (degrees), at the centre of the view; null when the centre is sky.
 */
export function northOnScreenDeg(p: Pose, fovDeg: number, aspect: number): number | null {
  const g = groundAt(p, fovDeg, aspect, 0, 0)
  if (!g) return null
  const { latDeg, lonDeg } = unitToLatLon(g)
  const north = tangentFrame(latDeg, lonDeg).north
  const right = cross(p.look, p.up)
  const ahead = add(g, scale(north, 1e-4))
  const d = sub(ahead, p.pos)
  // Screen coordinates of the point a little north of the centre, relative to the centre.
  const x = dot(d, right) / dot(d, p.look)
  const y = dot(d, p.up) / dot(d, p.look)
  const g0 = sub(g, p.pos)
  const x0 = dot(g0, right) / dot(g0, p.look)
  const y0 = dot(g0, p.up) / dot(g0, p.look)
  return Math.atan2(x - x0, y - y0) / DEG
}

/**
 * The ray through a screen point: `nx`, `ny` in -1..1 (right and up), for a
 * vertical field of view `fovDeg` and width/height `aspect`.
 */
export function rayThrough(p: Pose, fovDeg: number, aspect: number, nx: number, ny: number): Vec3 {
  const t = Math.tan((fovDeg * DEG) / 2)
  const right = cross(p.look, p.up)
  return unit(add(p.look, add(scale(right, nx * t * aspect), scale(p.up, ny * t))))
}

/** Where a ray from `origin` first meets the unit sphere (the ground), or null if it misses. */
export function raySphere(origin: Vec3, dir: Vec3): Vec3 | null {
  const b = dot(origin, dir)
  const c = dot(origin, origin) - 1
  const disc = b * b - c
  if (disc < 0) return null
  const t = -b - Math.sqrt(disc)
  if (t < 0) return null
  return add(origin, scale(dir, t))
}

/** The ground point under a screen point, or null for sky. */
export function groundAt(p: Pose, fovDeg: number, aspect: number, nx: number, ny: number): Vec3 | null {
  return raySphere(p.pos, rayThrough(p, fovDeg, aspect, nx, ny))
}

// Rotate `v` by the rotation that takes unit vector `from` to unit vector `to`
// (Rodrigues; the identity when they coincide).
function rotateBy(v: Vec3, from: Vec3, to: Vec3): Vec3 {
  const axis = cross(from, to)
  const s = len(axis)
  const c = dot(from, to)
  if (s < 1e-15) return v
  const k = scale(axis, 1 / s)
  const angle = Math.atan2(s, c)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return add(add(scale(v, cos), scale(cross(k, v), sin)), scale(k, dot(k, v) * (1 - cos)))
}

/**
 * Move the surface camera so the ground point under the screen point
 * (nx, ny) is `target` (Earth-fixed unit vector): a few rotations of its
 * ground point converge (exact for the sphere, unlike a flat-ground shift).
 */
export function keepUnder(s: SurfaceCam, target: Vec3, fovDeg: number, aspect: number, nx: number, ny: number): SurfaceCam {
  let cur = s
  for (let i = 0; i < 24; i++) {
    const p = groundAt(surfacePose(cur), fovDeg, aspect, nx, ny)
    if (!p) break
    // Converged to well under a metre.
    if (dot(unit(p), unit(target)) > 1 - 1e-15) break
    const centre = rotateBy(latLonToUnit(cur.latDeg, cur.lonDeg), unit(p), unit(target))
    const ll = unitToLatLon(centre)
    cur = { ...cur, latDeg: Math.max(-MAX_LAT, Math.min(MAX_LAT, ll.latDeg)), lonDeg: ll.lonDeg }
  }
  return cur
}

/**
 * A new altitude after zooming by `factor` (below 1 zooms in), easing to a
 * stop at `minKm`: within SOFT_LIMIT_RATIO of the limit each step shrinks in
 * proportion, so the approach slows and then stops instead of hitting a wall.
 * Zooming out is free up to `maxKm`.
 */
export function easeAltitude(altKm: number, factor: number, minKm: number, maxKm: number): number {
  const a = Math.log(altKm)
  const lo = Math.log(minKm)
  const hi = Math.log(maxKm)
  let d = Math.log(factor)
  if (d < 0) d *= Math.max(0, Math.min(1, (a - lo) / Math.log(SOFT_LIMIT_RATIO)))
  const next = a + d
  if (next >= hi) return maxKm
  if (next <= lo) return minKm
  return Math.exp(next)
}

/**
 * Zoom the surface camera by `factor` toward the screen point (nx, ny): the
 * ground point under it stays under it.
 */
export function zoomSurfaceToward(
  s: SurfaceCam,
  factor: number,
  nx: number,
  ny: number,
  fovDeg: number,
  aspect: number,
  limits: { minKm: number; maxKm: number },
): SurfaceCam {
  const target = groundAt(surfacePose(s), fovDeg, aspect, nx, ny)
  const next = { ...s, altKm: easeAltitude(s.altKm, factor, limits.minKm, limits.maxKm) }
  return target ? keepUnder(next, target, fovDeg, aspect, nx, ny) : next
}

/**
 * Pan the surface camera so the ground point under the pointer's previous
 * position follows it to the new one (north stays up).
 */
export function panSurface(
  s: SurfaceCam,
  from: [number, number],
  to: [number, number],
  fovDeg: number,
  aspect: number,
): SurfaceCam {
  const grabbed = groundAt(surfacePose(s), fovDeg, aspect, from[0], from[1])
  return grabbed ? keepUnder(s, grabbed, fovDeg, aspect, to[0], to[1]) : s
}

/**
 * The lowest altitude worth descending to: one image pixel of `kmPerPx`
 * (the finest imagery level) may cover at most `overMag` screen pixels.
 */
export function minAltitudeKm(kmPerPx: number, fovDeg: number, screenPx: number, overMag = 2): number {
  return ((kmPerPx / overMag) * screenPx) / (2 * Math.tan((fovDeg * DEG) / 2))
}

/**
 * The surface camera that takes over from a satellite-locked view: over the
 * ground point at the centre of the screen (null if the centre is sky), at
 * the distance from the camera to that point, so the scale carries over, and
 * with the ground direction that was up on screen as its heading, so the
 * view doesn't swing.
 */
export function detachFrom(p: Pose, fovDeg: number, aspect: number): SurfaceCam | null {
  const g = groundAt(p, fovDeg, aspect, 0, 0)
  if (!g) return null
  const { latDeg, lonDeg } = unitToLatLon(g)
  return {
    latDeg: Math.max(-MAX_LAT, Math.min(MAX_LAT, latDeg)),
    lonDeg,
    altKm: len(sub(p.pos, g)) * EARTH_RADIUS_KM,
    headingDeg: screenUpHeading(p, fovDeg, aspect) ?? 0,
  }
}

/** Ease in and out (cubic), for view transitions. */
export function easeInOut(t: number): number {
  const x = Math.max(0, Math.min(1, t))
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
}

/** A transition's length: none when the user prefers reduced motion. */
export const transitionMs = (reducedMotion: boolean) => (reducedMotion ? 0 : TRANSITION_MS)

// Spherical interpolation between unit vectors.
function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const c = Math.max(-1, Math.min(1, dot(a, b)))
  const angle = Math.acos(c)
  if (angle < 1e-9) return a
  const s = Math.sin(angle)
  return unit(add(scale(a, Math.sin((1 - t) * angle) / s), scale(b, Math.sin(t * angle) / s)))
}

/**
 * A pose part-way (t in 0..1) between two: the position's direction swings
 * along the great circle and its height above the ground changes
 * geometrically (so a descent feels even), the look and up directions turn
 * smoothly, and up stays perpendicular to look.
 */
export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const ra = len(a.pos)
  const rb = len(b.pos)
  const ha = Math.max(1e-9, ra - 1)
  const hb = Math.max(1e-9, rb - 1)
  const h = Math.exp(Math.log(ha) + (Math.log(hb) - Math.log(ha)) * t)
  const pos = scale(slerp(unit(a.pos), unit(b.pos), t), 1 + h)
  const look = slerp(a.look, b.look, t)
  const upRaw = slerp(a.up, b.up, t)
  const up = unit(sub(upRaw, scale(look, dot(upRaw, look))))
  return { pos, look, up }
}

/**
 * Locked mode: narrow (or widen) the field of view by `factor` toward the
 * screen point (nx, ny), turning the look (yaw, pitch from the preset
 * `base`) so the direction under the pointer stays under it. The field of
 * view stays within minFov..120.
 */
export function zoomLockedToward(
  base: { look: Vec3; up: Vec3 },
  look: { yaw: number; pitch: number; fov: number },
  factor: number,
  nx: number,
  ny: number,
  aspect: number,
  minFov: number,
): { yaw: number; pitch: number; fov: number } {
  const fov = Math.min(POV_FOV_MAX, Math.max(minFov, look.fov * factor))
  const before = applyLook(base, look.yaw, look.pitch)
  const target = rayThrough({ pos: [0, 0, 0], ...before }, look.fov, aspect, nx, ny)
  const right = cross(base.look, base.up)
  let { yaw, pitch } = look
  for (let i = 0; i < 4; i++) {
    const v = applyLook(base, yaw, pitch)
    const now = rayThrough({ pos: [0, 0, 0], ...v }, fov, aspect, nx, ny)
    const turned = rotateBy(v.look, now, target)
    pitch = Math.asin(Math.max(-1, Math.min(1, dot(turned, base.up)))) / DEG
    yaw = Math.atan2(dot(turned, right), dot(turned, base.look)) / DEG
  }
  return { yaw, pitch, fov }
}
