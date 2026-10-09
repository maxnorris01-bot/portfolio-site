// The satellite's-eye view: the camera rides the selected satellite in a
// nadir-locked (LVLH) frame. Pure vector maths and view-state rules, shared by
// the engine, the page and the tests.

export type Vec3 = [number, number, number]
export type PovPreset = 'down' | 'forward' | 'outward'

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const unit = (a: Vec3): Vec3 => scale(a, 1 / (len(a) || 1))
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

/**
 * The local orbital frame at a satellite (position and velocity in any one
 * inertial frame): `out` points away from the Earth's centre, `down` at it,
 * `along` is the velocity's direction, and `track` the velocity with its
 * radial part removed (the local horizontal along-track direction, equal to
 * `along` for a circular orbit).
 */
export function lvlhBasis(pos: Vec3, vel: Vec3) {
  const out = unit(pos)
  const along = unit(vel)
  const track = unit(sub(vel, scale(out, dot(vel, out))))
  return { out, down: scale(out, -1), along, track }
}

/**
 * Where a preset looks and which way is up on screen, both unit vectors:
 * - down: at the Earth's centre, with up = the along-track direction (the
 *   ground rolls toward the top of the screen as the satellite flies);
 * - forward: along the velocity, with up = away from the Earth (sky above,
 *   Earth's limb below, like a cockpit);
 * - outward: straight up away from the Earth, with up = along-track again.
 * Each up is made exactly perpendicular to its look direction, so the frame
 * never rolls unexpectedly.
 */
export function presetView(preset: PovPreset, pos: Vec3, vel: Vec3): { look: Vec3; up: Vec3 } {
  const b = lvlhBasis(pos, vel)
  const look = preset === 'down' ? b.down : preset === 'forward' ? b.along : b.out
  const upHint = preset === 'forward' ? b.out : b.track
  const up = unit(sub(upHint, scale(look, dot(upHint, look))))
  return { look, up }
}

const DEG = Math.PI / 180

/** Pitch is limited so looking up or down never flips over the top. */
export const POV_PITCH_MAX = 85

/**
 * The look and up after turning a preset by `yawDeg` (to the right, about the
 * preset's up) and then `pitchDeg` (upward, about the turned right axis).
 */
export function applyLook(
  view: { look: Vec3; up: Vec3 },
  yawDeg: number,
  pitchDeg: number,
): { look: Vec3; up: Vec3 } {
  const right = cross(view.look, view.up)
  const y = yawDeg * DEG
  const look1 = add(scale(view.look, Math.cos(y)), scale(right, Math.sin(y)))
  const right1 = cross(look1, view.up)
  const p = Math.max(-POV_PITCH_MAX, Math.min(POV_PITCH_MAX, pitchDeg)) * DEG
  const look = unit(add(scale(look1, Math.cos(p)), scale(view.up, Math.sin(p))))
  const up = unit(cross(right1, look))
  return { look, up }
}

/**
 * Field of view limits. 120 degrees is a wide, still undistorted view. The
 * narrow end is 15 degrees: at GEO the Earth's disc (17.4 degrees) then fills
 * the view, which is where the 2K day texture runs out (about 2 device pixels
 * per texel there). Narrower would only magnify blur.
 */
export const POV_FOV_MIN = 15
export const POV_FOV_MAX = 120
export const POV_FOV_DEFAULT = 70

/** Zoom by a factor (below 1 narrows): logarithmic, so every step feels the same. */
export function zoomFov(fov: number, factor: number): number {
  return Math.min(POV_FOV_MAX, Math.max(POV_FOV_MIN, fov * factor))
}

/** The field of view at position t (0 = widest, 1 = narrowest) on a logarithmic scale. */
export function fovAt(t: number): number {
  const k = Math.max(0, Math.min(1, t))
  return Math.exp(Math.log(POV_FOV_MAX) + (Math.log(POV_FOV_MIN) - Math.log(POV_FOV_MAX)) * k)
}

export type MainView = 'globe' | 'sky'
export type View = MainView | 'pov'

/**
 * View switching with a way back: entering the satellite view remembers the
 * view it came from; "back" (or losing the viewpoint satellite) returns
 * there. Entering needs a selected satellite; without one nothing changes.
 */
export function nextView(
  state: { view: View; from: MainView },
  e: { type: 'show'; view: View; canPov: boolean } | { type: 'back' },
): { view: View; from: MainView } {
  if (e.type === 'back') return state.view === 'pov' ? { view: state.from, from: state.from } : state
  if (e.view === 'pov') {
    if (!e.canPov || state.view === 'pov') return state
    return { view: 'pov', from: state.view }
  }
  return { view: e.view, from: e.view }
}

/** A satellite's speed and the angle a sphere of radius r subtends from distance d (degrees). */
export function angularDiameterDeg(radius: number, distance: number): number {
  return (2 * Math.asin(Math.min(1, radius / distance))) / DEG
}
