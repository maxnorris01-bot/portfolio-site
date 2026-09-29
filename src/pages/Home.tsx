import { Link } from 'react-router-dom'
import OrbitIllustration from '../components/OrbitIllustration'
import { satelliteTool } from '../data/satelliteTool'
import './Home.css'

const credentials = ['DoD Secret Clearance', 'Physics — Cal State Northridge']

export default function Home() {
  return (
    <main className="page">
      <section className="container home-hero">
        <div className="home-hero-copy">
          <p className="eyebrow">Aerospace engineer · Applied AI &amp; data</p>
          <h1 className="home-headline">
            Aerospace engineering, now pointed at data
          </h1>
          <p className="home-lede">
            I spent 10+ years at Northrop Grumman and Joby Aviation making sure
            aircraft and spacecraft hit their mass, balance, and inertia
            targets, work that lives or dies on careful data handling and
            physics you can defend. Now I'm pointing that same rigor at applied
            AI and data engineering: building pipelines that are fast,
            transparent about their assumptions, and grounded in the real
            physics of the problem.
          </p>
          <div className="home-ctas">
            <Link to="/satellite-conjunction-screening" className="btn btn-primary">
              View the screening tool →
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
        </div>
        <div className="home-hero-art">
          <OrbitIllustration />
        </div>
      </section>

      <section className="container home-featured">
        <h2 className="eyebrow home-featured-label">Featured project</h2>
        <Link to="/satellite-conjunction-screening" className="card home-featured-card">
          <div>
            <h3 className="home-featured-title">Satellite Conjunction Screening</h3>
            <p className="home-featured-body">
              Continuously screens public satellite tracking data for close
              approaches using real orbital mechanics. The core pipeline makes
              zero LLM calls.
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
              <dd>{satelliteTool.objectsScreened.toLocaleString('en-US')}</dd>
            </div>
            <div>
              <dt>Conjunctions flagged</dt>
              <dd>{satelliteTool.conjunctionsFlagged.toLocaleString('en-US')}</dd>
            </div>
          </dl>
          <span className="card-link">See the project →</span>
        </Link>
      </section>
    </main>
  )
}
