import { Link } from 'react-router-dom'
import OrbitIllustration from '../components/OrbitIllustration'
import PageHeader from '../components/PageHeader'
import { satelliteTool } from '../data/satelliteTool'
import { useSatelliteSummary } from '../hooks/useSatelliteSummary'
import './Home.css'

const credentials = ['DoD Secret Clearance', 'Physics — Cal State Northridge']

export default function Home() {
  const { state } = useSatelliteSummary()
  const summary = state.status === 'ready' ? state.summary : null
  const count = (n: number | undefined) => (n === undefined ? '—' : n.toLocaleString('en-US'))

  return (
    <main className="page">
      <div className="page-container">
        <PageHeader
          asideSize="narrow"
          asideFirst
          eyebrow="Aerospace engineer · Applied AI & data"
          title="Aerospace engineering, now pointed at data"
          lead="I spent 10+ years at Northrop Grumman and Joby Aviation making sure aircraft and spacecraft hit their mass, balance, and inertia targets, work that lives or dies on careful data handling and physics you can defend. Now I'm pointing that same rigor at applied AI and data engineering: building pipelines that are fast, transparent about their assumptions, and grounded in the real physics of the problem."
          aside={<OrbitIllustration />}
        >
          <div className="home-ctas">
            <Link to="/satellite-conjunction-screening" className="btn btn-primary">
              Open the Satellite POV Tool →
            </Link>
            <Link to="/resume" className="btn btn-secondary">
              Resume
            </Link>
          </div>
          <ul className="chip-list home-credentials" aria-label="Credentials">
            {credentials.map((c) => (
              <li key={c} className="chip">
                {c}
              </li>
            ))}
          </ul>
        </PageHeader>
      </div>

      <section className="page-container home-featured">
        <h2 className="eyebrow home-featured-label">Featured project</h2>
        <Link to="/satellite-conjunction-screening" className="card home-featured-card">
          <div>
            <h3 className="home-featured-title">{satelliteTool.name}</h3>
            <p className="home-featured-body">
              {satelliteTool.intro.join(' ')}
            </p>
            <ul className="chip-list">
              {satelliteTool.techStack.map((t) => (
                <li key={t} className="chip">
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <dl className="home-featured-stats">
            <div>
              <dt>Objects screened</dt>
              <dd>{count(summary?.objects_screened)}</dd>
            </div>
            <div>
              <dt>Conjunctions flagged</dt>
              <dd>{count(summary?.conjunctions_flagged)}</dd>
            </div>
          </dl>
          <span className="card-link">See the project →</span>
        </Link>
      </section>
    </main>
  )
}
