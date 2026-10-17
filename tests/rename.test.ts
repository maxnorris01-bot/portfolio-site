import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { satelliteTool } from '../src/data/satelliteTool.ts'

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')

test('the tool is the Satellite Point-of-View Tool, with the two-sentence intro and the two added tags', () => {
  assert.equal(satelliteTool.name, 'Satellite Point-of-View Tool')
  assert.equal(satelliteTool.intro.length, 2)
  assert.match(satelliteTool.intro[0], /^Ride along with any tracked satellite and see what it sees: Earth below, the Sun, Moon and planets, and millions of real stars from ESA's Hipparcos and Gaia catalogues\.$/)
  assert.match(satelliteTool.intro[1], /^The same page shows a daily screening of public tracking data for close approaches between satellites, which uses real orbital mechanics and makes zero LLM calls\.$/)
  assert.deepEqual(satelliteTool.techStack, ['Python', 'SGP4', 'scipy cKDTree', 'CelesTrak', 'three.js', 'ESA Gaia'])
  assert.match(satelliteTool.pageTitle, /^Satellite Point-of-View Tool/)
  assert.ok(satelliteTool.pageDescription.length <= 300)
})

test('no page still calls the tool by its old name, and the route is unchanged', () => {
  for (const f of ['pages/SatelliteTool.tsx', 'pages/Home.tsx', 'pages/Resume.tsx', 'components/NavBar.tsx']) {
    const text = src(f)
    assert.doesNotMatch(text, /Satellite Conjunction Screening|Satellite Screening Tool|screening tool/i, f)
  }
  assert.match(src('App.tsx'), /path="\/satellite-conjunction-screening"/)
  assert.match(src('components/NavBar.tsx'), /to: '\/satellite-conjunction-screening'/)
})

test('the repository name, the repository URL and the bucket stay as they are', () => {
  assert.equal(satelliteTool.repoUrl, 'https://github.com/maxnorris01-bot/satellite-conjunction-screening')
  assert.match(src('globe/data.ts'), /satellite-conjunction-screening\.fly\.storage\.tigris\.dev/)
})

test('the conjunction screening section keeps its heading', () => {
  assert.match(src('pages/SatelliteTool.tsx'), /Conjunction screening\n/)
})
