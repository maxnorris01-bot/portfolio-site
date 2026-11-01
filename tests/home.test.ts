import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, test } from 'node:test'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { BODIES, CHOSEN, LABEL_SLOTS, ORBITS, VIEW, advance, labelWidth, labelsOverlap, layoutLabels, place, positionAt, shouldMove, toggle } from '../src/components/solarmodel.ts'
import { HOME_CREDENTIALS, HOME_HINT, HOME_INFO, HOME_PLANETS, HOME_TITLE, type PlanetId } from '../src/content/home.ts'
import { closeServer, loadModule, render } from './helpers/ssr.ts'

after(closeServer)

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')

test('the Background text is the old Home intro, word for word; the title and the two tags are unchanged', () => {
  const bg = HOME_INFO.find((p) => p.id === 'background')
  assert.equal(
    bg?.paragraphs.join(' '),
    "I spent 10+ years at Northrop Grumman and Joby Aviation making sure aircraft and spacecraft hit their mass, balance, and inertia targets, work that lives or dies on careful data handling and physics you can defend. Now I'm pointing that same rigor at applied AI and data engineering: building pipelines that are fast, transparent about their assumptions, and grounded in the real physics of the problem.",
  )
  assert.equal(HOME_TITLE, 'Aerospace engineering, now pointed at data')
  assert.deepEqual(HOME_CREDENTIALS, ['DoD Secret Clearance', 'Physics — Cal State Northridge'])
})

test('Site Info (draft): what the site is, a pointer at the planets, and how it is built; the planet descriptions are not repeated', () => {
  const site = HOME_INFO.find((p) => p.id === 'site')
  assert.deepEqual(site?.paragraphs, [
    'This site is a portfolio of applied AI and data projects. It has two working tools and my Résumé.',
    'Select a planet in the solar system to explore each part of the site.',
    'The site is built with Vite, React 19 and TypeScript, and deployed on Vercel from git. The satellite view is drawn with three.js. The ShopAI backend is a Python service on Fly with a Postgres database.',
  ])
  const text = site?.paragraphs.join(' ') ?? ''
  assert.doesNotMatch(text, /ride along|Shop Again|Google Shopping|zero LLM/)
  assert.match(src('content/home.ts'), /DRAFT/)
})

test('Background and Site Info are plain content, in that order; only three planets lead somewhere, each with an Open link to its route', () => {
  assert.deepEqual(HOME_INFO.map((p) => p.id), ['background', 'site'])
  assert.deepEqual(HOME_INFO.map((p) => p.label), ['Background', 'Site Info'])
  assert.deepEqual(HOME_PLANETS.map((p) => p.label), ['SatPOV', 'ShopAI', 'Résumé'])
  assert.deepEqual(HOME_PLANETS.map((p) => p.link), [
    { to: '/satellite-conjunction-screening', text: 'Open SatPOV' },
    { to: '/shop', text: 'Open ShopAI' },
    { to: '/resume', text: 'Open Résumé' },
  ])
  for (const p of HOME_PLANETS) assert.ok(p.paragraphs.length >= 2 && p.paragraphs.length <= 3, p.id)
  assert.equal(HOME_HINT, 'Select a planet to explore the site.')
})

test('the planet descriptions say only what the README, the pages and the Résumé data say', () => {
  const text = (id: string) => (HOME_PLANETS.find((p) => p.id === id)?.paragraphs ?? []).join(' ')
  for (const fact of ['3D globe', 'Hipparcos and Gaia', 'zero LLM calls', 'close approaches']) assert.ok(text('satpov').includes(fact), fact)
  for (const fact of ['Google Shopping', 'Love, Like or Dislike', 'Shop Again', 'Saved']) assert.ok(text('shopai').includes(fact), fact)
  for (const fact of ['Joby Aviation', 'Northrop Grumman', 'DoD Secret', 'Cal State Northridge', 'SciPy']) assert.ok(text('resume').includes(fact), fact)
})

test('exactly three planets can be chosen (SatPOV, ShopAI, Résumé), on different orbits and at different speeds; the rest are decoration', () => {
  assert.deepEqual(CHOSEN.map((b) => b.select?.label), ['SatPOV', 'ShopAI', 'Résumé'])
  assert.deepEqual(CHOSEN.map((b) => b.select?.id), HOME_PLANETS.map((p) => p.id))
  assert.ok(BODIES.length - CHOSEN.length >= 5, 'several decorative planets')
  assert.equal(new Set(CHOSEN.map((b) => b.orbit)).size, 3)
  assert.equal(new Set(CHOSEN.map((b) => b.period)).size, 3)
  assert.ok(!BODIES.some((b) => b.select && ['background', 'site'].includes(b.select.id)), 'Background and Site Info are no longer planets')
})

test('choosing a planet shows it; choosing it again lets go; choosing another switches', () => {
  let s: PlanetId | null = null
  s = toggle(s, 'satpov')
  assert.equal(s, 'satpov')
  s = toggle(s, 'shopai')
  assert.equal(s, 'shopai')
  s = toggle(s, 'shopai')
  assert.equal(s, null)
  assert.equal(toggle(null, 'resume'), 'resume')
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
  // The three chosen planets are far from each other, and their labels, as laid out, do not touch.
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

test('the pause listeners are attached to the picture itself, not to any one planet', () => {
  const code = src('components/SolarSystem.tsx')
  assert.match(code, /const root = svgRef\.current/)
  assert.match(code, /<svg ref=\{svgRef\}/)
  for (const gone of ["'background'", "'site'"]) assert.ok(!code.includes(gone), `no leftover reference to ${gone}`)
  for (const ev of ['pointerenter', 'pointerleave', 'focusin', 'focusout', 'visibilitychange']) assert.ok(code.includes(ev), ev)
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
  const { default: SolarSystem } = await loadModule<{ default: ComponentType<{ selected: PlanetId | null; onSelect: (id: PlanetId) => void }> }>('/src/components/SolarSystem.tsx')
  return SolarSystem
}

const buttonsOf = (html: string) => [...html.matchAll(/<g [^>]*role="button"[^>]*>/g)].map((m) => m[0])

test('the three planets are buttons in reading order with names and pressed state; decoration is hidden from assistive technology', async () => {
  const names = ['SatPOV', 'ShopAI', 'Résumé']
  const none = render(await planets(), { selected: null, onSelect: () => {} })
  const buttons = buttonsOf(none)
  assert.equal(buttons.length, 3)
  buttons.forEach((b, i) => {
    assert.ok(b.includes(`aria-label="${names[i]}"`), names[i])
    assert.ok(b.includes('aria-pressed="false"'), 'nothing is chosen at first')
    assert.match(b, /tabindex="0"/)
  })
  assert.equal(none.match(/aria-hidden="true"/g)?.length, BODIES.filter((b) => !b.select).length + 1, 'decorative planets and the orbits and sun')
  assert.match(none, /role="group" aria-label="Choose a planet to read about"/)
  assert.doesNotMatch(none, /is-selected/)
  for (const [i, id] of (['satpov', 'shopai', 'resume'] as const).entries()) {
    const chosen = render(await planets(), { selected: id, onSelect: () => {} })
    const pressed = buttonsOf(chosen).map((b) => b.includes('aria-pressed="true"'))
    assert.deepEqual(pressed, [0, 1, 2].map((k) => k === i))
    assert.match(chosen, /solar-planet is-selected/)
  }
})

test('all three planets share one dashed ring; there is no separate info or go style', async () => {
  const html = render(await planets(), { selected: null, onSelect: () => {} })
  assert.doesNotMatch(html, /is-go/)
  assert.match(src('components/SolarSystem.css'), /\.solar-ring \{[^}]*stroke-dasharray/s)
  assert.doesNotMatch(src('components/SolarSystem.css'), /is-go/)
})

test('each chosen planet has a hit area of at least 44 CSS px on a phone, and a visible focus ring', async () => {
  const html = render(await planets(), { selected: null, onSelect: () => {} })
  // The picture is drawn VIEW.w units across and is never narrower than 288px (a 320px phone less its gutters).
  const hit = Number(/class="solar-hit" r="(\d+)"/.exec(html)?.[1])
  assert.ok(hit * 2 * (288 / VIEW.w) >= 44, `hit r=${hit}`)
  assert.match(html, /class="solar-focus"/)
  assert.match(src('components/SolarSystem.css'), /\.solar-planet:focus-visible \.solar-focus \{\s*opacity: 1/)
})

const homeParts = async () => loadModule<{ HomeInfoCard: ComponentType<{ panel: (typeof HOME_INFO)[number] }>; HomePlanetSlot: ComponentType<{ panel: (typeof HOME_PLANETS)[number] | null }> }>('/src/components/HomePanel.tsx')
const inRouter = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, node))

test('the planet slot: a labelled live region; a hint with nothing chosen; the chosen planet\'s card with a real router link (same tab)', async () => {
  const { HomePlanetSlot } = await homeParts()
  const hint = inRouter(createElement(HomePlanetSlot, { panel: null }))
  assert.match(hint, /<section class="card home-panel home-slot" aria-label="Explore the site">/)
  assert.match(hint, /aria-live="polite"/)
  assert.ok(hint.includes(HOME_HINT))
  assert.doesNotMatch(hint, /<a |<h2/)
  for (const [id, to, text] of [['satpov', '/satellite-conjunction-screening', 'Open SatPOV'], ['shopai', '/shop', 'Open ShopAI'], ['resume', '/resume', 'Open Résumé']]) {
    const panel = HOME_PLANETS.find((p) => p.id === id)!
    const html = inRouter(createElement(HomePlanetSlot, { panel }))
    assert.match(html, /aria-live="polite"/)
    assert.ok(html.includes(`<h2 class="home-panel-title">${panel.label}</h2>`), id)
    assert.ok(!html.includes(HOME_HINT), 'the hint is gone')
    const link = html.match(/<a [^>]*>[^<]*<\/a>/)?.[0] ?? ''
    assert.ok(link.includes('class="btn btn-primary home-panel-link"') && link.includes(`href="${to}"`) && link.endsWith(`>${text}</a>`), `${id}: ${link}`)
    assert.doesNotMatch(link, /target=/, 'same tab')
  }
})

test('Home: nothing chosen at first; Background and Site Info always shown, in order, without links; one h1', async () => {
  const { default: Home } = await loadModule<{ default: ComponentType }>('/src/pages/Home.tsx')
  const html = inRouter(createElement(Home))
  assert.equal(html.match(/<h1[ >]/g)?.length, 1)
  assert.match(html, /Aerospace engineering, now pointed at data/)
  assert.match(html, /DoD Secret Clearance/)
  assert.match(html, /Physics — Cal State Northridge/)
  assert.match(html, /<h2 id="home-background-title"[^>]*>Background<\/h2>/)
  assert.match(html, /<h2 id="home-site-title"[^>]*>Site Info<\/h2>/)
  assert.ok(html.includes(HOME_HINT))
  assert.doesNotMatch(html, /Open the Satellite POV Tool|Featured project|home-featured|Objects screened|<a /)
  assert.doesNotMatch(html, /aria-pressed="true"/)
})

test('order: Background, Site Info, the solar system, then the planet strip (the phone order, and the tab order: planets, then the strip\'s link)', async () => {
  const { default: Home } = await loadModule<{ default: ComponentType }>('/src/pages/Home.tsx')
  const html = inRouter(createElement(Home))
  const at = ['home-background-title', 'home-site-title', 'class="home-system"', 'home-slot'].map((k) => html.indexOf(k))
  assert.ok(at.every((i) => i > 0))
  assert.deepEqual([...at].sort((a, b) => a - b), at)
  const css = src('pages/Home.css')
  // Below 900px the stage is one column (no named areas); from 900px: the system and the two cards in one row, the strip under them.
  const wide = css.slice(css.indexOf('@media (min-width: 900px) {'))
  assert.match(wide, /grid-template-areas:\s*'system info'\s*'slot slot'/)
  assert.doesNotMatch(css.slice(0, css.indexOf('@media (min-width: 900px) {')), /grid-template-areas/)
})

test('the header: the two tags sit beside the title (as on SatPOV) and the eyebrow line is gone', async () => {
  const home = src('pages/Home.tsx')
  assert.match(home, /titleMeta=\{/)
  assert.doesNotMatch(home, /eyebrow/)
  assert.doesNotMatch(src('content/home.ts'), /HOME_EYEBROW|Aerospace engineer ·/)
  const { default: Home } = await loadModule<{ default: ComponentType }>('/src/pages/Home.tsx')
  const html = inRouter(createElement(Home))
  assert.doesNotMatch(html, /class="eyebrow"|APPLIED AI|Applied AI &amp; data/)
  assert.match(html, /<div class="page-title-row"><h1 class="page-title">Aerospace engineering, now pointed at data<\/h1><ul class="chip-list home-tags" aria-label="Credentials">/)
  assert.doesNotMatch(html, /is-aside/, 'no empty right-hand column in the header')
  assert.match(src('components/PageHeader.tsx'), /aside \? `is-aside-\$\{asideSize\}` : ''/)
})

test('one screen: the row\'s height comes from the window, and nav, header, row and strip fit', () => {
  const css = src('pages/Home.css')
  assert.match(css, /--home-strip-h: 9rem/)
  assert.match(css, /--home-chrome: calc\(74\.1px \+ clamp\(1\.25rem, 2vw, 2rem\) \+ 28px \+ clamp\(0\.6rem, 1vw, 0\.9rem\) \+ clamp\(0\.75rem, 2vw, 1\.5rem\) \+ 0\.9rem \+ var\(--home-strip-h\) \+ 0\.75rem\)/)
  assert.match(css, /--home-h: clamp\(340px, calc\(100vh - var\(--home-chrome\)\), 570px\)/)
  assert.match(css, new RegExp(`--home-aspect: calc\\(${VIEW.w} / ${VIEW.h}\\)`), 'the picture\'s own aspect ratio')
  // The system column is as wide as H gives the picture (so it is exactly H tall); the row is at least H and grows rather than overlap.
  assert.match(css, /grid-template-columns: calc\(var\(--home-h\) \* var\(--home-aspect\)\) minmax\(0, 1fr\)/)
  assert.match(css, /grid-template-rows: minmax\(var\(--home-h\), auto\) auto/)
  assert.match(css, /\.home-stage \{[^}]*align-items: stretch/s)
  assert.match(css, /\.home-info \{[^}]*flex: 1 1 auto/s)
  assert.ok(VIEW.w / VIEW.h > 1.2 && VIEW.w / VIEW.h < 1.25)
})

test('the strip keeps one height whether or not a planet is chosen; the cards have none of their own', () => {
  const css = src('pages/Home.css')
  assert.match(css, /\.home-slot \{[^}]*min-height: var\(--home-strip-h\)/s)
  assert.match(css, /\.home-slot-content \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto/s)
  assert.doesNotMatch(css, /\.home-info[^{]*\{[^}]*(?<![-\w])(min-)?height:/s)
  assert.doesNotMatch(css, /sizer|panel-stack|height: 406/)
  assert.doesNotMatch(src('pages/Home.tsx') + src('components/HomePanel.tsx'), /sizer|panel-stack/)
  assert.match(css, /\.home-panel-content \{[^}]*animation: home-panel-in/s)
  assert.match(css, /prefers-reduced-motion: reduce\) \{\s*\.home-panel-content \{\s*animation: none/)
  // The strip's text is on the left and the button on the right: the text group comes first.
  assert.match(src('components/HomePanel.tsx'), /home-slot-text[\s\S]*home-panel-link/)
})

test('alignment: the system starts at the left edge (no centring or inner padding)', () => {
  const css = src('pages/Home.css')
  assert.match(css, /\.home-system \{[^}]*justify-self: start/s)
  assert.doesNotMatch(css.slice(css.indexOf('.home-system {'), css.indexOf('}', css.indexOf('.home-system {'))), /margin|padding|center/)
  assert.doesNotMatch(css, /align-items: center;\s*\n\s*gap/)
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
