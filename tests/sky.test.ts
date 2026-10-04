import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as THREE from 'three'
import {
  degreesToRadians,
  eciToEcf,
  eciToGeodetic,
  ecfToLookAngles,
  gstime,
  propagate,
  twoline2satrec,
} from 'satellite.js'
import { EARTH_RADIUS_KM, writeInertial } from '../src/globe/frames.ts'
import { lookAngles, observerFrame, skyDirection } from '../src/globe/sky.ts'

// Real element sets from the live catalog (2026-10-03 run).
const TLES = [
  { name: "ISS (ZARYA)", l1: "1 25544U 98067A   26276.49792087  .00005083  00000-0  10128-3 0  9990", l2: "2 25544  51.6313 124.0722 0006914 218.1010 141.9490 15.48725660588544" },
  { name: "STARLINK-3005", l1: "1 48881U 21059C   26276.30432177 -.00000533  00000-0 -37320-4 0  9998", l2: "2 48881  97.2846  35.8435 0001995 200.7034 159.4111 15.01263888289952" },
  { name: "NAVSTAR 43 (USA 132)", l1: "1 24876U 97035A   26276.39349969  .00000044  00000-0  00000+0 0  9993", l2: "2 24876  56.0587  94.3439 0106316  59.1820 301.9041  2.00564381214121" },
  { name: "INTELSAT 902 (IS-902)", l1: "1 26900U 01039A   26276.34047207 -.00000291  00000-0  00000+0 0  9992", l2: "2 26900   6.3836  70.4142 0004340 117.4218 256.7111  1.00279468 91783" },
  { name: "FENGYUN 1C DEB", l1: "1 29733U 99025X   26276.33557748  .00000606  00000-0  10714-2 0  9991", l2: "2 29733  99.2045 292.4789 0564362 241.4297 126.6922 12.96930715929383" },
]
const AT = new Date('2026-10-04T12:00:00Z')
const OBSERVERS = [
  { name: 'Boulder (north)', lat: 40.015, lon: -105.27 },
  { name: 'Wellington (south)', lat: -41.287, lon: 174.776 },
  { name: 'Longyearbyen (near the pole)', lat: 78.223, lon: 15.647 },
]

function scenePos(eci: { x: number; y: number; z: number }): [number, number, number] {
  const out = new Float32Array(3)
  writeInertial(out, 0, eci.x, eci.y, eci.z)
  return [out[0], out[1], out[2]]
}

const angleDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)

test('azimuth/elevation match satellite.js look angles within 0.1 degrees', () => {
  const gmst = gstime(AT)
  let checked = 0
  for (const o of OBSERVERS) {
    const frame = observerFrame(o.lat, o.lon, gmst)
    const gd = { latitude: degreesToRadians(o.lat), longitude: degreesToRadians(o.lon), height: 0 }
    for (const t of TLES) {
      const pv = propagate(twoline2satrec(t.l1, t.l2), AT)
      assert.ok(pv, t.name)
      const ref = ecfToLookAngles(gd, eciToEcf(pv.position, gmst))
      const mine = lookAngles(frame, scenePos(pv.position))
      const refAz = (ref.azimuth * 180) / Math.PI
      const refEl = (ref.elevation * 180) / Math.PI
      assert.ok(Math.abs(mine.elDeg - refEl) < 0.1, `${o.name} ${t.name} el ${mine.elDeg} vs ${refEl}`)
      // Azimuth is undefined straight overhead; everything here is well off zenith.
      assert.ok(angleDiff(mine.azDeg, refAz) < 0.1, `${o.name} ${t.name} az ${mine.azDeg} vs ${refAz}`)
      assert.ok(Math.abs(mine.rangeKm - ref.rangeSat) / ref.rangeSat < 1e-3, `${t.name} range`)
      checked++
    }
  }
  assert.equal(checked, OBSERVERS.length * TLES.length)
})

test('an observer directly under an object sees it near the zenith', () => {
  const gmst = gstime(AT)
  for (const t of TLES) {
    const pv = propagate(twoline2satrec(t.l1, t.l2), AT)!
    const sub = eciToGeodetic(pv.position, gmst)
    const frame = observerFrame((sub.latitude * 180) / Math.PI, (sub.longitude * 180) / Math.PI, gmst)
    const el = lookAngles(frame, scenePos(pv.position)).elDeg
    assert.ok(el > 89.9, `${t.name}: elevation ${el}`)
  }
})

test('a point just north of the observer has azimuth 0, just east has 90', () => {
  const f = observerFrame(-33.9, 151.2, 1.234)
  const step = 50 / EARTH_RADIUS_KM
  const at = (v: [number, number, number]) =>
    [0, 1, 2].map((k) => f.pos[k] + v[k] * step + f.up[k] * step) as [number, number, number]
  assert.ok(angleDiff(lookAngles(f, at(f.north)).azDeg, 0) < 1e-6)
  assert.ok(angleDiff(lookAngles(f, at(f.east)).azDeg, 90) < 1e-6)
  assert.ok(Math.abs(lookAngles(f, at(f.north)).elDeg - 45) < 1e-6)
})

test('looking north and up, east is on the right of the screen', () => {
  const camera = new THREE.PerspectiveCamera(70, 1.5, 0.1, 1000)
  camera.up.set(0, 1, 0)
  camera.lookAt(new THREE.Vector3(...skyDirection(0, 30)))
  camera.updateMatrixWorld()
  const screenX = (az: number) => new THREE.Vector3(...skyDirection(az, 30)).multiplyScalar(100).project(camera).x
  assert.ok(screenX(20) > 0.1, 'a little east of north should be right of centre')
  assert.ok(screenX(340) < -0.1, 'a little west of north should be left of centre')
  // And facing south, west is on the right.
  camera.lookAt(new THREE.Vector3(...skyDirection(180, 30)))
  camera.updateMatrixWorld()
  assert.ok(screenX(200) > 0.1, 'facing south, a little west (az 200) is on the right')
})

test('writeDome places objects where lookAngles says, and counts only shown objects above the horizon', async () => {
  const { DOME_RADIUS, writeDome } = await import('../src/globe/sky.ts')
  const gmst = gstime(AT)
  const f = observerFrame(40.015, -105.27, gmst)
  const pos = new Float32Array(TLES.length * 3)
  const vel = new Float32Array(TLES.length * 3)
  TLES.forEach((t, i) => {
    const pv = propagate(twoline2satrec(t.l1, t.l2), AT)!
    writeInertial(pos, i, pv.position.x, pv.position.y, pv.position.z)
    writeInertial(vel, i, pv.velocity.x, pv.velocity.y, pv.velocity.z)
  })
  const out = new Float32Array(pos.length)
  const above = writeDome(out, pos, vel, [0], f, () => true, () => true)
  let expectAbove = 0
  TLES.forEach((_, i) => {
    const la = lookAngles(f, [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]])
    if (la.elDeg > 0) expectAbove++
    const d = new THREE.Vector3(...skyDirection(la.azDeg, la.elDeg)).multiplyScalar(DOME_RADIUS)
    assert.ok(d.distanceTo(new THREE.Vector3(out[i * 3], out[i * 3 + 1], out[i * 3 + 2])) < 1e-3)
  })
  assert.equal(above, expectAbove)
  assert.equal(writeDome(out, pos, vel, [0], f, () => true, () => false), 0)

  // Extrapolation: positions 5 s stale plus velocity land where a fresh
  // propagation would put them (well under 0.1 degrees).
  const later = new Date(AT.getTime() + 5000)
  const fl = observerFrame(40.015, -105.27, gstime(later))
  writeDome(out, pos, vel, [5], fl, () => true, () => true)
  TLES.forEach((t, i) => {
    const pv = propagate(twoline2satrec(t.l1, t.l2), later)!
    const la = lookAngles(fl, scenePos(pv.position))
    const d = new THREE.Vector3(...skyDirection(la.azDeg, la.elDeg))
    const got = new THREE.Vector3(out[i * 3], out[i * 3 + 1], out[i * 3 + 2]).normalize()
    assert.ok((d.angleTo(got) * 180) / Math.PI < 0.1, `${t.name} extrapolation`)
  })
})
