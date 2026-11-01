import { useState } from 'react'
import { HomeInfoCard, HomePlanetSlot } from '../components/HomePanel'
import SolarSystem from '../components/SolarSystem'
import { HOME_DEFAULT_PLANET, HOME_INFO, HOME_PLANETS, HOME_TITLE, type PlanetId } from '../content/home'
import './Home.css'

export default function Home() {
  // A planet is chosen from the start, so the card is never empty; choosing the chosen one again does nothing.
  const [selected, setSelected] = useState<PlanetId>(HOME_DEFAULT_PLANET)
  const panel = HOME_PLANETS.find((p) => p.id === selected) ?? HOME_PLANETS[0]

  return (
    <main className="page home-page">
      <div className="page-container">
        {/* From 1280px two columns, 49% / 2% / 49% of the content width: on the left the title and the two text cards, on the
            right the solar system and the chosen planet's card. Below that they stack: title, system, planet card, the two cards. */}
        <div className="home-grid">
          <div className="home-left">
            <h1 className="home-title">{HOME_TITLE}</h1>
            {HOME_INFO.map((p) => (
              <HomeInfoCard key={p.id} panel={p} />
            ))}
          </div>
          <div className="home-right">
            <div className="home-system">
              <SolarSystem selected={selected} onSelect={setSelected} />
            </div>
            <HomePlanetSlot panel={panel} />
          </div>
        </div>
      </div>
    </main>
  )
}
