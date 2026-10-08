import assert from 'node:assert/strict'
import { test } from 'node:test'
import { propagate, twoline2satrec, type SatRec } from 'satellite.js'
import { EARTH_RADIUS_KM } from '../src/globe/frames.ts'
import {
  MAX_ORBITS,
  ORBIT_SAMPLES,
  orbitNeedsRefresh,
  orbitPeriodMs,
  orbitTargets,
  sampleOrbit,
} from '../src/globe/orbit.ts'

// Real elements from the 2026-10-06 catalog: low Earth orbit, geostationary,
// and a highly eccentric (e = 0.66) orbit.
const TLES = {
  iss: [
    '1 25544U 98067A   26279.01444283  .00005131  00000-0  10208-3 0  9996',
    '2 25544  51.6314 111.6262 0006859 227.8987 132.1419 15.48747543588934',
  ],
  geo: [
    '1 64723U 25143A   26279.24337438 -.00000023  00000-0  00000+0 0  9992',
    '2 64723   0.6120 345.3468 0004185 257.6015 219.4469  1.00275089  4539',
  ],
  polar: [
    '1 23802U 96013A   26277.41195768  .00000078  00000-0  00000+0 0  9993',
    '2 23802  80.0055 225.7354 6583205 205.3374  97.5023  1.29845628146277',
  ],
} as const
const recs = Object.fromEntries(
  Object.entries(TLES).map(([k, [l1, l2]]) => [k, twoline2satrec(l1, l2)]),
) as Record<keyof typeof TLES, SatRec>
const T0 = Date.parse('2026-10-06T12:00:00Z')
const MIN = 60_000

// Revolutions per day, as printed in the TLE's line 2.
const revsPerDay = (key: keyof typeof TLES) => Number(TLES[key][1].slice(52, 63))

const eci = (rec: SatRec, ms: number) => {
  const p = propagate(rec, new Date(ms))!.position as { x: number; y: number; z: number }
  return [p.x, p.y, p.z]
}

test('the period comes from the mean motion and matches the TLE', () => {
  assert.ok(Math.abs(orbitPeriodMs(recs.iss)! / MIN - 93) < 0.5)
  assert.ok(Math.abs(orbitPeriodMs(recs.geo)! / MIN - 1436.1) < 0.5)
  for (const key of Object.keys(TLES) as (keyof typeof TLES)[]) {
    const fromTle = (1440 / revsPerDay(key)) * MIN
    // SGP4's mean motion is the TLE's, recovered from Kozai to Brouwer form:
    // within 0.2%.
    assert.ok(Math.abs(orbitPeriodMs(recs[key])! / fromTle - 1) < 0.002, key)
  }
})

test('no period, and no loop, without a positive mean motion', () => {
  for (const no of [0, -1, Number.NaN]) {
    assert.equal(orbitPeriodMs({ no }), null)
    assert.equal(sampleOrbit({ ...recs.iss, no } as SatRec, T0), null)
  }
})

test('one period nearly closes the loop', () => {
  // SGP4's perturbations (mainly J2) keep the ends from meeting exactly; for
  // these orbits the gap is 15-34 km, under 0.5% of the orbit's radius.
  for (const rec of Object.values(recs)) {
    const period = orbitPeriodMs(rec)!
    const a = eci(rec, T0 - period / 2)
    const b = eci(rec, T0 + period / 2)
    const gap = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
    assert.ok(gap / Math.hypot(...a) < 0.005, `gap ${gap} km`)
  }
})

test('the sampled loop is seamless and passes through the object at the centre time', () => {
  for (const [key, rec] of Object.entries(recs)) {
    const s = sampleOrbit(rec, T0)!
    assert.equal(s.length, ORBIT_SAMPLES * 3, key)
    const n = s.length / 3
    const dist = (i: number, j: number) =>
      Math.hypot(s[i * 3] - s[j * 3], s[i * 3 + 1] - s[j * 3 + 1], s[i * 3 + 2] - s[j * 3 + 2])
    let maxStep = 0
    for (let i = 0; i + 1 < n; i++) maxStep = Math.max(maxStep, dist(i, i + 1))
    // Drawn as a closed loop, the chord from the last sample back to the first
    // is no longer than an ordinary step (it sits on the far side).
    assert.ok(dist(n - 1, 0) <= maxStep * 1.01, `${key}: closing chord`)
    // Sample n/2 is the centre time itself, in the scene's frame (inertial,
    // Earth radii, y-up: x, z, -y).
    const [x, y, z] = eci(rec, T0)
    const mid = n / 2
    const expected = [x / EARTH_RADIUS_KM, z / EARTH_RADIUS_KM, -y / EARTH_RADIUS_KM]
    for (let c = 0; c < 3; c++) assert.ok(Math.abs(s[mid * 3 + c] - expected[c]) < 1e-5, key)
  }
})

test('the loop is recomputed only once the time is more than half a period away', () => {
  const p = orbitPeriodMs(recs.iss)!
  assert.equal(orbitNeedsRefresh(T0, T0, p), false)
  assert.equal(orbitNeedsRefresh(T0, T0 + p * 0.49, p), false)
  assert.equal(orbitNeedsRefresh(T0, T0 - p * 0.49, p), false)
  assert.equal(orbitNeedsRefresh(T0, T0 + p * 0.51, p), true)
  assert.equal(orbitNeedsRefresh(T0, T0 - 6 * 3600e3, p), true) // a slider jump back
})

test('orbit targets follow the one selection: object, pair or station', () => {
  const none = { inspect: null, pair: null, group: null }
  assert.deepEqual(orbitTargets(none), [])
  // A click-picked (or list-picked) object: its own orbit, not its neighbour's.
  assert.deepEqual(orbitTargets({ ...none, inspect: 55 }), [55])
  // A near-miss pair from the conjunctions list: both objects.
  assert.deepEqual(orbitTargets({ ...none, pair: [9129, 11350] }), [9129, 11350])
  assert.deepEqual(orbitTargets({ ...none, pair: [7, 7] }), [7])
  // A station from the known-objects list: the station itself (its first
  // piece; the others are docked and share the orbit).
  assert.deepEqual(orbitTargets({ ...none, group: [55, 57, 71, 77, 4974] }), [55])
  assert.deepEqual(orbitTargets({ ...none, group: [] }), [])
  // Never more lines than the engine has slots.
  for (const sel of [{ ...none, pair: [1, 2] as [number, number] }, { ...none, group: [1, 2, 3] }]) {
    assert.ok(orbitTargets(sel).length <= MAX_ORBITS)
  }
})

test("a pair's two loops are sampled around the closest approach and pass through both objects", () => {
  // The replay jumps the clock to the closest approach; each loop is centred on
  // that moment, so each object sits on its own loop there.
  const tca = Date.parse('2026-10-07T03:12:45Z')
  for (const rec of [recs.iss, recs.polar]) {
    const s = sampleOrbit(rec, tca)!
    const mid = s.length / 6
    const [x, y, z] = eci(rec, tca)
    const expected = [x / EARTH_RADIUS_KM, z / EARTH_RADIUS_KM, -y / EARTH_RADIUS_KM]
    for (let c = 0; c < 3; c++) assert.ok(Math.abs(s[mid * 3 + c] - expected[c]) < 1e-5)
  }
})

test("each of a pair's loops refreshes on its own period", () => {
  // An hour after the closest approach, the ISS (93 min) has left its
  // half-period span and is resampled; a geostationary partner (24 h) hasn't.
  const tca = T0
  assert.equal(orbitNeedsRefresh(tca, tca + 3600e3, orbitPeriodMs(recs.iss)!), true)
  assert.equal(orbitNeedsRefresh(tca, tca + 3600e3, orbitPeriodMs(recs.geo)!), false)
})
