import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, test } from 'node:test'
import type { ComponentType } from 'react'
import { BODIES, advance, place, positionAt, shouldMove } from '../src/components/solarmodel.ts'
import { HOME_CREDENTIALS, HOME_PANELS, HOME_TITLE } from '../src/content/home.ts'
import { closeServer, loadModule, render } from './helpers/ssr.ts'

after(closeServer)

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')

test('the Background text is the old Home intro, word for word; the title and the two tags are unchanged', () => {
  const bg = HOME_PANELS.find((p) => p.id === 'background')
  assert.equal(
    bg?.paragraphs.join(' '),
    "I spent 10+ years at Northrop Grumman and Joby Aviation making sure aircraft and spacecraft hit their mass, balance, and inertia targets, work that lives or dies on careful data handling and physics you can defend. Now I'm pointing that same rigor at applied AI and data engineering: building pipelines that are fast, transparent about their assumptions, and grounded in the real physics of the problem.",
  )
  assert.equal(HOME_TITLE, 'Aerospace engineering, now pointed at data')
  assert.deepEqual(HOME_CREDENTIALS, ['DoD Secret Clearance', 'Physics — Cal State Northridge'])
})

test('Site Info (draft) says what the site is, what is on it and how it is built, from the README and the pages', () => {
  const text = (HOME_PANELS.find((p) => p.id === 'site')?.paragraphs ?? []).join(' ')
  for (const fact of ['portfolio', 'SatPOV', 'ShopAI', 'Résumé', 'Shop Again', 'Vite', 'React 19', 'TypeScript', 'Vercel', 'git', 'Python', 'Fly', 'Postgres']) assert.ok(text.includes(fact), fact)
  assert.deepEqual(HOME_PANELS.map((p) => p.label), ['Background', 'Site Info'])
  assert.match(src('content/home.ts'), /DRAFT/)
})

test('exactly two planets can be chosen, labelled Background and Site Info; the others are decoration', () => {
  const chosen = BODIES.filter((b) => b.select)
  assert.deepEqual(chosen.map((b) => b.select?.label), ['Background', 'Site Info'])
  assert.deepEqual(chosen.map((b) => b.select?.id), ['background', 'site'])
  assert.ok(BODIES.length - chosen.length >= 4, 'several decorative planets')
})

test('every orbit takes between 40 and 120 seconds, and the speeds differ', () => {
  for (const b of BODIES) assert.ok(b.period >= 40 && b.period <= 120, `${b.key}: ${b.period}`)
  assert.ok(new Set(BODIES.map((b) => b.period)).size >= 6)
})

test('motion is smooth: a planet never moves far in a frame, and a full period returns it to its place', () => {
  for (const b of BODIES) {
    let prev = positionAt(b, 0, false)
    let worst = 0
    for (let ms = 16; ms <= 5000; ms += 16) {
      const p = positionAt(b, ms / 1000, false)
      worst = Math.max(worst, Math.hypot(p.x - prev.x, p.y - prev.y))
      prev = p
    }
    assert.ok(worst < 0.8, `${b.key} moves ${worst.toFixed(2)} units a frame at most`)
    const start = positionAt(b, 0, false)
    const end = positionAt(b, b.period, false)
    assert.ok(Math.hypot(start.x - end.x, start.y - end.y) < 1e-6, b.key)
  }
})

test('reduced motion: the planets rest at their start positions, well spread, on their orbits', () => {
  const rest = BODIES.map((b) => ({ b, ...positionAt(b, 1234, true) }))
  for (const r of rest) assert.deepEqual({ x: r.x, y: r.y }, place(r.b.orbit, r.b.phase))
  for (let i = 0; i < rest.length; i++) for (let j = i + 1; j < rest.length; j++) assert.ok(Math.hypot(rest[i].x - rest[j].x, rest[i].y - rest[j].y) > 30, `${rest[i].b.key} / ${rest[j].b.key}`)
  // The two chosen planets are far from each other, so their labels do not collide.
  const [bg, site] = rest.filter((r) => r.b.select)
  assert.ok(Math.hypot(bg.x - site.x, bg.y - site.y) > 80)
})

test('the planets stand still on hover, on keyboard focus, in a hidden tab and under reduced motion; otherwise they move', () => {
  const idle = { reducedMotion: false, hover: false, focus: false, hidden: false }
  assert.equal(shouldMove(idle), true)
  for (const k of ['reducedMotion', 'hover', 'focus', 'hidden'] as const) assert.equal(shouldMove({ ...idle, [k]: true }), false, k)
})

test('time only advances while moving, and a stalled frame cannot make a jump', () => {
  assert.equal(advance(10, 16), 10.016)
  assert.equal(advance(10, 5000), 10.1)
  assert.equal(advance(10, -5), 10)
})

const planets = async () => {
  const { default: SolarSystem } = await loadModule<{ default: ComponentType<{ selected: 'background' | 'site'; onSelect: (id: 'background' | 'site') => void }> }>('/src/components/SolarSystem.tsx')
  return SolarSystem
}

test('the two planets are buttons with names and pressed state; decoration is hidden from assistive technology', async () => {
  const html = render(await planets(), { selected: 'background', onSelect: () => {} })
  const buttons = [...html.matchAll(/<g [^>]*role="button"[^>]*>/g)].map((m) => m[0])
  assert.equal(buttons.length, 2)
  assert.match(buttons[0], /aria-label="Background"[^>]*|aria-pressed="true"/)
  assert.ok(buttons[0].includes('aria-pressed="true"') && buttons[0].includes('aria-label="Background"'))
  assert.ok(buttons[1].includes('aria-pressed="false"') && buttons[1].includes('aria-label="Site Info"'))
  for (const b of buttons) assert.match(b, /tabindex="0"/)
  assert.equal(html.match(/aria-hidden="true"/g)?.length, BODIES.filter((b) => !b.select).length + 1, 'decorative planets and the orbits and sun')
  assert.match(html, /role="group" aria-label="Choose a planet to read about"/)
  const chosen = render(await planets(), { selected: 'site', onSelect: () => {} })
  assert.ok([...chosen.matchAll(/<g [^>]*role="button"[^>]*>/g)][1][0].includes('aria-pressed="true"'))
  assert.match(chosen, /solar-planet is-selected/)
})

test('each chosen planet has a hit area of at least 44 CSS px on a phone, and a visible focus ring', async () => {
  const html = render(await planets(), { selected: 'background', onSelect: () => {} })
  // The picture is drawn 360 units across and is never narrower than 288px (a 320px phone less its gutters): r 28 is 44.8px across at 0.8 scale.
  const hit = Number(/class="solar-hit" r="(\d+)"/.exec(html)?.[1])
  assert.ok(hit * 2 * (288 / 360) >= 44, `hit r=${hit}`)
  assert.match(html, /class="solar-focus"/)
  assert.match(src('components/SolarSystem.css'), /\.solar-planet:focus-visible \.solar-focus \{\s*opacity: 1/)
})

test('Home: the header, the system and the panel; Background shown first; no buttons, links or Featured project', async () => {
  const { default: Home } = await loadModule<{ default: ComponentType }>('/src/pages/Home.tsx')
  const html = render(Home, {})
  assert.equal(html.match(/<h1[ >]/g)?.length, 1)
  assert.match(html, /Aerospace engineering, now pointed at data/)
  assert.match(html, /DoD Secret Clearance/)
  assert.match(html, /Physics — Cal State Northridge/)
  assert.match(html, /<section class="card home-panel" aria-labelledby="home-panel-title">/)
  assert.match(html, /aria-live="polite"/)
  assert.match(html, /<h2 id="home-panel-title"[^>]*>Background<\/h2>/)
  assert.doesNotMatch(html, /Open the Satellite POV Tool|Featured project|home-featured|btn btn-primary|Objects screened|href=/)
  // Both panels are laid out (the other hidden) so the card never changes height.
  assert.equal(html.match(/class="home-panel-sizer" aria-hidden="true"/g)?.length, 2)
  assert.ok(html.indexOf('home-system') < html.indexOf('home-panel'), 'the system comes before the panel (above it on a phone)')
})

test('Home: the featured project is gone from the code and the styles; the intro has no reading-width cap', () => {
  assert.doesNotMatch(src('pages/Home.tsx'), /featured|useSatelliteSummary|OrbitIllustration/i)
  assert.doesNotMatch(src('pages/Home.css'), /featured|measure-text|measure-lead|home-lede/i)
  assert.throws(() => src('components/OrbitIllustration.tsx'), 'the old illustration is removed')
})

test('SatPOV "Data and credits" runs the full width; "For context" keeps its reading width', () => {
  const css = src('pages/SatelliteTool.css')
  assert.doesNotMatch(css.slice(css.indexOf('.sat-credits-body {'), css.indexOf('}', css.indexOf('.sat-credits-body {'))), /max-width/)
  assert.doesNotMatch(css, /\.sat-page \.globe-footnote/)
  assert.match(css, /\.sat-page \.globe-history-lede,\s*\.sat-page \.globe-history-sources \{\s*max-width: var\(--sat-measure\)/)
})
