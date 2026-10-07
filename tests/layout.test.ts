import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EARTH_RADIUS_KM } from '../src/globe/frames.ts'
import {
  geoBeltAzimuth,
  geoBeltElevation,
  phoneSideDock,
  ringLabelElevation,
} from '../src/globe/layout.ts'
import { lookAngles, observerFrame } from '../src/globe/sky.ts'

// A phone stage: 540 px tall, legend ending at 190 px, a 100 px side column
// (so docked at the bottom it covers 428-528 px; under the legend, 198-298 px).
const base = { stageHeight: 540, sideHeight: 100, legendBottom: 190, current: null }

test('stays at the bottom when the ring is clear of it, or not on screen', () => {
  assert.equal(phoneSideDock({ ...base, ringY: 300 }), null)
  assert.equal(phoneSideDock({ ...base, ringY: null }), null)
  assert.equal(phoneSideDock({ ...base, ringY: null, current: 198 }), null)
})

test('moves under the legend when the ring would be covered at the bottom', () => {
  assert.equal(phoneSideDock({ ...base, ringY: 410 }), 198)
  assert.equal(phoneSideDock({ ...base, ringY: 500 }), 198)
})

test('returns to the bottom only once the ring is clearly above it', () => {
  // At 395 a bottom-docked column stays put, and so does a top-docked one...
  assert.equal(phoneSideDock({ ...base, ringY: 395 }), null)
  assert.equal(phoneSideDock({ ...base, ringY: 395, current: 198 }), 198)
  // ...which returns once the ring is well clear of the bottom.
  assert.equal(phoneSideDock({ ...base, ringY: 380, current: 198 }), null)
})

test('stays at the bottom when moving up would not uncover the ring', () => {
  // A tall (expanded) column covers the ring in either place.
  assert.equal(phoneSideDock({ ...base, sideHeight: 330, ringY: 400 }), null)
})

// Elevation labels and the geostationary belt.

test('the belt elevation matches the Sky geometry for a satellite on the meridian', () => {
  // A geostationary point on the equator at the observer's own longitude,
  // through the same observer frame the Sky view uses (WGS84; the formula is
  // spherical, hence the small tolerance).
  const geo: [number, number, number] = [42164.17 / EARTH_RADIUS_KM, 0, 0]
  for (const lat of [0.5, 10, 25, 40, 51.48, 60, -41.29, -25]) {
    const look = lookAngles(observerFrame(lat, 0, 0), geo)
    const belt = geoBeltElevation(lat)
    assert.ok(belt !== null)
    assert.ok(Math.abs(look.elDeg - belt) < 0.25, `lat ${lat}: ${look.elDeg} vs ${belt}`)
    assert.ok(Math.abs(look.azDeg - geoBeltAzimuth(lat)) < 1e-6, `lat ${lat}: az ${look.azDeg}`)
  }
})

test('the belt crosses each labelled ring at a known latitude, and sets near the poles', () => {
  assert.equal(geoBeltElevation(0), 90)
  assert.ok(Math.abs(geoBeltElevation(25)! - 60) < 1) // the 60° label, e.g. Miami
  assert.ok(Math.abs(geoBeltElevation(51.48)! - 31.1) < 0.1) // the 30° label, Greenwich
  assert.equal(geoBeltElevation(-51.48), geoBeltElevation(51.48))
  assert.equal(geoBeltElevation(82), null)
  assert.equal(geoBeltAzimuth(51.48), 180)
  assert.equal(geoBeltAzimuth(-41.29), 0)
})

test('a ring label stays put unless the belt is within the clearance', () => {
  assert.equal(ringLabelElevation(30, null, 1.8), 30)
  assert.equal(ringLabelElevation(60, 31.1, 1.8), 60)
  assert.equal(ringLabelElevation(30, 32, 1.8), 30) // 2 degrees away, beyond the 1.8 clearance
})

test('a crowded ring label moves to the far side of its ring', () => {
  // Greenwich: the belt runs just above the 30° ring, so the label goes below.
  assert.ok(Math.abs(ringLabelElevation(30, 31.1, 1.8) - 29.3) < 1e-9)
  // Belt just below the ring: the label goes above.
  assert.ok(Math.abs(ringLabelElevation(60, 59.5, 1.8) - 61.3) < 1e-9)
  // Belt exactly on the ring: below.
  assert.equal(ringLabelElevation(30, 30, 2), 28)
  // Always at least the clearance from the belt.
  for (const belt of [28.5, 29.2, 30, 30.7, 31.4]) {
    assert.ok(Math.abs(ringLabelElevation(30, belt, 1.8) - belt) >= 1.8 - 1e-9, `belt ${belt}`)
  }
})
