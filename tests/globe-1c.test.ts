import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NAME_GROUPS, OTHER_GROUP, STATIONS, groupOf, stationViewpoint, viewpointFor } from '../src/globe/groups.ts'
import { nearestTo } from '../src/globe/neighbors.ts'

test('specific debris groups win over their broader prefixes', () => {
  assert.equal(groupOf('IRIDIUM 33 DEB'), 'iridium33deb')
  assert.equal(groupOf('IRIDIUM 105'), 'iridium')
  assert.equal(groupOf('COSMOS 2251 DEB'), 'cosmos2251deb')
  assert.equal(groupOf('COSMOS 2542'), OTHER_GROUP)
  assert.equal(groupOf('FENGYUN 1C DEB'), 'fengyun1cdeb')
  assert.equal(groupOf('FENGYUN 3E'), OTHER_GROUP) // a working weather satellite, not ASAT debris
})

test('constellations match by name prefix only', () => {
  assert.equal(groupOf('STARLINK-1007'), 'starlink')
  assert.equal(groupOf('ONEWEB-0012'), 'oneweb')
  assert.equal(groupOf('KUIPER-00001'), 'kuiper')
  assert.equal(groupOf('NAVSTAR 81 (USA 319)'), 'navstar')
  assert.equal(groupOf('LEMUR-2-HUBBLE-4'), OTHER_GROUP)
  assert.ok(NAME_GROUPS.every((g) => g.key !== OTHER_GROUP))
})

test('stations select their modules, not objects that merely contain the letters', () => {
  const iss = STATIONS.find((s) => s.key === 'iss')!
  const css = STATIONS.find((s) => s.key === 'css')!
  for (const n of ['ISS (ZARYA)', 'ISS (UNITY)', 'ISS (NAUKA)']) assert.ok(iss.match(n), n)
  // Free-flying objects released from the ISS, and unrelated names, are excluded.
  for (const n of ['ISS OBJECT YM', 'SWISSCUBE', 'AISSAT 4', 'OUTPOST MISSION 2']) {
    assert.ok(!iss.match(n), n)
  }
  for (const n of ['CSS (TIANHE)', 'CSS (WENTIAN)', 'CSS (MENGTIAN)']) assert.ok(css.match(n), n)
})

test('a station is viewed from its core module, whatever order the snapshot lists its pieces in', () => {
  const iss = STATIONS.find((s) => s.key === 'iss')!
  const css = STATIONS.find((s) => s.key === 'css')!
  const objects = [
    { name: 'ISS OBJECT YM', norad_id: 60000 },
    { name: 'ISS (NAUKA)', norad_id: 49044 },
    { name: 'CSS (WENTIAN)', norad_id: 53239 },
    { name: 'ISS (UNITY)', norad_id: 25575 },
    { name: 'CSS (TIANHE)', norad_id: 48274 },
    { name: 'ISS (ZARYA)', norad_id: 25544 },
  ]
  assert.equal(objects[stationViewpoint(iss, objects)!].name, 'ISS (ZARYA)')
  assert.equal(objects[stationViewpoint(css, objects)!].name, 'CSS (TIANHE)')
  // Core module missing from a snapshot: the oldest tracked piece, never a free-flyer.
  const noZarya = objects.filter((o) => o.norad_id !== 25544)
  assert.equal(noZarya[stationViewpoint(iss, noZarya)!].name, 'ISS (UNITY)')
  // Not in the snapshot at all.
  assert.equal(stationViewpoint(css, [{ name: 'ISS (ZARYA)', norad_id: 25544 }]), null)
})

test('the satellite view rides the selected satellite, else the selected station', () => {
  const iss = STATIONS.find((s) => s.key === 'iss')!
  const objects = [
    { name: 'STARLINK-1007', norad_id: 44713 },
    { name: 'ISS (ZARYA)', norad_id: 25544 },
  ]
  assert.equal(viewpointFor({ satellite: 0, station: null }, objects), 0)
  assert.equal(viewpointFor({ satellite: null, station: iss }, objects), 1)
  assert.equal(viewpointFor({ satellite: 0, station: iss }, objects), 0) // never both, but a pick wins
  assert.equal(viewpointFor({ satellite: null, station: null }, objects), null)
  assert.equal(viewpointFor({ satellite: null, station: iss }, null), null) // no snapshot yet
})

test('picking any piece of a station by its dot rides the core module; other objects ride themselves', () => {
  const objects = [
    { name: 'STARLINK-1007', norad_id: 44713 },
    { name: 'ISS (NAUKA)', norad_id: 49044 },
    { name: 'ISS (ZARYA)', norad_id: 25544 },
    { name: 'CSS (WENTIAN)', norad_id: 53239 },
    { name: 'CSS (TIANHE)', norad_id: 48274 },
    { name: 'CYGNUS NG-24', norad_id: 64001 }, // a visiting vehicle: its own object
  ]
  assert.equal(viewpointFor({ satellite: 1, station: null }, objects), 2) // NAUKA -> ZARYA
  assert.equal(viewpointFor({ satellite: 2, station: null }, objects), 2) // ZARYA itself
  assert.equal(viewpointFor({ satellite: 3, station: null }, objects), 4) // WENTIAN -> TIANHE
  assert.equal(viewpointFor({ satellite: 5, station: null }, objects), 5)
  assert.equal(viewpointFor({ satellite: 0, station: null }, objects), 0)
})

test('a conjunction pair involving a station can be viewed from the station; other pairs cannot', () => {
  const objects = [
    { name: 'JACKAL X-1L-001', norad_id: 65001 },
    { name: 'ISS (NAUKA)', norad_id: 49044 },
    { name: 'ISS (ZARYA)', norad_id: 25544 },
    { name: 'FENGYUN 1C DEB', norad_id: 30413 },
    { name: 'IRIDIUM 105', norad_id: 43838 },
  ]
  assert.equal(viewpointFor({ satellite: null, station: null, pair: [1, 0] }, objects), 2)
  assert.equal(viewpointFor({ satellite: null, station: null, pair: [0, 1] }, objects), 2)
  assert.equal(viewpointFor({ satellite: null, station: null, pair: [3, 4] }, objects), null) // as before
  assert.equal(viewpointFor({ satellite: null, station: null, pair: [0, null] }, objects), null) // B not in snapshot
})

test('nearestTo finds the closest other object and skips invalid ones', () => {
  const pos = new Float64Array([0, 0, 0, 10, 0, 0, 3, 4, 0, 1, 0, 0])
  assert.deepEqual(nearestTo(pos, 0, () => true), { index: 3, distance: 1 })
  assert.deepEqual(nearestTo(pos, 0, (i) => i !== 3), { index: 2, distance: 5 })
  assert.equal(nearestTo(new Float64Array([1, 2, 3]), 0, () => true), null)
})
