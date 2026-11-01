import { useState } from 'react'
import { HomeInfoCard, HomePlanetSlot } from '../components/HomePanel'
import PageHeader from '../components/PageHeader'
import SolarSystem from '../components/SolarSystem'
import { toggle } from '../components/solarmodel'
import { HOME_CREDENTIALS, HOME_EYEBROW, HOME_INFO, HOME_PLANETS, HOME_TITLE, type PlanetId } from '../content/home'
import './Home.css'

export default function Home() {
  // Nothing is chosen at first; choosing the chosen planet again lets go of it.
  const [selected, setSelected] = useState<PlanetId | null>(null)
  const panel = HOME_PLANETS.find((p) => p.id === selected) ?? null

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

        {/* In reading order: Background, Site Info, the system, then the planet's card. From 900px the system fills the left column and the other three stack in the right one. */}
        <div className="home-stage">
          {HOME_INFO.map((p) => (
            <div key={p.id} className={`home-cell home-cell-${p.id}`}>
              <HomeInfoCard panel={p} />
            </div>
          ))}
          <div className="home-system">
            <SolarSystem selected={selected} onSelect={(id) => setSelected((cur) => toggle(cur, id))} />
          </div>
          <div className="home-cell home-cell-slot">
            <HomePlanetSlot panel={panel} />
          </div>
        </div>
      </div>
    </main>
  )
}
