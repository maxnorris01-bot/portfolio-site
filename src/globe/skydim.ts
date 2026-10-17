// Dimming the sky when the satellite view looks at the Earth. A camera
// exposed for the sunlit Earth would show little of the sky, so the Milky Way
// glow and the stars dim as the Earth fills the view and stay at full
// brightness looking at dark sky; the Sun, Moon, planets, constellation lines,
// the Earth and the selection are never dimmed. Pure, so it is tested.
//
// How much Earth is in view: the fraction of the view that is Earth, taken
// over a disc of the view's vertical half field of view around the view axis
// (a spherical cap), against the Earth's cap of angular radius rho = asin(R/r)
// around nadir, by sampling 48 evenly spread directions of the view cap.
// That one number covers both ways the angle to nadir alone misleads: a very
// narrow field centred on the disc is all Earth whatever the angle, and a very
// wide field centred just outside the limb still has a lot of Earth in it.
// It is then eased through a smoothstep so a sliver of Earth at the edge of a
// wide view dims the sky only a little.

import type { Vec3 } from './pov.ts'

const DEG = Math.PI / 180

/** The dimming multipliers: what the sky is multiplied by with the Earth filling the view, sunlit or not. */
export interface SkyDimTargets {
  glowSunlit: number
  starsSunlit: number
  glowNight: number
  starsNight: number
}

export const SKY_DIM_DEFAULT: Readonly<SkyDimTargets> = { glowSunlit: 0.2, starsSunlit: 0.45, glowNight: 0.5, starsNight: 0.75 }

/** Time constant of the smoothing, seconds; gentler (slower) for people who ask for less motion. */
export const SKY_DIM_TAU = 0.4
export const SKY_DIM_TAU_REDUCED = 1.0

const SAMPLES = 48
// Sample offsets (as a share of the cap's area and an angle around the axis), fixed once.
const SAMPLE: { t: number; c: number; s: number }[] = Array.from({ length: SAMPLES }, (_, k) => {
  const a = k * Math.PI * (3 - Math.sqrt(5)) // golden angle
  return { t: (k + 0.5) / SAMPLES, c: Math.cos(a), s: Math.sin(a) }
})

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

/** The Earth's angular radius from a camera `r` Earth radii from its centre, radians (90 degrees at the surface). */
export const earthAngularRadius = (r: number) => Math.asin(Math.min(1, 1 / Math.max(r, 1e-6)))

/**
 * The fraction (0..1) of the view that is Earth: `axis` the view direction,
 * `nadir` the direction to the Earth's centre (both unit vectors, same
 * frame), `rho` the Earth's angular radius (radians), `fovDeg` the vertical
 * field of view.
 */
export function earthViewFraction(axis: Vec3, nadir: Vec3, rho: number, fovDeg: number): number {
  const half = Math.min(89, Math.max(1e-4, fovDeg / 2)) * DEG
  const a = norm(axis)
  const n = norm(nadir)
  const cosRho = Math.cos(rho)
  // A frame around the view axis.
  const helper: Vec3 = Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]
  const u = norm(cross(a, helper))
  const v = cross(a, u)
  const spread = 1 - Math.cos(half)
  let inside = 0
  for (const { t, c, s } of SAMPLE) {
    const cosAng = 1 - t * spread // uniform over the cap's area
    const sinAng = Math.sqrt(Math.max(0, 1 - cosAng * cosAng))
    const d: Vec3 = [
      cosAng * a[0] + sinAng * (c * u[0] + s * v[0]),
      cosAng * a[1] + sinAng * (c * u[1] + s * v[1]),
      cosAng * a[2] + sinAng * (c * u[2] + s * v[2]),
    ]
    if (dot(d, n) >= cosRho) inside++
  }
  return inside / SAMPLES
}

const smoothstep = (lo: number, hi: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)))
  return t * t * (3 - 2 * t)
}

/** From the Earth's share of the view to the dimming factor e (0 none, 1 the Earth fills it): full by 60% Earth, none under 5%. */
export const earthInView = (fraction: number) => smoothstep(0.05, 0.6, fraction)

/**
 * How sunlit the point below the satellite is (1 day, 0 night), from the
 * cosine of the Sun's angle there: blended through twilight (the Sun from
 * about 6 degrees below the horizon to 12 above) so crossing the terminator
 * never pops.
 */
export const sunlitWeight = (cosSunAtNadir: number) => smoothstep(-0.1, 0.2, cosSunAtNadir)

/** The multipliers for the glow and the stars: 1 with no Earth in view, the day/night target with the Earth filling it. */
export function dimFactors(e: number, lit: number, t: SkyDimTargets = SKY_DIM_DEFAULT): { glow: number; stars: number } {
  const glowTarget = t.glowNight + (t.glowSunlit - t.glowNight) * lit
  const starsTarget = t.starsNight + (t.starsSunlit - t.starsNight) * lit
  return { glow: 1 + (glowTarget - 1) * e, stars: 1 + (starsTarget - 1) * e }
}

/** Ease `current` toward `target` over a time constant (exponential smoothing). */
export function easeToward(current: number, target: number, dtSec: number, reducedMotion: boolean): number {
  const tau = reducedMotion ? SKY_DIM_TAU_REDUCED : SKY_DIM_TAU
  const k = 1 - Math.exp(-Math.max(0, dtSec) / tau)
  const next = current + (target - current) * k
  return Math.abs(next - target) < 1e-3 ? target : next
}

export interface SkyDimState {
  glow: number
  stars: number
  /** The latest un-smoothed inputs, for the debug readout. */
  e: number
  lit: number
}

/**
 * One frame: `camPos` the camera's position in Earth radii (Earth at the
 * origin), `axis` its view direction, `sunDir` the Sun's direction (same
 * frame). `state` null starts at the target (no fade on entering the view).
 */
export function stepSkyDim(
  state: SkyDimState | null,
  camPos: Vec3,
  axis: Vec3,
  sunDir: Vec3,
  fovDeg: number,
  dtSec: number,
  reducedMotion: boolean,
  targets: SkyDimTargets = SKY_DIM_DEFAULT,
): SkyDimState {
  const r = Math.hypot(camPos[0], camPos[1], camPos[2])
  const up: Vec3 = r > 0 ? [camPos[0] / r, camPos[1] / r, camPos[2] / r] : [0, 0, 1]
  const nadir: Vec3 = [-up[0], -up[1], -up[2]]
  const e = earthInView(earthViewFraction(axis, nadir, earthAngularRadius(r), fovDeg))
  const lit = sunlitWeight(dot(up, norm(sunDir)))
  const want = dimFactors(e, lit, targets)
  if (!state) return { glow: want.glow, stars: want.stars, e, lit }
  return {
    glow: easeToward(state.glow, want.glow, dtSec, reducedMotion),
    stars: easeToward(state.stars, want.stars, dtSec, reducedMotion),
    e,
    lit,
  }
}
