import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Body, GeoVector, Illumination, Rotation_EQJ_EQD } from 'astronomy-engine'
import { EARTH_RADIUS_KM } from '../src/globe/frames.ts'
import type { Vec3 } from '../src/globe/pov.ts'
import {
  bodiesFromSatellite,
  bodyPixels,
  geocentricDirection,
  pickBody,
  sceneKm,
  type GeoBody,
} from '../src/globe/spacebodies.ts'
import { j2000ToDateMatrix } from '../src/globe/planets.ts'
import { NO_ROTATION, type Mat3 } from '../src/globe/stars.ts'

const AU_KM = 149_597_870.7
const when = new Date('2026-10-12T20:00:00Z')
const geo = (body: Body, key: string): GeoBody => {
  const v = GeoVector(body, when, true)
  return { key, vecKm: [v.x * AU_KM, v.y * AU_KM, v.z * AU_KM], mag: Illumination(body, when).mag }
}
const all: GeoBody[] = [
  geo(Body.Sun, 'sun'),
  geo(Body.Moon, 'moon'),
  geo(Body.Mars, 'mars'),
  geo(Body.Jupiter, 'jupiter'),
  geo(Body.Venus, 'venus'),
]
const M: Mat3 = j2000ToDateMatrix(when)
const angle = (a: Vec3, b: Vec3) => (Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180) / Math.PI
const dist = (a: Vec3) => Math.hypot(a[0], a[1], a[2])

test('the precession rotation is a proper rotation of about 0.36 degrees over 26 years', () => {
  const det =
    M[0] * (M[4] * M[8] - M[5] * M[7]) - M[1] * (M[3] * M[8] - M[5] * M[6]) + M[2] * (M[3] * M[7] - M[4] * M[6])
  assert.ok(Math.abs(det - 1) < 1e-12)
  const turned = [M[0], M[3], M[6]] as Vec3 // the image of the J2000 x axis
  assert.ok(angle(turned, [1, 0, 0]) > 0.3 && angle(turned, [1, 0, 0]) < 0.45)
  // It matches astronomy-engine's own matrix (column-major there).
  const r = Rotation_EQJ_EQD(when).rot
  assert.ok(Math.abs(M[1] - r[1][0]) < 1e-15 && Math.abs(M[3] - r[0][1]) < 1e-15)
})

test('from the Earth\'s centre the Moon\'s direction is astronomy-engine\'s geocentric result', () => {
  const views = bodiesFromSatellite(all, [0, 0, 0], M)
  const moon = views.find((v) => v.key === 'moon')!
  const g = geocentricDirection(all[1], M)
  assert.ok(angle(moon.dir, g) < 1e-4) // acos can't resolve less than ~1e-6 degrees
  assert.ok(moon.parallaxDeg! < 1e-4)
  // 380,000 km or so away, half a degree across.
  assert.ok(moon.distKm > 356_000 && moon.distKm < 407_000)
  assert.ok(moon.angDiameterDeg > 0.49 && moon.angDiameterDeg < 0.57)
})

test('from low orbit the Moon moves by up to about a degree: that is its parallax from the satellite', () => {
  const g = geocentricDirection(all[1], M)
  const r = 1 + 420 / EARTH_RADIUS_KM
  // The satellite on the Moon's side of the Earth, on the far side, and 90 degrees off.
  const perp: Vec3 = [-g[1], g[0], 0]
  const pn = Math.hypot(...perp)
  const cases: [string, Vec3][] = [
    ['toward the Moon', [g[0] * r, g[1] * r, g[2] * r]],
    ['away from it', [-g[0] * r, -g[1] * r, -g[2] * r]],
    ['abeam', [(perp[0] / pn) * r, (perp[1] / pn) * r, (perp[2] / pn) * r]],
  ]
  const out: Record<string, number> = {}
  for (const [name, p] of cases) {
    const moon = bodiesFromSatellite(all, sceneKm(p), M).find((v) => v.key === 'moon')!
    out[name] = moon.parallaxDeg!
    // Reported parallax is the angle between the two directions.
    assert.ok(Math.abs(moon.parallaxDeg! - angle(moon.dir, g)) < 1e-4)
  }
  // Sub-satellite point under the Moon or opposite: no parallax; abeam: asin(6798 / 384,400) = 1.0 degree.
  assert.ok(out['toward the Moon'] < 0.01 && out['away from it'] < 0.01)
  assert.ok(out['abeam'] > 0.9 && out['abeam'] < 1.2, `${out['abeam']}`)
  // From a satellite abeam the Moon looks larger or smaller by its distance changing a little only.
  const abeam = bodiesFromSatellite(all, sceneKm(cases[2][1]), M).find((v) => v.key === 'moon')!
  assert.ok(Math.abs(abeam.distKm - dist(all[1].vecKm)) < 7000)
})

test('planets and the Sun are in the same direction from the satellite as from the Earth\'s centre, to a few thousandths of a degree', () => {
  const r = 1 + 420 / EARTH_RADIUS_KM
  const p: Vec3 = [r, 0, 0]
  const views = bodiesFromSatellite(all, sceneKm(p), M)
  for (const g of all) {
    if (g.key === 'moon') continue
    const v = views.find((x) => x.key === g.key)!
    const d = angle(v.dir, geocentricDirection(g, M))
    assert.ok(d < 0.01, `${g.key}: ${d}`) // Mars is the nearest planet here
  }
  const sun = views.find((v) => v.key === 'sun')!
  assert.ok(sun.angDiameterDeg > 0.52 && sun.angDiameterDeg < 0.55)
})

test('the Moon\'s phase is the angle at the Moon between the Sun and the satellite', () => {
  // Geocentric illumination (astronomy-engine) vs from the satellite: they agree within a fraction of a percent.
  const geoK = Illumination(Body.Moon, when).phase_fraction
  const r = 1 + 420 / EARTH_RADIUS_KM
  const moonG = geocentricDirection(all[1], M)
  const k = bodiesFromSatellite(all, sceneKm([moonG[0] * r, moonG[1] * r, moonG[2] * r]), M).find((v) => v.key === 'moon')!
  assert.ok(Math.abs(k.illuminated! - geoK) < 0.005, `${k.illuminated} vs ${geoK}`)
  // A satellite far out (a million km) toward the Sun sees a different (fuller) Moon than the Earth does.
  const sunDir = geocentricDirection(all[0], M)
  const far = sceneKm([sunDir[0] * 160, sunDir[1] * 160, sunDir[2] * 160]) // about a million km
  const farMoon = bodiesFromSatellite(all, far, M).find((v) => v.key === 'moon')!
  assert.ok(farMoon.illuminated! > geoK - 0.5 && farMoon.illuminated! !== k.illuminated)
  // The lit limb points from the Moon toward the Sun, tangent to the sky: perpendicular to the Moon's direction.
  const limb = k.limb!
  assert.ok(Math.abs(limb[0] * k.dir[0] + limb[1] * k.dir[1] + limb[2] * k.dir[2]) < 1e-9)
})

test('sprites are never smaller than their minimum and grow to the true size when zoomed in', () => {
  assert.equal(bodyPixels(0.52, 70, 576, 18), 18) // the Moon at 70 degrees: ~4 px true
  assert.ok(Math.abs(bodyPixels(0.52, 0.5, 576, 18) - 599) < 1) // it fills the view at 0.5 degrees
  assert.equal(bodyPixels(0, 70, 576, 6), 6) // a planet is a point
})

test('picking: inside a disc wins; otherwise the nearest within the tolerance; otherwise nothing', () => {
  const bodies = [
    { key: 'moon', x: 100, y: 100, r: 15 },
    { key: 'venus', x: 130, y: 100, r: 5 },
    { key: 'mars', x: 300, y: 300, r: 4 },
  ]
  assert.equal(pickBody(105, 100, bodies, 6), 'moon') // inside the Moon's disc
  assert.equal(pickBody(128, 100, bodies, 6), 'venus') // inside Venus's disc, though the Moon's tolerance ring is nearer
  assert.equal(pickBody(120, 100, bodies, 6), 'moon') // inside the Moon's disc (r 15 reaches x 115) is 5 outside; Venus is 5 away: nearest wins
  assert.equal(pickBody(300, 308, bodies, 6), 'mars') // 8 px from its centre, 4 outside the disc: within the tolerance
  assert.equal(pickBody(300, 312, bodies, 6), null) // 8 px outside its disc: beyond the tolerance
  assert.equal(pickBody(300, 330, bodies, 6), null)
  assert.equal(pickBody(0, 0, [], 6), null)
  assert.deepEqual(NO_ROTATION.length, 9)
})
