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
      value:
        summary?.closest_active_approach_km != null
          ? km(summary.closest_active_approach_km)
          : placeholder,
      label: 'closest active-satellite approach',
    },
    {
      value: `${satelliteTool.kdTreeSpeedup}×`,
      label: 'faster screening after the KD-tree swap',
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

function objectLabel(o: NearMiss['object_a']) {
  return `${o.name} (${o.norad_id})`
}

const nearMissKey = (n: NearMiss) => `${n.object_a.norad_id}-${n.object_b.norad_id}-${n.tca_utc}`

function NearMissList({
  summary,
  selectedKey,
  onSelect,
}: {
  summary: SatelliteSummary
  selectedKey: string | null
  onSelect: (n: NearMiss) => void
}) {
  return (
    <div className="card sat-table-wrap">
      <table className="sat-table">
        <thead>
          <tr>
            <th scope="col">Risk</th>
            <th scope="col">Objects</th>
            <th scope="col" className="num">
              Miss
            </th>
            <th scope="col" className="num">
              Rel. speed
            </th>
            <th scope="col">Closest approach</th>
            <th scope="col">
              <span className="visually-hidden">Replay</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {summary.near_misses.map((n) => {
            const key = nearMissKey(n)
            return (
              <tr
                key={key}
                className={`sat-row${key === selectedKey ? ' is-selected' : ''}`}
                onClick={() => onSelect(n)}
              >
                <td>
                  <span className={`sat-risk-tag risk-${n.risk_level}`}>{n.risk_level}</span>
                </td>
                <td className="sat-pair">
                  <span>{objectLabel(n.object_a)}</span>
                  <span>{objectLabel(n.object_b)}</span>
                </td>
                <td className="num">{km(n.miss_distance_km)}</td>
                <td className="num">{n.relative_speed_km_s.toFixed(1)} km/s</td>
                <td>{utc(n.tca_utc)}</td>
                <td>
                  <button
                    type="button"
                    className="sat-replay"
                    aria-pressed={key === selectedKey}
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelect(n)
                    }}
                  >
                    Show on globe
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
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
          <p className="eyebrow">Project · Applied AI &amp; data engineering</p>
          <h1 className="sat-title">Satellite Conjunction Screening</h1>
          <p className="sat-lede">
            Continuously screens public satellite tracking data for close
            approaches using real orbital mechanics. The core pipeline makes
            zero LLM calls.
          </p>
          <ul className="chip-list sat-tech" aria-label="Tech stack">
            {satelliteTool.techStack.map((t) => (
              <li key={t} className="chip">
                {t}
              </li>
            ))}
          </ul>
          <a
            href={satelliteTool.repoUrl}
            className="btn btn-secondary"
            target="_blank"
            rel="noreferrer"
          >
            View on GitHub ↗
          </a>
        </header>

        <section ref={globeRef} className="sat-section" aria-labelledby="sat-globe">
          <h2 id="sat-globe" className="section-title">
            Every tracked object
          </h2>
          <Suspense fallback={<div className="sat-globe-fallback">Loading the globe…</div>}>
            <SatelliteGlobe
              focus={focus}
              onExitFocus={exitFocus}
              onDatasetChange={setGlobeDataset}
            />
          </Suspense>
        </section>

        <section className="sat-section" aria-labelledby="sat-results" aria-busy={state.status === 'loading'}>
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
              passes under {summary.threshold_km} km. Runs daily on Fly.io.
            </p>
          )}
        </section>

        {summary && (
          <>
            <section className="sat-section" aria-labelledby="sat-risk">
              <h2 id="sat-risk" className="section-title">
                Risk breakdown
              </h2>
              <RiskBreakdown summary={summary} />
            </section>

          </>
        )}

        <section className="sat-section" aria-labelledby="sat-near-misses">
          <h2 id="sat-near-misses" className="section-title">
            Top conjunctions{pastDate ? ` · ${pastDate} snapshot` : ''}
          </h2>
          {tableSummary ? (
            <>
              <NearMissList
                summary={tableSummary}
                selectedKey={focus?.key ?? null}
                onSelect={replay}
              />
              <p className="sat-note">
                Top {tableSummary.near_misses.length} of{' '}
                {fmt(tableSummary.conjunctions_flagged)}, ranked by risk tier, then miss distance.
                Select one to replay it on the globe at its closest approach.
              </p>
            </>
          ) : (
            <p className="sat-note" role={tableState.status === 'error' ? 'alert' : undefined}>
              {tableState.status === 'error'
                ? 'These conjunctions couldn’t be loaded right now.'
                : 'Loading conjunctions…'}
            </p>
          )}
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
