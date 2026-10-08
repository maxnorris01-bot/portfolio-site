import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as Astronomy from 'astronomy-engine'
import { DAY_NIGHT, dayNightWeights } from '../src/globe/daynight.ts'
import { subsolarPoint, sunDirectionEci, sunDirectionScene, sunElevationDeg } from '../src/globe/sun.ts'

// astronomy-engine is an independent ephemeris, a devDependency used only
// here as the reference; the site ships satellite.js's sunPos.
const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180
function referenceSubsolar(date: Date) {
  const eq = Astronomy.Equator(Astronomy.Body.Sun, date, new Astronomy.Observer(0, 0, 0), true, true)
  const gast = Astronomy.SiderealTime(date) // hours
  return { latDeg: eq.dec, lonDeg: wrap180((eq.ra - gast) * 15) }
}

test('the subsolar point matches an independent ephemeris to under 0.1 degrees', () => {
  for (let m = 0; m < 12; m++) {
    for (const hour of [3, 12, 21]) {
      const date = new Date(Date.UTC(2026, m, 1 + 2 * m, hour, 17))
      const ours = subsolarPoint(date)
      const ref = referenceSubsolar(date)
      assert.ok(Math.abs(ours.latDeg - ref.latDeg) < 0.1, `${date.toISOString()} lat ${ours.latDeg} vs ${ref.latDeg}`)
      assert.ok(Math.abs(wrap180(ours.lonDeg - ref.lonDeg)) < 0.1, `${date.toISOString()} lon ${ours.lonDeg} vs ${ref.lonDeg}`)
    }
  }
})

test('known values: equinox, solstice, and noon at Greenwich', () => {
  const seasons = Astronomy.Seasons(2026)
  assert.ok(Math.abs(subsolarPoint(seasons.mar_equinox.date).latDeg) < 0.05) // 2026-03-20
  assert.ok(Math.abs(subsolarPoint(seasons.jun_solstice.date).latDeg - 23.44) < 0.05) // 2026-06-21
  assert.ok(Math.abs(subsolarPoint(seasons.dec_solstice.date).latDeg + 23.44) < 0.05)
  // At 12:00 UTC the Sun is over Greenwich give or take the equation of time
  // (at most about 16 minutes, so about 4 degrees).
  for (let m = 0; m < 12; m++) {
    const lon = subsolarPoint(new Date(Date.UTC(2026, m, 15, 12))).lonDeg
    assert.ok(Math.abs(lon) < 4.5, `month ${m + 1}: ${lon}`)
  }
})

test('the direction is a unit vector in the scene frame the globe uses', () => {
  const date = new Date('2026-10-08T04:00:00Z')
  const [x, y, z] = sunDirectionEci(date)
  assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < 1e-12)
  assert.deepEqual(sunDirectionScene(date), [x, z, -y]) // as writeInertial maps inertial axes
})

test('a surface point goes from lit to dark as time passes (London, 8 October 2026)', () => {
  const london = (h: number) => sunElevationDeg(51.507, -0.128, new Date(Date.UTC(2026, 9, 8, h)))
  assert.ok(london(12) > 20) // around midday
  assert.ok(london(22) < -20) // night
  // Sunset (elevation 0) falls between 17:00 and 18:00 UTC; the shading
  // follows it through the twilight band.
  let prev = london(16)
  let crossing = null as number | null
  for (let m = 16 * 60; m <= 19 * 60; m += 5) {
    const e = sunElevationDeg(51.507, -0.128, new Date(Date.UTC(2026, 9, 8, 0, m)))
    if (prev > 0 && e <= 0) crossing = m
    prev = e
  }
  assert.ok(crossing !== null && crossing >= 17 * 60 && crossing <= 18 * 60, `crossing at ${crossing}`)
  const w = (deg: number) => dayNightWeights(Math.sin((deg * Math.PI) / 180))
  assert.deepEqual(w(30), { day: 1, lights: 0 }) // daylight: as before
  assert.ok(w(-3).day < 1 && w(-3).day > DAY_NIGHT.nightFloor) // inside the twilight band
  assert.equal(w(-30).day, DAY_NIGHT.nightFloor) // night
  assert.equal(w(-30).lights, 1)
  // Monotone through the band: no hard line, no reversal.
  let last = 2
  for (let d = 10; d >= -20; d -= 0.5) {
    const now = w(d).day
    assert.ok(now <= last + 1e-12)
    last = now
  }
})

test('switched off, every point gets the old uniform lighting', () => {
  for (const deg of [90, 10, 0, -6, -12, -45, -90]) {
    const s = Math.sin((deg * Math.PI) / 180)
    assert.deepEqual(dayNightWeights(s, { enabled: false }), { day: 1, lights: 0 })
  }
  // Without the lights texture (loading or failed), night is plain darkened day texture.
  assert.deepEqual(dayNightWeights(-1, { hasLights: false }), { day: DAY_NIGHT.nightFloor, lights: 0 })
})
