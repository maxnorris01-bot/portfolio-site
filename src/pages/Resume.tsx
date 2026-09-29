import { Link } from 'react-router-dom'
import './Resume.css'

const skills = [
  'Python',
  'SciPy',
  'SGP4',
  'Orbital Mechanics',
  'Data Pipelines',
  'Mass Properties',
]

// Placeholder content until the final resume copy is ready.
const experience = [
  {
    title: 'Senior Mass Properties Engineer',
    company: 'Joby Aviation',
    dates: '[dates]',
    bullets: [
      '[Add specific achievement bullet]',
      '[Add specific achievement bullet]',
      '[Add specific achievement bullet]',
    ],
  },
  {
    title: 'Mass Properties Engineer',
    company: 'Northrop Grumman',
    dates: '[dates]',
    bullets: [
      '[Add specific achievement bullet]',
      '[Add specific achievement bullet]',
      '[Add specific achievement bullet]',
    ],
  },
]

export default function Resume() {
  return (
    <main className="page">
      <div className="container">
        <article className="resume">
          <aside className="resume-rail">
            <h1 className="resume-name">Max Norris</h1>
            <p className="resume-title">
              Aerospace Engineer · Applied AI &amp; Data Engineering
            </p>

            <dl className="resume-facts">
              <div>
                <dt>Location</dt>
                <dd>
                  Santa Cruz, CA
                  <br />
                  Open to Oregon / Washington
                </dd>
              </div>
              <div>
                <dt>Clearance</dt>
                <dd>DoD Secret</dd>
              </div>
              <div>
                <dt>Education</dt>
                <dd>
                  Physics
                  <br />
                  Cal State Northridge
                </dd>
              </div>
            </dl>

            <h2 className="resume-rail-heading">Skills</h2>
            <ul className="chip-list resume-skills">
              {skills.map((s) => (
                <li key={s} className="chip">
                  {s}
                </li>
              ))}
            </ul>

            <a href="#" className="btn resume-download">
              Download PDF
            </a>
          </aside>

          <div className="resume-main">
            <section>
              <h2 className="section-title">Experience</h2>
              <ol className="resume-jobs">
                {experience.map((job) => (
                  <li key={job.company} className="resume-job">
                    <div className="resume-job-header">
                      <h3>{job.title}</h3>
                      <span className="resume-job-dates">{job.dates}</span>
                    </div>
                    <p className="resume-job-company">{job.company}</p>
                    <ul className="resume-job-bullets">
                      {job.bullets.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </section>

            <section className="resume-projects">
              <h2 className="section-title">Applied AI Projects</h2>
              <Link to="/satellite-conjunction-screening" className="card resume-project-card">
                <h3>Satellite Conjunction Screening</h3>
                <p>
                  Continuously screens public satellite tracking data for close
                  approaches using real orbital mechanics. The core pipeline
                  makes zero LLM calls.
                </p>
                <span className="card-link">View project →</span>
              </Link>
            </section>
          </div>
        </article>
      </div>
    </main>
  )
}
