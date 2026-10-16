import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'
import { DESCEND_FOV, zoomLockedToward } from '../src/globe/descend.ts'
import { presetView, type Vec3 } from '../src/globe/pov.ts'
import { SPACE_FOV_MIN } from '../src/globe/stars.ts'
import { STAR_TIERS } from '../src/globe/space.ts'
import { starsReadout } from '../src/globe/starsreadout.ts'
import {
  CONSTELLATION_BOUNDARIES_CREDIT,
  CONSTELLATION_FIGURES_CREDIT,
  GAIA_CREDIT,
  IAU_NAMES_CREDIT,
  STARS_CREDIT,
  skyCredits,
} from '../src/globe/imagery.ts'

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')

test('the space view and its star data load lazily, only when the satellite view opens', () => {
  const engine = src('globe/engine.ts')
  // space.ts only through a dynamic import, never a static one.
  assert.match(engine, /import\('\.\/space'\)/)
  assert.doesNotMatch(engine, /^import [^\n]*from '\.\/space'/m)
  // Nothing in src imports the catalogue file; it's fetched at run time.
  const files = (dir: string): string[] =>
    readdirSync(new URL(`../src/${dir}`, import.meta.url), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? files(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
    )
  for (const f of files('.').filter((f) => /\.(ts|tsx)$/.test(f))) {
    assert.doesNotMatch(src(f), /import[^\n]*hipparcos\.bin/, f)
  }
  // The fetch happens inside the satellite view's entry path.
  assert.match(engine, /enterPov[\s\S]*loadSpace\(\)/)
})

test('looking out at space, the riding zoom narrows to 0.01 degrees; over the ground it stops at 30', () => {
  const pos: Vec3 = [1.07, 0, 0]
  const vel: Vec3 = [0, 0.7, 0.7]
  const out = presetView('outward', pos, vel)
  let look = { yaw: 0, pitch: 0, fov: 70 }
  for (let i = 0; i < 60; i++) look = zoomLockedToward(out, look, 0.6, 0, 0, 16 / 9, SPACE_FOV_MIN)
  assert.ok(Math.abs(look.fov - 0.01) < 1e-9, `${look.fov}`)
  // The ground limit is unchanged.
  const down = presetView('down', pos, vel)
  const g = zoomLockedToward(down, { yaw: 0, pitch: 0, fov: 40 }, 0.1, 0, 0, 16 / 9, DESCEND_FOV)
  assert.equal(g.fov, DESCEND_FOV)
})

test('the star credit shows while stars are on screen in the satellite view', () => {
  assert.match(STARS_CREDIT, /Credit: ESA/)
  assert.match(STARS_CREDIT, /CC BY-NC 3\.0 IGO/)
  assert.match(STARS_CREDIT, /non-commercial/)
  assert.deepEqual(skyCredits('pov', { stars: 118217 }), [STARS_CREDIT])
  assert.deepEqual(skyCredits('pov', { stars: 0 }), [])
  assert.deepEqual(skyCredits('globe', { stars: 118217 }), [])
})

test('the IAU names credit shows only while a star with a name is on screen', () => {
  assert.match(IAU_NAMES_CREDIT, /IAU Catalog of Star Names/)
  assert.ok(!skyCredits('pov', { stars: 1000 }).includes(IAU_NAMES_CREDIT))
  assert.ok(!skyCredits('pov', { stars: 1000, names: true }).includes(IAU_NAMES_CREDIT)) // loaded, none selected
  assert.ok(skyCredits('pov', { stars: 1000, names: true, starSelected: true }).includes(IAU_NAMES_CREDIT))
  assert.deepEqual(skyCredits('globe', { stars: 1000, names: true, starSelected: true }), [])
})

test('constellation credits appear only while figures or boundaries are on screen', () => {
  assert.ok(!skyCredits('pov', { stars: 1000 }).includes(CONSTELLATION_FIGURES_CREDIT))
  const lines = skyCredits('pov', { stars: 1000, constellations: { lines: true, boundaries: false } })
  assert.ok(lines.includes(CONSTELLATION_FIGURES_CREDIT) && !lines.includes(CONSTELLATION_BOUNDARIES_CREDIT))
  const both = skyCredits('pov', { stars: 1000, constellations: { lines: true, boundaries: true } })
  assert.ok(both.includes(CONSTELLATION_BOUNDARIES_CREDIT))
  assert.match(CONSTELLATION_FIGURES_CREDIT, /d3-celestial.*Frohn.*BSD/)
  assert.deepEqual(skyCredits('globe', { stars: 1, constellations: { lines: true, boundaries: true } }), [])
})

test('the constellation code and files load only when used (type imports aside)', () => {
  const engine = src('globe/engine.ts')
  assert.match(engine, /import\('\.\/constellations'\)/)
  assert.match(engine, /import\('\.\/constellationlayer'\)/)
  assert.doesNotMatch(engine, /^import (?!type)[^\n]*from '\.\/constellations(layer)?'/m)
  // The files are fetched inside ensureConstellations / ensureBounds, not at start-up.
  assert.match(engine, /ensureConstellations\(\): Promise<void> \{[\s\S]*?CONSTELLATIONS_URL/)
  assert.doesNotMatch(src('globe/space.ts'), /constellationlayer/)
})

test('the Gaia code and files load only after the Hipparcos stars (type imports aside), from the one data URL', () => {
  const engine = src('globe/engine.ts')
  for (const m of ['gaiatiles', 'gaiastars', 'tilestream', 'healpix']) {
    assert.match(engine, new RegExp(`import\\('\\./${m}'\\)`), m)
    assert.doesNotMatch(engine, new RegExp(`^import (?!type)[^\\n]*from '\\./${m}'`, 'm'), m)
  }
  // The star data's URL comes from starDataUrl (one place), never written out in the engine.
  assert.match(engine, /starDataUrl\(/)
  assert.doesNotMatch(engine, /tigris/)
  assert.doesNotMatch(src('globe/space.ts'), /gaiastars|tilestream/)
})

test('the quality tiers: every Hipparcos star on both (the tiles drop the ones they match), budgets 1.5M and 0.3M', () => {
  assert.equal(STAR_TIERS.desktop.maxMag, Infinity)
  assert.equal(STAR_TIERS.phone.maxMag, Infinity)
  assert.equal(STAR_TIERS.desktop.gaiaBudget, 1_500_000)
  assert.equal(STAR_TIERS.phone.gaiaBudget, 300_000)
  assert.ok(STAR_TIERS.phone.gaiaCache < STAR_TIERS.desktop.gaiaCache)
  assert.ok(STAR_TIERS.phone.concurrency < STAR_TIERS.desktop.concurrency)
})

test('the Gaia credit appears while streamed stars are drawn, with ESA, Gaia DPAC and the licence', () => {
  assert.ok(!skyCredits('pov', { stars: 1000, gaia: { drawn: 0 } }).includes(GAIA_CREDIT))
  assert.ok(skyCredits('pov', { stars: 1000, gaia: { drawn: 5 } }).includes(GAIA_CREDIT))
  assert.ok(skyCredits('pov', { stars: 1000, glow: true }).includes(GAIA_CREDIT))
  assert.match(GAIA_CREDIT, /Credit: ESA, Gaia DPAC/)
  assert.match(GAIA_CREDIT, /CC BY-NC 3\.0 IGO/)
  assert.match(GAIA_CREDIT, /non-commercial/)
  assert.deepEqual(skyCredits('globe', { stars: 1000, gaia: { drawn: 5 } }), [])
})

test('the panel reads out the stars: loading, unavailable (Hipparcos only, said plainly), and streaming', () => {
  const g = (o: object) => ({ state: 'ready', drawn: 0, tilesLoaded: 0, tilesInView: 0, inFlight: 0, budget: 1_500_000, ...o })
  assert.match(starsReadout(118217, undefined), /Loading the Gaia star index/)
  assert.match(starsReadout(118217, g({ state: 'loading' })), /Loading/)
  const off = starsReadout(118217, g({ state: 'unavailable' }))
  assert.match(off, /aren't available/)
  assert.match(off, /118,217 Hipparcos stars only/)
  assert.match(starsReadout(118217, g({})), /zoom/)
  const on = starsReadout(118217, g({ drawn: 412880, tilesLoaded: 14, tilesInView: 9, inFlight: 2 }))
  assert.match(on, /118,217 Hipparcos \+ 412,880 Gaia/)
  assert.match(on, /14 tiles/)
  assert.match(on, /2 loading/)
})

test('the NASA Milky Way picture is gone: no file, no loader, no credit; the Gaia glow is the backdrop through the same hook', () => {
  assert.equal(existsSync(new URL('../public/data/sky/milkyway-2k.jpg', import.meta.url)), false)
  assert.equal(existsSync(new URL('../public/data/sky', import.meta.url)), false)
  for (const f of ['globe/engine.ts', 'globe/space.ts', 'globe/imagery.ts']) {
    assert.doesNotMatch(src(f), /milkyway|MilkyWay|MILKY_WAY|Deep Star Maps/i, f)
  }
  const engine = src('globe/engine.ts')
  assert.match(engine, /import\('\.\/glowlayer'\)/)
  assert.doesNotMatch(engine, /^import (?!type)[^\n]*from '\.\/glow(layer)?'/m)
  assert.match(engine, /space\.addBackdrop\(new layer\.GlowLayer/)
  assert.match(src('globe/glowlayer.ts'), /implements SkyBackdropLayer/)
})
