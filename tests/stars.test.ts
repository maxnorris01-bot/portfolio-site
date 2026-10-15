import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { writeInertial } from '../src/globe/frames.ts'
import {
  NO_ROTATION,
  SPACE_FOV_MIN,
  j2000ToScene,
  limitingMagnitude,
  raDecToJ2000,
  readStarCatalog,
  starAppearance,
  starColor,
  type Mat3,
} from '../src/globe/stars.ts'

const file = readFileSync(new URL('../public/data/stars/hipparcos.bin', import.meta.url))
const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength)
const deg = (rad: number) => (rad * 180) / Math.PI

test('the Hipparcos file reads back: 118,217 stars, brightest first, Sirius and Polaris where they belong', () => {
  const cat = readStarCatalog(buffer)
  assert.equal(cat.count, 118217)
  assert.ok(Math.abs(cat.epoch - 2026) < 1e-6)
  for (let i = 1; i < cat.count; i += 997) assert.ok(cat.mag[i] >= cat.mag[i - 1])
  // Sirius: V -1.44, RA 101.29, Dec -16.72 (J2000, moved a few arcseconds by proper motion).
  assert.ok(Math.abs(cat.mag[0] + 1.44) < 0.04)
  const [x, y, z] = [cat.dirJ2000[0], cat.dirJ2000[1], cat.dirJ2000[2]]
  assert.ok(Math.abs(((deg(Math.atan2(y, x)) + 360) % 360) - 101.29) < 0.01)
  assert.ok(Math.abs(deg(Math.asin(z)) + 16.72) < 0.01)
  // Polaris (V 1.97) is within a degree of the north celestial pole.
  let polaris = -1
  for (let i = 0; i < 60; i++) if (cat.dirJ2000[i * 3 + 2] > Math.cos((1 * Math.PI) / 180)) polaris = i
  assert.ok(polaris >= 0 && Math.abs(cat.mag[polaris] - 1.97) < 0.1)
  // Unit vectors throughout.
  for (let i = 0; i < cat.count; i += 4999) {
    assert.ok(Math.abs(Math.hypot(cat.dirJ2000[i * 3], cat.dirJ2000[i * 3 + 1], cat.dirJ2000[i * 3 + 2]) - 1) < 1e-6)
  }
})

test('phones cut the catalogue at a magnitude without scanning past it', () => {
  const phone = readStarCatalog(buffer, 8)
  // Magnitudes are stored in 1/16 steps, so the cut lands within that of 8.0 (41,411 exactly).
  assert.ok(phone.count > 41000 && phone.count < 43000, `${phone.count}`)
  assert.ok(phone.mag[phone.count - 1] <= 8)
  assert.throws(() => readStarCatalog(new ArrayBuffer(64)))
})

test('the star frame: J2000 directions rotated to the date and mapped to scene axes like the satellites', () => {
  // With no precession, a direction lands where writeInertial puts the same inertial vector.
  const d = raDecToJ2000(37.95, 89.26) // Polaris
  const scene = j2000ToScene(d, NO_ROTATION)
  const out = new Float32Array(3)
  writeInertial(out, 0, d[0] * 6378.135, d[1] * 6378.135, d[2] * 6378.135)
  assert.ok(scene.every((v, i) => Math.abs(v - out[i]) < 1e-6))
  // The north celestial pole is scene +y, RA 0 on the equator is scene +x, RA 90 is scene -z.
  assert.deepEqual(j2000ToScene([0, 0, 1], NO_ROTATION).map((v) => Math.round(v * 1e9) / 1e9 + 0), [0, 1, 0])
  assert.deepEqual(j2000ToScene([1, 0, 0], NO_ROTATION).map((v) => Math.round(v * 1e9) / 1e9 + 0), [1, 0, 0])
  assert.deepEqual(j2000ToScene([0, 1, 0], NO_ROTATION).map((v) => Math.round(v * 1e9) / 1e9 + 0), [0, 0, -1])
  // A rotation (here 0.36 degrees about the pole, roughly 26 years of precession in RA) is applied first.
  const a = (0.36 * Math.PI) / 180
  const rot: Mat3 = [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1]
  const turned = j2000ToScene([1, 0, 0], rot)
  assert.ok(Math.abs(deg(Math.atan2(-turned[2], turned[0])) - 0.36) < 1e-9)
})

test('star colours follow B-V: hot stars blue-white, cool stars orange-red', () => {
  const hot = starColor(-0.2)
  const sun = starColor(0.65)
  const cool = starColor(1.6)
  assert.ok(hot[2] >= hot[0]) // blue at least as strong as red
  assert.ok(sun[0] === 1 && sun[1] > 0.8 && sun[2] > 0.6) // near white, slightly warm
  assert.ok(cool[0] === 1 && cool[1] < 0.8 && cool[2] < 0.65) // pale orange
  assert.ok(cool[2] < sun[2] && sun[2] < hot[2]) // warmer as B-V grows
  for (const c of [hot, sun, cool]) assert.ok(Math.max(...c) === 1 && Math.min(...c) >= 0)
})

test('zooming in shows fainter stars, larger and brighter, and softens them at very narrow fields', () => {
  assert.ok(Math.abs(limitingMagnitude(60) - 6.5) < 1e-9) // about the naked eye
  assert.ok(limitingMagnitude(6) > limitingMagnitude(60))
  assert.equal(limitingMagnitude(0.05), 12) // the catalogue's limit
  // A magnitude 8 star is invisible wide, appears when zoomed.
  assert.equal(starAppearance(8, 70).alpha, 0)
  assert.ok(starAppearance(8, 5).alpha > 0)
  // Brighter means bigger and brighter at any field of view.
  const a = starAppearance(1, 30)
  const b = starAppearance(4, 30)
  assert.ok(a.sizePx > b.sizePx && a.alpha >= b.alpha)
  // The same star grows a little as you zoom...
  assert.ok(starAppearance(4, 2).sizePx > starAppearance(4, 30).sizePx)
  // ...but under 0.2 degrees it dims and stops growing into a blob.
  assert.ok(starAppearance(4, 0.05).alpha < starAppearance(4, 0.3).alpha)
  assert.ok(starAppearance(-1.4, 0.05).sizePx <= 9)
  assert.equal(SPACE_FOV_MIN, 0.01)
  // At the new floor the points are soft but never blobs, and the sky is sparse:
  // a star of magnitude 12 is shown, a 14.5 isn't (the catalogue ends near 14).
  const faint = starAppearance(12, SPACE_FOV_MIN, 14.08)
  assert.ok(faint.alpha > 0 && faint.sizePx <= 9)
  assert.equal(starAppearance(14.5, SPACE_FOV_MIN, 14.08).alpha, 0)
  assert.ok(starAppearance(-1.4, SPACE_FOV_MIN).alpha < starAppearance(-1.4, 0.2).alpha)
  // The riding zoom is logarithmic over the new range: each step is the same ratio.
  const steps = Math.log(120 / SPACE_FOV_MIN) / Math.log(1.25)
  assert.ok(steps > 40 && steps < 45, `${steps} keyboard steps from 120 to 0.01 degrees`)
})
