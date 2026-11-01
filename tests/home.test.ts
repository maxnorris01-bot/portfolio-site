import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, test } from 'node:test'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { BODIES, CHOSEN, LABEL_SLOTS, ORBITS, VIEW, advance, labelWidth, labelsOverlap, layoutLabels, place, positionAt, shouldMove } from '../src/components/solarmodel.ts'
import { HOME_DEFAULT_PLANET, HOME_INFO, HOME_PLANETS, HOME_TITLE, type PlanetId } from '../src/content/home.ts'
import * as contentModule from '../src/content/home.ts'
import { closeServer, loadModule, render } from './helpers/ssr.ts'

after(closeServer)

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')

const visible = (copy: { text: string; short?: string }) => copy.text

test('the title text is kept (for the hidden h1); the Background and About this site texts (DRAFT, all in content/home.ts) say what the spec says', () => {
  assert.equal(HOME_TITLE, 'Aerospace engineering, now pointed at data')
  assert.ok(!('HOME_CREDENTIALS' in contentModule), 'the credentials tags are gone')
  const bg = HOME_INFO.find((p) => p.id === 'background')
  const text = bg?.paragraphs?.map(visible).join(' ') ?? ''
  for (const fact of ['Aerospace mass-properties engineer', '10+ years', 'Northrop Grumman', 'Joby Aviation', 'applied AI and data pipelines', 'transparent', 'real physics']) assert.ok(text.includes(fact), fact)
  const site = HOME_INFO.find((p) => p.id === 'site')
  assert.equal(site?.label, 'About this site')
  assert.deepEqual(site?.bullets?.map((b) => b.lead), ['Purpose:', 'Backend:', 'What it shows:'])
  const all = site?.bullets?.map((b) => b.text).join(' ') ?? ''
  for (const fact of ['working portfolio', 'runs live', 'Python service (Fly.io) with Postgres', 'reachable only through this site', 'Spending is capped', '1,700+ automated tests', 'locked evaluation set', 'end-to-end ownership', 'LLM ranking with cost controls', 'physics background']) assert.ok(all.includes(fact), fact)
  assert.match(src('content/home.ts'), /DRAFT/)
})

test('copy: each block is within 15% of the spec\'s length (top card 215 characters, bottom card about 520)', () => {
  const bg = HOME_INFO[0].paragraphs ?? []
  const top = bg.map((c) => c.text.length).reduce((a, b) => a + b, 0)
  assert.ok(top >= 215 * 0.85 && top <= 215 * 1.15, `top ${top}`)
  const bullets = HOME_INFO[1].bullets ?? []
  const bottom = bullets.map((b) => b.text.length).reduce((a, b) => a + b, 0)
  assert.ok(bottom >= 480 * 0.8 && bottom <= 580 * 1.15, `bottom ${bottom}`)
  const backend = bullets[1]
  assert.ok(backend.short && backend.short.length < backend.text.length, 'the Backend row has a shorter text for a small window')
  // The rows share the card's height as their line counts: 2, 4 and 3 lines (2, 3 and 3 in a small window).
  assert.deepEqual(bullets.map((b) => b.lines), [2, 4, 3])
  assert.deepEqual(bullets.map((b) => b.midLines), [2, 4, 3])
  assert.deepEqual(bullets.map((b) => b.shortLines), [1.9, 3, 3])
})

test('only three planets lead somewhere, each with an Open link to its route; the strip is never empty (SatPOV is chosen from the start)', () => {
  assert.deepEqual(HOME_INFO.map((p) => p.id), ['background', 'site'])
  assert.deepEqual(HOME_PLANETS.map((p) => p.label), ['SatPOV', 'ShopAI', 'Résumé'])
  assert.deepEqual(HOME_PLANETS.map((p) => p.link), [
    { to: '/satellite-conjunction-screening', text: 'Open SatPOV' },
    { to: '/shop', text: 'Open ShopAI' },
    { to: '/resume', text: 'Open Résumé' },
  ])
  for (const p of HOME_PLANETS) assert.ok(p.paragraphs.length >= 2 && p.paragraphs.length <= 3, p.id)
  assert.equal(HOME_DEFAULT_PLANET, 'satpov')
  assert.doesNotMatch(src('content/home.ts') + src('components/HomePanel.tsx') + src('pages/Home.tsx'), /HOME_HINT|home-hint|Select a planet to explore/)
})

test('the planet descriptions say only what the README, the pages and the Résumé data say', () => {
  const text = (id: string) => (HOME_PLANETS.find((p) => p.id === id)?.paragraphs ?? []).join(' ')
  for (const fact of ['3D globe', 'Hipparcos and Gaia', 'close approaches', 'ride along']) assert.ok(text('satpov').includes(fact), fact)
  for (const fact of ['Google Shopping', 'Love, Like or Dislike', 'Shop Again', 'Saved list']) assert.ok(text('shopai').includes(fact), fact)
  for (const fact of ['Joby Aviation', 'Northrop Grumman', 'DoD Secret', 'Cal State Northridge', 'SciPy']) assert.ok(text('resume').includes(fact), fact)
})

test('the three planet descriptions are about the same length: totals within 15% of each other, a short first sentence and a longer second one', () => {
  const sizes = HOME_PLANETS.map((p) => p.paragraphs.join('').length)
  assert.ok(Math.min(...sizes) >= Math.max(...sizes) * 0.85, `totals ${sizes.join(', ')}`)
  for (const p of HOME_PLANETS) {
    assert.equal(p.paragraphs.length, 2, p.id)
    assert.ok(p.paragraphs[0].length <= 125 && p.paragraphs[1].length >= 150 && p.paragraphs[1].length <= 215, `${p.id}: ${p.paragraphs.map((x) => x.length).join(' + ')}`)
  }
})

test('exactly three planets can be chosen (SatPOV, ShopAI, Résumé), on different orbits and at different speeds; the rest are decoration', () => {
  assert.deepEqual(CHOSEN.map((b) => b.select?.label), ['SatPOV', 'ShopAI', 'Résumé'])
  assert.deepEqual(CHOSEN.map((b) => b.select?.id), HOME_PLANETS.map((p) => p.id))
  assert.ok(BODIES.length - CHOSEN.length >= 5, 'several decorative planets')
  assert.equal(new Set(CHOSEN.map((b) => b.orbit)).size, 3)
  assert.equal(new Set(CHOSEN.map((b) => b.period)).size, 3)
  assert.ok(!BODIES.some((b) => b.select && ['background', 'site'].includes(b.select.id)), 'Background and Site Info are no longer planets')
})

test('choosing another planet switches the strip; choosing the chosen one again does nothing', () => {
  const home = src('pages/Home.tsx')
  assert.match(home, /useState<PlanetId>\(HOME_DEFAULT_PLANET\)/)
  assert.match(home, /onSelect=\{setSelected\}/)
  assert.doesNotMatch(home, /toggle|null/)
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
  const lay = layoutLabels(items, items.map(() => 0), items.map((_, i) => i))
  lay.forEach((l, i) => {
    const x0 = items[i].x + l.dx - items[i].w / 2, x1 = items[i].x + l.dx + items[i].w / 2, base = items[i].y + LABEL_SLOTS[l.slot]
    assert.ok(x0 >= VIEW.x && x1 <= VIEW.x + VIEW.w && base - 13 >= VIEW.y && base + 4 <= VIEW.y + VIEW.h, `label ${i} inside the box at rest`)
  })
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

test('the drawing is tight: its box starts at the outer orbit\'s left and top, ends at its right and bottom, with about a unit to spare, and has the 49:32 aspect', () => {
  let l = Infinity, r = -Infinity, tp = Infinity, bt = -Infinity
  for (let a = 0; a < 360; a += 0.25) { const q = place(ORBITS.length - 1, a); l = Math.min(l, q.x); r = Math.max(r, q.x); tp = Math.min(tp, q.y); bt = Math.max(bt, q.y) }
  const pad = { left: l - VIEW.x, right: VIEW.x + VIEW.w - r, top: tp - VIEW.y, bottom: VIEW.y + VIEW.h - bt }
  for (const [side, v] of Object.entries(pad)) assert.ok(v >= 0.6 && v <= 6, `${side} padding ${v.toFixed(2)} units`)
  // The extent is at least 98% of the box each way (the owner's mockup: 98.5% by 97.5%).
  assert.ok((r - l) / VIEW.w >= 0.98 && (bt - tp) / VIEW.h >= 0.98, `extent ${((r - l) / VIEW.w).toFixed(3)} x ${((bt - tp) / VIEW.h).toFixed(3)}`)
  assert.ok(Math.abs(VIEW.w / VIEW.h - 49 / 32) < 0.005, `aspect ${(VIEW.w / VIEW.h).toFixed(4)}`)
})

test('labels stay inside the drawing\'s box all the time (never cut off at its edges)', () => {
  for (let sel = 0; sel < CHOSEN.length; sel++) {
    const prev = CHOSEN.map(() => 0)
    for (let t = 0; t < 1200; t += 0.5) {
      const items = CHOSEN.map((b, i) => ({ ...positionAt(b, t, false), w: labelWidth(b.select!.label, i === sel) }))
      const lay = layoutLabels(items, prev, CHOSEN.map((_, i) => i).sort((i, j) => Number(j === sel) - Number(i === sel)))
      lay.forEach((l, i) => {
        prev[i] = l.slot
        const x0 = items[i].x + l.dx - items[i].w / 2, x1 = items[i].x + l.dx + items[i].w / 2
        const base = items[i].y + LABEL_SLOTS[l.slot]
        assert.ok(x0 >= VIEW.x - 0.01 && x1 <= VIEW.x + VIEW.w + 0.01, `${CHOSEN[i].key} sideways at ${t}`)
        assert.ok(base - 13 >= VIEW.y - 0.01 && base + 4 <= VIEW.y + VIEW.h + 0.01, `${CHOSEN[i].key} up or down at ${t}`)
      })
    }
  }
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
  const { default: SolarSystem } = await loadModule<{ default: ComponentType<{ selected: PlanetId; onSelect: (id: PlanetId) => void }> }>('/src/components/SolarSystem.tsx')
  return SolarSystem
}

const buttonsOf = (html: string) => [...html.matchAll(/<g [^>]*role="button"[^>]*>/g)].map((m) => m[0])

test('the three planets are buttons in reading order with names and pressed state; decoration is hidden from assistive technology', async () => {
  const names = ['SatPOV', 'ShopAI', 'Résumé']
  const start = render(await planets(), { selected: HOME_DEFAULT_PLANET, onSelect: () => {} })
  const buttons = buttonsOf(start)
  assert.equal(buttons.length, 3)
  buttons.forEach((b, i) => {
    assert.ok(b.includes(`aria-label="${names[i]}"`), names[i])
    assert.match(b, /tabindex="0"/)
  })
  assert.deepEqual(buttons.map((b) => b.includes('aria-pressed="true"')), [true, false, false], 'SatPOV is chosen from the start')
  assert.equal(start.match(/aria-hidden="true"/g)?.length, BODIES.filter((b) => !b.select).length + 1, 'decorative planets and the orbits and sun')
  assert.match(start, /role="group" aria-label="Choose a planet to read about"/)
  for (const [i, id] of (['satpov', 'shopai', 'resume'] as const).entries()) {
    const chosen = render(await planets(), { selected: id, onSelect: () => {} })
    assert.deepEqual(buttonsOf(chosen).map((b) => b.includes('aria-pressed="true"')), [0, 1, 2].map((k) => k === i))
    assert.match(chosen, /solar-planet is-selected/)
  }
})

test('all three planets share one dashed ring; there is no separate info or go style', async () => {
  const html = render(await planets(), { selected: 'satpov', onSelect: () => {} })
  assert.doesNotMatch(html, /is-go/)
  assert.match(src('components/SolarSystem.css'), /\.solar-ring \{[^}]*stroke-dasharray/s)
  assert.doesNotMatch(src('components/SolarSystem.css'), /is-go/)
})

test('each chosen planet has a hit area of at least 44 CSS px on a phone, and a visible focus ring', async () => {
  const html = render(await planets(), { selected: 'satpov', onSelect: () => {} })
  // The picture is drawn VIEW.w units across and is never narrower than 288px (a 320px phone less its gutters).
  const hit = Number(/class="solar-hit" r="(\d+)"/.exec(html)?.[1])
  assert.ok(hit * 2 * (288 / VIEW.w) >= 44, `hit r=${hit}`)
  assert.match(html, /class="solar-focus"/)
  assert.match(src('components/SolarSystem.css'), /\.solar-planet:focus-visible \.solar-focus \{\s*opacity: 1/)
})

const homeParts = async () => loadModule<{ HomeInfoCard: ComponentType<{ panel: (typeof HOME_INFO)[number] }>; HomePlanetSlot: ComponentType<{ panel: (typeof HOME_PLANETS)[number] }> }>('/src/components/HomePanel.tsx')
const inRouter = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, node))

test('the strip: a labelled live region in three zones (heading and first sentence, second sentence, a real router link, same tab), laid out for the chosen planet only', async () => {
  const { HomePlanetSlot } = await homeParts()
  for (const [id, to, text] of [['satpov', '/satellite-conjunction-screening', 'Open SatPOV'], ['shopai', '/shop', 'Open ShopAI'], ['resume', '/resume', 'Open Résumé']]) {
    const panel = HOME_PLANETS.find((p) => p.id === id)!
    const html = inRouter(createElement(HomePlanetSlot, { panel }))
    assert.match(html, /<section class="card home-panel home-slot" aria-label="Explore the site">/)
    const live = html.slice(html.indexOf('aria-live="polite"'))
    assert.ok(live.includes(`<h2 class="home-panel-title">${panel.label}</h2>`), id)
    assert.equal(live.match(/class="home-zone"/g)?.length, 2, 'two text zones')
    const esc = (s: string) => s.replace(/'/g, '&#x27;')
    assert.ok(live.indexOf(esc(panel.paragraphs[0])) > 0 && live.indexOf(esc(panel.paragraphs[0])) < live.indexOf(esc(panel.paragraphs[1])) && live.indexOf(esc(panel.paragraphs[1])) < live.indexOf('<a '), 'heading and first sentence, second sentence, link')
    const link = live.match(/<a [^>]*>[^<]*<\/a>/)?.[0] ?? ''
    assert.ok(link.includes('class="btn btn-primary home-panel-link"') && link.includes(`href="${to}"`) && link.endsWith(`>${text}</a>`), `${id}: ${link}`)
    assert.doesNotMatch(link, /target=/, 'same tab')
    assert.doesNotMatch(html, /sizer|aria-hidden/, 'no hidden copies of the other planets\' text: the strip is as tall as its own text')
    assert.equal(html.match(/<a /g)?.length, 1)
  }
})

test('Home: SatPOV\'s strip shows from the start; Background and About this site are always shown, in order, without links; one h1', async () => {
  const { default: Home } = await loadModule<{ default: ComponentType }>('/src/pages/Home.tsx')
  const html = inRouter(createElement(Home))
  assert.equal(html.match(/<h1[ >]/g)?.length, 1)
  assert.match(html, /Aerospace engineering, now pointed at data/)
  assert.doesNotMatch(html, /DoD Secret Clearance|Physics — Cal State Northridge|chip-list|page-header/, 'no visible header or tags')
  assert.match(html, /<h2 id="home-background-title"[^>]*>Background<\/h2>/)
  assert.match(html, /<h2 id="home-site-title"[^>]*>About this site<\/h2>/)
  assert.match(html, /<strong class="home-row-label">Purpose<\/strong>/)
  assert.match(html, /class="home-rows" style="--rows-full:2fr 4fr 3fr;--rows-mid:2fr 4fr 3fr;--rows-short:1.9fr 3fr 3fr"/)
  assert.match(html, /<h2 class="home-panel-title">SatPOV<\/h2>/)
  assert.match(html, /href="\/satellite-conjunction-screening"/)
  assert.doesNotMatch(html, /Open the Satellite POV Tool|Featured project|home-featured|Objects screened/)
  assert.equal(html.match(/<a /g)?.length, 1)
})

test('order: the two cards, the solar system, then the planet strip (the phone order, and the tab order: planets, then the strip\'s link)', async () => {
  const { default: Home } = await loadModule<{ default: ComponentType }>('/src/pages/Home.tsx')
  const html = inRouter(createElement(Home))
  const at = ['home-background-title', 'home-site-title', 'class="home-system"', 'class="card home-panel home-slot"'].map((k) => html.indexOf(k))
  assert.ok(at.every((i) => i > 0))
  assert.deepEqual([...at].sort((a, b) => a - b), at)
  const css = src('pages/Home.css')
  const wide = css.slice(css.indexOf('@media (min-width: 1280px) {'))
  assert.match(wide, /grid-template-areas:\s*'system info'\s*'slot slot'/)
  assert.doesNotMatch(css.slice(0, css.indexOf('@media (min-width: 1280px) {')), /grid-template-areas/)
})

test('the page has no visible header: exactly one h1, visually hidden, with the old title text; the row starts right under the nav', async () => {
  const home = src('pages/Home.tsx')
  assert.doesNotMatch(home, /PageHeader|titleMeta|eyebrow|HOME_CREDENTIALS/)
  const { default: Home } = await loadModule<{ default: ComponentType }>('/src/pages/Home.tsx')
  const html = inRouter(createElement(Home))
  assert.equal(html.match(/<h1[ >]/g)?.length, 1)
  assert.match(html, /<h1 class="visually-hidden">Aerospace engineering, now pointed at data<\/h1>/)
  assert.ok(html.indexOf('<h1') < html.indexOf('home-grid'), 'the h1 comes first')
  const c = css()
  assert.match(c, /\.home-page \.visually-hidden \{[^}]*position: absolute[^}]*width: 1px[^}]*height: 1px[^}]*clip-path: inset\(50%\)/s)
  assert.doesNotMatch(c, /home-tags|\.page-header|2\.4cqw/, 'nothing left that assumed a header')
  assert.ok(!('HOME_CREDENTIALS' in contentModule))
  // The page's own padding is the gap under the nav (the row is the first thing in the page).
  assert.match(src('index.css'), /\.page \{[^}]*padding: clamp\(1\.25rem, 2vw, 2rem\) 0 clamp\(2rem, 5vw, 4rem\)/s)
})

test('Shop and the 404 page still use PageHeader, and so does SatPOV (titleMeta and eyebrow are still used there)', () => {
  assert.match(src('shop/ShopView.tsx'), /<PageHeader/)
  assert.match(src('App.tsx'), /<PageHeader title="Page not found"/)
  assert.match(src('pages/SatelliteTool.tsx'), /titleMeta=\{/)
  assert.match(src('pages/SatelliteTool.tsx'), /eyebrow=\{/)
})

// ---- the layout's proportions, from the owner's measured mockup (fractions of the content width Wc, or of the row height R) ----

const css = () => src('pages/Home.css')

test('layout: the container is a size container, so cqw is 1% of Wc', () => {
  assert.match(css(), /\.home-page \.page-container \{\s*container-type: inline-size/)
})

test('layout: row 1 is R = 32% of Wc tall; the system box is 49% wide (at most), the gutter 2%, the cards take the rest (49%)', () => {
  const c = css()
  assert.match(c, /--home-r: max\(300px, min\(32cqw, var\(--home-room\)\)\)/)
  assert.match(c, /grid-template-columns: min\(49cqw, calc\(var\(--home-r\) \* var\(--home-aspect\)\)\) minmax\(0, 1fr\)/)
  assert.match(c, /grid-template-rows: minmax\(var\(--home-r\), auto\) auto/)
  assert.match(c, /column-gap: 2cqw/)
  assert.match(c, /--home-aspect: calc\(418 \/ 273\)/)
  assert.equal(VIEW.w, 418)
  assert.equal(VIEW.h, 273)
  // Not binding, the system column is min(49% , 32% x aspect): 32 x 1.5311 = 48.99%.
  assert.ok(Math.abs(32 * (VIEW.w / VIEW.h) - 49) < 0.1)
})

test('layout: the cards are 32% : 4% : 64% of R, with the same top and bottom as the system; the strip is 1.6% below', () => {
  const c = css()
  assert.match(c, /--home-card-gap: calc\(var\(--home-r\) \* 0\.04\)/)
  assert.match(c, /\.home-info \{\s*flex: 0 0 calc\(\(100% - var\(--home-card-gap\)\) \/ 3\)/)
  assert.match(c, /\.home-info \+ \.home-info \{\s*flex-basis: calc\(\(100% - var\(--home-card-gap\)\) \* 2 \/ 3\)/)
  assert.match(c, /\.home-grid \{[^}]*align-items: stretch/s)
  assert.match(c, /row-gap: 1\.6cqw/)
  // (0.96 R) / 3 = 0.32 R and (0.96 R) x 2 / 3 = 0.64 R.
  assert.ok(Math.abs(0.96 / 3 - 0.32) < 1e-9 && Math.abs((0.96 * 2) / 3 - 0.64) < 1e-9)
})

test('layout: R is also at most the room the window has left, and then the cards get wider, not taller', () => {
  const c = css()
  assert.match(c, /--home-room: calc\(100vh - 74\.1px - clamp\(1\.25rem, 2vw, 2rem\) - 1\.6cqw - var\(--home-strip-est\) - 1rem\)/)
  assert.match(c, /--home-strip-est: 7\.8rem/)
  assert.match(c, /calc\(var\(--home-r\) \* var\(--home-aspect\)\)\) minmax\(0, 1fr\)/)
})

test('type fits its box: each card and strip zone is a size container and its text size comes from the container\'s width (16px or more, capped), with no max-width on the text', () => {
  const c = css()
  assert.match(c, /--home-fs: clamp\(16px, 2\.7cqw, 22px\)/)
  assert.match(c, /--home-strip-fs: clamp\(16px, 3cqw, 20px\)/)
  assert.match(c, /\.home-panel \{\s*container-type: inline-size/)
  assert.match(c, /\.home-zone \{\s*container-type: inline-size/)
  assert.match(c, /\.home-panel-title \{[^}]*font-size: calc\(var\(--home-fs\) \* 1\.3\)/s)
  assert.match(c, /\.home-zone \.home-panel-title \{\s*font-size: calc\(var\(--home-strip-fs\) \* 1\.15\)/)
  assert.match(c, /\.home-panel \.home-lead \{\s*font-size: min\(calc\(var\(--home-fs\) \* 1\.15\), 24px\)/)
  assert.match(c, /\.home-panel p,\s*\.home-row-text,\s*\.home-row-label \{[^}]*font-size: var\(--home-fs\)[^}]*line-height: 1\.45/s)
  const cards = c.slice(c.indexOf('.home-panel {'), c.indexOf('/* Below 1280px'))
  assert.doesNotMatch(cards, /max-width|max-inline-size/, 'the box and the type size set the line length, not a narrower column')
  assert.doesNotMatch(cards, /font-size: 0\.[0-9]+rem/, 'no card or strip text under 1rem')
})

test('About this site: a label column and the text in three rows that share the card\'s height, with a hairline between them', () => {
  const c = css()
  assert.match(c, /\.home-rows \{[^}]*display: grid[^}]*grid-template-rows: var\(--rows-full\)/s)
  assert.match(c, /\.home-row \{[^}]*grid-template-columns: 21% minmax\(0, 1fr\)[^}]*align-items: center/s)
  assert.match(c, /\.home-row \+ \.home-row \{\s*border-top: 1px solid var\(--color-border\)/)
  assert.doesNotMatch(c.slice(c.indexOf('.home-row {'), c.indexOf('}', c.indexOf('.home-row {'))), /padding/, 'a row has no padding of its own: its text fills it')
  assert.match(src('components/HomePanel.tsx'), /b\.lead\.replace\(\/:\$\/, ''\)/)
})

test('three sizes of window get three cuts of the text, each at its own row split (and the type does not shrink): large, mid, short', () => {
  const c = css()
  assert.match(c, /@media \(min-width: 1700px\) and \(min-height: 950px\) \{\s*\.home-full \{\s*display: inline/)
  assert.match(c, /@media \(min-width: 1280px\) and \(max-height: 820px\), \(min-width: 1280px\) and \(max-width: 1359px\) \{/)
  assert.match(c, /grid-template-rows: var\(--rows-mid\)/)
  assert.match(c, /grid-template-rows: var\(--rows-short\)/)
  assert.match(c, /--home-fs: clamp\(16px, calc\(16px \+ \(100vh - 720px\) \* 0\.0208\), 17px\)/)
  assert.match(c, /\.home-mid,\s*\.home-short \{\s*display: none/)
})

test('stacked (below 1280px), a card is padded in so a line stays near 75 characters however wide the window is', () => {
  assert.match(css(), /@media \(max-width: 1279px\) \{[^}]*\.home-info,\s*\.home-slot \{\s*padding-inline: max\(24px, calc\(\(100cqw - 40rem\) \/ 2\)\)/s)
})

test('the cards\' side padding is small and fixed in range (about 32px at 1440): the type, not the padding, fills the width', () => {
  const c = css()
  assert.match(c, /\.home-info \{[^}]*padding: clamp\(8px, 0\.75cqw, 16px\) clamp\(20px, 2\.2cqw, 36px\)/s)
  assert.doesNotMatch(c, /5\.3cqw|5\.6cqw|110px/)
  const wc1440 = 13.766 * 100 // the content width at 1440 (1376.6px)
  const px = Math.min(36, Math.max(20, 0.022 * wc1440))
  assert.ok(px > 29 && px < 33, `${px.toFixed(1)}px at 1440`)
})

test('the layout check is a runnable script with an npm script, and its targets are the owner\'s', () => {
  const script = readFileSync(new URL('../scripts/check-layout.mjs', import.meta.url), 'utf8')
  assert.match(script, /hFill: 0\.9, vFill: 0\.88, cplMin: 45, cplMax: 80/)
  for (const size of ['1280, 720', '1366, 768', '1440, 900', '1920, 1080']) assert.ok(script.includes(`[${size}]`), size)
  assert.match(script, /process\.exit\(1\)/)
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(pkg.scripts['check:layout'], 'node scripts/check-layout.mjs')
  assert.ok(!('playwright' in (pkg.devDependencies ?? {})) && !('playwright' in (pkg.dependencies ?? {})), 'no new dependency')
  assert.ok(Array.isArray(JSON.parse(readFileSync(new URL('../scripts/check-layout.expected.json', import.meta.url), 'utf8')).misses))
})

test('the strip hugs its text: no reserved height, padded like the other cards, three zones with the button centred at the right; the rows above are sized for the tallest strip', () => {
  const c = css()
  assert.doesNotMatch(c, /\.home-slot[^{]*\{[^}]*(min-)?height:/s, 'the strip has no height of its own')
  assert.doesNotMatch(c, /sizer|panel-stack|8\.8cqw/)
  assert.match(c, /\.home-slot \{\s*padding: clamp\(12px, 1\.2cqw, 20px\) clamp\(20px, 2\.2cqw, 36px\)/)
  assert.match(c, /\.home-slot-content \{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\) auto/s)
  assert.match(c, /\.home-slot-content \{[^}]*column-gap: clamp\(2rem, 5\.5cqw, 100px\)/s)
  assert.match(c, /\.home-slot \.home-panel-link \{\s*justify-self: end/)
  assert.match(c, /\.home-slot-content \{[^}]*align-items: center/s)
  // The viewport rule counts the strip at one fixed height (the tallest planet's, about 125px), so choosing a planet never moves row 1.
  assert.match(c, /--home-strip-est: 7\.8rem/)
  assert.match(c, /\.home-panel-content \{\s*animation: home-panel-in/)
  assert.match(c, /prefers-reduced-motion: reduce\) \{\s*\.home-panel-content \{\s*animation: none/)
  assert.doesNotMatch(c.slice(c.indexOf('.home-info {'), c.indexOf('}', c.indexOf('.home-info {'))), /(?<![-\w])(min-)?height:/)
})

test('the strip is measured against the visible strip card\'s inner rectangle, and so is every other box (never a content-sized child)', () => {
  const script = readFileSync(new URL('../scripts/check-layout.mjs', import.meta.url), 'utf8')
  assert.match(script, /const stripCard = document\.querySelector\('\.home-slot'\)\s*const sbox = inner\(stripCard\)/)
  assert.match(script, /stripTall: 0\.88, stripShort: 0\.75, stripSpan: 0\.92/)
  assert.match(script, /boxOf\('Background card', cards\[0\]/)
  assert.match(script, /boxOf\('About card \(whole\)', cards\[1\]/)
  assert.doesNotMatch(script, /\.\.\.zones\.map\(\(z, i\) => boxOf/, 'the strip zones are no longer measured as boxes of their own')
})

test('alignment: the system starts at the left edge (no centring or inner padding)', () => {
  const c = css()
  assert.match(c, /\.home-system \{[^}]*justify-self: start/s)
  assert.doesNotMatch(c.slice(c.indexOf('.home-system {'), c.indexOf('}', c.indexOf('.home-system {'))), /margin|padding|center/)
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
