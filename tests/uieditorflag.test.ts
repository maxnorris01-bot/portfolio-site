import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, test } from 'node:test'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { BODIES, CHOSEN, LABEL_SLOTS, VIEW, bodiesFor, chosenOf, labelWidth, labelsOverlap, layoutLabels, place, positionAt } from '../src/components/solarmodel.ts'
import { withUiEditor } from '../src/components/navtabs.ts'
import { HOME_PLANETS, homePlanets } from '../src/content/home.ts'
import { uiEditor } from '../src/data/uiEditor.ts'
import { isUiEditorOn, UI_EDITOR_ON } from '../src/data/uiEditorFlag.ts'
import { applyNoIndex } from '../src/hooks/useNoIndex.ts'
import { closeFlagServers, loadWithFlag } from './helpers/ssrflag.ts'

after(closeFlagServers)

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')
const inRouter = (location: string, node: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(StaticRouter, { location }, node))

// ---- the flag: exactly 'true' is ON ----

test('the flag is ON only for the exact string "true"; unset, empty and anything else is OFF', () => {
  assert.equal(isUiEditorOn('true'), true)
  for (const v of [undefined, '', 'TRUE', 'True', '1', 'yes', 'false', ' true', 'true ']) assert.equal(isUiEditorOn(v), false, JSON.stringify(v))
  assert.equal(UI_EDITOR_ON, false, 'the tests run with the flag unset')
  assert.equal(HOME_PLANETS.length, 3)
  assert.equal(BODIES.length, bodiesFor(false).length)
})

test('the flag is one small module that other code reads, and the page chunk is lazy', () => {
  assert.match(src('data/uiEditorFlag.ts'), /VITE_SHOW_UI_EDITOR/)
  const app = src('App.tsx')
  assert.match(app, /UI_EDITOR_ON \? lazy\(\(\) => import\('\.\/pages\/UiEditor'\)\) : null/)
  assert.doesNotMatch(app, /^import UiEditor/m, 'the page is never imported eagerly')
  assert.match(app, /\{UiEditor && \(\s*<Route\s+path=\{uiEditor\.route\}/)
})

// ---- the nav ----

test('the nav: the UI Editor is the third tool button after SatPOV and ShopAI when ON, and absent when OFF', () => {
  const base = [{ to: '/a', label: 'A' }, { to: '/b', label: 'B' }]
  assert.deepEqual(withUiEditor(base, false), base)
  assert.deepEqual(withUiEditor(base, true), [...base, { to: '/ui-editor', label: 'UI Editor' }])
})

const navLabels = (html: string) => [...html.matchAll(/class="nav-(?:link|tool)[^"]*"[^>]*>(.*?)<\/(?:a|button)>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''))

test('the rendered nav has the five labels with the flag OFF and a sixth button, UI Editor, on the right with it ON', async () => {
  const off = await loadWithFlag<{ default: ComponentType }>(undefined, '/src/components/NavBar.tsx')
  assert.deepEqual(navLabels(inRouter('/', createElement(off.default))), ['Home', 'Résumé', 'Contact', 'SatPOV', 'ShopAI'])
  const on = await loadWithFlag<{ default: ComponentType }>('true', '/src/components/NavBar.tsx')
  const html = inRouter('/', createElement(on.default))
  assert.deepEqual(navLabels(html), ['Home', 'Résumé', 'Contact', 'SatPOV', 'ShopAI', 'UI Editor'])
  assert.match(html, /<ul class="nav-tools">.*SatPOV.*ShopAI.*UI Editor.*<\/ul>/)
  assert.match(html, /<a [^>]*href="\/ui-editor"[^>]*>UI Editor<\/a>/)
  assert.match(inRouter('/ui-editor', createElement(on.default)), /class="nav-tool is-active"[^>]*>UI Editor/)
  const wrong = await loadWithFlag<{ default: ComponentType }>('false', '/src/components/NavBar.tsx')
  assert.deepEqual(navLabels(inRouter('/', createElement(wrong.default))), ['Home', 'Résumé', 'Contact', 'SatPOV', 'ShopAI'])
})

// ---- Home ----

test('Home planets: three with the flag OFF, a fourth (the UI Editor, last) with it ON, two sentences each, a button-style link to the route', () => {
  assert.deepEqual(homePlanets(false).map((p) => p.label), ['SatPOV', 'ShopAI', 'Résumé'])
  const four = homePlanets(true)
  assert.deepEqual(four.map((p) => p.label), ['SatPOV', 'ShopAI', 'Résumé', 'UI Editor'])
  const p = four[3]
  assert.equal(p.id, 'uieditor')
  assert.deepEqual(p.link, { to: '/ui-editor', text: 'Open UI Editor' })
  assert.equal(p.paragraphs.length, 2)
  const sizes = four.map((q) => q.paragraphs.map((c) => c.text).join('').length)
  assert.ok(Math.min(...sizes) >= Math.max(...sizes) * 0.6, `totals ${sizes.join(', ')}`)
  // Only what the page and the README say.
  const text = p.paragraphs.map((c) => c.text).join(' ')
  for (const fact of ['paste or upload', 'HTML or SVG', 'copy or download', 'in your browser']) assert.ok(text.includes(fact), fact)
})

test('Home renders three planet buttons with the flag OFF and four with it ON, and the fourth opens the UI Editor card', async () => {
  const solar = async (flag: string | undefined) => (await loadWithFlag<{ default: ComponentType<{ selected: string; onSelect: () => void }> }>(flag, '/src/components/SolarSystem.tsx')).default
  const buttons = (html: string) => [...html.matchAll(/<g [^>]*role="button"[^>]*aria-label="([^"]+)"/g)].map((m) => m[1])
  assert.deepEqual(buttons(renderToStaticMarkup(createElement(await solar(undefined), { selected: 'satpov', onSelect: () => {} }))), ['SatPOV', 'ShopAI', 'Résumé'])
  assert.deepEqual(buttons(renderToStaticMarkup(createElement(await solar('true'), { selected: 'satpov', onSelect: () => {} }))), ['SatPOV', 'ShopAI', 'Résumé', 'UI Editor'])
  const parts = await loadWithFlag<{ HomePlanetSlot: ComponentType<{ panel: (typeof HOME_PLANETS)[number] }> }>('true', '/src/components/HomePanel.tsx')
  const html = inRouter('/', createElement(parts.HomePlanetSlot, { panel: homePlanets(true)[3] }))
  assert.match(html, /<h2 class="home-panel-title">UI Editor<\/h2>/)
  assert.match(html, /<a [^>]*class="btn btn-primary home-panel-link"[^>]*href="\/ui-editor"[^>]*>Open UI Editor<\/a>/)
  assert.equal(html.match(/<p>/g)?.length, 2)
})

// ---- the solar picture with four planets (the flag-off tests in home.test.ts stay as they are) ----

const FOUR = chosenOf(bodiesFor(true))

test('four planets can be chosen with the flag ON: the UI Editor is the fourth, on its own orbit and period, in the same ranges as the others', () => {
  assert.deepEqual(chosenOf(bodiesFor(false)).map((b) => b.select?.label), ['SatPOV', 'ShopAI', 'Résumé'])
  assert.deepEqual(FOUR.map((b) => b.select?.label), ['SatPOV', 'ShopAI', 'Résumé', 'UI Editor'])
  assert.deepEqual(FOUR.map((b) => b.select?.id), homePlanets(true).map((p) => p.id))
  assert.equal(new Set(FOUR.map((b) => b.orbit)).size, 4)
  assert.equal(new Set(FOUR.map((b) => b.period)).size, 4)
  const all = bodiesFor(true)
  assert.ok(all.length - FOUR.length >= 5, 'the decorative planets are still there')
  for (const b of all) assert.ok(b.period >= 40 && b.period <= 120, `${b.key}: ${b.period}`)
  assert.equal(new Set(all.map((b) => b.period)).size, all.length, 'every orbit time differs')
  assert.deepEqual(CHOSEN.map((b) => b.key), chosenOf(bodiesFor(false)).map((b) => b.key), 'this build has the flag off')
})

test('four planets at rest: well spread (80 units apart for the chosen, 30 for any two), and their labels as laid out do not touch and stay in the box', () => {
  const rest = bodiesFor(true).map((b) => ({ b, ...positionAt(b, 99, true) }))
  for (const r of rest) assert.deepEqual({ x: r.x, y: r.y }, place(r.b.orbit, r.b.phase))
  for (let i = 0; i < rest.length; i++) for (let j = i + 1; j < rest.length; j++) assert.ok(Math.hypot(rest[i].x - rest[j].x, rest[i].y - rest[j].y) > 30, `${rest[i].b.key} / ${rest[j].b.key}`)
  const chosen = rest.filter((r) => r.b.select)
  for (let i = 0; i < chosen.length; i++) for (let j = i + 1; j < chosen.length; j++) assert.ok(Math.hypot(chosen[i].x - chosen[j].x, chosen[i].y - chosen[j].y) > 80)
  const items = chosen.map((r) => ({ x: r.x, y: r.y, w: labelWidth(r.b.select!.label, false) }))
  const lay = layoutLabels(items, items.map(() => 0), items.map((_, i) => i))
  assert.equal(labelsOverlap(items, lay), false)
  lay.forEach((l, i) => {
    const x0 = items[i].x + l.dx - items[i].w / 2, x1 = items[i].x + l.dx + items[i].w / 2, base = items[i].y + LABEL_SLOTS[l.slot]
    assert.ok(x0 >= VIEW.x && x1 <= VIEW.x + VIEW.w && base - 13 >= VIEW.y && base + 4 <= VIEW.y + VIEW.h, `label ${i} inside the box at rest`)
  })
})

test('four planets in motion: labels overlap only rarely whichever is chosen, and always stay inside the drawing', () => {
  for (let sel = 0; sel < FOUR.length; sel++) {
    const prev = FOUR.map(() => 0)
    let bad = 0
    let frames = 0
    for (let t = 0; t < 6000; t += 0.5) {
      const items = FOUR.map((b, i) => ({ ...positionAt(b, t, false), w: labelWidth(b.select!.label, i === sel) }))
      const order = FOUR.map((_, i) => i).sort((i, j) => Number(j === sel) - Number(i === sel))
      const lay = layoutLabels(items, prev, order)
      lay.forEach((l, i) => {
        prev[i] = l.slot
        const x0 = items[i].x + l.dx - items[i].w / 2, x1 = items[i].x + l.dx + items[i].w / 2, base = items[i].y + LABEL_SLOTS[l.slot]
        assert.ok(x0 >= VIEW.x - 0.01 && x1 <= VIEW.x + VIEW.w + 0.01, `${FOUR[i].key} sideways at ${t}`)
        assert.ok(base - 13 >= VIEW.y - 0.01 && base + 4 <= VIEW.y + VIEW.h + 0.01, `${FOUR[i].key} up or down at ${t}`)
      })
      frames++
      if (labelsOverlap(items, lay)) bad++
    }
    assert.ok(bad / frames < 0.02, `${FOUR[sel].key}: ${((100 * bad) / frames).toFixed(2)}% of the time`)
  }
})

// ---- the page: not found when OFF, noindex, strings in one place ----

test('with the flag OFF /ui-editor is the NotFound page (no route); with it ON it is not', async () => {
  const html = async (flag: string | undefined, location: string) => {
    const { default: App } = await loadWithFlag<{ default: ComponentType }>(flag, '/src/App.tsx')
    return inRouter(location, createElement(App))
  }
  assert.match(await html(undefined, '/ui-editor'), /Page not found/)
  assert.match(await html('false', '/ui-editor'), /Page not found/)
  assert.doesNotMatch(await html('true', '/ui-editor'), /Page not found/)
  assert.match(await html('true', '/nowhere'), /Page not found/)
  assert.doesNotMatch(await html(undefined, '/ui-editor'), /UI Editor/, 'nothing about it is visible with the flag off')
})

test('noindex: a robots meta is added while the page is mounted and removed again; the header rule is in vercel.json next to the old ones', () => {
  const added: { name: string; content: string; removed: boolean }[] = []
  const doc = {
    createElement: () => {
      const m = { name: '', content: '', removed: false, remove() { m.removed = true } }
      added.push(m)
      return m
    },
    head: { appendChild: () => {} },
  } as unknown as Document
  const undo = applyNoIndex(doc)
  assert.equal(added.length, 1)
  assert.deepEqual([added[0].name, added[0].content, added[0].removed], ['robots', 'noindex', false])
  undo()
  assert.equal(added[0].removed, true)
  assert.match(src('pages/UiEditor.tsx'), /useNoIndex\(\)/)
  assert.doesNotMatch(src('hooks/usePageMeta.ts'), /noindex|robots/, 'usePageMeta is unchanged')
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  assert.deepEqual(vercel.headers.find((h: { source: string }) => h.source === '/ui-editor')?.headers, [{ key: 'X-Robots-Tag', value: 'noindex' }])
  assert.ok(vercel.headers.some((h: { source: string }) => h.source === '/api/shop/:path*'), 'the existing header rule is still there')
  assert.ok(vercel.routes.length === 1 && vercel.rewrites.length === 1, 'the existing routes and rewrites are intact')
})

test('every name and string of the page is in src/data/uiEditor.ts: no other source file spells the tool\'s name as a string', () => {
  assert.equal(uiEditor.name, 'UI Editor')
  assert.equal(uiEditor.route, '/ui-editor')
  assert.equal(uiEditor.repoUrl, null, 'the engine repository is private: no GitHub button until Max makes it public')
  assert.ok(uiEditor.pageTitle.startsWith(uiEditor.name))
  assert.ok(uiEditor.pageDescription.length <= 300)
  for (const f of ['App.tsx', 'components/NavBar.tsx', 'components/navtabs.ts', 'components/solarmodel.ts', 'content/home.ts', 'pages/UiEditor.tsx']) {
    assert.doesNotMatch(src(f), /['"`>]UI Editor['"`<]|'\/ui-editor'/, f)
  }
})
