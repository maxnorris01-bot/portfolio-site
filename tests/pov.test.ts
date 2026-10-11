import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  POV_FOV_MAX,
  POV_FOV_MIN,
  angularDiameterDeg,
  applyLook,
  cross,
  fovAt,
  lvlhBasis,
  nextView,
  presetView,
  zoomFov,
  type Vec3,
} from '../src/globe/pov.ts'

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps
// An inclined, slightly eccentric LEO state (scene units, any inertial frame).
const pos: Vec3 = [0.6, 0.55, 0.62]
// Near-circular: mostly perpendicular to the radius, with a 1% radial part.
const tangent = cross(pos, [0.2, 0.3, 1])
const vel: Vec3 = [0, 1, 2].map((i) => tangent[i] * 0.001 + pos[i] * 0.00001) as Vec3

test('LVLH basis: down at the centre, along = velocity, all unit', () => {
  const b = lvlhBasis(pos, vel)
  const r = Math.hypot(...pos)
  for (let i = 0; i < 3; i++) assert.ok(near(b.down[i], -pos[i] / r))
  const v = Math.hypot(...vel)
  for (let i = 0; i < 3; i++) assert.ok(near(b.along[i], vel[i] / v))
  assert.ok(near(dot(b.track, b.out), 0))
})

test('each preset gives an orthonormal look/up with the documented directions', () => {
  const b = lvlhBasis(pos, vel)
  for (const preset of ['down', 'forward', 'outward'] as const) {
    const { look, up } = presetView(preset, pos, vel)
    assert.ok(near(Math.hypot(...look), 1) && near(Math.hypot(...up), 1))
    assert.ok(near(dot(look, up), 0))
    const right = cross(look, up)
    assert.ok(near(Math.hypot(...right), 1))
  }
  assert.deepEqual(presetView('down', pos, vel).look, b.down)
  assert.deepEqual(presetView('forward', pos, vel).look, b.along)
  assert.deepEqual(presetView('outward', pos, vel).look, b.out)
  assert.ok(dot(presetView('forward', pos, vel).up, b.out) > 0.99) // sky up in Forward
  assert.ok(dot(presetView('down', pos, vel).up, b.track) > 0.99) // ground rolls toward the top
})

test('drag offsets turn the view and stay orthonormal; pitch is limited', () => {
  const v0 = presetView('forward', pos, vel)
  const same = applyLook(v0, 0, 0)
  for (let i = 0; i < 3; i++) assert.ok(near(same.look[i], v0.look[i]))
  const r = applyLook(v0, 90, 0)
  const right = cross(v0.look, v0.up)
  for (let i = 0; i < 3; i++) assert.ok(near(r.look[i], right[i], 1e-9))
  const up = applyLook(v0, 0, 200) // clamped to 85
  assert.ok(Math.abs(Math.acos(dot(up.look, v0.up)) * (180 / Math.PI) - 5) < 1e-6)
  assert.ok(near(dot(up.look, up.up), 0))
})

test('zoom is logarithmic and clamped', () => {
  assert.equal(zoomFov(70, 1000), POV_FOV_MAX)
  assert.equal(zoomFov(70, 0.001), POV_FOV_MIN)
  assert.ok(near(zoomFov(zoomFov(60, 0.8), 1.25), 60))
  assert.ok(near(fovAt(0), POV_FOV_MAX) && near(fovAt(1), POV_FOV_MIN))
  assert.ok(near(fovAt(0.5), Math.sqrt(POV_FOV_MAX * POV_FOV_MIN)))
})

test('view transitions remember where you came from; entering needs a satellite', () => {
  let s = { view: 'sky' as const, from: 'sky' as const } as { view: 'globe' | 'sky' | 'pov'; from: 'globe' | 'sky' }
  assert.deepEqual(nextView(s, { type: 'show', view: 'pov', canPov: false }), s)
  s = nextView(s, { type: 'show', view: 'pov', canPov: true })
  assert.deepEqual(s, { view: 'pov', from: 'sky' })
  assert.deepEqual(nextView(s, { type: 'back' }), { view: 'sky', from: 'sky' })
  assert.deepEqual(nextView(s, { type: 'show', view: 'globe', canPov: true }), { view: 'globe', from: 'globe' })
})

test('from a station view: Satellite, then Back returns to the Globe it came from', () => {
  // Stations list ISS (globe camera mode): the satellite view is available.
  let s = { view: 'globe' as const, from: 'globe' as const } as { view: 'globe' | 'sky' | 'pov'; from: 'globe' | 'sky' }
  s = nextView(s, { type: 'show', view: 'pov', canPov: true })
  assert.deepEqual(s, { view: 'pov', from: 'globe' })
  s = nextView(s, { type: 'back' })
  assert.deepEqual(s, { view: 'globe', from: 'globe' })
  // "Back to full view" clears the station: nothing to ride, so Satellite does nothing.
  assert.deepEqual(nextView(s, { type: 'show', view: 'pov', canPov: false }), s)
})

test('the Earth from GEO is about 17.4 degrees across', () => {
  assert.ok(Math.abs(angularDiameterDeg(6378.137, 42164.17) - 17.4) < 0.1)
})
