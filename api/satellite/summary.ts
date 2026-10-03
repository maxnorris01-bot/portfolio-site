// GET /api/satellite/summary
//
// Reads the screening pipeline's full report (reports/current.json, ~78 MB at
// full-catalog scope) from the public Tigris bucket server-side and returns a
// small summary: risk-level counts plus the top-N conjunctions. The full report
// is far over Vercel's ~4.5 MB response cap, so it is never passed through.
// See satellite-conjunction-screening's ADR 0010 (amendment).
//
// `?date=YYYY-MM-DD` summarizes that day's retained report
// (reports/<date>.json.gz, ADR 0011) instead, for the globe's time slider.
//
// This file is self-contained (no relative imports) so it runs unchanged on
// Vercel, under the Vite dev middleware, and under `node --test`.

export const BUCKET_URL = 'https://satellite-conjunction-screening.fly.storage.tigris.dev'
export const REPORT_URL = `${BUCKET_URL}/reports/current.json`

export const SUMMARY_SCHEMA_VERSION = 1
export const DEFAULT_LIMIT = 25
export const MAX_LIMIT = 200

export type RiskLevel = 'high' | 'moderate' | 'low'

const RISK_ORDER: Record<RiskLevel, number> = { high: 0, moderate: 1, low: 2 }

// The subset of the pipeline's report this function reads (report schema v3).
interface ReportObject {
  norad_id: number
  name: string
  object_type: string | null
  active_payload: boolean
  satcat_owner: { code: string; name: string } | null
}

interface ReportConjunction {
  risk_level: RiskLevel
  risk_reason: string
  tca_utc: string
  miss_distance_km: number
  relative_speed_km_s: number
  object_a: ReportObject
  object_b: ReportObject
}

export interface Report {
  schema_version: number
  run_id: string
  generated_at_utc: string
  window: { start_utc: string; end_utc: string }
  parameters: { screening: { threshold_km: number } }
  scope: { objects_screened: number }
  summary: {
    conjunctions_flagged: number
    by_risk_level: Record<RiskLevel, number>
    co_located_pairs: number
  }
  conjunctions: ReportConjunction[]
}

export interface SummaryObject {
  norad_id: number
  name: string
  object_type: string | null
  active_payload: boolean
  owner: string | null
}

export interface NearMiss {
  risk_level: RiskLevel
  risk_reason: string
  tca_utc: string
  miss_distance_km: number
  relative_speed_km_s: number
  object_a: SummaryObject
  object_b: SummaryObject
}

export interface SatelliteSummary {
  schema_version: number
  report_schema_version: number
  run_id: string
  generated_at_utc: string
  window: { start_utc: string; end_utc: string }
  threshold_km: number
  objects_screened: number
  conjunctions_flagged: number
  by_risk_level: Record<RiskLevel, number>
  co_located_pairs: number
  closest_active_approach_km: number | null
  near_misses: NearMiss[]
}

function trimObject(o: ReportObject): SummaryObject {
  return {
    norad_id: o.norad_id,
    name: o.name,
    object_type: o.object_type,
    active_payload: o.active_payload,
    owner: o.satcat_owner?.name ?? null,
  }
}

// Builds the summary with up to MAX_LIMIT near misses, ordered by risk tier and
// then miss distance (the pipeline's own priority order, re-applied here rather
// than trusted from the file).
export function summarize(report: Report): SatelliteSummary {
  const conjunctions = report.conjunctions
  let closestActive: number | null = null
  for (const c of conjunctions) {
    if (c.object_a.active_payload || c.object_b.active_payload) {
      if (closestActive === null || c.miss_distance_km < closestActive) {
        closestActive = c.miss_distance_km
      }
    }
  }

  const nearMisses = [...conjunctions]
    .sort(
      (a, b) =>
        RISK_ORDER[a.risk_level] - RISK_ORDER[b.risk_level] ||
        a.miss_distance_km - b.miss_distance_km,
    )
    .slice(0, MAX_LIMIT)
    .map((c) => ({
      risk_level: c.risk_level,
      risk_reason: c.risk_reason,
      tca_utc: c.tca_utc,
      miss_distance_km: c.miss_distance_km,
      relative_speed_km_s: c.relative_speed_km_s,
      object_a: trimObject(c.object_a),
      object_b: trimObject(c.object_b),
    }))

  return {
    schema_version: SUMMARY_SCHEMA_VERSION,
    report_schema_version: report.schema_version,
    run_id: report.run_id,
    generated_at_utc: report.generated_at_utc,
    window: { start_utc: report.window.start_utc, end_utc: report.window.end_utc },
    threshold_km: report.parameters.screening.threshold_km,
    objects_screened: report.scope.objects_screened,
    conjunctions_flagged: report.summary.conjunctions_flagged,
    by_risk_level: report.summary.by_risk_level,
    co_located_pairs: report.summary.co_located_pairs,
    closest_active_approach_km: closestActive,
    near_misses: nearMisses,
  }
}

export function parseLimit(raw: string | null): number {
  const n = raw === null ? DEFAULT_LIMIT : Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT
  return Math.min(n, MAX_LIMIT)
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Returns the report URL for `?date=` (null when absent), or undefined when
// the value isn't a YYYY-MM-DD date. The strict pattern also keeps arbitrary
// input out of the bucket path.
export function reportUrlFor(date: string | null): string | undefined {
  if (date === null) return REPORT_URL
  if (!DATE_RE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return undefined
  return `${BUCKET_URL}/reports/${date}.json.gz`
}

class NotFoundError extends Error {}

// Kept per warm function instance and per report URL; the bucket's ETag tells
// us when a new daily run has replaced a report, so a warm instance skips the
// download. Dated reports are served with Content-Encoding: gzip, which fetch
// decompresses transparently.
const cache = new Map<string, { etag: string; summary: SatelliteSummary }>()

async function loadSummary(url: string): Promise<SatelliteSummary> {
  const cached = cache.get(url)
  const headers: Record<string, string> = {}
  if (cached) headers['If-None-Match'] = cached.etag
  const res = await fetch(url, { headers })
  if (res.status === 304 && cached) return cached.summary
  if (res.status === 404) throw new NotFoundError(url)
  if (!res.ok) throw new Error(`report fetch failed: HTTP ${res.status}`)
  const summary = summarize((await res.json()) as Report)
  const etag = res.headers.get('etag')
  if (etag) cache.set(url, { etag, summary })
  return summary
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams
  const limit = parseLimit(params.get('limit'))
  const date = params.get('date')
  const url = reportUrlFor(date)
  if (url === undefined) {
    return Response.json(
      { error: 'date must be YYYY-MM-DD.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }
  try {
    const summary = await loadSummary(url)
    return Response.json(
      { ...summary, near_misses: summary.near_misses.slice(0, limit) },
      {
        headers: {
          // current.json changes once a day; a dated report never changes.
          'Cache-Control':
            date === null
              ? 'public, s-maxage=3600, stale-while-revalidate=86400'
              : 'public, s-maxage=86400, stale-while-revalidate=604800',
        },
      },
    )
  } catch (err) {
    if (err instanceof NotFoundError) {
      return Response.json(
        { error: `No retained report for ${date}.` },
        { status: 404, headers: { 'Cache-Control': 'public, s-maxage=300' } },
      )
    }
    console.error(err)
    return Response.json(
      { error: 'Could not load the latest screening report.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
