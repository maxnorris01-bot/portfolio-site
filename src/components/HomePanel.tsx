import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { HOME_SLOT_LABEL, type InfoPanel, type PlanetPanel } from '../content/home'

/** Background or About this site: plain content, always on the page. */
export function HomeInfoCard({ panel }: { panel: InfoPanel }) {
  const titleId = `home-${panel.id}-title`
  const rows = panel.bullets
  return (
    <section className={`card home-panel home-info home-info-${panel.id}`} aria-labelledby={titleId}>
      <h2 id={titleId} className="home-panel-title">
        {panel.label}
      </h2>
      {rows && (
        <ul className="home-rows" style={{ '--rows': rows.map((b) => `${b.lines}fr`).join(' ') } as CSSProperties}>
          {rows.map((b) => (
            <li key={b.lead} className="home-row">
              <strong className="home-row-label">{b.lead}</strong>
              <span className="home-row-text">{b.text}</span>
            </li>
          ))}
        </ul>
      )}
      {panel.paragraphs?.map((t) => (
        <p key={t} className="home-lead">
          {t}
        </p>
      ))}
    </section>
  )
}

/**
 * The card for the chosen planet: its name on the left and the link to its page on the right, on one line, then its two
 * sentences. As tall as its own text. A labelled region that announces its changes politely.
 */
export function HomePlanetSlot({ panel }: { panel: PlanetPanel }) {
  return (
    <section className="card home-panel home-slot" aria-label={HOME_SLOT_LABEL}>
      <div className="home-slot-live" aria-live="polite" aria-atomic="true">
        <div key={panel.id} className="home-panel-content">
          <div className="home-slot-head">
            <h2 className="home-panel-title">{panel.label}</h2>
            <Link to={panel.link.to} className="btn btn-primary home-panel-link">
              {panel.link.text}
            </Link>
          </div>
          {panel.paragraphs.map((t) => (
            <p key={t}>{t}</p>
          ))}
        </div>
      </div>
    </section>
  )
}
