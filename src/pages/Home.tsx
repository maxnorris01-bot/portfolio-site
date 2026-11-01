import { useState } from 'react'
import { HomeInfoCard, HomePlanetSlot } from '../components/HomePanel'
import PageHeader from '../components/PageHeader'
import SolarSystem from '../components/SolarSystem'
import { toggle } from '../components/solarmodel'
import { HOME_CREDENTIALS, HOME_INFO, HOME_PLANETS, HOME_TITLE, type PlanetId } from '../content/home'
import './Home.css'

export default function Home() {
  // Nothing is chosen at first; choosing the chosen planet again lets go of it.
  const [selected, setSelected] = useState<PlanetId | null>(null)
  const panel = HOME_PLANETS.find((p) => p.id === selected) ?? null

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

        {/* In reading order: Background and Site Info, the system, then the planet's strip. From 900px the system and the two cards are
            one row of the same height (set from the window's height, so the strip below fits on screen), and the strip runs under them. */}
        <div className="home-stage">
          <div className="home-info-col">
            {HOME_INFO.map((p) => (
              <HomeInfoCard key={p.id} panel={p} />
            ))}
          </div>
          <div className="home-system">
            <SolarSystem selected={selected} onSelect={(id) => setSelected((cur) => toggle(cur, id))} />
          </div>
          <div className="home-cell-slot">
            <HomePlanetSlot panel={panel} />
          </div>
        </div>
      </div>
    </main>
  )
}
