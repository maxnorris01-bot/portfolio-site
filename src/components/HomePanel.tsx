import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { HOME_SLOT_LABEL, type Copy, type InfoPanel, type PlanetPanel } from '../content/home'

/** The text, and where there is one a compact cut that a short window shows instead (Home.css). */
function Text({ copy }: { copy: Copy }) {
  if (!copy.compact) return <>{copy.text}</>
  return (
    <>
      <span className="home-full">{copy.text}</span>
      <span className="home-compact">{copy.compact}</span>
    </>
  )
}

/** Background or About this site: label | text rows with a hairline between them, always on the page. */
export function HomeInfoCard({ panel }: { panel: InfoPanel }) {
  const titleId = `home-${panel.id}-title`
  return (
    <section className={`card home-panel home-info home-info-${panel.id}`} style={{ '--rows': panel.bullets.length } as CSSProperties} aria-labelledby={titleId}>
      <h2 id={titleId} className="home-panel-title">
        {panel.label}
      </h2>
      <ul className="home-rows">
        {panel.bullets.map((b) => (
          <li key={b.lead} className={`home-row${b.compactHide ? ' home-row-full-only' : ''}`}>
            <strong className="home-row-label">{b.lead}</strong>
            <span className="home-row-text">
              <Text copy={b} />
            </span>
          </li>
        ))}
      </ul>
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
            <p key={t.text}>
              <Text copy={t} />
            </p>
          ))}
        </div>
      </div>
    </section>
  )
}
