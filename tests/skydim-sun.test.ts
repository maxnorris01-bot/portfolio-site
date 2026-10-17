import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gstime } from 'satellite.js'
import { SKY_DIM_DEFAULT, earthAngularRadius, stepSkyDim, sunlitWeight } from '../src/globe/skydim.ts'
import { sunDirectionScene, sunElevationDeg, subsolarPoint } from '../src/globe/sun.ts'
import type { Vec3 } from '../src/globe/pov.ts'

// "Sunlit" must mean the Sun is up at the point below the satellite, and "night" that it is dark there: checked with the
// real Sun (sun.ts, independent of skydim.ts) and a satellite put at a known latitude, longitude and height, in the
// same inertial scene frame the engine uses (frames.ts: Earth-fixed to inertial by GMST, then (x, z, -y)).
const DEG = Math.PI / 180

/** A satellite above (lat, lon) at `altKm`, in scene axes and Earth radii. */
function satAt(latDeg: number, lonDeg: number, altKm: number, date: Date): Vec3 {
  const r = 1 + altKm / 6378.135
  const lon = lonDeg * DEG + gstime(date)
  const x = r * Math.cos(latDeg * DEG) * Math.cos(lon)
  const y = r * Math.cos(latDeg * DEG) * Math.sin(lon)
  const z = r * Math.sin(latDeg * DEG)
  return [x, z, -y]
}

/** One frame looking straight down from there at FOV 120 with the shipped defaults (so the Earth fills the view). */
function lookDown(latDeg: number, lonDeg: number, altKm: number, date: Date) {
  const pos = satAt(latDeg, lonDeg, altKm, date)
  const r = Math.hypot(...pos)
  const axis: Vec3 = [-pos[0] / r, -pos[1] / r, -pos[2] / r]
  return stepSkyDim(null, pos, axis, sunDirectionScene(date), 120, 0, false, SKY_DIM_DEFAULT)
}

const DATES = [new Date('2026-10-17T06:52:57Z'), new Date('2026-03-20T12:00:00Z'), new Date('2026-06-21T18:30:00Z'), new Date('2026-12-21T03:15:00Z')]

test('a satellite over the subsolar point (Sun overhead) is sunlit: weight 1, and over its antipode it is night: weight 0', () => {
  for (const d of DATES) {
    const sub = subsolarPoint(d)
    const day = lookDown(sub.latDeg, sub.lonDeg, 1200, d)
    assert.equal(day.lit, 1, `${d.toISOString()} over the subsolar point`)
    const night = lookDown(-sub.latDeg, sub.lonDeg + 180, 1200, d)
    assert.equal(night.lit, 0, `${d.toISOString()} over the antipode`)
    // Looking straight down the Earth fills the view either way.
    assert.equal(day.e, 1)
    assert.equal(night.e, 1)
  }
})

test('the sunlit weight follows the Sun\'s elevation at the sub-satellite point: 1 from about 12 degrees up, 0 below about 6 degrees down', () => {
  const d = DATES[0]
  for (let lat = -80; lat <= 80; lat += 20) {
    for (let lon = -180; lon < 180; lon += 20) {
      const elev = sunElevationDeg(lat, lon, d)
      const lit = lookDown(lat, lon, 1200, d).lit
      if (elev >= 12) assert.equal(lit, 1, `elevation ${elev.toFixed(1)} at ${lat}, ${lon}`)
      if (elev <= -6) assert.equal(lit, 0, `elevation ${elev.toFixed(1)} at ${lat}, ${lon}`)
      // Exactly the smoothstep of the sine of the elevation (the cosine of the Sun's zenith angle there).
      assert.ok(Math.abs(lit - sunlitWeight(Math.sin(elev * DEG))) < 0.02, `weight ${lit} at elevation ${elev.toFixed(1)}`)
    }
  }
})

test('the two cases from a low satellite (OneWeb, 1,200 km) as checked on the live engine: Antarctica in daylight, the eastern Pacific at night', () => {
  // Frozen engine times where the overlay showed sunlit 1.00 over (-82.5, 59.5) and sunlit 0.00 over (7.8, -96.7).
  const day = new Date(1792219977667)
  const night = new Date(1792218061055)
  assert.ok(sunElevationDeg(-82.5, 59.5, day) > 12) // 16.6 degrees up
  assert.ok(sunElevationDeg(7.8, -96.7, night) < -6) // 87 degrees down
  assert.equal(lookDown(-82.5, 59.5, 1228, day).lit, 1)
  assert.equal(lookDown(7.8, -96.7, 1201, night).lit, 0)
})

test('sunlit values apply in daylight and night values at night, to the right fields; the shipped sunlit values are 1.0 (a no-op), night 0.19', () => {
  const d = DATES[0]
  const sub = subsolarPoint(d)
  const t = { glowSunlit: 0.9, starsSunlit: 0.8, glowNight: 0.3, starsNight: 0.2 }
  const pos = satAt(sub.latDeg, sub.lonDeg, 1200, d)
  const axis: Vec3 = [-pos[0], -pos[1], -pos[2]]
  const day = stepSkyDim(null, pos, axis, sunDirectionScene(d), 120, 0, false, t)
  assert.ok(Math.abs(day.glow - 0.9) < 1e-12 && Math.abs(day.stars - 0.8) < 1e-12, 'daylight uses the sunlit fields')
  const anti = satAt(-sub.latDeg, sub.lonDeg + 180, 1200, d)
  const nightF = stepSkyDim(null, anti, [-anti[0], -anti[1], -anti[2]], sunDirectionScene(d), 120, 0, false, t)
  assert.ok(Math.abs(nightF.glow - 0.3) < 1e-12 && Math.abs(nightF.stars - 0.2) < 1e-12, 'night uses the night fields')
  // The shipped defaults: daylight with the Earth filling the view is not dimmed at all; night is 0.19.
  const shippedDay = lookDown(sub.latDeg, sub.lonDeg, 1200, d)
  assert.deepEqual([shippedDay.glow, shippedDay.stars], [1, 1])
  const shippedNight = lookDown(-sub.latDeg, sub.lonDeg + 180, 1200, d)
  assert.ok(Math.abs(shippedNight.glow - 0.19) < 1e-12 && Math.abs(shippedNight.stars - 0.19) < 1e-12)
  // Looking out at dark sky is never dimmed, day or night.
  const out = stepSkyDim(null, anti, [anti[0], anti[1], anti[2]], sunDirectionScene(d), 120, 0, false)
  assert.deepEqual([out.glow, out.stars, out.e], [1, 1, 0])
  assert.ok(earthAngularRadius(Math.hypot(...anti)) > 1) // (1,200 km: the Earth's disc is 1.2 radians across)
})
