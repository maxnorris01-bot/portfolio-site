import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  EOX_ATTRIBUTION,
  EOX_GRID,
  EOX_LAYER,
  EOX_LEVEL_KM,
  EOX_MAX_LEVEL,
  eoxTileUrl,
  toneMap,
} from '../src/globe/eox.ts'
import {
  FailedTiles,
  GIBS_ACKNOWLEDGMENT,
  children,
  latLonToVec,
  matrixHeight,
  maxLevelForMotion,
  matrixWidth,
  parent,
  pickStandIn,
  roots,
  selectTiles,
  tileAt,
  tileBounds,
  tileVisible,
  type View,
} from '../src/globe/gibs.ts'
import {
  TODAY_IMAGERY_DEFAULT,
  TODAY_IMAGERY_NOTE,
  imageryCredits,
  imageryLine,
  type ImageryStatus,
} from '../src/globe/imagery.ts'
import { EOX_SOURCE, GIBS_SOURCE } from '../src/globe/earthTiles.ts'

const G = EOX_GRID

test('EOX WGS84 grid: 2^(z+1) x 2^z tiles of 180/2^z degrees, exactly covering the globe', () => {
  for (let z = 0; z <= EOX_MAX_LEVEL; z++) {
    assert.equal(matrixWidth(z, G), 2 ** (z + 1), `width z${z}`)
    assert.equal(matrixHeight(z, G), 2 ** z, `height z${z}`)
    // No partial edge tiles: the last column ends at 180 E, the last row at 90 S, unclipped.
    const last = tileBounds({ z, row: 2 ** z - 1, col: 2 ** (z + 1) - 1 }, G)
    assert.equal(last.full.east, 180)
    assert.equal(last.full.south, -90)
    assert.deepEqual(last.drawn, last.full)
  }
  assert.deepEqual(roots(G), [
    { z: 0, row: 0, col: 0 },
    { z: 0, row: 0, col: 1 },
  ])
  // Level 13 is the native ~10 m.
  assert.ok(Math.abs(EOX_LEVEL_KM(13) * 1000 - 9.55) < 0.05, `${EOX_LEVEL_KM(13) * 1000} m`)
})

test('EOX tiles meet exactly at every level: neighbours, the 180th meridian and the poles', () => {
  for (let z = 0; z <= EOX_MAX_LEVEL; z++) {
    const w = matrixWidth(z, G)
    const h = matrixHeight(z, G)
    // Neighbouring columns and rows share their edge exactly (no gap, no overlap).
    for (const c of [0, Math.floor(w / 2) - 1, w - 2].filter((x) => x >= 0)) {
      assert.equal(tileBounds({ z, row: 0, col: c }, G).full.east, tileBounds({ z, row: 0, col: c + 1 }, G).full.west)
    }
    for (const r of [0, Math.floor(h / 2) - 1, h - 2].filter((x) => x >= 0)) {
      assert.equal(tileBounds({ z, row: r, col: 0 }, G).full.south, tileBounds({ z, row: r + 1, col: 0 }, G).full.north)
    }
    // Across the antimeridian: column 0 starts at 180 W, the last column ends at 180 E.
    assert.equal(tileBounds({ z, row: 0, col: 0 }, G).full.west, -180)
    assert.equal(tileAt(10, 180, z, G).col, w - 1)
    assert.equal(tileAt(10, -180, z, G).col, 0)
    assert.equal(tileAt(10, 179.999999, z, G).col, w - 1)
    // Poles: the first and last rows, whose edges are exactly 90 N and 90 S.
    assert.equal(tileAt(90, 30, z, G).row, 0)
    assert.equal(tileAt(-90, 30, z, G).row, h - 1)
    assert.equal(tileBounds({ z, row: 0, col: 0 }, G).full.north, 90)
    // Every point lies inside its tile.
    for (const [lat, lon] of [[37.8, -122.3], [30.8, 31], [-89.99, 179.99], [89.99, -179.99], [0, 0]]) {
      const b = tileBounds(tileAt(lat, lon, z, G), G).full
      assert.ok(lon >= b.west && lon <= b.east && lat <= b.north && lat >= b.south, `${lat},${lon} z${z}`)
    }
  }
  // Children nest in their parent, four each.
  const t = { z: 5, row: 9, col: 41 }
  const kids = children(t, G)
  assert.equal(kids.length, 4)
  for (const k of kids) assert.deepEqual(parent(k), t)
})

test('EOX URLs use the 2016 layer only', () => {
  assert.equal(EOX_LAYER, 's2cloudless')
  assert.equal(
    eoxTileUrl({ z: 13, row: 2375, col: 2625 }),
    'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless/default/WGS84/13/2375/2625.jpg',
  )
  // Never a later (CC BY-NC-SA) edition.
  for (const later of ['s2cloudless-2018', 's2cloudless-2024', 's2cloudless-2025', 's2cloudless-2024_3857']) {
    assert.throws(() => eoxTileUrl({ z: 1, row: 0, col: 0 }, later))
  }
  assert.equal(EOX_SOURCE.url({ z: 2, row: 1, col: 3 }, 'any'), eoxTileUrl({ z: 2, row: 1, col: 3 }))
})

const issDown = (latDeg: number, lonDeg: number, fovDeg: number): View => {
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

test('level selection on the EOX grid: coarse when wide, native level 13 when close, within the caps', () => {
  const levels = (fov: number, caps = EOX_SOURCE.desktop) =>
    selectTiles(issDown(37.8, -122.3, fov), { maxLevel: caps.maxLevel, maxTiles: caps.maxTiles, grid: G })
  const wide = levels(120)
  const close = levels(1)
  assert.ok(Math.max(...wide.map((t) => t.z)) < Math.max(...close.map((t) => t.z)))
  assert.equal(Math.max(...close.map((t) => t.z)), 13)
  assert.equal(Math.max(...levels(1, EOX_SOURCE.phone).map((t) => t.z)), 12) // phones stop a level earlier
  for (const fov of [120, 60, 30, 10, 3, 1]) {
    const ts = levels(fov)
    assert.ok(ts.length <= EOX_SOURCE.desktop.maxTiles, `fov ${fov}: ${ts.length} tiles`)
    for (const t of ts) assert.ok(tileVisible(t, issDown(37.8, -122.3, fov), G))
  }
  // The tile under the camera is in the set at the finest level.
  const nadir = tileAt(37.8, -122.3, 13, G)
  assert.ok(close.some((t) => t.z === 13 && t.row === nadir.row && t.col === nadir.col))
})

test('caps: phones lower than desktop for both layers', () => {
  for (const s of [EOX_SOURCE, GIBS_SOURCE]) {
    for (const k of ['maxLevel', 'cacheTiles', 'concurrent', 'maxTiles', 'requestsPerSec'] as const) {
      assert.ok(s.phone[k] <= s.desktop[k], `${s.key}.${k}`)
    }
    assert.ok(s.phone.cacheTiles < s.desktop.cacheTiles)
  }
  assert.equal(EOX_SOURCE.overlay, false)
  assert.equal(GIBS_SOURCE.overlay, true)
  assert.ok(GIBS_SOURCE.renderOrderBase > EOX_SOURCE.renderOrderBase + 3 * 13 + 2) // overlay always above the base
  // Live (1x) at the ISS's ground speed: EOX still reaches level 12, GIBS its finest (8).
  assert.equal(maxLevelForMotion(7.2, EOX_SOURCE.desktop.maxLevel, EOX_SOURCE.holdSec, G), 12)
  assert.equal(maxLevelForMotion(0, EOX_SOURCE.desktop.maxLevel, EOX_SOURCE.holdSec, G), 13)
  assert.equal(maxLevelForMotion(7.2, GIBS_SOURCE.desktop.maxLevel, GIBS_SOURCE.holdSec), 8)
})

test('fallback: a missing or failed tile shows its nearest loaded ancestor, never a hole', () => {
  const deep = tileAt(46.6, 8, 13, G) // the Alps, level 13
  assert.deepEqual(tileAt(46.6, 8, 3, G), { z: 3, row: 1, col: 8 })
  const loaded = new Set(['fixed|0/0/1', 'fixed|3/1/8'])
  // The nearest loaded ancestor (level 3), not the coarser root.
  assert.equal(pickStandIn(deep, 'fixed', null, (id) => loaded.has(id)), 'fixed|3/1/8')
  loaded.delete('fixed|3/1/8')
  assert.equal(pickStandIn(deep, 'fixed', null, (id) => loaded.has(id)), 'fixed|0/0/1')
  assert.equal(pickStandIn(deep, 'fixed', null, () => false), null) // nothing yet: the 2K texture shows
  // Dated layers prefer the same tile from the previous date.
  const both = new Set(['2026-10-08|5/3/7', '2026-10-09|4/1/3'])
  assert.equal(pickStandIn({ z: 5, row: 3, col: 7 }, '2026-10-09', '2026-10-08', (id) => both.has(id)), '2026-10-08|5/3/7')
  // A failed tile waits out its retry delay (one request a minute, not one per frame).
  const failed = new FailedTiles(60_000)
  failed.mark('fixed|13/1975/8555', 1000)
  assert.equal(failed.blocked('fixed|13/1975/8555', 1000 + 59_999), true)
  assert.equal(failed.blocked('fixed|13/1975/8555', 1000 + 60_000), false)
  assert.equal(failed.blocked('fixed|13/1975/8555', 1000 + 60_001), false) // forgotten once retried
  assert.equal(failed.blocked('fixed|13/0/0', 0), false)
})

const status = (o: Partial<ImageryStatus> = {}): ImageryStatus => ({
  base: { date: null, state: 'ok', drawn: 30 },
  overlay: null,
  ...o,
})

test('"Today\'s imagery" is off by default; the panel line follows the layer state', () => {
  assert.equal(TODAY_IMAGERY_DEFAULT, false)
  assert.equal(TODAY_IMAGERY_NOTE, 'Daily mosaic; swath edges are visible.')
  assert.equal(imageryLine(status()), 'Imagery: Sentinel-2 cloudless, 2016 composite')
  assert.equal(
    imageryLine(status({ overlay: { date: '2026-10-09', state: 'ok', drawn: 12 } })),
    'Imagery: 2026-10-09 (NASA GIBS)',
  )
  assert.equal(imageryLine(status({ overlay: { date: null, state: 'starting', drawn: 0 } })), 'Imagery: loading…')
  assert.equal(
    imageryLine(status({ base: { date: null, state: 'offline', drawn: 0 } })),
    'Imagery unavailable right now: showing the built-in Earth texture.',
  )
})

test('attribution: EOX while its tiles are visible, NASA GIBS only while the overlay is on', () => {
  assert.equal(
    EOX_ATTRIBUTION,
    'Sentinel-2 cloudless - https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016)',
  )
  assert.deepEqual(imageryCredits('globe', status()), []) // no EOX tiles outside the satellite view
  assert.deepEqual(imageryCredits('sky', status()), [])
  assert.deepEqual(imageryCredits('pov', null), [])
  assert.deepEqual(imageryCredits('pov', status({ base: { date: null, state: 'starting', drawn: 0 } })), [])
  assert.deepEqual(imageryCredits('pov', status()), [EOX_ATTRIBUTION])
  assert.deepEqual(imageryCredits('pov', status({ overlay: { date: '2026-10-09', state: 'ok', drawn: 9 } })), [
    EOX_ATTRIBUTION,
    GIBS_ACKNOWLEDGMENT.replace(/\.$/, ''),
  ])
})

test('EOX tone calibration: typical land keeps the 2K brightness, deserts no longer clip under the day gain', () => {
  // Linear luminances measured on the level-0 tiles and the bundled 2K texture.
  assert.ok(Math.abs(toneMap(0.079) - 0.092) < 0.002) // land median: EOX -> 2K
  assert.ok(Math.abs(toneMap(0.814) - 0.4) < 0.01) // Sahara mean: EOX -> GIBS level
  // Even pure white stays below 1 after the lit side's 1.6x gain.
  assert.ok(toneMap(1) * 1.6 < 0.8)
  assert.deepEqual(GIBS_SOURCE.tone, [1, 1]) // GIBS unchanged
})
