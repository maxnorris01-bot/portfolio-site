import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NAME_GROUPS, OTHER_GROUP, STATIONS, groupOf } from '../src/globe/groups.ts'
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

test('nearestTo finds the closest other object and skips invalid ones', () => {
  const pos = new Float64Array([0, 0, 0, 10, 0, 0, 3, 4, 0, 1, 0, 0])
  assert.deepEqual(nearestTo(pos, 0, () => true), { index: 3, distance: 1 })
  assert.deepEqual(nearestTo(pos, 0, (i) => i !== 3), { index: 2, distance: 5 })
  assert.equal(nearestTo(new Float64Array([1, 2, 3]), 0, () => true), null)
})
