import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pickBody } from '../src/globe/spacebodies.ts'
import { STAR_PICK_PX, limitingMagnitude, pickStar } from '../src/globe/stars.ts'
import type { Vec3 } from '../src/globe/pov.ts'

const DEG = Math.PI / 180
// A direction `degFromRay` away from +z, toward +x, scaled like the sky sphere.
const at = (degFromRay: number, scale = 15): Vec3 => [Math.sin(degFromRay * DEG) * scale, 0, Math.cos(degFromRay * DEG) * scale]
const RAY: Vec3 = [0, 0, 1]
const flat = (dirs: Vec3[]) => new Float32Array(dirs.flat())

test('the nearest star inside the pick radius is selected; the radius is in screen px at this zoom', () => {
  // 576 px tall view, 60 degrees: 0.104 degrees per px. 12 px is 1.25 degrees.
  const dirs = flat([at(2), at(0.7), at(-1.0)])
  const mags = new Float32Array([4, 4, 4])
  assert.equal(pickStar(dirs, mags, 3, RAY, 60, 576, STAR_PICK_PX.mouse, 15), 1) // 6.7 px away
  // Only one star within 12 px of a ray 0.5 degrees from it.
  assert.equal(pickStar(dirs, mags, 3, RAY, 60, 576, 3, 15), -1) // 3 px radius: nothing that near
  // The same angular gap is more pixels when zoomed in: at 6 degrees a 0.7 degree gap is 67 px.
  assert.equal(pickStar(dirs, mags, 3, RAY, 6, 576, STAR_PICK_PX.mouse, 15), -1)
  // ...and a 20 px touch radius catches what a 12 px mouse radius doesn't (1.8 degrees = 17 px at 60 degrees).
  const wide = flat([at(1.8)])
  const one = new Float32Array([3])
  assert.equal(pickStar(wide, one, 1, RAY, 60, 576, STAR_PICK_PX.mouse, 15), -1)
  assert.equal(pickStar(wide, one, 1, RAY, 60, 576, STAR_PICK_PX.touch, 15), 0)
  assert.deepEqual(STAR_PICK_PX, { mouse: 12, touch: 20 })
})

test('among close stars the brighter one is preferred, within reason', () => {
  const dirs = flat([at(0.3), at(0.6)])
  // Equal brightness: the nearer wins.
  assert.equal(pickStar(dirs, new Float32Array([5, 5]), 2, RAY, 60, 576, 12, 15), 0)
  // The farther star is 3 px away more but 2 magnitudes brighter: it wins (1.5 px per magnitude).
  assert.equal(pickStar(dirs, new Float32Array([6, 3.5]), 2, RAY, 60, 576, 12, 15), 1)
  // A much brighter star well outside the radius never wins.
  const far = flat([at(0.3), at(5)])
  assert.equal(pickStar(far, new Float32Array([6, -1]), 2, RAY, 60, 576, 12, 15), 0)
})

test('only stars shown at this field of view can be picked', () => {
  const dirs = flat([at(0.2), at(0.5)])
  // A magnitude 9 star isn't drawn at 60 degrees (limit 6.5), so it can't be picked there...
  const mags = new Float32Array([9, 5])
  assert.ok(limitingMagnitude(60) < 9)
  assert.equal(pickStar(dirs, mags, 2, RAY, 60, 576, 12, 15), 1)
  // ...but is once zoomed in (at 5 degrees the limit is about 10).
  assert.ok(limitingMagnitude(5) > 9)
  assert.equal(pickStar(dirs, mags, 2, RAY, 5, 576, 40, 15), 0)
  assert.equal(pickStar(new Float32Array(0), new Float32Array(0), 0, RAY, 60, 576, 12, 15), -1)
})

test('a Sun, Moon or planet disc wins over a star under the same tap', () => {
  // The body rule runs first (engine tap handler); a star there isn't consulted.
  const bodies = [{ key: 'venus', x: 100, y: 100, r: 10 }]
  assert.equal(pickBody(104, 100, bodies, 12), 'venus')
  // A tap just outside every body's tolerance falls through to stars.
  assert.equal(pickBody(140, 100, bodies, 12), null)
  const dirs = flat([at(0.1)])
  assert.equal(pickStar(dirs, new Float32Array([2]), 1, RAY, 60, 576, 12, 15), 0)
})
