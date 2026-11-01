import { useState } from 'react'
import { HomeInfoCard, HomePlanetSlot } from '../components/HomePanel'
import PageHeader from '../components/PageHeader'
import SolarSystem from '../components/SolarSystem'
import { HOME_CREDENTIALS, HOME_DEFAULT_PLANET, HOME_INFO, HOME_PLANETS, HOME_TITLE, type PlanetId } from '../content/home'
import './Home.css'

export default function Home() {
  // A planet is chosen from the start, so the strip is never empty; choosing the chosen one again does nothing.
  const [selected, setSelected] = useState<PlanetId>(HOME_DEFAULT_PLANET)
  const panel = HOME_PLANETS.find((p) => p.id === selected) ?? HOME_PLANETS[0]

  return (
    <main className="page home-page">
      <div className="page-container">
        <PageHeader
          title={HOME_TITLE}
          titleMeta={
            <ul className="chip-list home-tags" aria-label="Credentials">
              {HOME_CREDENTIALS.map((c) => (
                <li key={c} className="chip">
                  {c}
                </li>
              ))}
            </ul>
          }
        />

        {/* In reading order: the two cards, the system, then the planet's strip. From 1280px, row 1 is the system (49% of the content width)
            beside the cards (49%), 2% apart and 32% of the width tall; the strip is full width under it. */}
        <div className="home-grid">
          <div className="home-info-col">
            {HOME_INFO.map((p) => (
              <HomeInfoCard key={p.id} panel={p} />
            ))}
          </div>
          <div className="home-system">
            <SolarSystem selected={selected} onSelect={setSelected} />
          </div>
          <div className="home-cell-slot">
            <HomePlanetSlot panel={panel} />
          </div>
        </div>
      </div>
    </main>
  )
}
