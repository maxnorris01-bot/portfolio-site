import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EquatorFromVector, GeoMoon, Horizon, MakeTime, Observer, RotateVector, Rotation_EQJ_EQD } from 'astronomy-engine'
import { computeSkyBodies } from '../src/globe/planets.ts'
import {
  SKY_BODIES,
  aboveHorizon,
  brightLimbAngle,
  markerSizePx,
  moonPhaseName,
  nextSelection,
  showsLabel,
} from '../src/globe/skybodies.ts'
import { sunElevationDeg } from '../src/globe/sun.ts'
import { SKY_CAP } from '../src/globe/twilight.ts'

const SANTA_CRUZ = [36.974, -122.031] as const
const at = (iso: string, lat = 0, lon = 0) => computeSkyBodies(new Date(iso), lat, lon)
const get = (list: ReturnType<typeof at>, key: string) => list.find((b) => b.key === key)!
const sep = (a: { azDeg: number; elDeg: number }, b: { azDeg: number; elDeg: number }) => {
  const r = Math.PI / 180
  const c =
    Math.sin(a.elDeg * r) * Math.sin(b.elDeg * r) +
    Math.cos(a.elDeg * r) * Math.cos(b.elDeg * r) * Math.cos((a.azDeg - b.azDeg) * r)
  return Math.acos(Math.min(1, c)) / r
}

test('every body is computed, with sane magnitudes and distances', () => {
  const list = at('2026-10-08T12:00:00Z', ...SANTA_CRUZ)
  assert.deepEqual(list.map((b) => b.key), SKY_BODIES.map((b) => b.key))
  assert.ok(get(list, 'sun').mag < -26 && Math.abs(get(list, 'sun').distAu - 1) < 0.02)
  assert.ok(get(list, 'moon').distKm > 356_000 && get(list, 'moon').distKm < 407_000)
  assert.ok(get(list, 'venus').mag < -3.5)
  assert.ok(get(list, 'neptune').mag > 7.5 && get(list, 'neptune').distAu > 28)
})

test('well-known values: eclipse Moons, the 2020 great conjunction, greatest elongations', () => {
  // Total lunar eclipse 2026-03-03 (Moon full) and annular solar eclipse 2026-02-17 (new).
  assert.ok(get(at('2026-03-03T11:33:00Z'), 'moon').illuminated! > 0.999)
  assert.ok(get(at('2026-02-17T12:12:00Z'), 'moon').illuminated! < 0.001)
  // Jupiter and Saturn about 6 arcminutes apart on 2020-12-21.
  const gc = at('2020-12-21T18:20:00Z')
  assert.ok(Math.abs(sep(get(gc, 'jupiter'), get(gc, 'saturn')) * 60 - 6.1) < 0.5)
  // Venus's greatest evening elongation, 2026-08-15: 45.9 degrees from the Sun.
  const v = at('2026-08-15T12:00:00Z', ...SANTA_CRUZ)
  assert.ok(Math.abs(sep(get(v, 'venus'), get(v, 'sun')) - 45.9) < 0.3)
  // Mercury's greatest evening elongation, 2026-10-12: 25.2 degrees.
  const m = at('2026-10-12T12:00:00Z', ...SANTA_CRUZ)
  assert.ok(Math.abs(sep(get(m, 'mercury'), get(m, 'sun')) - 25.2) < 0.3)
})

test("the Sun agrees with the globe's own sun module (satellite.js) to a few tenths", () => {
  for (const iso of ['2026-03-20T15:00:00Z', '2026-06-21T03:00:00Z', '2026-10-08T22:00:00Z']) {
    const sun = get(at(iso, ...SANTA_CRUZ), 'sun')
    assert.ok(Math.abs(sun.elDeg - sunElevationDeg(SANTA_CRUZ[0], SANTA_CRUZ[1], new Date(iso))) < 0.3, iso)
  }
})

test('the Moon is topocentric: parallax lowers it by about a degree near the horizon', () => {
  // Find a moment the Moon is low (0-10 degrees up) at Santa Cruz.
  const obs = new Observer(SANTA_CRUZ[0], SANTA_CRUZ[1], 0)
  let checked = 0
  for (let h = 0; h < 48 && checked < 3; h += 0.25) {
    const date = new Date(Date.parse('2026-10-14T00:00:00Z') + h * 3600e3)
    const topo = get(computeSkyBodies(date, SANTA_CRUZ[0], SANTA_CRUZ[1]), 'moon')
    if (topo.elDeg < 2 || topo.elDeg > 10) continue
    // Geocentric, rotated from J2000 to the equator of date (as Horizon expects).
    const time = MakeTime(date)
    const geoEq = EquatorFromVector(RotateVector(Rotation_EQJ_EQD(time), GeoMoon(time)))
    const geo = Horizon(date, obs, geoEq.ra, geoEq.dec)
    const shift = geo.altitude - topo.elDeg
    assert.ok(shift > 0.8 && shift < 1.05, `parallax ${shift}`)
    checked++
  }
  assert.equal(checked, 3)
})

test('horizon clipping: only bodies above the horizon are listed, highest first', () => {
  const list = [
    { key: 'a', elDeg: 12 },
    { key: 'b', elDeg: -3 },
    { key: 'c', elDeg: 40 },
    { key: 'd', elDeg: 0 },
  ]
  assert.deepEqual(aboveHorizon(list).map((b) => b.key), ['c', 'a'])
  // And for real: at 21:00 PDT on 8 Oct 2026 from Santa Cruz, the Sun is down.
  const night = aboveHorizon(at('2026-10-09T04:00:00Z', ...SANTA_CRUZ))
  assert.equal(night.some((b) => b.key === 'sun'), false)
  assert.ok(night.every((b) => b.elDeg > 0))
})

test("the Moon's lit limb faces the Sun", () => {
  // Sun straight below the Moon: lit from below.
  assert.ok(Math.abs(brightLimbAngle(180, 30, 180, -10) - 180) < 1e-6)
  // Sun straight above: lit from above.
  assert.ok(Math.abs(brightLimbAngle(180, 30, 180, 70) % 360) < 1e-6)
  // Moon due south on the horizon, Sun due west on the horizon: to the
  // observer's right (facing south, west is on the right).
  assert.ok(Math.abs(brightLimbAngle(180, 0, 270, 0) - 90) < 1e-6)
  // Sun due east: to the left.
  assert.ok(Math.abs(brightLimbAngle(180, 0, 90, 0) - 270) < 1e-6)
  // An evening crescent: Sun just set in the west, Moon low in the south-west:
  // lit on the lower right.
  const a = brightLimbAngle(230, 15, 265, -5)
  assert.ok(a > 90 && a < 180, `angle ${a}`)
})

test('Moon phase names', () => {
  assert.equal(moonPhaseName(0.01, true), 'New moon')
  assert.equal(moonPhaseName(0.2, true), 'Waxing crescent')
  assert.equal(moonPhaseName(0.5, true), 'First quarter')
  assert.equal(moonPhaseName(0.8, false), 'Waning gibbous')
  assert.equal(moonPhaseName(0.99, false), 'Full moon')
})

test('marker sizes follow magnitude; phone labels only for the bright and the selected', () => {
  assert.equal(markerSizePx('planet', -4.5), 20) // Venus
  assert.ok(markerSizePx('planet', -2.5) > markerSizePx('planet', 1)) // Jupiter over Mars
  assert.equal(markerSizePx('planet', 7.8), 6) // Neptune: the floor
  assert.equal(markerSizePx('moon', -12), 30)
  const neptune = { key: 'neptune', kind: 'planet' as const, mag: 7.8 }
  assert.equal(showsLabel(neptune, false, null), true)
  assert.equal(showsLabel(neptune, true, null), false)
  assert.equal(showsLabel(neptune, true, 'neptune'), true)
  assert.equal(showsLabel({ key: 'moon', kind: 'moon', mag: -10 }, true, null), true)
})

test('selection transitions: satellite, planet, Deselect, and Sky to Globe', () => {
  let s = { satellite: null as number | null, body: null as string | null }
  s = nextSelection(s, { type: 'pickSatellite', index: 55 })
  assert.deepEqual(s, { satellite: 55, body: null })
  s = nextSelection(s, { type: 'pickBody', key: 'jupiter' }) // planet replaces the satellite
  assert.deepEqual(s, { satellite: null, body: 'jupiter' })
  s = nextSelection(s, { type: 'pickSatellite', index: 7 }) // and back
  assert.deepEqual(s, { satellite: 7, body: null })
  s = nextSelection(s, { type: 'pickBody', key: 'moon' })
  s = nextSelection(s, { type: 'deselect' })
  assert.deepEqual(s, { satellite: null, body: null })
  s = nextSelection(s, { type: 'pickSatellite', index: null }) // empty click
  assert.deepEqual(s, { satellite: null, body: null })
  // A planet selection ends on switching to the Globe; a satellite survives.
  assert.deepEqual(nextSelection({ satellite: null, body: 'venus' }, { type: 'view', mode: 'globe' }), {
    satellite: null,
    body: null,
  })
  assert.deepEqual(nextSelection({ satellite: 3, body: null }, { type: 'view', mode: 'globe' }), {
    satellite: 3,
    body: null,
  })
})

test('every marker colour and the label ink stay legible on the brightest sky and the ground', () => {
  const lum = (hex: string) =>
    [1, 3, 5]
      .map((i) => {
        const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
      })
      .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0)
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  }
  for (const surface of [SKY_CAP, '#26303c']) {
    for (const b of SKY_BODIES) assert.ok(contrast(b.color, surface) >= 3, `${b.name} on ${surface}`)
    assert.ok(contrast('#e8ecf4', surface) >= 4.5, `label ink on ${surface}`)
  }
})
