import { Link } from 'react-router-dom'
import type { HomePanel } from '../content/home'

/** The Home page's card: the chosen planet's heading and text, and a link to its page when it has one. */
export default function HomePanelCard({ panel }: { panel: HomePanel }) {
  return (
    <section className="card home-panel" aria-labelledby="home-panel-title">
      <div aria-live="polite" aria-atomic="true">
        <div key={panel.id} className="home-panel-content">
          <h2 id="home-panel-title" className="home-panel-title">
            {panel.label}
          </h2>
          {panel.paragraphs.map((t) => (
            <p key={t}>{t}</p>
          ))}
          {panel.link && (
            <Link to={panel.link.to} className="btn btn-primary home-panel-link">
              {panel.link.text}
            </Link>
          )}
        </div>
      </div>
    </section>
  )
}
