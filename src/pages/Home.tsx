import { useState } from 'react'
import PageHeader from '../components/PageHeader'
import SolarSystem, { type PlanetId } from '../components/SolarSystem'
import { HOME_CREDENTIALS, HOME_EYEBROW, HOME_PANELS, HOME_TITLE } from '../content/home'
import './Home.css'

export default function Home() {
  const [selected, setSelected] = useState<PlanetId>('background')
  const panel = HOME_PANELS.find((p) => p.id === selected) ?? HOME_PANELS[0]

  return (
    <main className="page">
      <div className="page-container">
        <PageHeader eyebrow={HOME_EYEBROW} title={HOME_TITLE}>
          <ul className="chip-list home-credentials" aria-label="Credentials">
            {HOME_CREDENTIALS.map((c) => (
              <li key={c} className="chip">
                {c}
              </li>
            ))}
          </ul>
        </PageHeader>

        <div className="home-stage">
          <div className="home-system">
            <SolarSystem selected={selected} onSelect={setSelected} />
          </div>

          <section className="card home-panel" aria-labelledby="home-panel-title">
            {/* Every panel is laid out, the others hidden, so the card keeps the height of the longest and nothing jumps when the choice changes. */}
            <div className="home-panel-stack">
              {HOME_PANELS.map((p) => (
                <div key={p.id} className="home-panel-sizer" aria-hidden="true">
                  <h2 className="home-panel-title">{p.label}</h2>
                  {p.paragraphs.map((t) => (
                    <p key={t}>{t}</p>
                  ))}
                </div>
              ))}
              <div className="home-panel-live" aria-live="polite" aria-atomic="true">
                <div key={panel.id} className="home-panel-content">
                  <h2 id="home-panel-title" className="home-panel-title">
                    {panel.label}
                  </h2>
                  {panel.paragraphs.map((t) => (
                    <p key={t}>{t}</p>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
