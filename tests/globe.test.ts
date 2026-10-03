import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as THREE from 'three'
import { degreesToRadians, ecfToEci, geodeticToEcf, gstime } from 'satellite.js'
import { colorize } from '../src/globe/colors.ts'
import { earthRotationY, writeInertial } from '../src/globe/frames.ts'
import { DAY_MS, datasetFor, sliderBounds } from '../src/globe/timeline.ts'
import type { CatalogObject } from '../src/globe/types.ts'

// Where a lat/lon on the textured sphere ends up after the GMST rotation,
// using three.js's real SphereGeometry UV layout and Mesh transform.
function texturePointInScene(latDeg: number, lonDeg: number, date: Date): THREE.Vector3 {
  const geometry = new THREE.SphereGeometry(1, 360, 180)
  const mesh = new THREE.Mesh(geometry)
  mesh.rotation.y = earthRotationY(gstime(date))
  mesh.updateMatrixWorld()
  const u = (lonDeg + 180) / 360
  const v = 1 - (90 - latDeg) / 180 // three.js flips v (uv.y = 1 at the north pole)
  const uv = geometry.getAttribute('uv')
  const pos = geometry.getAttribute('position')
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < uv.count; i++) {
    const d = (uv.getX(i) - u) ** 2 + (uv.getY(i) - v) ** 2
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return new THREE.Vector3().fromBufferAttribute(pos, best).applyMatrix4(mesh.matrixWorld)
}

// The same place via satellite.js: geodetic -> Earth-fixed -> inertial at
// that moment, then through the scene mapping satellites use.
function inertialPointInScene(latDeg: number, lonDeg: number, date: Date): THREE.Vector3 {
  const ecf = geodeticToEcf({
    latitude: degreesToRadians(latDeg),
    longitude: degreesToRadians(lonDeg),
    height: 0,
  })
  const eci = ecfToEci(ecf, gstime(date))
  const out = new Float32Array(3)
  writeInertial(out, 0, eci.x, eci.y, eci.z)
  return new THREE.Vector3(out[0], out[1], out[2]).normalize()
}

test('rotating the Earth mesh by GMST lines the texture up with inertial positions', () => {
  const places = [
    [51.48, 0], // Greenwich
    [0, 90],
    [-33.87, 151.21], // Sydney
    [40.71, -74.01], // New York
    [64.13, -21.9], // Reykjavik
  ]
  for (const iso of ['2026-10-03T00:00:00Z', '2026-10-03T07:30:00Z', '2026-12-21T18:00:00Z']) {
    const date = new Date(iso)
    for (const [lat, lon] of places) {
      const angle = texturePointInScene(lat, lon, date).angleTo(inertialPointInScene(lat, lon, date))
      // Within 0.6°: the sphere's 1° mesh spacing plus WGS72's geodetic latitude.
      assert.ok(angle < degreesToRadians(0.6), `${iso} ${lat},${lon}: off by ${angle} rad`)
    }
  }
})

function obj(over: Partial<CatalogObject>): CatalogObject {
  return {
    norad_id: 1,
    name: 'X',
    tle_line1: '',
    tle_line2: '',
    element_epoch_utc: '',
    satcat_owner: null,
    object_type: 'PAY',
    active_payload: true,
    ...over,
  }
}

test('type coloring buckets objects and hides empty categories', () => {
  const c = colorize(
    [
      obj({}),
      obj({ object_type: 'DEB', active_payload: false }),
      obj({ object_type: 'DEB', active_payload: false }),
      obj({ active_payload: false }),
    ],
    'type',
  )
  assert.deepEqual(
    c.categories.map((x) => [x.key, x.count]),
    [
      ['active', 1],
      ['debris', 2],
      ['other', 1],
    ],
  )
  assert.equal(c.rgb.length, 12)
})

test('owner colors follow the owner code, not its rank', () => {
  const cn = { code: 'PRC', name: "People's Republic of China" }
  const many = colorize([obj({ satcat_owner: cn }), obj({ satcat_owner: cn })], 'owner')
  const one = colorize(
    [obj({ satcat_owner: cn }), obj({ satcat_owner: { code: 'US', name: 'United States' } })],
    'owner',
  )
  const color = (c: ReturnType<typeof colorize>, key: string) =>
    c.categories.find((x) => x.key === key)?.color
  assert.equal(color(many, 'PRC'), color(one, 'PRC'))
  assert.equal(
    colorize([obj({ satcat_owner: { code: 'UK', name: 'United Kingdom' } })], 'owner')
      .categories[0].key,
    'other',
  )
})

test('flat coloring is one category', () => {
  assert.deepEqual(
    colorize([obj({}), obj({ object_type: 'DEB' })], 'flat').categories.map((c) => c.count),
    [2],
  )
})

test('datasetFor uses current from the run window onward and that day before it', () => {
  const start = Date.parse('2026-10-03T04:03:00Z')
  const history = ['2026-10-03', '2026-10-01', '2026-09-30', '2026-10-02']
  assert.equal(datasetFor(start + 3 * 3_600_000, start, history), 'current')
  assert.equal(datasetFor(Date.parse('2026-10-03T01:00:00Z'), start, history), 'current')
  assert.equal(datasetFor(Date.parse('2026-10-01T12:00:00Z'), start, history), '2026-10-01')
  // A missing day falls back to the nearest earlier snapshot...
  assert.equal(
    datasetFor(Date.parse('2026-10-02T12:00:00Z'), start, ['2026-10-01', '2026-09-30']),
    '2026-10-01',
  )
  // ...or the oldest one if there's nothing earlier.
  assert.equal(datasetFor(Date.parse('2026-09-20T00:00:00Z'), start, history), '2026-09-30')
  assert.equal(datasetFor(start - DAY_MS, start, []), 'current')
})

test('sliderBounds spans the retained days and about a day forward', () => {
  const now = Date.parse('2026-10-03T12:00:00Z')
  const start = Date.parse('2026-10-03T04:03:00Z')
  assert.deepEqual(sliderBounds(now, start, []), { minMs: start, maxMs: now + DAY_MS })
  assert.equal(
    sliderBounds(now, start, ['2026-10-01', '2026-10-03']).minMs,
    Date.parse('2026-10-01T00:00:00Z'),
  )
  // Never more than 7 days back, even if an older snapshot lingers.
  assert.equal(sliderBounds(now, start, ['2026-09-20']).minMs, now - 7 * DAY_MS)
})
