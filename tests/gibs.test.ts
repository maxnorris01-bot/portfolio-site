import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  LEVEL_KM,
  LruCache,
  MAX_LEVEL,
  maxLevelForMotion,
  children,
  domainsUrl,
  featherEdges,
  latLonToVec,
  levelFor,
  matrixHeight,
  matrixWidth,
  minFovForImagery,
  parent,
  parseDomain,
  pickImageryDate,
  selectTiles,
  tileAt,
  tileBounds,
  tileSpanDeg,
  tileUrl,
  tileVisible,
  vecToLatLon,
  type TileSource,
  type View,
} from '../src/globe/gibs.ts'

test('the grid matches the GIBS 250m tile matrix set', () => {
  // From GetCapabilities: matrix widths/heights per level.
  const dims = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((z) => [matrixWidth(z), matrixHeight(z)])
  assert.deepEqual(dims, [
    [2, 1],
    [3, 2],
    [5, 3],
    [10, 5],
    [20, 10],
    [40, 20],
    [80, 40],
    [160, 80],
    [320, 160],
  ])
  assert.equal(tileSpanDeg(8), 1.125)
  assert.ok(Math.abs(LEVEL_KM(8) - 0.2446) < 0.001) // ~244 m per pixel
  assert.equal(MAX_LEVEL, 8)
})

test('tile bounds and lookup, including the antimeridian and the poles', () => {
  assert.deepEqual(tileBounds({ z: 0, row: 0, col: 0 }).drawn, { west: -180, east: 108, north: 90, south: -90 })
  assert.deepEqual(tileBounds({ z: 0, row: 0, col: 1 }).drawn, { west: 108, east: 180, north: 90, south: -90 })
  assert.deepEqual(tileAt(0, 0, 3), { z: 3, row: 2, col: 5 })
  // Antimeridian: 180 E and 180 W are the two edge columns.
  assert.equal(tileAt(10, 180, 4).col, matrixWidth(4) - 1)
  assert.equal(tileAt(10, -180, 4).col, 0)
  assert.equal(tileAt(10, 179.99, 4).col, matrixWidth(4) - 1)
  assert.equal(tileAt(10, -179.99, 4).col, 0)
  // Poles: the first and last rows.
  assert.equal(tileAt(90, 30, 5).row, 0)
  assert.equal(tileAt(-90, 30, 5).row, matrixHeight(5) - 1)
  // Every point lies inside its tile's bounds, at every level.
  for (const [lat, lon] of [[51.5, -0.1], [-33.9, 151.2], [89.9, 179.9], [-89.9, -179.9], [0, 0]]) {
    for (let z = 0; z <= MAX_LEVEL; z++) {
      const b = tileBounds(tileAt(lat, lon, z)).full
      assert.ok(lon >= b.west - 1e-9 && lon <= b.east + 1e-9 && lat <= b.north + 1e-9 && lat >= b.south - 1e-9, `${lat},${lon} z${z}`)
    }
  }
})

test('children nest inside their parent and drop the off-globe ones', () => {
  const t = { z: 3, row: 2, col: 9 }
  for (const c of children(t)) {
    assert.deepEqual(parent(c), t)
    const pb = tileBounds(t).full
    const cb = tileBounds(c).full
    assert.ok(cb.west >= pb.west && cb.east <= pb.east && cb.north <= pb.north && cb.south >= pb.south)
  }
  // The last column at level 3 (10 wide) has only one in-grid child column at level 4 (20 wide)... both fit:
  assert.equal(children({ z: 3, row: 4, col: 9 }).length, 4)
  // Level 0's eastern tile is mostly off the globe: only in-grid children survive.
  assert.ok(children({ z: 0, row: 0, col: 1 }).every((c) => c.col < matrixWidth(1)))
})

test('lat/lon <-> vector round trip on the globe mesh axes', () => {
  const v0 = latLonToVec(0, 0)
  assert.ok(Math.abs(v0[0] - 1) < 1e-12 && Math.abs(v0[1]) < 1e-12 && Math.abs(v0[2]) < 1e-12)
  const east = latLonToVec(0, 90)
  assert.ok(Math.abs(east[2] + 1) < 1e-12) // 90 E on -z
  for (const [lat, lon] of [[51.5, -0.1], [-41.3, 174.8], [0, 180], [89, -45]]) {
    const back = vecToLatLon(latLonToVec(lat, lon))
    assert.ok(Math.abs(back.latDeg - lat) < 1e-9)
    assert.ok(Math.abs(((back.lonDeg - lon + 540) % 360) - 180) < 1e-9)
  }
})

test('level selection follows altitude and field of view', () => {
  // ISS (420 km), 576 px tall view.
  const wide = levelFor(420, 120, 576)
  const narrow = levelFor(420, 15, 576)
  assert.ok(narrow > wide)
  assert.equal(levelFor(420, 5, 576), MAX_LEVEL) // capped at the finest level
  // From GEO the same field of view needs a much coarser level.
  assert.ok(levelFor(35786, 30, 576) < levelFor(420, 30, 576))
})

const issView = (latDeg: number, lonDeg: number, fovDeg = 70): View => {
  const r = 1 + 420 / 6378.137
  const n = latLonToVec(latDeg, lonDeg)
  return {
    cam: [n[0] * r, n[1] * r, n[2] * r],
    dir: [-n[0], -n[1], -n[2]],
    fovDeg,
    halfDiagDeg: (Math.atan(Math.tan(((fovDeg / 2) * Math.PI) / 180) * Math.hypot(1, 16 / 9)) * 180) / Math.PI,
    screenPx: 576,
  }
}

test('the visible set contains the nadir tile and respects the horizon', () => {
  const v = issView(42.6, 57.2)
  const tiles = selectTiles(v)
  const nadirZ = Math.max(...tiles.map((t) => t.z))
  const nadir = tileAt(42.6, 57.2, nadirZ)
  assert.ok(tiles.some((t) => t.z === nadir.z && t.row === nadir.row && t.col === nadir.col), 'nadir tile drawn')
  assert.ok(tiles.length <= 80)
  // Nothing beyond the horizon (about 20 degrees from the sub-point at 420 km), even wide.
  const wide = issView(42.6, 57.2, 120)
  for (const t of selectTiles(wide)) assert.ok(tileVisible(t, wide))
  assert.equal(tileVisible(tileAt(-42.6, -122.8, 5), wide), false) // the antipode
  assert.equal(tileVisible(tileAt(42.6, 57.2 + 60, 6), wide), false) // well past the horizon
  // Narrow zoom refines to the finest level around the nadir.
  assert.equal(Math.max(...selectTiles(issView(42.6, 57.2, 10)).map((t) => t.z)), MAX_LEVEL)
})

test('the zoom limit comes from the imagery resolution and the altitude', () => {
  const iss = minFovForImagery(420, 0.25, 576)
  const geo = minFovForImagery(35786, 0.25, 576)
  assert.ok(iss > 9 && iss < 11, `ISS ${iss}`) // ~9.8 degrees
  assert.equal(geo, 1) // GEO: the 1 degree floor
  assert.ok(minFovForImagery(420, 0.5, 576) > iss) // a coarser cap (phones) means a wider limit
})

test('the imagery date: newest available on or before the displayed date', () => {
  const ranges = parseDomain('2026-04-30/2026-07-10/P1D,2026-07-16/2026-10-09/P1D')
  assert.deepEqual(ranges[1], { start: '2026-07-16', end: '2026-10-09' })
  assert.equal(pickImageryDate('2026-10-07', ranges), '2026-10-07')
  // The newest listed day (10-09) is still filling in: use the day before it.
  assert.equal(pickImageryDate('2026-10-09', ranges), '2026-10-08')
  assert.equal(pickImageryDate('2026-10-12', ranges), '2026-10-08') // future: latest complete
  assert.equal(pickImageryDate('2026-07-13', ranges), '2026-07-10') // inside a gap
  assert.equal(pickImageryDate('2026-07-16', ranges), '2026-07-16') // first day after a gap
  assert.equal(pickImageryDate('2026-01-01', ranges), null) // before any imagery
  // A single listed day is used even though it's the newest.
  assert.equal(pickImageryDate('2026-10-05', parseDomain('2026-10-05')), '2026-10-05')
  assert.deepEqual(parseDomain('2026-10-05'), [{ start: '2026-10-05', end: '2026-10-05' }])
})

test('URLs follow the GIBS REST templates', () => {
  assert.equal(
    tileUrl({ z: 8, row: 50, col: 170 }, '2026-10-08'),
    'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/2026-10-08/250m/8/50/170.jpeg',
  )
  assert.equal(
    domainsUrl('2026-09-08', '2026-10-08'),
    'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/1.0.0/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/250m/all/2026-09-08--2026-10-08.xml',
  )
})

test('the LRU cache evicts the least recently used, but never what is in use', () => {
  const evicted: string[] = []
  const c = new LruCache<number>(3, (k) => evicted.push(k))
  c.set('a', 1)
  c.set('b', 2)
  c.set('c', 3)
  c.get('a') // a is now the most recent
  c.set('d', 4)
  assert.deepEqual(evicted, ['b'])
  c.set('e', 5, new Set(['c'])) // c is being drawn: skip it, evict the next oldest (a)
  assert.deepEqual(evicted, ['b', 'a'])
  assert.ok(c.has('c') && c.has('d') && c.has('e') && c.size === 3)
  c.clear()
  assert.equal(c.size, 0)
  assert.equal(evicted.length, 5)
})

test('moving fast caps the tile level, paused keeps full detail', () => {
  assert.equal(maxLevelForMotion(0), MAX_LEVEL)
  assert.equal(maxLevelForMotion(7.2), MAX_LEVEL) // ISS ground speed at 1x: 14 km in 2 s
  assert.equal(maxLevelForMotion(72), 7) // 10x: 144 km in 2 s, level 7 tiles are 250 km
  assert.equal(maxLevelForMotion(360), 5) // 50x: 720 km in 2 s
  assert.equal(maxLevelForMotion(360, 7), 5)
  assert.equal(maxLevelForMotion(10_000), 0)
})

test('edges feather only toward stand-ins or missing tiles, across the antimeridian, never past a pole', () => {
  const t = { z: 3, row: 1, col: 5 } // 54..18 N, 0..36 E
  const own = () => 'own' as TileSource
  assert.deepEqual(featherEdges(t, own), [false, false, false, false])
  // The western neighbour is an older day's copy, the southern one isn't loaded.
  const mixed = (lat: number, lon: number): TileSource => (lon < 0 ? 'standin' : lat < 18 ? 'none' : 'own')
  assert.deepEqual(featherEdges(t, mixed), [true, false, false, true])
  // Outside the view (undefined) never feathers.
  assert.deepEqual(featherEdges(t, () => undefined), [false, false, false, false])
  // The last column's eastern neighbour is column 0, across 180 degrees.
  const east = { z: 3, row: 1, col: matrixWidth(3) - 1 }
  const probes: number[] = []
  featherEdges(east, (_lat, lon) => (probes.push(lon), 'own'))
  assert.ok(probes.every((lon) => lon >= -180 && lon < 180))
  assert.deepEqual(featherEdges(east, (_lat, lon) => (lon < -170 ? 'none' : 'own')), [false, true, false, false])
  // The top row has nothing north of it: no feather there even if everything else is missing.
  assert.equal(featherEdges({ z: 3, row: 0, col: 2 }, () => 'none')[2], false)
})
