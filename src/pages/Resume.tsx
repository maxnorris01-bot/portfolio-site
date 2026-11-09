import { Link } from 'react-router-dom'
import './Resume.css'
import { usePageMeta } from '../hooks/usePageMeta'

const PAGE_TITLE = 'Résumé — Max Norris'
const PAGE_DESCRIPTION =
  'Résumé of Max Norris: applied AI and data engineer with an aerospace background.'

const profile =
  'Engineer with 10+ years in aerospace (Northrop Grumman, Joby Aviation) moving into applied AI and data engineering. Has built and shipped LLM-powered products, including a live shopping-search agent with an evaluation harness and spending controls, and a daily satellite close-approach screening pipeline. Brings a decade of data-model, forecasting and standards-driven reporting work on safety-critical programs.'

const education = [
  'M.Sc. Physics, Cal State Northridge, 2014',
  'B.Sc. Astrophysics, Cal State Northridge, 2012',
]

const skills = [
  'LLM Apps & Agents',
  'Evaluation & Testing',
  'Data Pipelines & Databases',
  'Technical Documentation',
  'Mass Properties (ANSI S-120A, SAWE RP 7/8)',
]

const tools = [
  'Python',
  'TypeScript',
  'React',
  'Anthropic API',
  'PostgreSQL',
  'pytest',
  'GitHub Actions',
  'Fly.io',
  'Vercel',
  'MATLAB',
  'Phoenix Integration',
  'CAD (NX / CATIA)',
]

const projects: {
  title: string
  bullets: string[]
  link?: { to: string; label: string }
}[] = [
  {
    title: 'ShopAI: LLM shopping-search agent',
    bullets: [
      'Shipped an agent that retrieves Google Shopping results, ranks them with Claude, and re-ranks on user ratings ("Shop Again"); Python service on Fly.io with Postgres, React/TypeScript front end on Vercel',
      'Built a live evaluation harness with an LLM judge (checked for self-agreement), regression cases, and cost and latency gates; 1,700+ automated tests',
      'Added per-session, per-visitor and daily spending caps so a public demo stays within budget',
    ],
    link: { to: '/shop', label: 'Open ShopAI' },
  },
  {
    title: 'Satellite Point-of-View Tool',
    bullets: [
      'Daily screening of public tracking data for satellite close approaches using SGP4 propagation and scipy cKDTree spatial search; no LLM calls in the core',
      'Interactive 3D viewer (three.js) with Hipparcos and Gaia star catalogues',
    ],
    link: { to: '/satellite-conjunction-screening', label: 'View project' },
  },
]

type Bullet = { text: string; sub?: string[] }

const experience: { title: string; company: string; dates: string; bullets: Bullet[] }[] = [
  {
    title: 'Senior / Lead Mass Properties Engineer',
    company: 'Joby Aviation',
    dates: 'March 2022 – Present',
    bullets: [
      {
        text: 'Responsible for Weight and CG management for S4 Program',
        sub: ['IPT mass target development', 'Program mass tracking, reporting, forecasting', 'Mass reduction effort coordination'],
      },
      {
        text: 'Mass Properties process development and execution',
        sub: ['Database development, ANSI-S120A implementation', 'Mass Properties Reporting per SAWE-PR7/8'],
      },
      {
        text: 'Flight Test and Operations support',
        sub: [
          'Authored the Weight and Balance Manual and Mass Properties portions of Aircraft Flight Manual / Pilot Operating Handbook',
          'Produced aircraft weighing procedures, introduced the use of Form B / F, Chart A / C / E',
        ],
      },
    ],
  },
  {
    title: 'Mass Properties Engineer',
    company: 'Northrop Grumman',
    dates: 'January 2015 – March 2022',
    bullets: [
      {
        text: 'One of main focal points for Conceptual Design Mass Properties within Advanced Flight Sciences Division',
        sub: ['Advanced Design / Parametric Weight Estimation', 'MDO Mass Properties Lead', 'Contributed to multiple contract captures'],
      },
      {
        text: 'Extensive Detailed Design Experience',
        sub: ['Weight & CG Management, Reporting, Forecasting', 'Database Development & Management'],
      },
      {
        text: 'Production Vehicle Mass Properties Experience',
        sub: ['F/A-18, F-35A/B/C, Other'],
      },
    ],
  },
]

export default function Resume() {
  usePageMeta(PAGE_TITLE, PAGE_DESCRIPTION)

  return (
    <main className="page">
      <div className="page-container is-scaled">
        <article className="resume">
          <aside className="resume-rail">
            <h1 className="resume-name">Max Norris</h1>
            <p className="resume-title">
              Applied AI &amp; Data Engineer · Aerospace background
            </p>

            <dl className="resume-facts">
              <div>
                <dt>Location</dt>
                <dd>Santa Cruz, CA</dd>
              </div>
              <div>
                <dt>Clearance</dt>
                <dd>Active DoD Secret</dd>
              </div>
              <div>
                <dt>Education</dt>
                <dd>
                  {education.map((e) => (
                    <span key={e} className="resume-fact-line">
                      {e}
                    </span>
                  ))}
                </dd>
              </div>
              <div>
                <dt>Links</dt>
                <dd>
                  <a href="https://github.com/maxnorris01-bot" className="resume-link">
                    github.com/maxnorris01-bot
                  </a>
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

            <h2 className="resume-rail-heading resume-rail-heading-tools">Tools</h2>
            <ul className="chip-list resume-skills">
              {tools.map((t) => (
                <li key={t} className="chip">
                  {t}
                </li>
              ))}
            </ul>

            <a
              href="/Max_Norris_Resume.pdf"
              download
              className="btn resume-download"
            >
              Download PDF
            </a>
          </aside>

          <div className="resume-main">
            <section>
              <h2 className="section-title">Profile</h2>
              <p className="resume-profile">{profile}</p>
            </section>

            <section>
              <h2 className="section-title">Applied AI Projects</h2>
              <ol className="resume-jobs">
                {projects.map((p) => (
                  <li key={p.title} className="resume-job">
                    <div className="resume-job-header">
                      <h3>{p.title}</h3>
                    </div>
                    <ul className="resume-job-bullets">
                      {p.bullets.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                    {p.link && (
                      <Link to={p.link.to} className="card-link resume-project-link">
                        {p.link.label} →
                      </Link>
                    )}
                  </li>
                ))}
              </ol>
            </section>

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
                      {job.bullets.map((b) => (
                        <li key={b.text}>
                          {b.text}
                          {b.sub && (
                            <ul className="resume-job-sub">
                              {b.sub.map((t) => (
                                <li key={t}>{t}</li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </article>
      </div>
    </main>
  )
}
