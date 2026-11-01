import { Link } from 'react-router-dom'
import { HOME_HINT, HOME_SLOT_LABEL, type InfoPanel, type PlanetPanel } from '../content/home'

/** Background or Site Info: plain content, always on the page. */
export function HomeInfoCard({ panel }: { panel: InfoPanel }) {
  const titleId = `home-${panel.id}-title`
  return (
    <section className="card home-panel home-info" aria-labelledby={titleId}>
      <div className="home-panel-content is-still">
        <h2 id={titleId} className="home-panel-title">
          {panel.label}
        </h2>
        {panel.paragraphs.map((t) => (
          <p key={t}>{t}</p>
        ))}
      </div>
    </section>
  )
}

/**
 * The strip for the chosen planet (its text, and a link to its page on the right); a hint while no planet is chosen, in
 * the same strip. A labelled region that announces its changes politely.
 */
export function HomePlanetSlot({ panel }: { panel: PlanetPanel | null }) {
  return (
    <section className="card home-panel home-slot" aria-label={HOME_SLOT_LABEL}>
      <div aria-live="polite" aria-atomic="true">
        <div key={panel?.id ?? 'hint'} className="home-panel-content home-slot-content">
          {panel ? (
            <>
              <div className="home-slot-text">
                <h2 className="home-panel-title">{panel.label}</h2>
                {panel.paragraphs.map((t) => (
                  <p key={t}>{t}</p>
                ))}
              </div>
              <Link to={panel.link.to} className="btn btn-primary home-panel-link">
                {panel.link.text}
              </Link>
            </>
          ) : (
            <p className="home-hint">{HOME_HINT}</p>
          )}
        </div>
      </div>
    </section>
  )
}
