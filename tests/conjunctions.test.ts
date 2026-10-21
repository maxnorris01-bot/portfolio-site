import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { NearMiss } from '../api/satellite/summary.ts'
import { CLOSEST_COUNT, summarize, type Report } from '../api/satellite/summary.ts'
import { CONJUNCTION_ROWS, closestRows, rankClosest, relativeTime } from '../src/globe/conjunctions.ts'

const obj = (id: number, name: string) => ({ norad_id: id, name, object_type: null, active_payload: true, owner: null })
const nm = (miss: number, tca: string, risk: NearMiss['risk_level'] = 'low'): NearMiss => ({
  risk_level: risk, risk_reason: '', tca_utc: tca, miss_distance_km: miss, relative_speed_km_s: 7,
  object_a: obj(1, `A${miss}`), object_b: obj(2, `B${miss}`),
})

test('the list is ranked by miss distance, smallest first, whatever the risk tier, and holds ten rows', () => {
  assert.equal(CONJUNCTION_ROWS, 10)
  const list = [nm(3, '2026-10-21T01:00:00Z', 'high'), nm(0.5, '2026-10-21T02:00:00Z', 'low'), nm(2, '2026-10-21T03:00:00Z', 'moderate'), nm(0.1, '2026-10-21T04:00:00Z', 'low')]
  assert.deepEqual(rankClosest(list).map((n) => n.miss_distance_km), [0.1, 0.5, 2, 3])
  const many = Array.from({ length: 40 }, (_, i) => nm(40 - i, '2026-10-21T00:00:00Z'))
  const top = rankClosest(many)
  assert.equal(top.length, 10)
  assert.deepEqual(top.map((n) => n.miss_distance_km), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
})

test('ties go to the earlier closest approach, and the input is not changed', () => {
  const a = nm(1, '2026-10-21T05:00:00Z')
  const b = nm(1, '2026-10-21T01:00:00Z')
  const input = [a, b]
  assert.deepEqual(rankClosest(input), [b, a])
  assert.deepEqual(input, [a, b])
})

test('rows come from the server\'s own closest list, or from the near misses of an older response', () => {
  const closest = [nm(0.2, '2026-10-21T00:00:00Z'), nm(0.1, '2026-10-21T00:00:00Z')]
  assert.deepEqual(closestRows({ near_misses: [nm(9, '2026-10-21T00:00:00Z')], closest_approaches: closest }).map((n) => n.miss_distance_km), [0.1, 0.2])
  assert.deepEqual(closestRows({ near_misses: [nm(9, '2026-10-21T00:00:00Z'), nm(4, '2026-10-21T00:00:00Z')] }).map((n) => n.miss_distance_km), [4, 9])
  assert.deepEqual(closestRows({ near_misses: [], closest_approaches: [] }), [])
})

test('the summary carries the closest approaches over every conjunction, not just the top of the risk ordering', () => {
  const conj = (miss: number, risk: 'high' | 'moderate' | 'low', i: number) => ({
    risk_level: risk, risk_reason: '', tca_utc: `2026-10-21T00:${String(i).padStart(2, '0')}:00Z`, miss_distance_km: miss, relative_speed_km_s: 1,
    object_a: { norad_id: i, name: `A${i}`, object_type: null, active_payload: false, satcat_owner: null },
    object_b: { norad_id: 1000 + i, name: `B${i}`, object_type: null, active_payload: false, satcat_owner: null },
  })
  // A "low" tier conjunction that is the closest of all.
  const report = {
    schema_version: 3, run_id: 'r', generated_at_utc: '2026-10-20T00:00:00Z',
    window: { start_utc: 'a', end_utc: 'b' }, parameters: { screening: { threshold_km: 5 } }, scope: { objects_screened: 10 },
    summary: { conjunctions_flagged: 14, by_risk_level: { high: 1, moderate: 0, low: 13 }, co_located_pairs: 0 },
    conjunctions: [conj(4, 'high', 0), ...Array.from({ length: 13 }, (_, i) => conj(i === 5 ? 0.01 : 3 + i, 'low', i + 1))],
  } as unknown as Report
  const s = summarize(report)
  assert.equal(CLOSEST_COUNT, 10)
  assert.equal(s.closest_approaches.length, 10)
  assert.equal(s.closest_approaches[0].miss_distance_km, 0.01)
  assert.deepEqual(s.closest_approaches.map((n) => n.miss_distance_km), [...s.closest_approaches.map((n) => n.miss_distance_km)].sort((a, b) => a - b))
  assert.equal(s.near_misses[0].risk_level, 'high', 'the table keeps its risk-tier ordering')
})

test('relative times read as "in 3 h 20 min", "42 min ago" and "now"', () => {
  assert.equal(relativeTime(3 * 3600000 + 20 * 60000), 'in 3 h 20 min')
  assert.equal(relativeTime(-42 * 60000), '42 min ago')
  assert.equal(relativeTime(2 * 3600000), 'in 2 h')
  assert.equal(relativeTime(20000), 'now')
  assert.equal(relativeTime(-26 * 3600000), '26 h ago')
})

test('the dropdown: a toggle button with aria-expanded, closing on Escape, outside clicks and a row choice', () => {
  const tsx = readFileSync(new URL('../src/components/ConjunctionsMenu.tsx', import.meta.url), 'utf8')
  assert.match(tsx, /aria-expanded=\{open\}/)
  assert.match(tsx, /aria-controls=\{listId\}/)
  assert.match(tsx, /Show conjunctions/)
  assert.match(tsx, /e\.key === 'Escape'/)
  assert.match(tsx, /document\.addEventListener\('pointerdown'/)
  assert.match(tsx, /onSelect\(n\)\n\s+close\(false\)/)
  const page = readFileSync(new URL('../src/pages/SatelliteTool.tsx', import.meta.url), 'utf8')
  assert.match(page, /rows=\{tableSummary \? closestRows\(tableSummary\) : null\}/)
  assert.match(page, /onSelect=\{replay\}/)
})
