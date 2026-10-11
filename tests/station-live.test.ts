import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { propagate, twoline2satrec } from 'satellite.js'
import { STATIONS, viewpointFor } from '../src/globe/groups.ts'

// Station records exactly as the live objects/current.json had them on
// 2026-10-10 (names, NORAD IDs, TLE lines, order among other objects).
const live = JSON.parse(
  readFileSync(new URL('./fixtures/objects-stations-2026-10-10.json', import.meta.url), 'utf8'),
) as { generated_at_utc: string; objects: { norad_id: number; name: string; tle_line1: string; tle_line2: string }[] }
const objects = live.objects
const at = (id: number) => objects.findIndex((o) => o.norad_id === id)

test('live data: each Stations chip has a viewpoint (the toggle and "View from here" depend on it)', () => {
  const iss = STATIONS.find((s) => s.key === 'iss')!
  const css = STATIONS.find((s) => s.key === 'css')!
  assert.equal(viewpointFor({ satellite: null, station: iss }, objects), at(25544))
  assert.equal(viewpointFor({ satellite: null, station: css }, objects), at(48274))
  // The chip's pieces: what the station panel counts.
  assert.equal(objects.filter((o) => iss.match(o.name)).length, 5)
  assert.equal(objects.filter((o) => css.match(o.name)).length, 3)
})

test('live data: every station piece rides the core module; visitors and free-flyers ride themselves', () => {
  for (const o of objects) {
    const vp = viewpointFor({ satellite: objects.indexOf(o), station: null }, objects)
    const want = o.name.startsWith('ISS (') ? at(25544) : o.name.startsWith('CSS (') ? at(48274) : objects.indexOf(o)
    assert.equal(vp, want, o.name)
  }
})

test('live data: the core modules parse and propagate as the engine does it', () => {
  const t = new Date(Date.parse(live.generated_at_utc) + 6 * 3600e3)
  for (const id of [25544, 48274]) {
    const o = objects[at(id)]
    const rec = twoline2satrec(o.tle_line1, o.tle_line2)
    assert.equal(rec.error, 0, o.name)
    const pv = propagate(rec, t)
    assert.ok(pv && pv.position && typeof pv.position !== 'boolean', o.name)
    const r = Math.hypot(pv.position.x, pv.position.y, pv.position.z)
    assert.ok(r > 6600 && r < 6900, `${o.name} radius ${r}`) // a ~300-500 km orbit
  }
})
