import { satelliteTool, type RiskLevel } from '../data/satelliteTool'
import './SatelliteTool.css'

const fmt = (n: number) => n.toLocaleString('en-US')

const stats = [
  { value: fmt(satelliteTool.objectsScreened), label: 'objects screened' },
  { value: fmt(satelliteTool.conjunctionsFlagged), label: 'conjunctions flagged' },
  {
    value: `${satelliteTool.closestActiveApproachKm} km`,
    label: 'closest active-satellite approach',
  },
  {
    value: `${satelliteTool.kdTreeSpeedup}×`,
    label: 'faster screening after the KD-tree swap',
  },
]

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

export default function SatelliteTool() {
  const { riskBreakdown } = satelliteTool
  const totalRisk = riskLevels.reduce((sum, { level }) => sum + riskBreakdown[level], 0)

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

        <section className="sat-section" aria-labelledby="sat-results">
          <h2 id="sat-results" className="section-title">
            Latest run
          </h2>
          <dl className="sat-stats">
            {stats.map(({ value, label }) => (
              <div key={label} className="card sat-stat">
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="sat-section" aria-labelledby="sat-risk">
          <h2 id="sat-risk" className="section-title">
            Risk breakdown
          </h2>
          <div className="card">
            <ul className="sat-risk-bars">
              {riskLevels.map(({ level, label }) => {
                const count = riskBreakdown[level]
                const pct = totalRisk ? (count / totalRisk) * 100 : 0
                return (
                  <li key={level} className="sat-risk-row">
                    <span className="sat-risk-label">{label}</span>
                    <span className="sat-risk-track">
                      <span
                        className={`sat-risk-fill risk-${level}`}
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                    <span className="sat-risk-count">{fmt(count)}</span>
                  </li>
                )
              })}
            </ul>
            <p className="sat-callout">
              <strong>No high-risk conjunction has been observed yet</strong> at
              this scope. Risk tiers are a stated heuristic, not a true
              probability of collision.
            </p>
          </div>
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
          <p className="sat-note">
            Scaling test: the pipeline has also been run against{' '}
            {fmt(satelliteTool.scalingTestObjects)} tracked objects.
          </p>
        </section>
      </div>
    </main>
  )
}
