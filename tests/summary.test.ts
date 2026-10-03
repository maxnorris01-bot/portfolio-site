import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  BUCKET_URL,
  DEFAULT_LIMIT,
  GET,
  MAX_LIMIT,
  REPORT_URL,
  parseLimit,
  reportUrlFor,
  summarize,
  type Report,
  type RiskLevel,
} from '../api/satellite/summary.ts'

function obj(norad_id: number, active_payload: boolean) {
  return {
    norad_id,
    name: `OBJ ${norad_id}`,
    international_designator: '2020-001A',
    object_type: active_payload ? 'PAY' : 'DEB',
    ops_status: active_payload ? '+' : null,
    active_payload,
    satcat_owner: { code: 'US', name: 'United States' },
    source_groups: ['active'],
  }
}

function conj(risk_level: RiskLevel, miss_distance_km: number, active = false) {
  return {
    risk_level,
    risk_reason: 'test',
    tca_utc: '2026-10-02T12:00:00Z',
    miss_distance_km,
    relative_speed_km_s: 10,
    object_a: obj(1, active),
    object_b: obj(2, false),
    screening: { linear_estimate_miss_km: miss_distance_km },
  }
}

function report(conjunctions: ReturnType<typeof conj>[]): Report {
  return {
    schema_version: 3,
    run_id: 'run-1',
    generated_at_utc: '2026-10-02T04:03:55Z',
    window: { start_utc: '2026-10-02T04:03:00Z', end_utc: '2026-10-03T04:03:00Z' },
    parameters: { screening: { threshold_km: 5 } },
    scope: { objects_screened: 100 },
    summary: {
      conjunctions_flagged: conjunctions.length,
      by_risk_level: { high: 1, moderate: 1, low: 2 },
      co_located_pairs: 3,
    },
    conjunctions,
  } as Report
}

test('orders near misses by risk tier, then miss distance', () => {
  const s = summarize(
    report([conj('low', 0.1), conj('high', 0.9), conj('moderate', 0.2), conj('high', 0.3)]),
  )
  assert.deepEqual(
    s.near_misses.map((n) => [n.risk_level, n.miss_distance_km]),
    [
      ['high', 0.3],
      ['high', 0.9],
      ['moderate', 0.2],
      ['low', 0.1],
    ],
  )
})

test('carries counts through and trims object records', () => {
  const s = summarize(report([conj('high', 0.5, true)]))
  assert.equal(s.objects_screened, 100)
  assert.equal(s.threshold_km, 5)
  assert.equal(s.co_located_pairs, 3)
  assert.deepEqual(s.by_risk_level, { high: 1, moderate: 1, low: 2 })
  assert.deepEqual(s.near_misses[0].object_a, {
    norad_id: 1,
    name: 'OBJ 1',
    object_type: 'PAY',
    active_payload: true,
    owner: 'United States',
  })
  assert.equal('screening' in s.near_misses[0], false)
})

test('closest active approach ignores debris-only pairs', () => {
  const s = summarize(report([conj('low', 0.1), conj('moderate', 2.0, true)]))
  assert.equal(s.closest_active_approach_km, 2.0)
  assert.equal(summarize(report([conj('low', 0.1)])).closest_active_approach_km, null)
})

test('caps near misses at MAX_LIMIT', () => {
  const many = Array.from({ length: MAX_LIMIT + 50 }, (_, i) => conj('low', i))
  assert.equal(summarize(report(many)).near_misses.length, MAX_LIMIT)
})

test('parseLimit falls back to the default and clamps to the max', () => {
  assert.equal(parseLimit(null), DEFAULT_LIMIT)
  assert.equal(parseLimit('abc'), DEFAULT_LIMIT)
  assert.equal(parseLimit('0'), DEFAULT_LIMIT)
  assert.equal(parseLimit('10'), 10)
  assert.equal(parseLimit('100000'), MAX_LIMIT)
})

test('reportUrlFor maps ?date= to the dated report and rejects anything else', () => {
  assert.equal(reportUrlFor(null), REPORT_URL)
  assert.equal(reportUrlFor('2026-10-01'), `${BUCKET_URL}/reports/2026-10-01.json.gz`)
  for (const bad of ['', '2026-1-01', '../current', '2026-10-01/x', '2026-13-45']) {
    assert.equal(reportUrlFor(bad), undefined, bad)
  }
})

test('GET ?date= summarizes that day, 404s a missing day and 400s a bad date', async (t) => {
  const requested: string[] = []
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    requested.push(url)
    if (url.endsWith('2026-10-01.json.gz')) {
      return new Response(JSON.stringify(report([conj('high', 0.4)])), {
        headers: { etag: '"a"' },
      })
    }
    return new Response('missing', { status: 404 })
  })

  const ok = await GET(new Request('http://x/api/satellite/summary?date=2026-10-01&limit=5'))
  assert.equal(ok.status, 200)
  assert.equal((await ok.json()).near_misses.length, 1)
  assert.match(ok.headers.get('cache-control') ?? '', /s-maxage=86400/)
  assert.equal(requested[0], `${BUCKET_URL}/reports/2026-10-01.json.gz`)

  const missing = await GET(new Request('http://x/api/satellite/summary?date=2026-09-01'))
  assert.equal(missing.status, 404)

  const bad = await GET(new Request('http://x/api/satellite/summary?date=../../etc'))
  assert.equal(bad.status, 400)
  assert.equal(requested.length, 2)
})
