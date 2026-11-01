import { Link } from 'react-router-dom'
import { HOME_SLOT_LABEL, type Copy, type InfoPanel, type PlanetPanel } from '../content/home'

/** The full text, and where there is one a shorter version that a short window shows instead. */
function Text({ copy }: { copy: Copy }) {
  if (!copy.short) return <>{copy.text}</>
  return (
    <>
      <span className="home-full">{copy.text}</span>
      <span className="home-short">{copy.short}</span>
    </>
  )
}

/** Background or About this site: plain content, always on the page. */
export function HomeInfoCard({ panel }: { panel: InfoPanel }) {
  const titleId = `home-${panel.id}-title`
  return (
    <section className="card home-panel home-info" aria-labelledby={titleId}>
      <h2 id={titleId} className="home-panel-title">
        {panel.label}
      </h2>
      {panel.bullets && (
        <ul className="home-bullets">
          {panel.bullets.map((b) => (
            <li key={b.lead}>
              <strong>{b.lead}</strong> <Text copy={b} />
            </li>
          ))}
        </ul>
      )}
      {panel.paragraphs?.map((t) => (
        <p key={t.text}>
          <Text copy={t} />
        </p>
      ))}
    </section>
  )
}

function StripText({ panel }: { panel: PlanetPanel }) {
  const [first, ...rest] = panel.paragraphs
  return (
    <>
      <div className="home-zone">
        <h2 className="home-panel-title">{panel.label}</h2>
        <p>{first}</p>
      </div>
      <div className="home-zone">
        {rest.map((t) => (
          <p key={t}>{t}</p>
        ))}
      </div>
    </>
  )
}

/**
 * The strip for the chosen planet, in three zones: its heading and first sentence, the second sentence, and the link to
 * its page. Every planet's text is also laid out, hidden, in the same space, so the strip is as tall as the tallest and
 * choosing a planet never moves the page. A labelled region that announces its changes politely.
 */
export function HomePlanetSlot({ panel, all }: { panel: PlanetPanel; all: PlanetPanel[] }) {
  return (
    <section className="card home-panel home-slot" aria-label={HOME_SLOT_LABEL}>
      {all.map((p) => (
        <div key={p.id} className="home-slot-content home-slot-sizer" aria-hidden="true">
          <StripText panel={p} />
          <span className="btn btn-primary home-panel-link">{p.link.text}</span>
        </div>
      ))}
      <div className="home-slot-live" aria-live="polite" aria-atomic="true">
        <div key={panel.id} className="home-slot-content home-panel-content">
          <StripText panel={panel} />
          <Link to={panel.link.to} className="btn btn-primary home-panel-link">
            {panel.link.text}
          </Link>
        </div>
      </div>
    </section>
  )
}
