import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DESCEND_FOV,
  TRANSITION_MS,
  detachFrom,
  easeAltitude,
  easeInOut,
  groundAt,
  keepUnder,
  latLonToUnit,
  lerpPose,
  minAltitudeKm,
  panSurface,
  rayThrough,
  surfacePose,
  transitionMs,
  unitToLatLon,
  zoomLockedToward,
  zoomSurfaceToward,
  type Pose,
} from '../src/globe/descend.ts'
import { applyLook, presetView, type Vec3 } from '../src/globe/pov.ts'

const R = 6378.137
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const km = (a: Vec3, b: Vec3) => dist(a, b) * R
const SF = { latDeg: 37.77, lonDeg: -122.42 }
const ASPECT = 16 / 9

test('the surface camera sits above its ground point, looking straight down, north up', () => {
  const p = surfacePose({ ...SF, altKm: 50 })
  const n = latLonToUnit(SF.latDeg, SF.lonDeg)
  assert.ok(Math.abs(Math.hypot(...p.pos) - (1 + 50 / R)) < 1e-12)
  assert.ok(dist(p.look, [-n[0], -n[1], -n[2]]) < 1e-12)
  assert.ok(Math.abs(dot(p.up, p.look)) < 1e-12)
  assert.ok(p.up[1] > 0) // north has a +y (north pole) component
  // The centre of the screen is the ground point itself.
  assert.ok(km(groundAt(p, 30, ASPECT, 0, 0)!, n) < 1e-6)
  // Up on screen is north: a point near the top edge is at a higher latitude.
  const top = unitToLatLon(groundAt(p, 30, ASPECT, 0, 0.9)!)
  assert.ok(top.latDeg > SF.latDeg && Math.abs(top.lonDeg - SF.lonDeg) < 1e-6)
})

test('zooming toward a point keeps that ground point under the pointer, step after step', () => {
  let s = { ...SF, altKm: 400 }
  const pointer: [number, number] = [0.62, -0.35] // off-centre, lower right
  const target = groundAt(surfacePose(s), 30, ASPECT, ...pointer)!
  const limits = { minKm: 5, maxKm: 1000 }
  for (let i = 0; i < 8; i++) {
    s = zoomSurfaceToward(s, 0.6, ...pointer, 30, ASPECT, limits)
    const under = groundAt(surfacePose(s), 30, ASPECT, ...pointer)!
    assert.ok(km(under, target) < 0.002, `step ${i}: ${(km(under, target) * 1000).toFixed(2)} m off`)
  }
  assert.ok(s.altKm < 50) // it really descended
  // Zooming back out also keeps the point under the pointer.
  const out = zoomSurfaceToward(s, 2, ...pointer, 30, ASPECT, limits)
  assert.ok(km(groundAt(surfacePose(out), 30, ASPECT, ...pointer)!, target) < 0.002)
})

test('detaching keeps the pointer\'s ground point under it through the turn to north-up', () => {
  // A wide, oblique hand-over: the target far from the new centre.
  const s = { latDeg: 37.97, lonDeg: -121.6, altKm: 350 }
  const target = latLonToUnit(37.8, -122.4)
  const held = keepUnder(s, target, 30, ASPECT, -0.4, -0.2)
  assert.ok(km(groundAt(surfacePose(held), 30, ASPECT, -0.4, -0.2)!, target) < 0.01)
})

test('dragging pans the ground with the pointer and keeps north up', () => {
  const s = { ...SF, altKm: 20 }
  const grabbed = groundAt(surfacePose(s), 30, ASPECT, 0.1, 0.2)!
  const moved = panSurface(s, [0.1, 0.2], [-0.4, -0.1], 30, ASPECT)
  assert.ok(km(groundAt(surfacePose(moved), 30, ASPECT, -0.4, -0.1)!, grabbed) < 0.001)
  assert.equal(moved.altKm, 20)
  assert.ok(surfacePose(moved).up[1] > 0)
})

test('the imagery limit eases: steps slow near it, it is never passed, zooming out is free', () => {
  const lim = { min: 5, max: 1000 }
  // Far from the limit, a zoom step is exact.
  assert.ok(Math.abs(easeAltitude(400, 0.5, lim.min, lim.max) - 200) < 1e-9)
  // Within 2.5x of it, the same step does less, and less again closer in.
  const near = easeAltitude(10, 0.5, lim.min, lim.max)
  const nearer = easeAltitude(6, 0.5, lim.min, lim.max)
  assert.ok(near > 5 && near > 10 * 0.5 && near < 10)
  assert.ok(nearer / 6 > near / 10) // a smaller fraction of the remaining way
  // Repeated zooming creeps up to the limit and stops there.
  let a = 50
  for (let i = 0; i < 200; i++) a = easeAltitude(a, 0.5, lim.min, lim.max)
  assert.ok(a >= 5 && a < 5.05, `${a}`)
  // Zooming out from the limit isn't slowed; it caps at the maximum.
  assert.ok(Math.abs(easeAltitude(5, 2, lim.min, lim.max) - 10) < 1e-9)
  assert.equal(easeAltitude(800, 4, lim.min, lim.max), 1000)
})

test('the lowest altitude follows the finest imagery level, field of view and screen', () => {
  const desktop = minAltitudeKm(0.00955, DESCEND_FOV, 576) // EOX level 13
  const phone = minAltitudeKm(0.0191, DESCEND_FOV, 576) // EOX level 12
  assert.ok(desktop > 4.5 && desktop < 5.5, `${desktop}`)
  assert.ok(Math.abs(phone / desktop - 2) < 1e-9)
})

test('detaching takes over at the centre ground point at the same distance; sky gives none', () => {
  const r = 1 + 420 / R
  const pos: Vec3 = [r, 0, 0] // above 0 N, 0 E
  const down: Pose = { pos, look: [-1, 0, 0], up: [0, 1, 0] }
  const s = detachFrom(down, 30, ASPECT)!
  assert.ok(Math.abs(s.latDeg) < 1e-9 && Math.abs(s.lonDeg) < 1e-9)
  assert.ok(Math.abs(s.altKm - 420) < 1e-6)
  // Looking out to space: nothing to hold over.
  assert.equal(detachFrom({ pos, look: [1, 0, 0], up: [0, 1, 0] }, 30, ASPECT), null)
})

test('locked zoom toward a point keeps the direction under the pointer, within the field-of-view range', () => {
  const pos: Vec3 = [1.07, 0.1, 0.2]
  const vel: Vec3 = [0, 0.3, -0.9]
  const base = presetView('down', pos, vel)
  let look = { yaw: 10, pitch: -5, fov: 70 }
  const pointer: [number, number] = [-0.5, 0.4]
  const dirAt = (l: typeof look) => rayThrough({ pos, ...applyLook(base, l.yaw, l.pitch) }, l.fov, ASPECT, ...pointer)
  const target = dirAt(look)
  for (let i = 0; i < 4; i++) {
    look = zoomLockedToward(base, look, 0.8, ...pointer, ASPECT, DESCEND_FOV)
    assert.ok(Math.acos(Math.min(1, dot(dirAt(look), target))) < 2e-4, `step ${i}`)
  }
  assert.ok(look.fov < 70 && look.fov >= DESCEND_FOV)
  assert.equal(zoomLockedToward(base, { yaw: 0, pitch: 0, fov: 31 }, 0.5, 0, 0, ASPECT, DESCEND_FOV).fov, DESCEND_FOV)
  assert.equal(zoomLockedToward(base, { yaw: 0, pitch: 0, fov: 110 }, 2, 0, 0, ASPECT, DESCEND_FOV).fov, 120)
})

test('transitions ease in and out over about half a second, instantly with reduced motion', () => {
  assert.equal(easeInOut(0), 0)
  assert.equal(easeInOut(1), 1)
  assert.equal(easeInOut(0.5), 0.5)
  assert.ok(easeInOut(0.1) < 0.1 && easeInOut(0.9) > 0.9) // slow at both ends
  for (let t = 0; t < 1; t += 0.05) assert.ok(easeInOut(t + 0.05) >= easeInOut(t))
  assert.ok(TRANSITION_MS >= 400 && TRANSITION_MS <= 600)
  assert.equal(transitionMs(false), TRANSITION_MS)
  assert.equal(transitionMs(true), 0)
})

test('a transition pose is smooth: endpoints exact, up perpendicular to look, height geometric', () => {
  const a = surfacePose({ ...SF, altKm: 400 })
  const b = surfacePose({ latDeg: 38.5, lonDeg: -121, altKm: 4 })
  const s0 = lerpPose(a, b, 0)
  const s1 = lerpPose(a, b, 1)
  assert.ok(dist(s0.pos, a.pos) < 1e-12 && dist(s1.pos, b.pos) < 1e-12)
  const mid = lerpPose(a, b, 0.5)
  assert.ok(Math.abs(dot(mid.look, mid.up)) < 1e-12)
  assert.ok(Math.abs((Math.hypot(...mid.pos) - 1) * R - 40) < 1e-6) // sqrt(400 * 4)
})
