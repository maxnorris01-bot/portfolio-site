import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, test } from 'node:test'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { BODIES, CHOSEN, LABEL_SLOTS, ORBITS, VIEW, advance, labelWidth, labelsOverlap, layoutLabels, place, positionAt, shouldMove } from '../src/components/solarmodel.ts'
import * as contentModule from '../src/content/home.ts'
import { HOME_DEFAULT_PLANET, HOME_INFO, HOME_PLANETS, HOME_TITLE, type PlanetId } from '../src/content/home.ts'
import { closeServer, loadModule, render } from './helpers/ssr.ts'

after(closeServer)

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')
const css = () => src('pages/Home.css')

test('the title is editable in one place and is the owner\'s draft; the credentials tags are gone', () => {
  assert.equal(HOME_TITLE, 'Aerospace Engineer · AI Projects Portfolio')
  assert.ok(!('HOME_CREDENTIALS' in contentModule))
  assert.match(src('content/home.ts'), /DRAFT/)
})

test('Background and About this site (DRAFT, all in content/home.ts) say what the brief says, as label | text rows', () => {
  const bg = HOME_INFO.find((p) => p.id === 'background')
  assert.deepEqual(bg?.bullets.map((b) => b.lead), ['Experience', 'Focus', 'Education'])
  const text = bg?.bullets.map((b) => b.text).join(' ') ?? ''
  for (const fact of ['aerospace mass-properties engineer', '10+ years', 'Northrop Grumman', 'Joby Aviation', 'applied AI and data pipelines', 'transparent', 'real physics', 'Cal State Northridge']) assert.ok(text.includes(fact), fact)
  const site = HOME_INFO.find((p) => p.id === 'site')
  assert.equal(site?.label, 'About this site')
  assert.deepEqual(site?.bullets.map((b) => b.lead), ['Purpose', 'Backend', 'What it shows', 'Stack'])
  const all = site?.bullets.map((b) => b.text).join(' ') ?? ''
  for (const fact of ['working portfolio', 'Python service (Fly.io) with Postgres', 'reachable only through this site', 'Spending is capped', '1,700+ automated tests', 'locked evaluation set', 'end-to-end ownership', 'LLM ranking with cost controls', 'React, TypeScript, Vercel']) assert.ok(all.includes(fact), fact)
  assert.match(src('content/home.ts'), /DRAFT/)
})

test('the Stack row is back, and is the one row a short window leaves out; every other row has a compact cut or none needed', () => {
  const rows = HOME_INFO[1].bullets
  assert.ok(rows.some((b) => b.lead === 'Stack' && b.compactHide))
  assert.deepEqual(rows.filter((b) => b.compactHide).map((b) => b.lead), ['Stack'])
})

test('only three planets lead somewhere, each with an Open link to its route; the card is never empty (SatPOV is chosen from the start)', () => {
  assert.deepEqual(HOME_INFO.map((p) => p.id), ['background', 'site'])
  assert.deepEqual(HOME_PLANETS.map((p) => p.label), ['SatPOV', 'ShopAI', 'Résumé'])
  assert.deepEqual(HOME_PLANETS.map((p) => p.link), [
    { to: '/satellite-conjunction-screening', text: 'Open SatPOV' },
    { to: '/shop', text: 'Open ShopAI' },
    { to: '/resume', text: 'Open Résumé' },
  ])
  assert.equal(HOME_DEFAULT_PLANET, 'satpov')
})

test('the planet descriptions say only what the README, the pages and the Résumé data say, and are about the same length', () => {
  const text = (id: string) => (HOME_PLANETS.find((p) => p.id === id)?.paragraphs ?? []).map((c) => c.text).join(' ')
  for (const fact of ['3D globe', 'Hipparcos and Gaia', 'close approaches', 'ride along']) assert.ok(text('satpov').includes(fact), fact)
  for (const fact of ['Google Shopping', 'Love, Like or Dislike', 'Shop Again', 'Saved list']) assert.ok(text('shopai').includes(fact), fact)
  for (const fact of ['Joby Aviation', 'Northrop Grumman', 'DoD Secret', 'Cal State Northridge', 'SciPy']) assert.ok(text('resume').includes(fact), fact)
  const sizes = HOME_PLANETS.map((p) => p.paragraphs.map((c) => c.text).join('').length)
  assert.ok(Math.min(...sizes) >= Math.max(...sizes) * 0.85, `totals ${sizes.join(', ')}`)
})

test('exactly three planets can be chosen (SatPOV, ShopAI, Résumé), on different orbits and at different speeds; the rest are decoration', () => {
  assert.deepEqual(CHOSEN.map((b) => b.select?.label), ['SatPOV', 'ShopAI', 'Résumé'])
  assert.deepEqual(CHOSEN.map((b) => b.select?.id), HOME_PLANETS.map((p) => p.id))
  assert.ok(BODIES.length - CHOSEN.length >= 5, 'several decorative planets')
  assert.equal(new Set(CHOSEN.map((b) => b.orbit)).size, 3)
  assert.equal(new Set(CHOSEN.map((b) => b.period)).size, 3)
})

test('choosing another planet switches the card; choosing the chosen one again does nothing', () => {
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

test('the planet card: a labelled live region; the name on the left and the pill link on the right in one row, then the two sentences; a real router link, same tab', async () => {
  const { HomePlanetSlot } = await homeParts()
  for (const [id, to, text] of [['satpov', '/satellite-conjunction-screening', 'Open SatPOV'], ['shopai', '/shop', 'Open ShopAI'], ['resume', '/resume', 'Open Résumé']]) {
    const panel = HOME_PLANETS.find((p) => p.id === id)!
    const html = inRouter(createElement(HomePlanetSlot, { panel }))
    assert.match(html, /<section class="card home-panel home-slot" aria-label="Explore the site">/)
    const live = html.slice(html.indexOf('aria-live="polite"'))
    const head = live.match(/<div class="home-slot-head">(.*?)<\/div>/)?.[1] ?? ''
    assert.ok(head.startsWith(`<h2 class="home-panel-title">${panel.label}</h2>`), id)
    const link = head.match(/<a [^>]*>[^<]*<\/a>/)?.[0] ?? ''
    assert.ok(link.includes('class="btn btn-primary home-panel-link"') && link.includes(`href="${to}"`) && link.endsWith(`>${text}</a>`), `${id}: ${link}`)
    assert.doesNotMatch(link, /target=/, 'same tab')
    const esc = (s: string) => s.replace(/'/g, '&#x27;')
    assert.ok(live.indexOf('</div>', live.indexOf('home-slot-head')) < live.indexOf(esc(panel.paragraphs[0].text)), 'the text comes under the heading row')
    assert.equal(html.match(/<p>/g)?.length, 2, 'two sentences')
    assert.equal(html.match(/<a /g)?.length, 1)
  }
})

test('Home: a visible h1 (the title), the two cards, the system, the planet card; one h1, no PageHeader, no tags', async () => {
  const { default: Home } = await loadModule<{ default: ComponentType }>('/src/pages/Home.tsx')
  const html = inRouter(createElement(Home))
  assert.equal(html.match(/<h1[ >]/g)?.length, 1)
  assert.match(html, /<h1 class="home-title">Aerospace Engineer · AI Projects Portfolio<\/h1>/)
  assert.doesNotMatch(html, /visually-hidden|page-header|chip-list|DoD Secret Clearance/)
  assert.match(html, /<h2 id="home-background-title"[^>]*>Background<\/h2>/)
  assert.match(html, /<h2 id="home-site-title"[^>]*>About this site<\/h2>/)
  for (const lead of ['Experience', 'Focus', 'Education', 'Purpose', 'Backend', 'What it shows', 'Stack']) assert.match(html, new RegExp(`<strong class="home-row-label">${lead}</strong>`), lead)
  assert.match(html, /<h2 class="home-panel-title">SatPOV<\/h2>/)
  assert.match(html, /href="\/satellite-conjunction-screening"/)
  assert.equal(html.match(/<a /g)?.length, 1)
  assert.ok(!src('pages/Home.tsx').includes('PageHeader'))
})

test('column order: left = title, Background, About; right = system, planet card (so the tab order is the planets, then the card\'s link)', async () => {
  const { default: Home } = await loadModule<{ default: ComponentType }>('/src/pages/Home.tsx')
  const html = inRouter(createElement(Home))
  const at = ['class="home-left"', 'home-title', 'home-background-title', 'home-site-title', 'class="home-right"', 'class="home-system"', 'class="card home-panel home-slot"'].map((k) => html.indexOf(k))
  assert.ok(at.every((i) => i > 0))
  assert.deepEqual([...at].sort((a, b) => a - b), at)
})

test('stacked (below 1280px) the order is title, system, planet card, Background, About: the columns dissolve and the items are ordered', () => {
  const c = css()
  assert.match(c, /\.home-left,\s*\.home-right \{\s*display: contents/)
  for (const [sel, n] of [['\\.home-title', 1], ['\\.home-system', 2], ['\\.home-slot', 3], ['\\.home-info', 4], ['\\.home-info \\+ \\.home-info', 5]] as const) {
    assert.match(c, new RegExp(`${sel} \\{[^}]*order: ${n};`), `${sel} is item ${n}`)
  }
  assert.match(c, /@media \(max-width: 1279px\) \{[\s\S]*?\.home-info,\s*\.home-slot \{\s*padding-inline: max\(var\(--card-pad\), calc\(\(100cqw - 40rem\) \/ 2\)\)/)
})

// ---- the layout's proportions, from the spec (fractions of the content width Wc) ----

test('two columns from 1280px: 49% / 2% / 49% of Wc, stretched to one height; the title is not inside a size container (its cqw is Wc)', () => {
  const c = css()
  assert.match(c, /\.home-page \.page-container \{\s*container-type: inline-size/)
  const wide = c.slice(c.indexOf('@media (min-width: 1280px) {'))
  assert.match(wide, /\.home-grid \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);\s*column-gap: 2cqw;[^}]*align-items: stretch/s)
  assert.doesNotMatch(c, /container-type: size/)
  assert.match(wide, /\.home-left,\s*\.home-right \{\s*display: flex;\s*flex-direction: column;\s*gap: var\(--home-gap\)/s)
  assert.match(c, /--home-gap: 1\.6cqw/)
})

test('the system: 32% of Wc tall at most (a 49:32 box), shortened when the window has less room, never under 26.2% (the picture 40% of Wc wide); it grows to match the left column', () => {
  const wide = css().slice(css().indexOf('@media (min-width: 1280px) {'))
  assert.match(wide, /--home-sys-h: max\(26\.2cqw, min\(32cqw, calc\(var\(--home-avail\) - var\(--home-gap\) - var\(--home-card-est\)\)\)\)/)
  assert.match(wide, /\.home-system \{[^}]*flex: 1 1 var\(--home-sys-h\)[^}]*justify-content: center[^}]*min-height: var\(--home-sys-h\)[^}]*max-height: 32cqw/s)
  assert.match(wide, /\.home-system \.solar \{\s*width: auto;\s*max-width: 100%;\s*height: 100%/)
  assert.ok(Math.abs(49 / (VIEW.w / VIEW.h) - 32) < 0.1, 'the full-size box is 32% of Wc tall')
  assert.ok(26.2 * (VIEW.w / VIEW.h) > 40, 'the floor keeps the picture at 40% of Wc')
})

test('no page scroll: the right column\'s room is the window less the nav, the page\'s gap above, 24px below and the footer; the planet card is estimated from measurement', () => {
  const wide = css().slice(css().indexOf('@media (min-width: 1280px) {'))
  assert.match(wide, /--home-avail: calc\(100vh - 74\.1px - clamp\(1\.25rem, 2vw, 2rem\) - 1\.5rem - var\(--home-footer\)\)/)
  assert.match(wide, /--home-footer: 2\.9rem/)
  assert.match(wide, /--home-card-est: 13\.4rem/)
  assert.match(wide, /\.home-page \{[^}]*padding-bottom: 1\.5rem/s)
})

test('a short window (under 880px, from 1280px wide) shows the compact copy and hides the Stack row, at the same type size', () => {
  const c = css()
  assert.match(c, /@media \(min-width: 1280px\) and \(max-height: 879px\) \{\s*\.home-full \{\s*display: none/)
  assert.match(c, /\.home-compact \{\s*display: inline/)
  assert.match(c, /\.home-row-full-only \{\s*display: none/)
})

test('all Home text is on the shared tokens: no cqh or fill-driven sizes, no 24px cap', () => {
  const c = css()
  assert.doesNotMatch(c, /cqh|--home-fs|--home-slot-fs|24px\)/)
  assert.match(c, /\.home-page \{[^}]*font-size: var\(--text-body\)[^}]*line-height: var\(--leading\)/s)
  assert.match(c, /\.home-title \{[^}]*font-size: var\(--text-title\)[^}]*font-weight: var\(--title-weight\)[^}]*text-wrap: balance/s)
  assert.match(c, /\.home-panel-title \{[^}]*font-size: var\(--text-label\)[^}]*font-weight: var\(--label-weight\)/s)
  assert.match(c, /\.home-panel p,\s*\.home-row-text,\s*\.home-row-label \{[^}]*font-size: var\(--text-card\)/s)
  assert.match(c, /\.home-panel-link \{[^}]*font-size: var\(--text-small\)/s)
  assert.match(c, /\.home-panel \{\s*padding: var\(--card-pad\)/)
})

test('the shared scale in tokens.css: body 16, card 17 (18 from 1920px, never more), small 14, label 18/600, title clamp(1.75rem, 2cqw, 2.25rem), an 8px spacing scale, card padding clamp(20px, 2.2cqw, 32px)', () => {
  const t = src('styles/tokens.css')
  for (const re of [
    /--text-body: 16px/, /--text-card: 17px/, /@media \(min-width: 1920px\) \{\s*:root \{\s*--text-card: 18px/, /--text-small: 14px/, /--text-label: 18px/,
    /--text-title: clamp\(1\.75rem, 2cqw, 2\.25rem\)/, /--label-weight: 600/, /--space-2: 8px/, /--space-4: 24px/, /--card-pad: clamp\(20px, 2\.2cqw, 32px\)/,
  ]) assert.match(t, re, String(re))
  assert.doesNotMatch(t, /--text-card: (19|2\d)px/)
})

test('cards: label | text rows with hairlines that share the card\'s height; the Background card and the About card share the left column by their row counts', () => {
  const c = css()
  assert.match(c, /\.home-row \{[^}]*grid-template-columns: 21% minmax\(0, 1fr\)/s)
  assert.match(c, /\.home-row \+ \.home-row \{\s*border-top: 1px solid var\(--color-border\)/)
  assert.match(c, /\.home-rows \{[^}]*flex: 1 1 auto[^}]*flex-direction: column/s)
  assert.match(c, /\.home-info \{\s*flex: var\(--rows\) 1 auto/)
})

test('the planet card hugs its text: its name and the pill Open link on one line; the fade stops under reduced motion', () => {
  const c = css()
  assert.match(c, /\.home-slot-head \{\s*display: flex;\s*align-items: center;\s*justify-content: space-between/)
  assert.match(c, /\.home-panel-link \{[^}]*border-radius: 999px/s)
  assert.doesNotMatch(c, /\.home-slot[^{]*\{[^}]*(?<![-\w])(min-)?height:/s, 'no height of its own')
  assert.match(c, /\.home-panel-content \{[^}]*animation: home-panel-in/s)
  assert.match(c, /prefers-reduced-motion: reduce\) \{\s*\.home-panel-content \{\s*animation: none/)
})

test('the layout check is a runnable script with an npm script, and measures what the spec lists', () => {
  const script = readFileSync(new URL('../scripts/check-layout.mjs', import.meta.url), 'utf8')
  assert.match(script, /hFill: 0\.85, vFill: 0\.8, cplMin: 45, cplMax: 80, slotFill: 0\.85, system: 0\.4, rowPad: 16/)
  for (const size of ['1280, 720', '1366, 768', '1440, 900', '1920, 1080']) assert.ok(script.includes(`[${size}]`), size)
  for (const what of ['the page scrolls', "the columns' bottoms differ", "the system's top", 'the system is', 'the title']) assert.ok(script.includes(what), what)
  assert.match(script, /boxOf\('Background card', cards\[0\]/)
  assert.match(script, /boxOf\('About card', cards\[1\]/)
  assert.match(script, /boxOf\('Planet card', slotEl/)
  assert.match(script, /rowPad: 16/)
  assert.match(script, /process\.exit\(1\)/)
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(pkg.scripts['check:layout'], 'node scripts/check-layout.mjs')
  assert.ok(!('playwright' in (pkg.devDependencies ?? {})) && !('playwright' in (pkg.dependencies ?? {})), 'no new dependency')
  assert.ok(Array.isArray(JSON.parse(readFileSync(new URL('../scripts/check-layout.expected.json', import.meta.url), 'utf8')).misses))
})

test('alignment: the system is centred in its column and the left column\'s bottom is the right\'s (a stretched grid)', () => {
  assert.match(css(), /\.home-grid \{[^}]*align-items: stretch/s)
})

test('SatPOV "Data and credits" runs the full width; "For context" keeps its reading width', () => {
  const css = src('pages/SatelliteTool.css')
  // Full width in columns: the block only stops growing at three 75-character columns (114em), so no line is over 80 characters.
  assert.match(css.slice(css.indexOf('.sat-credits-body {'), css.indexOf('}', css.indexOf('.sat-credits-body {'))), /column-count: 3;[^}]*max-width: 114em/s)
  assert.doesNotMatch(css, /\.sat-page \.globe-footnote/)
  assert.match(css, /\.sat-page \.globe-history-lede,\s*\.sat-page \.globe-history-sources \{\s*max-width: var\(--sat-measure\)/)
})
