import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gstime } from 'satellite.js'
import { directionLookAngles, observerFrame } from '../src/globe/sky.ts'
import { sunDirectionScene, sunElevationDeg } from '../src/globe/sun.ts'
import { SKY_CAP, brightestSky, luminance, skyPalette, twilightPhase } from '../src/globe/twilight.ts'

const TROMSO = { lat: 69.649, lon: 18.956 }

test('twilight phases at known solar elevations', () => {
  assert.equal(twilightPhase(45), 'day')
  assert.equal(twilightPhase(0), 'day')
  assert.equal(twilightPhase(-0.833), 'day') // sunrise/sunset
  assert.equal(twilightPhase(-1), 'civil')
  assert.equal(twilightPhase(-6), 'civil')
  assert.equal(twilightPhase(-6.01), 'nautical')
  assert.equal(twilightPhase(-12), 'nautical')
  assert.equal(twilightPhase(-12.01), 'astronomical')
  assert.equal(twilightPhase(-18), 'astronomical')
  assert.equal(twilightPhase(-18.01), 'night')
  assert.equal(twilightPhase(-90), 'night')
})

const dayOfPhases = (date0: number) => {
  const phases = new Set<string>()
  let min = 90
  let max = -90
  for (let m = 0; m < 24 * 60; m += 10) {
    const el = sunElevationDeg(TROMSO.lat, TROMSO.lon, new Date(date0 + m * 60_000))
    phases.add(twilightPhase(el))
    min = Math.min(min, el)
    max = Math.max(max, el)
  }
  return { phases, min, max }
}

test('Tromso, midsummer: the Sun never sets', () => {
  const { phases, min } = dayOfPhases(Date.UTC(2026, 5, 21))
  assert.deepEqual([...phases], ['day'])
  assert.ok(min > 0, `lowest ${min}`) // about +3 degrees at local midnight
})

test('Tromso, midwinter: no daytime, but civil twilight at noon and night at midnight', () => {
  const { phases, max, min } = dayOfPhases(Date.UTC(2026, 11, 21))
  assert.equal(phases.has('day'), false)
  assert.ok(max < -0.833 && max > -6, `highest ${max}`) // about -3 degrees
  assert.ok(min < -18, `lowest ${min}`)
  for (const p of ['civil', 'nautical', 'astronomical', 'night']) assert.ok(phases.has(p), p)
})

test("the Sun's look angles from the observer frame agree with the spherical elevation", () => {
  for (const [lat, lon] of [[51.48, 0], [TROMSO.lat, TROMSO.lon], [-33.87, 151.21], [0, -78.5]]) {
    for (const iso of ['2026-03-20T12:00:00Z', '2026-06-21T03:00:00Z', '2026-10-08T17:00:00Z']) {
      const date = new Date(iso)
      const { elDeg, azDeg } = directionLookAngles(observerFrame(lat, lon, gstime(date)), sunDirectionScene(date))
      // Geodetic vs geocentric vertical: up to about 0.2 degrees apart.
      assert.ok(Math.abs(elDeg - sunElevationDeg(lat, lon, date)) < 0.3, `${lat} ${iso}`)
      assert.ok(azDeg >= 0 && azDeg < 360)
    }
  }
  // Greenwich at the March equinox, 12:00 UTC: the Sun is nearly due south,
  // about 38.5 degrees up. It crosses the meridian at about 12:07 that day
  // (equation of time -7.5 minutes), so at 12:00 it's still about 2 degrees east of south.
  const d = new Date('2026-03-20T12:00:00Z')
  const g = directionLookAngles(observerFrame(51.48, 0, gstime(d)), sunDirectionScene(d))
  assert.ok(g.azDeg > 176 && g.azDeg < 180, `az ${g.azDeg}`)
  assert.ok(Math.abs(g.elDeg - 38.5) < 0.5, `el ${g.elDeg}`)
})

test('the sky never gets brighter than the cap, at any solar elevation', () => {
  const capLum = luminance(skyPalette(30).horizon) // the day horizon is the cap colour
  const hex = (h: string) =>
    [1, 3, 5].map((i) => {
      const v = Number.parseInt(h.slice(i, i + 2), 16) / 255
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    }) as [number, number, number]
  assert.ok(Math.abs(capLum - luminance(hex(SKY_CAP))) < 1e-9)
  let last = -1
  for (let el = -90; el <= 90; el += 0.25) {
    const lum = luminance(brightestSky(el))
    assert.ok(lum <= capLum + 1e-9, `el ${el}: ${lum} > cap ${capLum}`)
    const { zenith } = skyPalette(el)
    // Darkness deepens monotonically toward night (no flicker in a slider sweep).
    if (el >= -30 && el <= 10) assert.ok(luminance(zenith) >= last - 1e-12, `zenith at ${el}`)
    last = luminance(zenith)
  }
  // Every mark keeps 3:1 against the brightest sky (WCAG contrast).
  const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
  for (const mark of ['#3987e5', '#d95926', '#199e70', '#8b8f98', '#f2c14e', '#b0a8ff', '#e85d3f', '#7fd8ff', '#ffffff']) {
    assert.ok(contrast(luminance(hex(mark)), capLum) >= 3, mark)
  }
})
