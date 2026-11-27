import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { existsSync, readdirSync } from 'node:fs'
import { after, test } from 'node:test'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { BODIES, CHOSEN, LABEL_SLOTS, VIEW, chosenOf, labelWidth, labelsOverlap, layoutLabels, place, positionAt } from '../src/components/solarmodel.ts'
import { withUiEditor } from '../src/components/navtabs.ts'
import { HOME_INFO, HOME_PLANETS } from '../src/content/home.ts'
import { uiEditor } from '../src/data/uiEditor.ts'
import { closeServer, loadModule } from './helpers/ssr.ts'

after(closeServer)

// The UI Editor is released (docs/ui-editor-gate-rules-release.md): no build-time variable decides anything. These tests run with no environment variable at all.

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')
const inRouter = (location: string, node: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(StaticRouter, { location }, node))

// ---- released: no flag, the route is there with no environment variable ----

test('N1: the route is always there: the page is a lazy chunk (never an eager import) and the route has no condition', () => {
  const app = src('App.tsx')
  assert.match(app, /const UiEditor = lazy\(\(\) => import\('\.\/pages\/UiEditor'\)\)/)
  assert.doesNotMatch(app, /^import UiEditor/m, 'the page is never imported eagerly')
  assert.match(app, /<Route\s+path=\{uiEditor\.route\}/)
  assert.doesNotMatch(app, /\{UiEditor &&/)
  assert.equal(existsSync(new URL('../src/data/uiEditorFlag.ts', import.meta.url)), false, 'the flag module is gone')
})

test('N2: no source file knows the flag or noindex any more (src, public, index.html, vite config, vercel.json)', () => {
  const walk = (dir: URL): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(new URL(`${e.name}/`, dir)) : [new URL(e.name, dir).pathname]))
  const files = [...walk(new URL('../src/', import.meta.url)), ...walk(new URL('../public/', import.meta.url))].filter((f) => /\.(ts|tsx|css|js|json|html|svg|txt|md)$/.test(f))
  const bad = /VITE_SHOW_UI_EDITOR|UI_EDITOR_ON|isUiEditorOn|uiEditorFlag|useNoIndex|applyNoIndex|X-Robots-Tag|noindex/i
  for (const f of files) assert.doesNotMatch(readFileSync(f, 'utf8'), bad, f)
  for (const f of ['index.html', 'vite.config.ts', 'vercel.json']) assert.doesNotMatch(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'), bad, f)
})

// ---- the nav ----

test('the nav: the UI Editor is the third tool button after SatPOV and ShopAI', () => {
  const base = [{ to: '/a', label: 'A' }, { to: '/b', label: 'B' }]
  assert.deepEqual(withUiEditor(base), [...base, { to: '/ui-editor', label: 'UI Editor' }])
})

const navLabels = (html: string) => [...html.matchAll(/class="nav-(?:link|tool)[^"]*"[^>]*>(.*?)<\/(?:a|button)>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''))

test('the rendered nav has a sixth button, UI Editor, on the right, with no environment variable', async () => {
  const on = await loadModule<{ default: ComponentType }>('/src/components/NavBar.tsx')
  const html = inRouter('/', createElement(on.default))
  assert.deepEqual(navLabels(html), ['Home', 'Résumé', 'Contact', 'SatPOV', 'ShopAI', 'UI Editor'])
  assert.match(html, /<ul class="nav-tools">.*SatPOV.*ShopAI.*UI Editor.*<\/ul>/)
  assert.match(html, /<a [^>]*href="\/ui-editor"[^>]*>UI Editor<\/a>/)
  assert.match(inRouter('/ui-editor', createElement(on.default)), /class="nav-tool is-active"[^>]*>UI Editor/)
})

// ---- Home ----

test('Home planets: four with no environment variable, the UI Editor last, two sentences each, a button-style link to the route', () => {
  const four = HOME_PLANETS
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

test('Home renders four planet buttons, and the fourth opens the UI Editor card', async () => {
  const solar = (await loadModule<{ default: ComponentType<{ selected: string; onSelect: () => void }> }>('/src/components/SolarSystem.tsx')).default
  const buttons = (html: string) => [...html.matchAll(/<g [^>]*role="button"[^>]*aria-label="([^"]+)"/g)].map((m) => m[1])
  assert.deepEqual(buttons(renderToStaticMarkup(createElement(solar, { selected: 'satpov', onSelect: () => {} }))), ['SatPOV', 'ShopAI', 'Résumé', 'UI Editor'])
  const parts = await loadModule<{ HomePlanetSlot: ComponentType<{ panel: (typeof HOME_PLANETS)[number] }> }>('/src/components/HomePanel.tsx')
  const html = inRouter('/', createElement(parts.HomePlanetSlot, { panel: HOME_PLANETS[3] }))
  assert.match(html, /<h2 class="home-panel-title">UI Editor<\/h2>/)
  assert.match(html, /<a [^>]*class="btn btn-primary home-panel-link"[^>]*href="\/ui-editor"[^>]*>Open UI Editor<\/a>/)
  assert.equal(html.match(/<p>/g)?.length, 2)
})

// ---- the solar picture with four planets (the flag-off tests in home.test.ts stay as they are) ----

const FOUR = CHOSEN

test('four planets can be chosen: the UI Editor is the fourth, on its own orbit and period, in the same ranges as the others', () => {
  assert.deepEqual(FOUR.map((b) => b.select?.label), ['SatPOV', 'ShopAI', 'Résumé', 'UI Editor'])
  assert.deepEqual(FOUR.map((b) => b.select?.id), HOME_PLANETS.map((p) => p.id))
  assert.equal(new Set(FOUR.map((b) => b.orbit)).size, 4)
  assert.equal(new Set(FOUR.map((b) => b.period)).size, 4)
  const all = BODIES
  assert.ok(all.length - FOUR.length >= 5, 'the decorative planets are still there')
  for (const b of all) assert.ok(b.period >= 40 && b.period <= 120, `${b.key}: ${b.period}`)
  assert.equal(new Set(all.map((b) => b.period)).size, all.length, 'every orbit time differs')
  assert.deepEqual(CHOSEN.map((b) => b.key), chosenOf(BODIES).map((b) => b.key))
})

test('four planets at rest: well spread (80 units apart for the chosen, 30 for any two), and their labels as laid out do not touch and stay in the box', () => {
  const rest = BODIES.map((b) => ({ b, ...positionAt(b, 99, true) }))
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

// ---- the page: it opens with no environment variable, no noindex anywhere, strings in one place ----

test('/ui-editor opens the page with no environment variable (not the NotFound page); other unknown paths are still NotFound', async () => {
  const { default: App } = await loadModule<{ default: ComponentType }>('/src/App.tsx')
  const html = (location: string) => inRouter(location, createElement(App))
  assert.doesNotMatch(html('/ui-editor'), /Page not found/)
  assert.match(html('/nowhere'), /Page not found/)
})

test('N3: the Home has four planets and the long Backend copy ends with the UI Editor sentence, the compact copy has none (no environment variable)', () => {
  assert.deepEqual(HOME_PLANETS.map((p) => p.label), ['SatPOV', 'ShopAI', 'Résumé', 'UI Editor'])
  const backend = HOME_INFO[1].bullets.find((b) => b.lead === 'Backend')!
  assert.ok(backend.text?.endsWith(' UI Editor runs in your browser.'))
  assert.doesNotMatch(backend.compact ?? '', /UI Editor/)
})

test('N4: no noindex anywhere: vercel.json has no X-Robots-Tag header and still has the shop header; no robots meta is added by the page or the head', () => {
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  assert.doesNotMatch(JSON.stringify(vercel), /robots|noindex/i)
  assert.deepEqual(vercel.headers.map((h: { source: string }) => h.source), ['/api/shop/:path*'])
  assert.deepEqual(vercel.headers[0].headers, [{ key: 'x-vercel-enable-rewrite-caching', value: '0' }])
  assert.ok(vercel.routes.length === 1 && vercel.rewrites.length === 1, 'the existing routes and rewrites are intact')
  // The page mounts only usePageMeta (title and description); it adds no robots meta (the built page is checked in a browser by scripts/ui-editor-gate/flags.mjs).
  assert.doesNotMatch(src('pages/UiEditor.tsx'), /robots|noindex/i)
  assert.doesNotMatch(src('hooks/usePageMeta.ts'), /noindex|robots/, 'usePageMeta is unchanged')
  assert.doesNotMatch(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /robots/i)
  for (const f of ['robots.txt', 'sitemap.xml']) assert.equal(existsSync(new URL(`../public/${f}`, import.meta.url)), false, f)
})

test('every name and string of the page is in src/data/uiEditor.ts: no other source file spells the tool\'s name as a string', async () => {
  assert.equal(uiEditor.name, 'UI Editor')
  assert.equal(uiEditor.route, '/ui-editor')
  assert.equal(uiEditor.repoUrl, 'https://github.com/maxnorris01-bot/ui-editor', 'the engine repository is public: the GitHub button is drawn')
  const page = await loadModule<{ default: ComponentType }>('/src/pages/UiEditor.tsx')
  assert.match(inRouter('/ui-editor', createElement(page.default)), /<a href="https:\/\/github\.com\/maxnorris01-bot\/ui-editor" class="btn btn-secondary ue-github" target="_blank" rel="noreferrer">View on GitHub ↗<\/a>/)
  assert.ok(uiEditor.pageTitle.startsWith(uiEditor.name))
  assert.ok(uiEditor.pageDescription.length <= 300)
  for (const f of ['App.tsx', 'components/NavBar.tsx', 'components/navtabs.ts', 'components/solarmodel.ts', 'content/home.ts', 'pages/UiEditor.tsx']) {
    assert.doesNotMatch(src(f), /['"`>]UI Editor['"`<]|'\/ui-editor'/, f)
  }
})

test('the GitHub button is sized like SatPOV\'s and sits out of the header grid from 1100 px, so the lead keeps its width', () => {
  const css = readFileSync(new URL('../src/pages/UiEditor.css', import.meta.url), 'utf8')
  const sat = readFileSync(new URL('../src/pages/SatelliteTool.css', import.meta.url), 'utf8')
  const rule = (text: string, sel: string) => new RegExp(`${sel.replace('.', '\\.')} \\{([^}]*)\\}`).exec(text)?.[1].replace(/\s+/g, ' ').trim()
  assert.equal(rule(css, '.ue-github'), rule(sat, '.sat-github')?.replace(/^/, ''), 'the same declarations as .sat-github')
  assert.match(css, /@media \(min-width: 1100px\) \{[^@]*\.ue-page \.page-header\.is-aside-wide \{\s*grid-template-columns: minmax\(0, 1fr\);/)
  assert.match(css, /\.ue-page \.page-header-aside \{\s*position: absolute;/)
})
