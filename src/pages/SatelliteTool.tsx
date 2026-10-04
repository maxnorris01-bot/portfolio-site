import { Suspense, lazy, useCallback, useRef, useState } from 'react'
import type { NearMiss, RiskLevel, SatelliteSummary } from '../../api/satellite/summary'
import type { DatasetKey, FocusRequest } from '../globe/types'
import { satelliteTool } from '../data/satelliteTool'
import { useSatelliteSummary } from '../hooks/useSatelliteSummary'
import './SatelliteTool.css'

// three.js and satellite.js load with the globe, on this route only.
const SatelliteGlobe = lazy(() => import('../components/SatelliteGlobe'))

const fmt = (n: number) => n.toLocaleString('en-US')
const km = (n: number) => `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} km`
const utc = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  })

const riskLevels: { level: RiskLevel; label: string }[] = [
  { level: 'high', label: 'High' },
  { level: 'moderate', label: 'Moderate' },
  { level: 'low', label: 'Low' },
]

const pipeline = [
  { name: 'Fetch', detail: 'Pull current orbital elements from CelesTrak.' },
  { name: 'Propagate', detail: 'Step every object forward in time with SGP4.' },
  { name: 'Screen', detail: 'Find close pairs with a scipy cKDTree spatial index.' },
  { name: 'Assess', detail: 'Assign each conjunction a heuristic risk tier.' },
  { name: 'Report', detail: 'Write the flagged conjunctions to a report.' },
]

function statsFor(summary: SatelliteSummary | null) {
  const placeholder = '—'
  return [
    {
      value: summary ? fmt(summary.objects_screened) : placeholder,
      label: 'objects screened',
    },
    {
      value: summary ? fmt(summary.conjunctions_flagged) : placeholder,
      label: 'conjunctions flagged',
    },
    {
      // The tile says "closest approach"; the note under the tiles says it's
      // the closest approach involving an active satellite.
      value:
        summary?.closest_active_approach_km != null
          ? km(summary.closest_active_approach_km)
          : placeholder,
      label: 'closest approach',
    },
  ]
}

function RiskBreakdown({ summary }: { summary: SatelliteSummary }) {
  const { by_risk_level: counts } = summary
  const total = riskLevels.reduce((sum, { level }) => sum + counts[level], 0)

  return (
    <div className="card">
      <ul className="sat-risk-bars">
        {riskLevels.map(({ level, label }) => {
          const count = counts[level]
          const pct = total ? (count / total) * 100 : 0
          return (
            <li key={level} className="sat-risk-row">
              <span className="sat-risk-label">{label}</span>
              <span className="sat-risk-track">
                <span className={`sat-risk-fill risk-${level}`} style={{ width: `${pct}%` }} />
              </span>
              <span className="sat-risk-count">{fmt(count)}</span>
            </li>
          )
        })}
      </ul>
      <p className="sat-callout">
        {counts.high > 0 ? (
          <strong>
            {fmt(counts.high)} high-risk conjunction{counts.high === 1 ? '' : 's'} in this run.
          </strong>
        ) : (
          <strong>No high-risk conjunctions in this run.</strong>
        )}{' '}
        Risk tiers are a stated heuristic, not a true probability of collision.
      </p>
    </div>
  )
}

const nearMissKey = (n: NearMiss) => `${n.object_a.norad_id}-${n.object_b.norad_id}-${n.tca_utc}`

const missKm = (km: number) =>
  `${km.toLocaleString('en-US', { maximumFractionDigits: km < 1 ? 3 : 2 })} km`

// The top conjunctions as a native select: each option carries the table's
// information (rank, both objects, miss distance, risk tier). Choosing one
// replays it on the globe; the current replay shows as selected, and the
// placeholder returns when the selection is cleared.
function ConjunctionPicker({
  summary,
  status,
  snapshot,
  selectedKey,
  onSelect,
}: {
  summary: SatelliteSummary | null
  status: 'loading' | 'error' | 'ready'
  snapshot: string | null
  selectedKey: string | null
  onSelect: (n: NearMiss) => void
}) {
  const options = summary?.near_misses ?? []
  const selected = options.some((n) => nearMissKey(n) === selectedKey) ? selectedKey! : ''
  return (
    <div className="sat-picker">
      <label htmlFor="sat-conjunction-select" className="sat-picker-label">
        Top conjunctions{snapshot ? ` · ${snapshot} snapshot` : ''}
      </label>
      <select
        id="sat-conjunction-select"
        className="sat-picker-select"
        value={selected}
        disabled={!summary}
        onChange={(e) => {
          const n = options.find((o) => nearMissKey(o) === e.target.value)
          if (n) onSelect(n)
        }}
      >
        <option value="" disabled>
          {status === 'error'
            ? 'Conjunctions couldn’t be loaded'
            : summary
              ? 'Select to show on Globe'
              : 'Loading conjunctions…'}
        </option>
        {options.map((n, i) => (
          <option key={nearMissKey(n)} value={nearMissKey(n)}>
            {`${i + 1}. ${n.object_a.name} × ${n.object_b.name} · ${missKm(n.miss_distance_km)} · ${n.risk_level}`}
          </option>
        ))}
      </select>
      {summary && (
        <p className="sat-picker-note">
          Top {options.length} of {fmt(summary.conjunctions_flagged)}, ranked by risk tier, then
          miss distance.
        </p>
      )}
    </div>
  )
}

export default function SatelliteTool() {
  const { state, retry } = useSatelliteSummary()
  const summary = state.status === 'ready' ? state.summary : null

  // The near-miss table follows the snapshot the globe is showing: the latest
  // run, or a retained day's report while the slider is in the past.
  const [globeDataset, setGlobeDataset] = useState<DatasetKey>('current')
  const pastDate = globeDataset === 'current' ? null : globeDataset
  const past = useSatelliteSummary({ date: pastDate, enabled: pastDate !== null })
  const tableState = pastDate ? past.state : state
  const tableSummary = tableState.status === 'ready' ? tableState.summary : null

  const [focus, setFocus] = useState<(FocusRequest & { key: string }) | null>(null)
  const globeRef = useRef<HTMLElement>(null)
  const exitFocus = useCallback(() => setFocus(null), [])

  const replay = (n: NearMiss) => {
    setFocus({
      key: nearMissKey(n),
      datasetKey: globeDataset,
      aId: n.object_a.norad_id,
      bId: n.object_b.norad_id,
      aName: n.object_a.name,
      bName: n.object_b.name,
      tcaUtc: n.tca_utc,
      missKm: n.miss_distance_km,
    })
    globeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <main className="page">
      <div className="container">
        <header className="sat-header">
          <div className="sat-eyebrow-row">
            <p className="eyebrow">Project · Applied AI &amp; data engineering</p>
            <ul className="chip-list sat-tech" aria-label="Tech stack">
              {satelliteTool.techStack.map((t) => (
                <li key={t} className="chip">
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="sat-title-row">
            <h1 className="sat-title">Satellite Conjunction Screening</h1>
            <a
              href={satelliteTool.repoUrl}
              className="btn btn-secondary"
              target="_blank"
              rel="noreferrer"
            >
              View on GitHub ↗
            </a>
          </div>
          <p className="sat-lede">
            Continuously screens public satellite tracking data for close
            approaches using real orbital mechanics. The core pipeline makes
            zero LLM calls.
          </p>
        </header>

        <div className="sat-overview">
          <section aria-labelledby="sat-results" aria-busy={state.status === 'loading'}>
            <h2 id="sat-results" className="section-title">
              Latest run
            </h2>
            {state.status === 'error' && (
              <div className="sat-callout sat-error" role="alert">
                <p>The latest screening results couldn&apos;t be loaded right now.</p>
                <button type="button" className="btn btn-secondary" onClick={retry}>
                  Try again
                </button>
              </div>
            )}
            <dl className={`sat-stats${state.status === 'loading' ? ' is-loading' : ''}`}>
              {statsFor(summary).map(({ value, label }) => (
                <div key={label} className="card sat-stat">
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            {summary && (
              <p className="sat-note">
                Screened {utc(summary.generated_at_utc)} over the following 24 hours, flagging
                passes under {summary.threshold_km} km. Closest approach is the nearest pass
                involving an active satellite. Runs daily on Fly.io.
              </p>
            )}
          </section>

          <section aria-labelledby="sat-risk">
            <h2 id="sat-risk" className="section-title">
              Risk breakdown
            </h2>
            {summary ? (
              <RiskBreakdown summary={summary} />
            ) : (
              <div className="card sat-risk-placeholder">
                {state.status === 'error' ? '—' : 'Loading…'}
              </div>
            )}
          </section>
        </div>

        <section ref={globeRef} className="sat-section sat-globe-section" aria-label="Globe of every tracked object">
          <Suspense fallback={<div className="sat-globe-fallback">Loading the globe…</div>}>
            <SatelliteGlobe
              focus={focus}
              onExitFocus={exitFocus}
              onDatasetChange={setGlobeDataset}
              conjunctionsFlagged={summary?.conjunctions_flagged}
              sideTop={
                <ConjunctionPicker
                  summary={tableSummary}
                  status={tableState.status}
                  snapshot={pastDate}
                  selectedKey={focus?.key ?? null}
                  onSelect={replay}
                />
              }
            />
          </Suspense>
        </section>

        <section className="sat-section" aria-labelledby="sat-pipeline">
          <h2 id="sat-pipeline" className="section-title">
            Pipeline
          </h2>
          <ol className="sat-pipeline">
            {pipeline.map(({ name, detail }, i) => (
              <li key={name} className="sat-step">
                <span className="sat-step-num">{String(i + 1).padStart(2, '0')}</span>
                <h3>{name}</h3>
                <p>{detail}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  )
}
