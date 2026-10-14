import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'
import { DESCEND_FOV, zoomLockedToward } from '../src/globe/descend.ts'
import { presetView, type Vec3 } from '../src/globe/pov.ts'
import { SPACE_FOV_MIN } from '../src/globe/stars.ts'
import { IAU_NAMES_CREDIT, STARS_CREDIT, skyCredits } from '../src/globe/imagery.ts'

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

test('looking out at space, the riding zoom narrows to 0.05 degrees; over the ground it stops at 30', () => {
  const pos: Vec3 = [1.07, 0, 0]
  const vel: Vec3 = [0, 0.7, 0.7]
  const out = presetView('outward', pos, vel)
  let look = { yaw: 0, pitch: 0, fov: 70 }
  for (let i = 0; i < 40; i++) look = zoomLockedToward(out, look, 0.6, 0, 0, 16 / 9, SPACE_FOV_MIN)
  assert.ok(Math.abs(look.fov - 0.05) < 1e-9, `${look.fov}`)
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
