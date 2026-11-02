import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { EOX_ATTRIBUTION } from '../src/globe/eox.ts'
import { GIBS_ACKNOWLEDGMENT } from '../src/globe/gibs.ts'
import {
  CONSTELLATION_BOUNDARIES_CREDIT,
  CONSTELLATION_FIGURES_CREDIT,
  GAIA_CREDIT,
  IAU_NAMES_CREDIT,
  SIMBAD_CREDIT,
  STARS_CREDIT,
  imageryCredits,
  skyCredits,
} from '../src/globe/imagery.ts'
import { BUNDLED_EARTH_CREDIT, CREDITS_ID, SHORT_CREDITS, allCreditTexts, footnoteText, shortCreditsLine } from '../src/globe/credits.ts'

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')

test('the short credits line names what the licences require: EOX, NASA GIBS and Black Marble, ESA Hipparcos and Gaia, d3-celestial', () => {
  const line = shortCreditsLine()
  for (const needle of ['EOX Sentinel-2 cloudless', 'Copernicus Sentinel data 2016', 'NASA GIBS', 'Black Marble', 'NASA Visible Earth', 'ESA Hipparcos', 'ESA Gaia DPAC', 'CC BY-NC 3.0 IGO', 'd3-celestial']) {
    assert.ok(line.includes(needle), needle)
  }
  assert.ok(line.length < 330, `short: ${line.length} characters`)
  assert.equal(SHORT_CREDITS.join(' · '), line)
  assert.equal(CREDITS_ID, 'sat-credits')
})

test('the footnote that sat under the map is word for word the same', () => {
  // The old paragraph's pieces, as the component used to write them.
  assert.equal(
    footnoteText({ objects: { count: 19353, snapshot: 'latest screening run' }, historyEmpty: true, satelliteCredits: [] }),
    '19,353 objects from the latest screening run. Earlier days appear on the slider as daily snapshots accumulate. ' +
      'Earth imagery: NASA Visible Earth (Blue Marble); city lights: NASA Earth Observatory (Black Marble 2016, Suomi NPP VIIRS).',
  )
  assert.equal(
    footnoteText({ historyEmpty: false, satelliteCredits: ['A', 'B'] }),
    'Earth imagery: NASA Visible Earth (Blue Marble); city lights: NASA Earth Observatory (Black Marble 2016, Suomi NPP VIIRS). Satellite view: A. B.',
  )
  assert.equal(BUNDLED_EARTH_CREDIT, 'Earth imagery: NASA Visible Earth (Blue Marble); city lights: NASA Earth Observatory (Black Marble 2016, Suomi NPP VIIRS).')
})

test('every attribution and licence statement is still there, in full, in the Data and credits section', () => {
  const all = allCreditTexts().join('\n')
  for (const credit of [EOX_ATTRIBUTION, GIBS_ACKNOWLEDGMENT, STARS_CREDIT, GAIA_CREDIT, IAU_NAMES_CREDIT, SIMBAD_CREDIT, CONSTELLATION_FIGURES_CREDIT, CONSTELLATION_BOUNDARIES_CREDIT]) {
    assert.ok(all.includes(credit.replace(/\.$/, '')), credit.slice(0, 50))
  }
  // The satellite view's own list of what is on screen is the same strings.
  const onScreen = [
    ...imageryCredits('pov', { base: { drawn: 4, state: 'ready', date: null }, night: { drawn: 1, state: 'ready', date: null }, overlay: null } as never),
    ...skyCredits('pov', { stars: 1, gaia: { drawn: 3 }, glow: true, names: true, starSelected: true, simbad: true, constellations: { lines: true, boundaries: true } }),
  ]
  for (const c of onScreen) assert.ok(all.includes(c.replace(/\.$/, '')), c.slice(0, 50))
  // Statements the licences ask for, by name.
  assert.match(all, /EOxCloudless https:\/\/cloudless\.eox\.at by EOX IT Services GmbH \(Contains modified Copernicus Sentinel data 2016\)/)
  assert.match(all, /Credit: ESA, Gaia DPAC/)
  assert.match(all, /CC BY-NC 3\.0 IGO/)
  assert.match(all, /Credit: ESA/)
  assert.match(all, /d3-celestial \(Olaf Frohn, BSD-3-Clause\)/)
  assert.match(all, /SIMBAD database, CDS, Strasbourg/)
})

test('the page: the tool first, then Conjunction screening, Pipeline, For context, Data and credits; the credits line sits with the map in compact view too', () => {
  const page = src('pages/SatelliteTool.tsx')
  const order = ['className="page-container"', 'id="sat-screening"', 'id="sat-pipeline"', 'className="sat-context-slot"', 'id="sat-credits"']
  const at = order.map((s) => page.indexOf(s))
  assert.ok(at.every((i) => i > 0), 'a section is missing')
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'sections are out of order')
  assert.match(page, /Conjunction screening/)
  assert.match(page, /Data and credits/)
  // The tool's name and intro come from one place (data/satelliteTool.ts) and are what the page, the Home card and the Resume show.
  assert.match(page, /<h1 className="page-title">\{satelliteTool\.name\}<\/h1>/)
  assert.match(page, /satelliteTool\.intro\[0\]/)
  assert.match(page, /satelliteTool\.intro\[1\]/)
  assert.match(page, /usePageMeta\(satelliteTool\.pageTitle, satelliteTool\.pageDescription\)/)
  assert.match(page, /Project · Applied AI &amp; data engineering/)
  assert.match(page, /View on GitHub ↗/)
  assert.match(page, /Latest run/)
  assert.match(page, /Risk breakdown/)
  // The nav tab is called SatPOV (the page and the Home card keep the full name); the route is unchanged, so existing links keep working.
  assert.match(src('components/NavBar.tsx'), /label: 'SatPOV'/)
  assert.match(src('App.tsx'), /path="\/satellite-conjunction-screening"/)
  // The globe: "For context" and the credits are handed to the page's sections; the short line is on the map side, outside the controls column.
  const tsx = src('components/SatelliteGlobe.tsx')
  assert.match(tsx, /createPortal\(history, contextSlot\)/)
  assert.match(tsx, /createPortal\(footnote, creditsSlot\)/)
  // The line is drawn after the clock row; the page takes it into its own grid row under the map (a portal), except in full screen.
  assert.ok(tsx.indexOf('{creditsLineSlot && !fullscreen.on ? createPortal(creditsLine, creditsLineSlot) : creditsLine}') > tsx.indexOf('className="globe-timebar"'))
  assert.match(tsx, /<p className="globe-credits">/)
  assert.match(tsx, /href=\{`#\$\{CREDITS_ID\}`\}/)
  // The sources line moved with the credits.
  assert.match(src('components/CollisionHistory.tsx'), /export function CollisionSources/)
  assert.match(tsx, /<CollisionSources \/>/)
  const history = src('components/CollisionHistory.tsx')
  assert.match(history, /For context: the real record/)
  assert.match(history, /Exactly one accidental collision between two intact satellites has ever been confirmed/)
  // Hidden by nothing in compact view: the CSS rule for the compact view names only the controls column.
  const css = src('components/SatelliteGlobe.css')
  assert.doesNotMatch(css, /is-compact[^{]*globe-credits/)
})
