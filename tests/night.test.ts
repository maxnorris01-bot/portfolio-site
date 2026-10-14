import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NIGHT_LAYER, NIGHT_SOURCE, NIGHT_TIME } from '../src/globe/earthTiles.ts'
import {
  NIGHT_STREAM_KM_PER_PX,
  latLonToVec,
  nightStreamWorthIt,
  selectTiles,
  tileAt,
  tileFullyLit,
  type View,
} from '../src/globe/gibs.ts'
import { GIBS_ACKNOWLEDGMENT } from '../src/globe/gibs.ts'
import { imageryCredits, type ImageryStatus } from '../src/globe/imagery.ts'

test('night lights: the fixed 2016 Black Marble product on the 500m grid, level 7 at most', () => {
  assert.equal(NIGHT_LAYER, 'VIIRS_Black_Marble')
  assert.equal(NIGHT_TIME, '2016-01-01') // an annual composite, not a daily one
  assert.equal(NIGHT_SOURCE.dated, false)
  assert.equal(NIGHT_SOURCE.additive, true)
  assert.equal(
    NIGHT_SOURCE.url({ z: 7, row: 21, col: 47 }, 'ignored'),
    'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/VIIRS_Black_Marble/default/2016-01-01/500m/7/21/47.png',
  )
  // GIBS has no level 8 for this layer: selection never asks for one.
  assert.equal(NIGHT_SOURCE.grid.maxLevel, 7)
  const r = 1 + 420 / 6378.137
  const n = latLonToVec(40.7, -74)
  const view: View = {
    cam: [n[0] * r, n[1] * r, n[2] * r],
    dir: [-n[0], -n[1], -n[2]],
    fovDeg: 1,
    halfDiagDeg: 1,
    screenPx: 576,
  }
  const tiles = selectTiles(view, { maxLevel: NIGHT_SOURCE.desktop.maxLevel, grid: NIGHT_SOURCE.grid })
  assert.equal(Math.max(...tiles.map((t) => t.z)), 7)
  // Phones fetch less of a heavy (300 kB) PNG layer.
  assert.ok(NIGHT_SOURCE.phone.maxLevel < NIGHT_SOURCE.desktop.maxLevel)
  assert.ok(NIGHT_SOURCE.phone.cacheTiles < NIGHT_SOURCE.desktop.cacheTiles)
})

test('tiles fully in daylight are skipped; dark and twilight ones are kept', () => {
  const sun = latLonToVec(0, 0) // the Sun over the equator at longitude 0
  // The sub-solar tile: the whole tile far above the horizon.
  assert.equal(tileFullyLit(tileAt(0, 0, 4), sun), true)
  // The anti-solar tile, and one on the terminator: kept.
  assert.equal(tileFullyLit(tileAt(0, 180, 4), sun), false)
  assert.equal(tileFullyLit(tileAt(0, 90, 4), sun), false)
  // A big tile that straddles the terminator is kept even if its centre is lit.
  assert.equal(tileFullyLit(tileAt(0, 40, 0), sun), false)
})

test('NASA\'s acknowledgment shows while the night lights are on screen, even with Today\'s imagery off', () => {
  const base: ImageryStatus = { base: { date: null, state: 'ok', drawn: 20 }, overlay: null }
  assert.ok(!imageryCredits('pov', base).includes(GIBS_ACKNOWLEDGMENT.replace(/\.$/, '')))
  const withNight: ImageryStatus = { ...base, night: { date: null, state: 'ok', drawn: 6 } }
  assert.ok(imageryCredits('pov', withNight).includes(GIBS_ACKNOWLEDGMENT.replace(/\.$/, '')))
  // Started but nothing drawn yet (all daylight): no acknowledgment needed.
  const idle: ImageryStatus = { ...base, night: { date: null, state: 'ok', drawn: 0 } }
  assert.ok(!imageryCredits('pov', idle).includes(GIBS_ACKNOWLEDGMENT.replace(/\.$/, '')))
})

test('the streamed lights wait until a screen pixel is finer than the bundled texture can show', () => {
  // The 2K night texture is ~19.6 km per pixel; wide views are as sharp without the tiles.
  assert.equal(nightStreamWorthIt(27), false) // GEO at 25 degrees
  assert.equal(nightStreamWorthIt(NIGHT_STREAM_KM_PER_PX + 0.1), false)
  assert.equal(nightStreamWorthIt(NIGHT_STREAM_KM_PER_PX), true)
  assert.equal(nightStreamWorthIt(0.5), true)
  // Looking straight down from 420 km at 30 degrees on a 576 px view is 0.5 km per pixel...
  const km = (2 * 420 * Math.tan((15 * Math.PI) / 180)) / 576
  assert.ok(nightStreamWorthIt(km))
  // ...and at the ISS's widest 120 degrees about 1.5 km at the centre, still worth it; GEO's whole disc is not.
  assert.ok(nightStreamWorthIt((2 * 420 * Math.tan((60 * Math.PI) / 180)) / 576))
  assert.equal(nightStreamWorthIt((2 * 35786 * Math.tan((12.5 * Math.PI) / 180)) / 576), false)
})
