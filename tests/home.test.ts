import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, test } from 'node:test'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { BODIES, CHOSEN, LABEL_SLOTS, ORBITS, VIEW, advance, labelWidth, labelsOverlap, layoutLabels, place, positionAt, shouldMove } from '../src/components/solarmodel.ts'
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
  assert.match(src('content/home.ts'), /DRAFT/)
})

test('five panels in order: Background, Site Info, SatPOV, ShopAI, Résumé; the last three each have an Open link to their route', () => {
  assert.deepEqual(HOME_PANELS.map((p) => p.label), ['Background', 'Site Info', 'SatPOV', 'ShopAI', 'Résumé'])
  assert.deepEqual(HOME_PANELS.map((p) => p.id), ['background', 'site', 'satpov', 'shopai', 'resume'])
  assert.deepEqual(HOME_PANELS.filter((p) => p.link).map((p) => p.link), [
    { to: '/satellite-conjunction-screening', text: 'Open SatPOV' },
    { to: '/shop', text: 'Open ShopAI' },
    { to: '/resume', text: 'Open Résumé' },
  ])
  for (const p of HOME_PANELS.filter((p) => p.link)) assert.ok(p.paragraphs.length >= 2 && p.paragraphs.length <= 3, p.id)
})

test('the new descriptions say only what the README, the pages and the Résumé data say', () => {
  const text = (id: string) => (HOME_PANELS.find((p) => p.id === id)?.paragraphs ?? []).join(' ')
  for (const fact of ['3D globe', 'Hipparcos and Gaia', 'zero LLM calls', 'close approaches']) assert.ok(text('satpov').includes(fact), fact)
  for (const fact of ['Google Shopping', 'Love, Like or Dislike', 'Shop Again', 'Saved']) assert.ok(text('shopai').includes(fact), fact)
  for (const fact of ['Joby Aviation', 'Northrop Grumman', 'DoD Secret', 'Cal State Northridge', 'SciPy']) assert.ok(text('resume').includes(fact), fact)
})

test('five planets can be chosen, in reading order; the others are decoration', () => {
  assert.deepEqual(CHOSEN.map((b) => b.select?.label), ['Background', 'Site Info', 'SatPOV', 'ShopAI', 'Résumé'])
  assert.deepEqual(CHOSEN.map((b) => b.select?.id), HOME_PANELS.map((p) => p.id))
  assert.deepEqual(CHOSEN.map((b) => b.select?.kind), ['info', 'info', 'go', 'go', 'go'])
  assert.ok(BODIES.length - CHOSEN.length >= 4, 'several decorative planets')
  assert.ok(new Set(CHOSEN.map((b) => b.orbit)).size >= 3, 'the chosen planets are spread over different orbits')
  assert.ok(new Set(CHOSEN.map((b) => b.period)).size === 5, 'at different speeds')
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
  // The five chosen planets are far from each other, and their labels, as laid out, do not touch.
  const chosen = rest.filter((r) => r.b.select)
  for (let i = 0; i < chosen.length; i++) for (let j = i + 1; j < chosen.length; j++) assert.ok(Math.hypot(chosen[i].x - chosen[j].x, chosen[i].y - chosen[j].y) > 80)
  const items = chosen.map((r) => ({ x: r.x, y: r.y, w: labelWidth(r.b.select!.label, false) }))
  assert.equal(labelsOverlap(items, layoutLabels(items, items.map(() => 0), items.map((_, i) => i))), false)
  assert.ok(layoutLabels(items, items.map(() => 0), items.map((_, i) => i)).every((l) => l.slot === 0), 'all above their planets at rest')
})

test('labels: nudged apart when two would overlap, never past the drawing\'s edges, and they return when there is room', () => {
  const w = labelWidth('Background', false)
  // Two planets side by side: the second label cannot sit above, so it goes elsewhere.
  const close = [{ x: 150, y: 200, w }, { x: 160, y: 205, w }]
  const lay = layoutLabels(close, [0, 0], [0, 1])
  assert.equal(lay[0].slot, 0)
  assert.notEqual(lay[1].slot, 0)
  assert.equal(labelsOverlap(close, lay), false)
  // The chosen planet's label wins the usual place.
  assert.equal(layoutLabels(close, [0, 0], [1, 0])[1].slot, 0)
  // At the left and right edges the label slides in, so it is never cut off.
  const edge = [{ x: VIEW.x + 2, y: 200, w }, { x: VIEW.x + VIEW.w - 2, y: 300, w }]
  const e = layoutLabels(edge, [0, 0], [0, 1])
  assert.ok(edge[0].x + e[0].dx - w / 2 >= VIEW.x && edge[1].x + e[1].dx + w / 2 <= VIEW.x + VIEW.w)
  // A label that moved aside goes back above once the other is clear, and stays aside while it is still close.
  assert.equal(layoutLabels([close[0], { x: 400, y: 205, w }], [0, 1], [0, 1])[1].slot, 0)
  assert.notEqual(layoutLabels(close, [0, 1], [0, 1])[1].slot, 0)
  assert.equal(LABEL_SLOTS[0], -21)
})

test('labels overlap only rarely while the planets move, whichever planet is chosen', () => {
  for (let sel = 0; sel < CHOSEN.length; sel++) {
    const prev = CHOSEN.map(() => 0)
    let bad = 0
    let frames = 0
    for (let t = 0; t < 1200; t += 0.5) {
      const items = CHOSEN.map((b, i) => ({ ...positionAt(b, t, false), w: labelWidth(b.select!.label, i === sel) }))
      const order = CHOSEN.map((_, i) => i).sort((i, j) => Number(j === sel) - Number(i === sel))
      const lay = layoutLabels(items, prev, order)
      lay.forEach((l, i) => (prev[i] = l.slot))
      frames++
      if (labelsOverlap(items, lay)) bad++
    }
    assert.ok(bad / frames < 0.02, `${CHOSEN[sel].key}: ${((100 * bad) / frames).toFixed(2)}% of the time`)
  }
})

test('the drawing starts at its leftmost orbit line, so it lines up with the header text', () => {
  let left = Infinity
  for (let o = 0; o < ORBITS.length; o++) for (let a = 0; a < 360; a += 0.5) left = Math.min(left, place(o, a).x)
  assert.ok(VIEW.x <= left && left - VIEW.x < 3, `view starts at ${VIEW.x}, the orbit at ${left.toFixed(1)}`)
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
  const { default: SolarSystem } = await loadModule<{ default: ComponentType<{ selected: PlanetId; onSelect: (id: PlanetId) => void }> }>('/src/components/SolarSystem.tsx')
  return SolarSystem
}
type PlanetId = 'background' | 'site' | 'satpov' | 'shopai' | 'resume'

const buttonsOf = (html: string) => [...html.matchAll(/<g [^>]*role="button"[^>]*>/g)].map((m) => m[0])

test('the five planets are buttons in reading order with names and pressed state; decoration is hidden from assistive technology', async () => {
  const html = render(await planets(), { selected: 'background', onSelect: () => {} })
  const buttons = buttonsOf(html)
  assert.equal(buttons.length, 5)
  const names = ['Background', 'Site Info', 'SatPOV', 'ShopAI', 'Résumé']
  buttons.forEach((b, i) => {
    assert.ok(b.includes(`aria-label="${names[i]}"`), names[i])
    assert.ok(b.includes(`aria-pressed="${i === 0}"`), names[i])
    assert.match(b, /tabindex="0"/)
  })
  assert.equal(html.match(/aria-hidden="true"/g)?.length, BODIES.filter((b) => !b.select).length + 1, 'decorative planets and the orbits and sun')
  assert.match(html, /role="group" aria-label="Choose a planet to read about"/)
  for (const id of ['site', 'satpov', 'shopai', 'resume'] as const) {
    const chosen = render(await planets(), { selected: id, onSelect: () => {} })
    const pressed = buttonsOf(chosen).map((b) => b.includes('aria-pressed="true"'))
    assert.equal(pressed.filter(Boolean).length, 1)
    assert.equal(pressed.indexOf(true), names.indexOf(CHOSEN.find((b) => b.select?.id === id)!.select!.label))
    assert.match(chosen, /solar-planet[^"]* is-selected/)
  }
})

test('the three destination planets carry a dashed ring; the two info planets a solid one', async () => {
  const html = render(await planets(), { selected: 'background', onSelect: () => {} })
  assert.deepEqual(buttonsOf(html).map((b) => b.includes('is-go')), [false, false, true, true, true])
  assert.match(src('components/SolarSystem.css'), /\.solar-planet\.is-go \.solar-ring \{[^}]*stroke-dasharray/)
})

test('each chosen planet has a hit area of at least 44 CSS px on a phone, and a visible focus ring', async () => {
  const html = render(await planets(), { selected: 'background', onSelect: () => {} })
  // The picture is drawn VIEW.w units across and is never narrower than 288px (a 320px phone less its gutters).
  const hit = Number(/class="solar-hit" r="(\d+)"/.exec(html)?.[1])
  assert.ok(hit * 2 * (288 / VIEW.w) >= 44, `hit r=${hit}`)
  assert.match(html, /class="solar-focus"/)
  assert.match(src('components/SolarSystem.css'), /\.solar-planet:focus-visible \.solar-focus \{\s*opacity: 1/)
})

const panelHtml = async (id: string) => {
  const { default: Card } = await loadModule<{ default: ComponentType<{ panel: (typeof HOME_PANELS)[number] }> }>('/src/components/HomePanel.tsx')
  const panel = HOME_PANELS.find((p) => p.id === id)!
  return renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, createElement(Card, { panel })))
}

test('the card: a labelled live region with the heading and text; Open links are real router links; Background and Site Info have none', async () => {
  for (const [id, to, text] of [['satpov', '/satellite-conjunction-screening', 'Open SatPOV'], ['shopai', '/shop', 'Open ShopAI'], ['resume', '/resume', 'Open Résumé']]) {
    const html = await panelHtml(id)
    assert.match(html, /<section class="card home-panel" aria-labelledby="home-panel-title">/)
    assert.match(html, /aria-live="polite"/)
    const link = html.match(/<a [^>]*>[^<]*<\/a>/)?.[0] ?? ''
    assert.ok(link.includes('class="btn btn-primary home-panel-link"') && link.includes(`href="${to}"`) && link.endsWith(`>${text}</a>`), `${id}: ${link}`)
    assert.doesNotMatch(link, /target=/, 'same tab')
  }
  for (const id of ['background', 'site']) assert.doesNotMatch(await panelHtml(id), /<a /)
})

test('Home: the header, the system and the card; Background shown first, no links yet, one h1', async () => {
  const { default: Home } = await loadModule<{ default: ComponentType }>('/src/pages/Home.tsx')
  const html = renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, createElement(Home)))
  assert.equal(html.match(/<h1[ >]/g)?.length, 1)
  assert.match(html, /Aerospace engineering, now pointed at data/)
  assert.match(html, /DoD Secret Clearance/)
  assert.match(html, /Physics — Cal State Northridge/)
  assert.match(html, /<h2 id="home-panel-title"[^>]*>Background<\/h2>/)
  assert.doesNotMatch(html, /Open the Satellite POV Tool|Featured project|home-featured|Objects screened|<a /)
  assert.ok(html.indexOf('home-system') < html.indexOf('home-panel'), 'the system comes before the card (above it on a phone), so the link is next in the tab order after the planets')
})

test('the card is as tall as its own text: no reserved height, no hidden sizing copies', () => {
  const css = src('pages/Home.css')
  assert.doesNotMatch(css, /sizer|panel-stack|min-height|height: 406|(?<![-\w])height:/)
  assert.doesNotMatch(src('pages/Home.tsx') + src('components/HomePanel.tsx'), /sizer|panel-stack/)
  assert.match(css, /\.home-panel-content \{[^}]*animation: home-panel-in/s)
  assert.match(css, /prefers-reduced-motion: reduce\) \{\s*\.home-panel-content \{\s*animation: none/)
})

test('alignment: the system starts at the left edge (no centring or inner padding) and the card is level with its top', () => {
  const css = src('pages/Home.css')
  assert.match(css, /\.home-stage \{[^}]*align-items: start/s)
  assert.match(css, /\.home-system \{[^}]*justify-self: start/s)
  assert.doesNotMatch(css.slice(css.indexOf('.home-system {'), css.indexOf('}', css.indexOf('.home-system {'))), /margin|padding|center/)
  assert.doesNotMatch(css, /align-items: center/)
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
