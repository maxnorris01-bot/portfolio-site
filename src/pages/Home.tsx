import { useState } from 'react'
import HomePanelCard from '../components/HomePanel'
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

          <HomePanelCard panel={panel} />
        </div>
      </div>
    </main>
  )
}
