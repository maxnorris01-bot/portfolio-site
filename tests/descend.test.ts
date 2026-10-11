import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DESCEND_FOV,
  TRANSITION_MS,
  detachFrom,
  easeAltitude,
  groundTrackHeading,
  northOnScreenDeg,
  northUpFor,
  oriented,
  screenUpHeading,
  tangentFrame,
  easeInOut,
  groundAt,
  keepUnder,
  latLonToUnit,
  lerpPose,
  MAX_SOURCE_PX_PER_CSS_PX,
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

test('the closest zoom stops where one source pixel covers one CSS pixel', () => {
  assert.equal(MAX_SOURCE_PX_PER_CSS_PX, 1)
  // EOX level 13 (~9.55 m per pixel) on a 576 px tall desktop view at 30 degrees: ~10.3 km.
  const desktop = minAltitudeKm(0.00955, DESCEND_FOV, 576)
  assert.ok(desktop > 10 && desktop < 10.6, `${desktop}`)
  // At that height one source pixel spans exactly one CSS pixel at the centre.
  const kmPerCssPx = (2 * desktop * Math.tan((DESCEND_FOV * Math.PI) / 360)) / 576
  assert.ok(Math.abs(kmPerCssPx - 0.00955) < 1e-12)
  // A taller view (a larger window) stops higher; phones (level 12, ~19 m) twice as high again.
  assert.ok(Math.abs(minAltitudeKm(0.00955, DESCEND_FOV, 700) / desktop - 700 / 576) < 1e-9)
  assert.ok(Math.abs(minAltitudeKm(0.0191, DESCEND_FOV, 576) / desktop - 2) < 1e-9)
  // The old rule (2 screen pixels per source pixel) stopped at half the height.
  assert.ok(Math.abs(minAltitudeKm(0.00955, DESCEND_FOV, 576, 2) / desktop - 0.5) < 1e-9)
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

const angleDeg = (a: Vec3, b: Vec3) => (Math.acos(Math.max(-1, Math.min(1, dot(a, b) / Math.hypot(...a) / Math.hypot(...b)))) * 180) / Math.PI

test('heading up: the held view\'s heading is the ground direction up on screen, round trip at any heading', () => {
  for (const h of [0, 37, 90, 180, 271.5]) {
    const p = surfacePose({ ...SF, altKm: 30, headingDeg: h })
    const got = screenUpHeading(p, 30, ASPECT)!
    assert.ok(Math.abs(((got - h + 540) % 360) - 180) < 1e-6, `${h} -> ${got}`)
    // Up on screen is that ground direction: 90 is east.
    const f = tangentFrame(SF.latDeg, SF.lonDeg)
    if (h === 90) assert.ok(angleDeg(p.up, f.east) < 1e-4)
  }
})

// A satellite at 420 km over (lat, lon), moving along `headingDeg`, in Earth-fixed axes.
const riding = (lat: number, lon: number, headingDeg: number) => {
  const f = tangentFrame(lat, lon)
  const r = 1 + 420 / R
  const h = (headingDeg * Math.PI) / 180
  const vel: Vec3 = [0, 1, 2].map((i) => f.north[i] * Math.cos(h) + f.east[i] * Math.sin(h)) as Vec3
  return { pos: [f.n[0] * r, f.n[1] * r, f.n[2] * r] as Vec3, vel }
}

test('detaching from the Down view keeps the satellite\'s heading: no swing', () => {
  const { pos, vel } = riding(37.5, -123, 312) // a descending pass heading north-west
  assert.ok(Math.abs(groundTrackHeading(pos, vel) - 312) < 1e-6)
  const view = applyLook(presetView('down', pos, vel), 0, 0)
  const s = detachFrom({ pos, ...view }, 30, ASPECT)!
  assert.ok(Math.abs(s.headingDeg! - 312) < 0.01, `${s.headingDeg}`)
  // The held view's screen-up matches the riding view's (it only moves closer).
  assert.ok(angleDeg(surfacePose(s).up, view.up) < 0.5)
  // Looking sideways first (yaw 25), the on-screen up direction carries over too.
  const side = applyLook(presetView('down', pos, vel), 25, -10)
  const s2 = detachFrom({ pos, ...side }, 30, ASPECT)!
  assert.ok(Math.abs(((s2.headingDeg! - screenUpHeading({ pos, ...side }, 30, ASPECT)! + 540) % 360) - 180) < 1e-9)
})

test('detaching from the Forward view keeps travel up on screen', () => {
  const { pos, vel } = riding(10, 40, 50)
  const fwd = applyLook(presetView('forward', pos, vel), 0, -30) // looking ahead and down at the ground
  const s = detachFrom({ pos, ...fwd }, 30, ASPECT)!
  // The ground ahead of the satellite is up on screen, as it was looking forward.
  const ahead = groundTrackHeading(pos, vel)
  assert.ok(Math.abs(((s.headingDeg! - ahead + 540) % 360) - 180) < 3, `${s.headingDeg} vs ${ahead}`)
})

test('switching between heading up and north up only turns the view about the vertical', () => {
  const held = { ...SF, altKm: 12, headingDeg: 312 }
  const north = surfacePose(oriented(held, 'north'))
  const heading = surfacePose(oriented(held, 'heading'))
  assert.ok(Math.hypot(...north.pos.map((v, i) => v - heading.pos[i])) < 1e-12) // same place
  assert.ok(angleDeg(north.look, heading.look) < 1e-9) // same straight-down look
  assert.ok(Math.abs(angleDeg(north.up, heading.up) - 48) < 1e-6) // turned by 360 - 312
  assert.ok(angleDeg(north.up, tangentFrame(SF.latDeg, SF.lonDeg).north) < 1e-9)
  // Heading up returns to the captured heading.
  assert.equal(oriented(oriented(held, 'heading'), 'heading').headingDeg, 312)
})

test('riding the satellite, north up rolls the down view so north is at the top', () => {
  const { pos, vel } = riding(-20, 100, 120)
  const view = applyLook(presetView('down', pos, vel), 0, 0)
  const up = northUpFor({ pos, ...view }, 70, ASPECT)!
  assert.ok(Math.abs(dot(up, view.look)) < 1e-12)
  assert.ok(Math.abs(northOnScreenDeg({ pos, look: view.look, up }, 70, ASPECT)!) < 1e-3)
  // Heading up (the down preset), north is off to the side by the track heading.
  assert.ok(Math.abs(Math.abs(northOnScreenDeg({ pos, ...view }, 70, ASPECT)!) - 120) < 0.5)
})

test('the compass: north\'s direction on screen for any heading', () => {
  for (const h of [0, 45, 90, 200]) {
    const deg = northOnScreenDeg(surfacePose({ ...SF, altKm: 20, headingDeg: h }), 30, ASPECT)!
    // Heading h up means north is h degrees anticlockwise, i.e. -h clockwise.
    assert.ok(Math.abs(((deg + h + 540) % 360) - 180) < 1e-3, `${h}: ${deg}`)
  }
  // Sky at the centre: no reading.
  assert.equal(northOnScreenDeg({ pos: [1.07, 0, 0], look: [1, 0, 0], up: [0, 1, 0] }, 30, ASPECT), null)
})

test('near the poles north stays defined: the view holds 0.5 degrees off and north points to the pole', () => {
  for (const lat of [89.4, 89.9, 90, -90]) {
    const p = surfacePose({ latDeg: lat, lonDeg: 30, altKm: 20, headingDeg: 0 })
    assert.ok(p.up.every(Number.isFinite) && Math.abs(Math.hypot(...p.up) - 1) < 1e-12)
    assert.ok(Math.abs(dot(p.up, p.look)) < 1e-12)
    // Held at most 89.5 from the equator.
    assert.ok(Math.abs(unitToLatLon(p.pos).latDeg) <= 89.5 + 1e-9)
    // North (up, at heading 0) leads toward the nearer pole: +y in the north, -y in the south.
    assert.ok(lat > 0 ? p.up[1] > 0 : p.up[1] > -1)
  }
  // The heading round trip still works next to the pole.
  const near = surfacePose({ latDeg: 89.5, lonDeg: -60, altKm: 15, headingDeg: 133 })
  assert.ok(Math.abs(screenUpHeading(near, 30, ASPECT)! - 133) < 0.05)
})
