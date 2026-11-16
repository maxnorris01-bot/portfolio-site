// The UI Editor gate runner (rules: docs/ui-editor-gate-rules.md, specs: scripts/ui-editor-gate/specs.json).
//   node scripts/ui-editor-gate/run.mjs --url http://127.0.0.1:4173/ui-editor            the real page (vite preview, flag ON)
//   node scripts/ui-editor-gate/run.mjs --stub [--fault half-drag] [--only S04,S05]      the scorer-check stub (see reference/)
//   node scripts/ui-editor-gate/run.mjs --stub2 [--fault no-scale] [--only N01,N05]       the round 1 scorer-check stub (reference/round1.html)
//   node scripts/ui-editor-gate/run.mjs --stub3 [--fault no-wrap] [--only R12]            the round 2 scorer-check stub (reference/round2.html)
// Both spec files run: specs.json (S01 to S20) and specs-round1.json (N01 to N11; rules in docs/ui-editor-gate-rules-round1.md). --only picks ids.
//   node scripts/ui-editor-gate/run.mjs --url ... --noop                                  load each sample, export, compare to the source
// Needs Playwright with Chromium (not a dependency of this repo): installed here, or in PLAYWRIGHT_DIR (a folder whose node_modules has it).
// Headless Chromium, a fresh context per action, real mouse events, no retries. Results go to UI_GATE_OUT (default scripts/ui-editor-gate/out, git-ignored).
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { diffLines, sameShape, p3Violations, p2Violations, outcomeOf, outcomeOfRound1 } from './checks.mjs'
import { hunksOf, linesOf } from './hunks.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const args = process.argv.slice(2)
const flag = (n) => args.includes(n)
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined)

let chromium
try {
  const require = createRequire(import.meta.url)
  const entry = require.resolve('playwright', process.env.PLAYWRIGHT_DIR ? { paths: [process.env.PLAYWRIGHT_DIR] } : undefined)
  ;({ chromium } = require(entry))
} catch {
  console.error('the gate needs Playwright with Chromium (set PLAYWRIGHT_DIR to a folder whose node_modules has it).')
  process.exit(2)
}

const specsFile = JSON.parse(readFileSync(join(here, 'specs.json'), 'utf8'))
const round1File = JSON.parse(readFileSync(join(here, 'specs-round1.json'), 'utf8'))
const round2File = JSON.parse(readFileSync(join(here, 'specs-round2.json'), 'utf8'))
const { SAMPLE_FILES } = await import(new URL('../../src/ui-editor/samples/manifest.ts', import.meta.url))
const sampleDir = join(root, 'src', 'ui-editor', 'samples')
const sources = {}
for (const s of SAMPLE_FILES) {
  sources[s.id] = { files: {}, primary: s.file, kind: s.kind, order: [s.file, ...s.companions] }
  for (const f of sources[s.id].order) sources[s.id].files[f] = readFileSync(join(sampleDir, f), 'utf8')
}
const READY = { landing: '#headline', email: '#hello', chart: '#bar-tue' }
const outDir = process.env.UI_GATE_OUT ?? join(here, 'out')
mkdirSync(outDir, { recursive: true })
const only = opt('--only')?.split(',')
const fault = opt('--fault') ?? null

// ---- servers: the stub page (when --stub) and the exported files (for the fresh-page check) ----
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.js': 'text/javascript' }
const listen = (srv) => new Promise((res) => srv.listen(0, '127.0.0.1', () => res(srv.address().port)))
const exported = new Map()
const exportServer = createServer((q, r) => {
  const f = decodeURIComponent(q.url.split('?')[0].slice(1))
  if (!exported.has(f)) { r.statusCode = 404; return r.end() }
  r.setHeader('content-type', MIME[extname(f)] ?? 'text/plain'); r.end(exported.get(f))
})
const exportPort = await listen(exportServer)
let stubServer = null
let baseUrl = opt('--url')
if (flag('--stub') || flag('--stub2') || flag('--stub3')) {
  const refDir = join(here, 'reference')
  const page1 = flag('--stub3') ? 'round2.html' : flag('--stub2') ? 'round1.html' : 'index.html'
  const engine = process.env.ENGINE_JS ?? join(root, 'src', 'ui-editor', 'vendor', 'engine.js')
  stubServer = createServer((q, r) => {
    const u = new URL(q.url, 'http://x'); const p = u.pathname
    try {
      let body
      if (p === '/' || p === '/index.html') body = readFileSync(join(refDir, page1))
      else if (p === '/engine.js') body = readFileSync(engine)
      else if (p.startsWith('/samples/')) body = readFileSync(join(sampleDir, p.slice(9)))
      else { r.statusCode = 404; return r.end() }
      r.setHeader('content-type', MIME[extname(p === '/' ? 'x.html' : p)] ?? 'text/plain'); r.end(body)
    } catch { r.statusCode = 404; r.end() }
  })
  const port = await listen(stubServer)
  baseUrl = `http://127.0.0.1:${port}/${fault ? `?fault=${fault}` : ''}`
}
if (!baseUrl) { console.error('give --url <page> or --stub'); process.exit(2) }

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })

// ---- in-page helpers (strings are evaluated in the host page; they read the preview iframe's document) ----
const PAGE_HELPERS = `(() => {
  const frame = () => document.querySelector('iframe[title="Preview"]')
  const keyOf = (el, doc) => {
    const rel = []
    let n = el
    while (n && n.nodeType === 1) {
      if (n.id) return '#' + n.id + (rel.length ? '/' + rel.join('/') : '')
      const sibs = n.parentElement ? Array.from(n.parentElement.children).filter((c) => c.localName === n.localName) : [n]
      rel.unshift(n.localName + '[' + (sibs.indexOf(n) + 1) + ']')
      n = n.parentElement
    }
    return '/' + rel.join('/')
  }
  const walk = (doc) => { const out = []; (function rec(e) { out.push(e); for (const c of e.children) rec(c) })(doc.documentElement); return out }
  const dump = (doc) => {
    const win = doc.defaultView
    const els = walk(doc)
    const idx = new Map(); els.forEach((e, i) => idx.set(e, i))
    return els.map((e, i) => {
      const cs = win.getComputedStyle(e); const props = {}
      for (let k = 0; k < cs.length; k++) props[cs[k]] = cs.getPropertyValue(cs[k])
      const b = e.getBoundingClientRect()
      return { i, key: keyOf(e, doc), parent: e.parentElement ? idx.get(e.parentElement) : -1, tag: e.localName, rect: [b.left, b.top, b.width, b.height], props }
    })
  }
  window.__gate = {
    frame, keyOf, dump,
    withWidth(w, fn) {
      const f = frame()
      if (w === 'current' || w == null) return fn(f.contentDocument)
      const old = f.style.width
      f.style.width = w + 'px'
      void f.contentDocument.documentElement.offsetWidth
      try { return fn(f.contentDocument) } finally { f.style.width = old; void f.contentDocument.documentElement.offsetWidth }
    },
    measure(w, sel, q) {
      return this.withWidth(w, (doc) => {
        const e = doc.querySelector(sel)
        if (!e) return null
        if (q === 'fontSize') return parseFloat(doc.defaultView.getComputedStyle(e).fontSize)
        const b = e.getBoundingClientRect()
        return { left: b.left, top: b.top, width: b.width, height: b.height }[q]
      })
    },
    dumpAt(w) { return this.withWidth(w, (doc) => dump(doc)) },
    // Round 2: a computed property, the content width of the parent (CSS px) and the right edge of the parent's content box, in the preview.
    cssOf(w, sel, prop) { return this.withWidth(w, (doc) => { const e = doc.querySelector(sel); return e ? doc.defaultView.getComputedStyle(e)[prop] : null }) },
    parentW(w, sel) { return this.withWidth(w, (doc) => { const e = doc.querySelector(sel); const p = e && e.parentElement; if (!p) return null; const cs = doc.defaultView.getComputedStyle(p); return p.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) }) },
    edgeOf(sel) { const doc = frame().contentDocument; const e = doc.querySelector(sel); const p = e.parentElement; const cs = doc.defaultView.getComputedStyle(p); const pr = p.getBoundingClientRect(); return { right: e.getBoundingClientRect().right, edge: pr.left + p.clientLeft + parseFloat(cs.paddingLeft) + p.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) } },
    keyFor(sel) { const e = frame().contentDocument.querySelector(sel); return e ? keyOf(e) : null },
    // A real mouse can only reach what is in the window: scroll the page (not the preview) until the point is in view.
    reveal(yOf) {
      const margin = 80
      const y = yOf()
      if (y > innerHeight - margin) window.scrollBy(0, y - (innerHeight - margin))
      else if (y < margin) window.scrollBy(0, y - margin)
    },
    // A scaled device (round 1): the preview's own pixels are CSS px, the window's are screen px; k = screen px per CSS px (1 when not scaled).
    scaleOf() { const f = frame(); return f.offsetWidth ? f.getBoundingClientRect().width / f.offsetWidth : 1 },
    point(sel, at) {
      const at2 = () => {
        const f = frame(); const fr = f.getBoundingClientRect(); const e = f.contentDocument.querySelector(sel)
        if (!e) return null
        const k = this.scaleOf()
        const b = e.getBoundingClientRect()
        return at === 'inset' ? { x: fr.left + (b.left + 12) * k, y: fr.top + (b.top + 12) * k } : { x: fr.left + (b.left + b.width / 2) * k, y: fr.top + (b.top + b.height / 2) * k }
      }
      const p0 = at2()
      if (!p0) return null
      this.reveal(() => at2().y)
      return at2()
    },
    elementBox(sel) { const f = frame(); const fr = f.getBoundingClientRect(); const k = this.scaleOf(); const b = f.contentDocument.querySelector(sel).getBoundingClientRect(); return { left: fr.left + b.left * k, top: fr.top + b.top * k, width: b.width * k, height: b.height * k } },
    blankPoint() { this.reveal(() => frame().getBoundingClientRect().bottom - 8); const fr = frame().getBoundingClientRect(); return { x: fr.left + 20, y: fr.bottom - 8 } },
  }
})()`

const settle = async (page) => {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'))
}

// ---- running one spec ----
async function runSpec(spec) {
  const src = sources[spec.sample]
  const ctx = await browser.newContext({ viewport: spec.host ?? specsFile.hostViewport, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  const res = { id: spec.id, name: spec.name, sample: spec.sample, expected: spec.expected, P1: [], P2: null, P3: null, P4: null, P5: [], P6: [], setup: [], notes: [], errors, checks: spec.checks ?? null }
  const snaps = {}
  let statusAtCopy = null
  let before = {}
  let originalDump = null
  const rec = (bucket, name, ok, detail) => res[bucket].push({ name, ok, detail })
  const widths = spec.widths

  const grab = async (file) => {
    const sel = page.getByLabel('File', { exact: true })
    if (await sel.count()) await sel.selectOption({ label: file })
    const dl = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download', exact: true }).click()
    const d = await dl
    const stream = await d.createReadStream()
    const chunks = []
    for await (const c of stream) chunks.push(c)
    return { name: d.suggestedFilename(), text: Buffer.concat(chunks).toString('utf8') }
  }
  const grabAll = async () => {
    const out = {}
    for (const f of src.order) out[f] = (await grab(f)).text
    return out
  }
  const dumps = async () => {
    const out = {}
    for (const w of widths) out[w] = await page.evaluate((w) => window.__gate.dumpAt(w), w)
    return out
  }
  const fieldOf = (label) => page.getByLabel(label, { exact: true })
  const region = () => page.getByRole('status', { name: 'Edit result' })

  async function measureNum(at, sel, q) {
    return page.evaluate(([a, s, qq]) => window.__gate.measure(a, s, qq), [at, sel, q])
  }

  // Open a sample: through the gallery card when the page has one (round 1), else through the Sample picker (the earlier page and its stub).
  async function openSample(id) {
    await page.locator('[data-editor]').first().waitFor()
    if (await page.locator('[data-sample-card]').count()) await page.locator(`[data-sample-card="${id}"]`).click()
    else await page.getByLabel('Sample', { exact: true }).selectOption(id)
    await page.waitForFunction((s) => { const f = document.querySelector('iframe[title="Preview"]'); return !!f?.contentDocument?.querySelector(s) }, READY[id])
    await settle(page)
  }
  // The "before" values and the original dumps (once the sample is open).
  async function captureBefore() {
    for (const s of spec.steps.filter((x) => x.do === 'assert' && (x.k === 'measure' || x.k === 'measureScaled'))) {
      for (const [sel] of [[s.sel], [s.of]].filter((p) => p[0])) before[`${s.at}|${sel}|${s.q}`] = await measureNum(s.at, sel, s.q)
      if (s.mode === 'same' || s.mode === 'delta' || s.k === 'measureScaled') before[`${s.at}|${s.sel}|${s.q}`] = await measureNum(s.at, s.sel, s.q)
    }
    for (const s of spec.steps.filter((x) => x.do === 'assert' && x.k === 'css' && x.mode === 'delta')) before[`css|${s.sel}|${s.prop}`] = parseFloat(await page.evaluate(([sel, prop]) => window.__gate.cssOf('current', sel, prop), [s.sel, s.prop]))
    for (const s of spec.steps.filter((x) => x.do === 'assert' && x.k === 'pctWidth')) {
      const w = await measureNum('current', s.sel, 'width'), pw = await page.evaluate((sel) => window.__gate.parentW('current', sel), s.sel)
      before[`pct|${s.sel}`] = (w / pw) * 100
    }
    originalDump = widths ? await dumps() : {}
    for (const b of spec.baseline ?? []) {
      const v = await measureNum(b.at, b.sel, b.q)
      rec('setup', `baseline ${b.sel} ${b.q} @${b.at}`, v !== null && Math.abs(v - b.value) <= b.tol, `got ${v}, want ${b.value} +-${b.tol}`)
    }
  }
  const scaleNow = () => page.evaluate(() => { const e = document.querySelector('[data-device-scale]'); if (!e) return 1; const t = getComputedStyle(e).transform; const m = /matrix\(([^)]+)\)/.exec(t); return m ? parseFloat(m[1].split(',')[0]) : 1 })
  let scaleAtDrag = 1
  const exportMemo = new Map()
  const found = async (item) => {
    if (item.role) return page.getByRole(item.role, { name: item.name === 'Review unlinked' ? /^Review unlinked/ : item.name, exact: item.name === 'Review unlinked' ? undefined : true })
    if (item.text) return page.getByText(item.text, { exact: true })
    return page.locator(item.selector)
  }
  const label = (item) => item.name ?? item.text ?? item.selector

  async function doAssert(a0) {
    // R12's nine counter asserts were written with the change number in `k`, which overwrote the assert's name (my slip in the locked file, docs/ui-editor-gate-log.md):
    // an assert whose `k` is a number is the change-counter check for that change.
    const a = typeof a0.k === 'number' ? { ...a0, k: 'changeCounter', counterK: a0.k } : a0
    const bucket = a.p
    const R = (ok, detail) => rec(bucket, a.k + (a.sel ? ' ' + a.sel : '') + (a.q ? ' ' + a.q : '') + (a.at ? ' @' + a.at : '') + (a.field ? ' ' + a.field : '') + (a.label ? ' ' + a.label : '') + (a.name ? ' ' + a.name : ''), ok, detail)
    switch (a.k) {
      case 'measure': {
        const now = await measureNum(a.at, a.sel, a.q)
        const b = before[`${a.at}|${a.sel}|${a.q}`]
        let want
        if (a.mode === 'abs') want = a.value
        else if (a.mode === 'delta') want = b + a.value
        else if (a.mode === 'same') want = b
        else if (a.mode === 'eqBefore') want = before[`${a.at}|${a.of}|${a.q}`]
        const ok = now !== null && want !== undefined && Math.abs(now - want) <= a.tol
        return R(ok, `got ${now}, want ${want} +-${a.tol}`)
      }
      case 'order': {
        const x = await measureNum(a.at, a.first, a.q), y = await measureNum(a.at, a.second, a.q)
        return R(x !== null && y !== null && x < y, `${a.first} ${a.q} ${x} must be less than ${a.second} ${y}`)
      }
      case 'selection': {
        const want = await page.evaluate((s) => window.__gate.elementBox(s), a.sel)
        const loc = page.locator('[data-selection]')
        if ((await loc.count()) !== 1) return R(false, `expected one [data-selection], found ${await loc.count()}`)
        const box = await loc.boundingBox()
        const d = Math.max(Math.abs(box.x - want.left), Math.abs(box.y - want.top), Math.abs(box.width - want.width), Math.abs(box.height - want.height))
        return R(d <= a.tol, `selection box off by ${d.toFixed(2)} px`)
      }
      case 'field': {
        const v = await fieldOf(a.label).inputValue()
        const ok = a.tol > 0 ? Math.abs(parseFloat(v) - parseFloat(a.value)) <= a.tol && v.replace(/[-\d.]/g, '') === String(a.value).replace(/[-\d.]/g, '') : v === a.value
        return R(ok, `field text "${v}", want "${a.value}"`)
      }
      case 'dot': {
        const n = await page.locator(`[data-field="${a.field}"] [data-dot]`).count()
        return R((n > 0) === a.on, `dots on ${a.field}: ${n}, want ${a.on ? 'some' : 'none'}`)
      }
      case 'review': {
        // The count is in the button's accessible name; an icon button draws it as a badge, so the name is read, not the text (round 1).
        const btn = page.getByRole('button', { name: /^Review unlinked \(\d+\)$/ }).first()
        const t = (await btn.getAttribute('aria-label').catch(() => null)) ?? (await btn.innerText().catch(() => ''))
        const n = Number(/\((\d+)\)/.exec(t)?.[1] ?? -1)
        return R(n === a.n, `Review unlinked count ${n}, want ${a.n}`)
      }
      case 'reviewList': {
        const items = page.getByRole('list', { name: 'Unlinked edits' }).getByRole('listitem')
        const n = await items.count()
        const text = n ? (await items.first().innerText()).toLowerCase() : ''
        const ok = n === a.n && a.contains.every((c) => text.includes(c.toLowerCase()))
        return R(ok, `${n} items, first "${text.replace(/\s+/g, ' ')}"`)
      }
      case 'reviewJump': {
        await page.getByRole('list', { name: 'Unlinked edits' }).getByRole('listitem').nth(a.index).getByRole('button').first().click()
        await settle(page)
        return R(true, 'clicked')
      }
      case 'undo': case 'redo': {
        const en = await page.getByRole('button', { name: a.k === 'undo' ? 'Undo' : 'Redo', exact: true }).isEnabled()
        return R(en === a.enabled, `${a.k} enabled ${en}, want ${a.enabled}`)
      }
      case 'message': {
        const t = (await region().innerText()).toLowerCase()
        return R(t.includes(a.contains.toLowerCase()), `message "${t.replace(/\s+/g, ' ')}"`)
      }
      case 'status': {
        const t = statusAtCopy ?? (await region().innerText()).toLowerCase()
        return R(t.includes(a.contains.toLowerCase()), `status "${t.replace(/\s+/g, ' ')}"`)
      }
      case 'selected': {
        const t = (await page.locator('[data-selected-label]').first().innerText().catch(() => '')).toLowerCase()
        return R(t.includes(a.contains.toLowerCase()), `selected label "${t}"`)
      }
      case 'noSelection': {
        const n = await page.locator('[data-selection]').count()
        return R(n === 0, `[data-selection] count ${n}`)
      }
      case 'env': {
        const t = (await page.locator('[data-env]').first().innerText()).trim()
        return R(t === a.text, `env "${t}"`)
      }
      case 'viewPressed': {
        const p = await page.getByRole('group', { name: 'View' }).getByRole('button', { name: a.name, exact: true }).getAttribute('aria-pressed')
        return R(p === 'true', `aria-pressed ${p}`)
      }
      case 'iframeWidth': {
        const w = await page.evaluate(() => window.__gate.frame().getBoundingClientRect().width)
        return R(Math.round(w) === a.value, `iframe ${w} px wide`)
      }
      case 'checkbox': {
        const c = fieldOf(a.label)
        if (!(await c.count())) return R(false, 'checkbox not found')
        const checked = await c.isChecked(); const dis = await c.isDisabled()
        return R(checked === a.checked && (a.disabled === undefined || dis === a.disabled), `checked ${checked}, disabled ${dis}`)
      }
      case 'tabletSentence': {
        const t = (await page.locator('body').innerText()).toLowerCase()
        return R(t.includes(a.contains.toLowerCase()), 'sentence ' + (t.includes(a.contains.toLowerCase()) ? 'present' : 'missing'))
      }
      case 'noHandles': {
        const n = await page.locator('[data-handle]').count()
        return R(n === 0, `${n} handles`)
      }
      case 'fieldDisabled': { const d = await fieldOf(a.label).isDisabled(); return R(d === (a.disabled !== false), `field disabled ${d}`) }
      case 'buttonDisabled': {
        const d = await page.getByRole('button', { name: a.name, exact: true }).isDisabled()
        return R(d === a.disabled, `disabled ${d}`)
      }
      case 'copy': {
        const f = page.getByLabel('File', { exact: true })
        if (await f.count()) await f.selectOption({ label: a.file })
        await page.getByRole('button', { name: 'Copy code', exact: true }).click()
        await settle(page)
        // What the page says right after the copy (the Download below, which the check also needs, says something else).
        statusAtCopy = (await region().innerText()).toLowerCase()
        const clip = await page.evaluate(() => navigator.clipboard.readText())
        const dl = await grab(a.file)
        return R(clip === dl.text && clip.length > 0, `clipboard ${clip.length} chars, download ${dl.text.length} chars, equal ${clip === dl.text}`)
      }
      case 'downloadName': {
        const dl = await grab(a.file)
        return R(dl.name === a.name, `saved as ${dl.name}`)
      }
      // ---- round 1 (docs/ui-editor-gate-rules-round1.md) ----
      case 'barButtons': {
        const names = (await page.getByRole('group', { name: 'Editor controls' }).getByRole('button').evaluateAll((els) => els.filter((e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden').map((e) => e.getAttribute('aria-label') ?? e.textContent.trim()))).map((n) => (/^Review unlinked/.test(n) ? 'Review unlinked' : n))
        const ok = a.includes ? a.names.every((n) => names.includes(n)) : names.length === a.names.length && a.names.every((n) => names.includes(n))
        return R(ok, `visible buttons: ${names.join(', ')}`)
      }
      case 'absent': {
        const bad = []
        for (const it of a.items) {
          const loc = await found(it)
          const n = await loc.count()
          for (let i = 0; i < n; i++) if (await loc.nth(i).isVisible()) { bad.push(label(it)); break }
        }
        return R(bad.length === 0, bad.length ? `visible: ${bad.join(', ')}` : `${a.items.length} controls hidden or absent`)
      }
      case 'present': {
        const bad = []
        for (const it of a.items) { const loc = await found(it); if (!(await loc.count()) || !(await loc.first().isVisible())) bad.push(label(it)) }
        return R(bad.length === 0, bad.length ? `not visible: ${bad.join(', ')}` : 'all visible')
      }
      case 'cards': {
        // Miniatures load after the page: give them a moment, then judge.
        await page.waitForFunction((n) => [...document.querySelectorAll('[data-gallery] iframe[data-miniature]')].filter((f) => ((f.contentDocument?.body ?? f.contentDocument?.documentElement)?.children.length ?? 0) > 0).length >= n, a.n, { timeout: 4000 }).catch(() => {})
        const info = await page.evaluate(([markers]) => [...document.querySelectorAll('[data-gallery] [data-sample-card]')].map((c) => {
          const id = c.getAttribute('data-sample-card'); const f = c.querySelector('iframe[data-miniature]'); const r = f?.getBoundingClientRect(); const d = f?.contentDocument
          const m = d?.querySelector(markers[id])?.getBoundingClientRect()
          return { id, text: c.innerText.trim(), sandbox: f?.getAttribute('sandbox') ?? null, w: r?.width ?? 0, h: r?.height ?? 0, offsetW: f?.offsetWidth ?? 0, kids: (d?.body ?? d?.documentElement)?.children.length ?? 0, mw: m?.width ?? 0, mh: m?.height ?? 0 }
        }), [a.markers])
        const problems = []
        if (info.length !== a.n) problems.push(`${info.length} cards, want ${a.n}`)
        for (const c of info) {
          const title = a.titles[Object.keys(a.markers).indexOf(c.id)]
          if (!c.text.includes(title)) problems.push(`${c.id}: no title "${title}"`)
          if (c.text.replace(title, '').trim().length < 8) problems.push(`${c.id}: no description`)
          if (c.sandbox === null || /allow-scripts/.test(c.sandbox)) problems.push(`${c.id}: sandbox "${c.sandbox}"`)
          if (!(c.w > 0 && c.h > 0)) problems.push(`${c.id}: miniature box ${c.w} x ${c.h}`)
          if (c.offsetW !== a.minWidth) problems.push(`${c.id}: miniature is ${c.offsetW} px wide, want ${a.minWidth}`)
          if (!(c.kids > 0)) problems.push(`${c.id}: miniature body has no children`)
          if (!(c.mw > 0 && c.mh > 0)) problems.push(`${c.id}: marker box ${c.mw} x ${c.mh}`)
        }
        return R(problems.length === 0, problems.length ? problems.slice(0, 4).join('; ') : `${info.length} cards, miniatures ${info.map((c) => `${Math.round(c.w)}x${Math.round(c.h)}`).join(', ')}`)
      }
      case 'markerIn': {
        const has = await page.evaluate((s) => !!document.querySelector('iframe[title="Preview"]')?.contentDocument?.querySelector(s), a.sel)
        return R(has === a.has, `preview ${has ? 'has' : 'lacks'} ${a.sel}`)
      }
      case 'miniFidelity': {
        await page.waitForFunction((id) => !!(document.querySelector(`[data-sample-card="${id}"] iframe[data-miniature]`)?.contentDocument?.body ?? document.querySelector(`[data-sample-card="${id}"] iframe[data-miniature]`)?.contentDocument?.documentElement)?.children.length, a.sample, { timeout: 4000 }).catch(() => {})
        const mini = await page.evaluate(([id, sel]) => {
          const f = document.querySelector(`[data-sample-card="${id}"] iframe[data-miniature]`)
          const m = f?.contentDocument?.querySelector(sel)?.getBoundingClientRect()
          return f && m ? { s: f.getBoundingClientRect().width / f.offsetWidth, w: f.offsetWidth, left: m.left, top: m.top, width: m.width, height: m.height } : null
        }, [a.sample, a.sel])
        await page.locator(`[data-sample-card="${a.sample}"]`).click()
        await page.waitForFunction((s) => !!document.querySelector('iframe[title="Preview"]')?.contentDocument?.querySelector(s), a.sel)
        await settle(page)
        if (!mini) return R(false, 'no marker in the miniature')
        const real = {}
        for (const q of ['left', 'top', 'width', 'height']) real[q] = await measureNum('current', a.sel, q)
        const d = ['left', 'top', 'width', 'height'].map((q) => Math.abs(mini[q] * mini.s - real[q] * mini.s))
        return R(Math.max(...d) <= a.tol && mini.w === 1280, `scale ${mini.s.toFixed(4)}, miniature width ${mini.w}, largest difference ${Math.max(...d).toFixed(2)} px`)
      }
      case 'device': {
        const m = await page.evaluate(() => {
          const f = window.__gate.frame(); const area = document.querySelector('[data-stage-area]'); const sc = document.querySelector('[data-device-scale]'); const fr = document.querySelector('[data-device-frame]')
          const t = sc ? getComputedStyle(sc).transform : 'none'; const mm = /matrix\(([^)]+)\)/.exec(t)
          const box = (fr ?? f).getBoundingClientRect(); const ar = area?.getBoundingClientRect()
          return { w: f.offsetWidth, h: f.offsetHeight, scale: mm ? parseFloat(mm[1].split(',')[0]) : 1, hasScale: !!sc, frame: !!fr, device: fr?.getAttribute('data-device') ?? null, orient: fr?.getAttribute('data-orientation') ?? null, dx: ar ? Math.abs(box.left + box.width / 2 - (ar.left + ar.width / 2)) : null }
        })
        const p = []
        if (m.w !== a.iframeW) p.push(`iframe ${m.w} wide, want ${a.iframeW}`)
        if (a.iframeH != null && m.h !== a.iframeH) p.push(`iframe ${m.h} tall, want ${a.iframeH}`)
        if (!m.hasScale) p.push('no [data-device-scale]')
        if (a.scale != null && Math.abs(m.scale - a.scale) > (a.scaleTol ?? 0.001)) p.push(`scale ${m.scale}, want ${a.scale}`)
        if (a.scaleBelow != null && !(m.scale < a.scaleBelow)) p.push(`scale ${m.scale}, want below ${a.scaleBelow}`)
        if (a.kind === 'desktop' ? m.frame : !m.frame || m.device !== a.kind || m.orient !== a.orientation) p.push(`frame ${m.frame ? `${m.device}/${m.orient}` : 'absent'}, want ${a.kind === 'desktop' ? 'none' : `${a.kind}/${a.orientation}`}`)
        if (m.dx === null || m.dx > a.centredTol) p.push(`centre off by ${m.dx === null ? 'n/a (no [data-stage-area])' : m.dx.toFixed(2)} px`)
        return R(p.length === 0, p.length ? p.join('; ') : `iframe ${m.w} x ${m.h}, scale ${m.scale.toFixed(3)}, centre off by ${m.dx.toFixed(2)} px`)
      }
      case 'measureScaled': {
        const now = await measureNum(a.at, a.sel, a.q)
        const b = before[`${a.at}|${a.sel}|${a.q}`]
        const want = b + a.screen / scaleAtDrag
        return R(now !== null && Math.abs(now - want) <= a.tol, `got ${now}, want ${want} (${b} + ${a.screen} / scale ${scaleAtDrag.toFixed(4)}) +-${a.tol}`)
      }
      case 'handles': {
        const n = await page.locator('[data-handle]').count()
        return R(n === a.n, `${n} handles, want ${a.n}`)
      }
      case 'noteText': {
        const t = ((await page.locator('[data-device-note]').first().innerText().catch(() => '')) ?? '').trim()
        return R(t === a.contains, `note "${t}"`)
      }
      case 'textAbsent': {
        // ITERATION 1 (after the scored run, docs/ui-editor-gate-log.md #12): the editor's own text, not the whole page (the Limits section says "Tablet is view-only").
        const t = (await page.locator('[data-editor]').first().innerText()).toLowerCase()
        return R(!t.includes(a.contains.toLowerCase()), 'sentence ' + (t.includes(a.contains.toLowerCase()) ? 'still shown' : 'not shown'))
      }
      case 'chips': {
        const got = await page.locator('ul.chip-list.page-chips li.chip').allInnerTexts()
        return R(got.join('|') === a.names.join('|'), `chips: ${got.join(', ')}`)
      }
      case 'ledeReach': {
        const m = await page.evaluate(() => {
          const l = document.querySelector('.page-lede')?.getBoundingClientRect(); const c = document.querySelector('main .page-container'); const cs = getComputedStyle(c); const r = c.getBoundingClientRect()
          return l ? { lede: l.right, edge: r.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth) } : null
        })
        return R(!!m && Math.abs(m.edge - m.lede) <= a.tol, m ? `intro right edge ${m.lede.toFixed(1)}, container content edge ${m.edge.toFixed(1)}` : 'no intro paragraph')
      }
      case 'columns': {
        const per = await page.evaluate(() => [...document.querySelectorAll('ul.ue-list')].map((ul) => new Set([...ul.children].map((li) => Math.round(li.getBoundingClientRect().left / 2) * 2)).size))
        const ok = per.length === a.lists.length && per.every((n) => (a.exact !== undefined ? n === a.exact : n >= a.min))
        return R(ok, `distinct column positions per list: ${per.join(', ')}`)
      }
      case 'lineLength': {
        const items = await page.evaluate(() => [...document.querySelectorAll('ul.ue-list > li')].map((li) => {
          const lines = new Map()
          const w = document.createTreeWalker(li, NodeFilter.SHOW_TEXT)
          for (let n = w.nextNode(); n; n = w.nextNode()) for (let i = 0; i < n.length; i++) {
            const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1)
            const b = r.getBoundingClientRect(); if (!b.width) continue
            const k = Math.round(b.top / 3) * 3
            lines.set(k, (lines.get(k) ?? 0) + 1)
          }
          const counts = [...lines.entries()].sort((x, y) => x[0] - y[0]).map((e) => e[1])
          return counts.length >= 2 ? counts.slice(0, -1).reduce((x, y) => x + y, 0) / (counts.length - 1) : null
        }))
        const used = items.filter((v) => v !== null)
        const bad = used.filter((v) => v < a.min || v > a.max)
        return R(used.length > 0 && bad.length === 0, `${used.length} items with two or more lines, means ${Math.min(...used).toFixed(1)} to ${Math.max(...used).toFixed(1)}${bad.length ? `, ${bad.length} outside ${a.min}-${a.max}` : ''}`)
      }
      // ---- round 2 (docs/ui-editor-gate-rules-round2.md) ----
      case 'galleryCards': {
        const info = await page.evaluate(() => [...document.querySelectorAll('[data-gallery] [data-sample-card]')].map((c) => {
          const r = c.getBoundingClientRect(); const bl = c.querySelector('[data-blank-page]')?.getBoundingClientRect()
          return { id: c.getAttribute('data-sample-card'), text: c.innerText, vis: r.width > 0 && r.height > 0 && getComputedStyle(c).visibility !== 'hidden', blank: bl ? bl.width * bl.height : 0, buttons: [...c.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') ?? b.textContent.trim()) }
        }))
        const p = []
        if (info.length !== a.n) p.push(`${info.length} cards, want ${a.n}`)
        if (info.map((c) => c.id).join() !== a.ids.join()) p.push(`ids ${info.map((c) => c.id).join()}`)
        for (const c of info) {
          if (!c.vis) p.push(`${c.id}: not visible`)
          if (c.id !== 'own') { const t = a.titles[a.ids.indexOf(c.id)]; if (!c.text.includes(t)) p.push(`${c.id}: no title ${t}`) }
          else {
            if (!c.text.includes(a.ownTitle)) p.push(`own: no title "${a.ownTitle}"`)
            if (!(c.blank > 0)) p.push('own: no blank-page miniature')
            for (const b of a.ownButtons) if (!c.buttons.includes(b)) p.push(`own: no ${b} button`)
          }
        }
        return R(p.length === 0, p.length ? p.slice(0, 4).join('; ') : `${info.length} cards: ${info.map((c) => c.id).join(', ')}`)
      }
      case 'barLacks': {
        const names = await page.getByRole('group', { name: 'Editor controls' }).locator('button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? e.textContent.trim()))
        const bad = a.names.filter((n) => names.includes(n))
        return R(bad.length === 0, bad.length ? `toolbar has: ${bad.join(', ')}` : `toolbar buttons: ${names.join(', ')}`)
      }
      case 'pasteArea': {
        const loc = page.getByRole('group', { name: 'Paste code' })
        const n = await loc.count()
        const shown = n > 0 && (await loc.first().isVisible())
        let reachable = false
        if (!a.visible) for (let i = 0; i < n; i++) if (await loc.nth(i).evaluate((e) => e.getClientRects().length > 0 || !!e.querySelector('textarea:not([disabled])') && e.querySelector('textarea').getClientRects().length > 0)) reachable = true
        return R(a.visible ? shown : !reachable, `paste area ${shown ? 'visible' : reachable ? 'reachable' : 'gone'}`)
      }
      case 'noSidePanel': {
        const m = await page.evaluate(() => ({ nodes: document.querySelectorAll('[data-editor] aside, .ue-side, .ue-panel').length, text: /side panel/i.test(document.body.innerText) }))
        return R(m.nodes === 0 && !m.text, `${m.nodes} panel elements, "side panel" text ${m.text ? 'present' : 'absent'}`)
      }
      case 'ribbonBox': {
        const m = await page.evaluate(() => {
          const r = document.querySelector('[data-ribbon]'), t = document.querySelector('[data-editor]')
          if (!r) return null
          const x = r.getBoundingClientRect(), y = t.getBoundingClientRect()
          const tops = new Set([...r.querySelectorAll('[data-ribbon-group]')].filter((g) => g.getClientRects().length).map((g) => Math.round(g.getBoundingClientRect().top / 6)))
          return { dl: Math.abs(x.left - y.left), dr: Math.abs(x.right - y.right), h: x.height, rows: tops.size }
        })
        if (!m) return R(false, 'no [data-ribbon]')
        const ok = m.dl <= a.fullTol && m.dr <= a.fullTol && m.h <= a.maxHeight && m.rows <= a.maxRows
        return R(ok, `edges off by ${m.dl.toFixed(1)} / ${m.dr.toFixed(1)}, height ${m.h.toFixed(1)}, ${m.rows} rows of groups`)
      }
      case 'ribbonAllDisabled': {
        const m = await page.evaluate(() => { const els = [...document.querySelectorAll('[data-ribbon] button, [data-ribbon] input, [data-ribbon] select, [data-ribbon] textarea')]; return { n: els.length, enabled: els.filter((e) => !e.matches(':disabled')).map((e) => e.getAttribute('aria-label') ?? e.id ?? e.tagName) } })
        return R(m.n >= a.min && m.enabled.length === 0, `${m.n} controls, enabled: ${m.enabled.slice(0, 5).join(', ') || 'none'}`)
      }
      case 'ribbonEnabled': {
        const bad = []
        for (const n of a.names) { const loc = page.locator('[data-ribbon]').getByLabel(n, { exact: true }); if (!(await loc.count()) || !(await loc.first().isEnabled())) bad.push(n) }
        return R(bad.length === 0, bad.length ? `not enabled: ${bad.join(', ')}` : `${a.names.length} controls enabled`)
      }
      case 'ribbonNote': {
        const loc = page.locator('[data-ribbon-note]').first()
        const t = (await loc.innerText().catch(() => '')).toLowerCase()
        return R((await loc.isVisible().catch(() => false)) && t.includes(a.contains.toLowerCase()), `note "${t}"`)
      }
      case 'linkTip': {
        const t = await page.evaluate((label) => { const el = [...document.querySelectorAll('[data-ribbon] input[type=checkbox]')].find((c) => document.querySelector(`label[for="${c.id}"]`)?.textContent.trim() === label); return el ? (el.title || document.querySelector(`label[for="${el.id}"]`)?.title || el.closest('[title]')?.title || '') : null }, a.label)
        return R(!!t && t.includes(a.contains), `tooltip "${t}"`)
      }
      case 'selectOptions': {
        const want = [await page.evaluate((s) => window.__gate.cssOf('current', s, 'fontFamily'), a.firstComputed), ...a.rest]
        const got = (await fieldOf(a.label).locator('option').allInnerTexts()).map((t) => t.trim())
        const tag = await fieldOf(a.label).evaluate((e) => e.tagName)
        return R(tag === 'SELECT' && got.join('|') === want.join('|'), `${tag}: ${got.join(' | ')}`)
      }
      case 'noTextInput': {
        const m = await page.evaluate((f) => ({ text: document.querySelectorAll(`[data-field="${f}"] input[type=text], [data-field="${f}"] input:not([type])`).length, select: document.querySelectorAll(`[data-field="${f}"] select`).length }), a.field)
        return R(m.text === 0 && m.select === 1, `${m.text} text inputs, ${m.select} selects`)
      }
      case 'css': {
        const raw = await page.evaluate(([s, p]) => window.__gate.cssOf('current', s, p), [a.sel, a.prop])
        if (a.equals !== undefined) return R(raw === a.equals, `${a.prop} is "${raw}", want "${a.equals}"`)
        if (a.startsWith !== undefined) return R(typeof raw === 'string' && raw.startsWith(a.startsWith), `${a.prop} is "${raw}", want it to start with "${a.startsWith}"`)
        const now = parseFloat(raw), b = before[`css|${a.sel}|${a.prop}`]
        const want = a.mode === 'abs' ? a.value : b + a.value
        return R(Math.abs(now - want) <= a.tol, `${a.prop} ${now}, want ${want} +-${a.tol}`)
      }
      case 'ratio': {
        const now = await measureNum(390, a.sel, a.q)
        const want = a.phoneFrom * (a.desktopNow / a.desktopFrom)
        return R(now !== null && Math.abs(now - want) <= a.tol, `Phone ${a.q} ${now}, want ${want.toFixed(2)} +-${a.tol}`)
      }
      case 'pctField': {
        const v = await fieldOf(a.label).inputValue()
        const w = await measureNum('current', a.sel, 'width'), pw = await page.evaluate((s) => window.__gate.parentW('current', s), a.sel)
        const want = (w / pw) * 100
        const m = /^(-?\d*\.?\d+)\s*%$/.exec(v.trim())
        return R(!!m && Math.abs(parseFloat(m[1]) - want) <= a.tol, `field "${v}", want ${want.toFixed(2)}% +-${a.tol}`)
      }
      case 'unitPressed': {
        const p = await page.getByRole('group', { name: 'Width unit' }).getByRole('button', { name: a.unit, exact: true }).getAttribute('aria-pressed')
        return R(p === 'true', `aria-pressed ${p}`)
      }
      case 'pctWidth': {
        const w = await measureNum('current', a.sel, 'width'), pw = await page.evaluate((s) => window.__gate.parentW('current', s), a.sel)
        const want = (pw * (Math.round(before[`pct|${a.sel}`] * 100) / 100 + a.plus)) / 100
        return R(Math.abs(w - want) <= a.tol, `width ${w}, want ${want.toFixed(2)} (parent ${pw}) +-${a.tol}`)
      }
      case 'exportHas': case 'exportLacks': {
        const t = (await grab(a.file)).text
        const has = new RegExp(a.pattern).test(t)
        return R(a.k === 'exportHas' ? has : !has, `${a.file} ${has ? 'matches' : 'does not match'} /${a.pattern}/`)
      }
      case 'toParentWidth': {
        const w = await measureNum(a.at, a.sel, 'width'), pw = await page.evaluate(([s, at]) => window.__gate.parentW(at, s), [a.sel, a.at])
        return R(Math.abs(w - (pw - a.short)) <= a.tol, `width ${w}, want ${pw - a.short} (parent ${pw} less ${a.short}) +-${a.tol}`)
      }
      case 'eqParent': {
        const w = await measureNum(a.at, a.sel, 'width'), pw = await page.evaluate(([s, at]) => window.__gate.parentW(at, s), [a.sel, a.at])
        return R(Math.abs(w - pw) <= a.tol, `width ${w}, parent content width ${pw} +-${a.tol}`)
      }
      case 'ghost': {
        const t = (await page.locator('[data-drag-label]').first().innerText().catch(() => '')).trim()
        return R(t.toLowerCase().includes(a.contains.toLowerCase()), `drag label "${t}"`)
      }
      case 'pressed': {
        const got = {}
        for (const n of a.names) got[n] = await page.locator('[data-ribbon]').getByRole('button', { name: n, exact: true }).getAttribute('aria-pressed')
        const ok = a.names.every((n) => got[n] === (n === a.on ? 'true' : 'false'))
        return R(ok, Object.entries(got).map(([n, v]) => `${n}=${v}`).join(', '))
      }
      case 'swatch': case 'swatchNative': {
        const m = await page.evaluate((l) => { const e = document.querySelector(`input[aria-label="${l}"]`); return e ? { type: e.type, value: e.value } : null }, a.label)
        if (!m) return R(false, 'no such input')
        return R(a.k === 'swatch' ? m.value === a.value : m.type === 'color', `type ${m.type}, value ${m.value}`)
      }
      case 'markerText': {
        const m = await page.evaluate(() => { const ls = [...document.querySelectorAll('[data-code-view] [data-line][data-change]')]; return { n: ls.length, bad: ls.filter((l) => !(l.querySelector('[data-margin-marker]')?.textContent.trim())).length } })
        return R(m.n > 0 && m.bad === 0, `${m.n} changed lines, ${m.bad} without a text marker`)
      }
      case 'noShowOnly': {
        const n = await page.getByRole('button', { name: /only changes/i }).count() + await page.getByRole('checkbox', { name: /only changes/i }).count()
        return R(n === 0, `${n} "only changes" controls`)
      }
      case 'codeDiff': case 'codeText': case 'changeCounter': case 'changeVisible': case 'changeMap': {
        const file = a.file ?? a.nFromDiff
        // One download per file and edit state (a page may refuse many automatic downloads in a row): the code asserts share it.
        if (file && !exportMemo.has(file)) exportMemo.set(file, (await grab(file)).text)
        const exp = file ? exportMemo.get(file) : ''
        const hunks = file ? hunksOf(src.files[file], exp) : []
        const nLines = linesOf(exp)
        const view = await page.evaluate(() => ({
          lines: [...document.querySelectorAll('[data-code-view] [data-line]')].map((l) => ({ n: Number(l.getAttribute('data-line')), change: l.getAttribute('data-change'), text: l.querySelector('[data-code-text]')?.textContent ?? null })),
          removed: [...document.querySelectorAll('[data-code-view] [data-removed]')].map((r) => ({ after: Number(r.getAttribute('data-removed-after')), change: r.getAttribute('data-change') })),
        }))
        if (a.k === 'codeText') {
          const same = view.lines.length === nLines.length && view.lines.every((l, i) => l.text === nLines[i])
          return R(same, `${view.lines.length} lines shown, ${nLines.length} in the export`)
        }
        if (a.k === 'codeDiff') {
          const wantGroups = hunks.filter((h) => h.added > 0).map((h) => [h.after + 1, h.after + h.added])
          const byChange = new Map()
          for (const l of view.lines) if (l.change !== null) byChange.set(l.change, [...(byChange.get(l.change) ?? []), l.n])
          const gotGroups = [...byChange.values()].map((ns) => [Math.min(...ns), Math.max(...ns)]).sort((x, y) => x[0] - y[0])
          const contiguous = [...byChange.values()].every((ns) => Math.max(...ns) - Math.min(...ns) + 1 === ns.length)
          const wantRemoved = hunks.filter((h) => h.removed > 0).map((h) => h.after).sort((x, y) => x - y)
          const gotRemoved = view.removed.map((r) => r.after).sort((x, y) => x - y)
          const ids = new Set([...view.lines.map((l) => l.change), ...view.removed.map((r) => r.change)].filter((c) => c !== null))
          const p = []
          if (JSON.stringify(gotGroups) !== JSON.stringify(wantGroups)) p.push(`highlighted groups ${JSON.stringify(gotGroups)}, want ${JSON.stringify(wantGroups)}`)
          if (!contiguous) p.push('a change is not a run of consecutive lines')
          if (JSON.stringify(gotRemoved) !== JSON.stringify(wantRemoved)) p.push(`removal points after lines ${JSON.stringify(gotRemoved)}, want ${JSON.stringify(wantRemoved)}`)
          if (ids.size !== hunks.length) p.push(`${ids.size} changes, want ${hunks.length}`)
          if (view.lines.length !== nLines.length) p.push(`${view.lines.length} lines shown, ${nLines.length} in the file`)
          return R(p.length === 0 && hunks.length > 0, p.length ? p.join('; ') : `${hunks.length} changes: groups ${JSON.stringify(wantGroups)}, removals ${JSON.stringify(wantRemoved)}`)
        }
        if (a.k === 'changeCounter') {
          const t = (await page.locator('[data-change-counter]').first().innerText().catch(() => '')).trim()
          if (a.text !== undefined) return R(t === a.text, `counter "${t}"`)
          if (a.pattern !== undefined) { const m = new RegExp(a.pattern).exec(t); return R(!!m && Number(m[1]) === hunks.length, `counter "${t}", want n = ${hunks.length}`) }
          return R(t === `${a.counterK} of ${hunks.length}`, `counter "${t}", want "${a.counterK} of ${hunks.length}"`)
        }
        if (a.k === 'changeVisible') {
          const t = (await page.locator('[data-change-counter]').first().innerText()).trim()
          const k = Number(/^(\d+) of/.exec(t)?.[1] ?? 0)
          const ok = await page.waitForFunction((kk) => {
            const box = document.querySelector('[data-code-view]'); if (!box) return false
            const el = document.querySelector(`[data-code-view] [data-line][data-change="${kk}"]`) ?? document.querySelector(`[data-code-view] [data-removed][data-change="${kk}"]`)
            if (!el) return false
            const b = box.getBoundingClientRect(), r = el.getBoundingClientRect()
            return r.top >= b.top - 1 && r.bottom <= b.bottom + 1
          }, k, { timeout: 2500 }).then(() => true, () => false)
          return R(k > 0 && ok, `change ${k} ${ok ? 'is' : 'is not'} inside the code box`)
        }
        // changeMap
        const n = a.n ?? hunks.length
        const m = await page.evaluate(() => {
          const strip = document.querySelector('[data-change-map]'); const sr = strip?.getBoundingClientRect()
          return { has: !!strip, h: sr?.height ?? 0, top: sr?.top ?? 0, ticks: [...(strip?.querySelectorAll('button') ?? [])].map((b) => { const r = b.getBoundingClientRect(); return { name: b.getAttribute('aria-label') ?? b.textContent.trim(), cy: r.top + r.height / 2 } }) }
        })
        if (n === 0) return R(m.ticks.length === 0, `${m.ticks.length} ticks`)
        const p = []
        if (m.ticks.length !== n) p.push(`${m.ticks.length} ticks, want ${n}`)
        m.ticks.forEach((t, i) => {
          if (t.name !== `Change ${i + 1} of ${n}`) p.push(`tick ${i + 1} named "${t.name}"`)
          if (i > 0 && t.cy < m.ticks[i - 1].cy - 0.5) p.push(`tick ${i + 1} above tick ${i}`)
          const h = hunks[i]
          if (h && m.h > 0) {
            const frac = h.after / nLines.length
            const got = (t.cy - m.top) / m.h
            if (Math.abs(got - frac) > a.fractionTol + a.slackPx / m.h) p.push(`tick ${i + 1} at ${got.toFixed(3)} of the strip, want ${frac.toFixed(3)}`)
          }
        })
        return R(p.length === 0, p.length ? p.slice(0, 3).join('; ') : `${n} ticks in order and in proportion`)
      }
      case 'toolbarEdges': {
        const m = await page.evaluate(() => {
          const bar = document.querySelector('[role=group][aria-label="Editor controls"]'); const cs = getComputedStyle(bar); const r = bar.getBoundingClientRect()
          const inL = r.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft), inR = r.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight)
          const kids = [...bar.querySelectorAll('button, select')].filter((e) => e.getClientRects().length > 0)
          const samples = kids.find((e) => e.textContent.trim() === 'Samples')?.getBoundingClientRect()
          return { left: samples ? samples.left - inL : null, right: kids.length ? inR - Math.max(...kids.map((e) => e.getBoundingClientRect().right)) : null }
        })
        return R(m.left !== null && Math.abs(m.left) <= a.tol && m.right !== null && Math.abs(m.right) <= a.tol, `Samples ${m.left?.toFixed(1)} px from the left inner edge, the last control ${m.right?.toFixed(1)} px from the right`)
      }
      case 'rotateLabel': {
        const t = ((await page.getByRole('group', { name: 'Editor controls' }).getByRole('button', { name: 'Rotate', exact: true }).innerText().catch(() => '')) ?? '').trim()
        return R(t === a.text, `Rotate shows "${t}"`)
      }
      case 'onlyRotateText': {
        const bad = await page.getByRole('group', { name: 'Editor controls' }).locator('button').evaluateAll((els) => els.filter((e) => e.getClientRects().length > 0 && e.textContent.trim() !== '' && !['Samples', 'Rotate'].includes(e.textContent.trim())).map((e) => e.getAttribute('aria-label') + ':' + e.textContent.trim()))
        return R(bad.length === 0, bad.length ? `visible text on: ${bad.join(', ')}` : 'only Samples and Rotate show text')
      }
      case 'iconsDistinct': {
        const sigs = await page.getByRole('group', { name: 'Editor controls' }).locator('button svg').evaluateAll((els) => els.map((e) => ({ name: e.closest('button').getAttribute('aria-label'), sig: e.innerHTML.replace(/\s+/g, ' ').trim() })))
        const dup = sigs.filter((x, i) => sigs.findIndex((y) => y.sig === x.sig) !== i).map((x) => x.name)
        return R(sigs.length >= 9 && dup.length === 0, `${sigs.length} icons${dup.length ? `, same drawing: ${dup.join(', ')}` : ', all different'}`)
      }
      case 'bottomSections': {
        const m = await page.evaluate(([titles]) => titles.map((t) => {
          const h = [...document.querySelectorAll('h2')].find((e) => e.textContent.trim() === t)
          if (!h) return { t, missing: true }
          const cs = getComputedStyle(h); const sec = h.closest('section'); const lists = sec ? sec.querySelectorAll('ul.ue-list') : []
          return { t, ff: cs.fontFamily, fs: cs.fontSize, fw: cs.fontWeight, cls: h.className, lists: lists.length, items: lists[0]?.children.length ?? 0 }
        }), [a.titles])
        const p = []
        for (const x of m) { if (x.missing) p.push(`no h2 "${x.t}"`); else { if (x.lists !== 1) p.push(`${x.t}: ${x.lists} lists`); if (x.items > a.maxItems || x.items < 1) p.push(`${x.t}: ${x.items} items`) } }
        const ok = m.filter((x) => !x.missing)
        if (new Set(ok.map((x) => `${x.ff}|${x.fs}|${x.fw}|${x.cls}`)).size > 1) p.push(`headings differ: ${ok.map((x) => `${x.fs}/${x.fw}/${x.cls}`).join(' ; ')}`)
        return R(p.length === 0, p.length ? p.slice(0, 3).join('; ') : `3 headings: ${ok[0].fs} ${ok[0].fw} class "${ok[0].cls}"; items ${ok.map((x) => x.items).join(', ')}`)
      }
      case 'noMarkers': case 'itemRules': {
        const bad = await page.evaluate((k) => [...document.querySelectorAll('ul.ue-list > li')].filter((li) => { const cs = getComputedStyle(li); return k === 'noMarkers' ? cs.listStyleType !== 'none' : !(parseFloat(cs.borderBottomWidth) >= 1 && cs.borderBottomStyle !== 'none') }).length, a.k)
        return R(bad === 0, `${bad} list items ${a.k === 'noMarkers' ? 'show a marker' : 'have no rule under them'}`)
      }
      case 'inWindow': {
        const m = await page.evaluate(() => { const f = window.__gate.frame(); f.scrollIntoView({ block: 'center' }); const r = f.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: innerHeight, w: innerWidth } })
        return R(m.top >= 0 && m.bottom <= m.h && m.left >= 0 && m.right <= m.w, `preview ${m.top.toFixed(0)}..${m.bottom.toFixed(0)} in a window ${m.h} tall`)
      }
      case 'ribbonHit': {
        const small = await page.evaluate((min) => [...document.querySelectorAll('[data-ribbon] button, [data-ribbon] input:not([type=hidden]), [data-ribbon] select')].filter((e) => e.getClientRects().length > 0).map((e) => ({ n: e.getAttribute('aria-label') ?? e.id, r: e.getBoundingClientRect() })).filter((x) => x.r.width < min - 0.5 || x.r.height < min - 0.5).map((x) => `${x.n} ${x.r.width.toFixed(0)}x${x.r.height.toFixed(0)}`), a.min)
        return R(small.length === 0, small.length ? `${small.length} too small: ${small.slice(0, 4).join(', ')}` : 'every ribbon control is at least 44 px')
      }
      case 'noOverflowX': {
        const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }))
        return R(m.sw <= m.iw + 1, `scrollWidth ${m.sw}, window ${m.iw}`)
      }
      default: return R(false, 'unknown assertion ' + a.k)
    }
  }

  try {
    for (const step of spec.steps) {
      if (!(step.do === 'assert' || step.do === 'tick' || step.do === 'openCode' || (step.do === 'button' && /change$/.test(step.name)))) exportMemo.clear()
      if (step.do === 'load') {
        await page.goto(baseUrl)
        await page.evaluate(PAGE_HELPERS)
        await openSample(step.sample)
        await captureBefore()
      } else if (step.do === 'visit') {
        // Round 1: a fresh load with nothing opened.
        await page.goto(baseUrl)
        await page.evaluate(PAGE_HELPERS)
        await page.locator('[data-editor]').first().waitFor()
        await page.waitForTimeout(0)
        continue
      } else if (step.do === 'openCard' || step.do === 'clickCard') {
        await page.locator(`[data-sample-card="${step.sample}"]`).click()
        if (step.do === 'openCard') {
          await page.waitForFunction((s) => { const f = document.querySelector('iframe[title="Preview"]'); return !!f?.contentDocument?.querySelector(s) }, step.marker)
          await settle(page)
          if (!originalDump) await captureBefore()
        } else await settle(page)
        continue
      } else if (step.do === 'waitMarker') {
        await page.waitForFunction((s) => { const f = document.querySelector('iframe[title="Preview"]'); return !!f?.contentDocument?.querySelector(s) }, step.sel)
      } else if (step.do === 'host') {
        await page.setViewportSize({ width: step.width, height: step.height })
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
        continue
      } else if (step.do === 'view') {
        await page.getByRole('group', { name: 'View' }).getByRole('button', { name: step.name, exact: true }).click()
      } else if (step.do === 'click') {
        const p = await page.evaluate(([s, a]) => window.__gate.point(s, a), [step.sel, step.at])
        if (!p) { rec('setup', `click ${step.sel}`, false, 'element not found'); continue }
        await page.mouse.move(p.x, p.y)
        await page.mouse.click(p.x, p.y)
      } else if (step.do === 'clickBlank') {
        const p = await page.evaluate(() => window.__gate.blankPoint())
        await page.mouse.move(p.x, p.y)
        await page.mouse.click(p.x, p.y)
      } else if (step.do === 'drag') {
        let p
        if (step.handle) {
          const b = await page.locator(`[data-handle="${step.handle}"]`).first().boundingBox().catch(() => null)
          if (!b) { rec('setup', `drag ${step.sel} handle ${step.handle}`, false, 'handle not found'); continue }
          p = { x: b.x + b.width / 2, y: b.y + b.height / 2 }
        } else p = await page.evaluate(([s]) => window.__gate.point(s, 'center'), [step.sel])
        scaleAtDrag = await scaleNow()
        let dxv = step.dx, dyv = step.dy ?? 0
        if (step.dxToParentEdge) {
          // Round 2: measured now, in the preview: the parent's content right edge, less `short`, minus the element's right edge (CSS px, then screen px).
          const g = await page.evaluate((s) => window.__gate.edgeOf(s), step.dxToParentEdge.sel)
          dxv = (g.edge - g.right - step.dxToParentEdge.short) * (await page.evaluate(() => window.__gate.scaleOf()))
        }
        await page.mouse.move(p.x, p.y)
        await page.mouse.down()
        const n = Math.max(2, Math.ceil(Math.max(Math.abs(dxv), Math.abs(dyv)) / 4))
        for (let i = 1; i <= n; i++) await page.mouse.move(p.x + (dxv * i) / n, p.y + (dyv * i) / n)
        if (!step.hold) await page.mouse.up()
      } else if (step.do === 'type') {
        const f = fieldOf(step.field)
        await f.click({ clickCount: 3 })
        await page.keyboard.type(step.text)
        await page.keyboard.press('Enter')
      } else if (step.do === 'uncheck') {
        await fieldOf(step.label).uncheck()
      } else if (step.do === 'button') {
        await page.getByRole('button', { name: step.name, exact: true }).click()
      } else if (step.do === 'selectFile') {
        await page.getByLabel('File', { exact: true }).selectOption({ label: step.name })
      } else if (step.do === 'ownAction') {
        const card = page.locator('[data-sample-card="own"]')
        if (!(await card.isVisible().catch(() => false))) await page.getByRole('button', { name: 'Samples', exact: true }).click()
        const b = card.getByRole('button', { name: step.name, exact: true })
        if (step.files) {
          const [fc] = await Promise.all([page.waitForEvent('filechooser'), b.click()])
          await fc.setFiles(step.files.map((f) => ({ name: f.name, mimeType: 'text/html', buffer: Buffer.from(f.text) })))
        } else await b.click()
      } else if (step.do === 'fill') {
        await fieldOf(step.label).fill(step.text)
      } else if (step.do === 'stepper') {
        const b = page.locator('[data-ribbon]').getByRole('button', { name: `${step.dir === '+' ? 'Increase' : 'Decrease'} ${step.field}`, exact: true })
        for (let i = 0; i < step.times; i++) { await b.click(step.shift ? { modifiers: ['Shift'] } : {}); await settle(page) }
        continue
      } else if (step.do === 'choose') {
        await fieldOf(step.label).selectOption({ label: step.option })
      } else if (step.do === 'openCode') {
        const d = page.locator('[data-editor] details').first()
        if (!(await d.evaluate((e) => e.open))) await d.locator('summary').click()
      } else if (step.do === 'unit') {
        await page.getByRole('group', { name: 'Width unit' }).getByRole('button', { name: step.unit, exact: true }).click()
      } else if (step.do === 'tick') {
        await page.locator('[data-change-map]').getByRole('button', { name: new RegExp(`^Change ${step.k} of \\d+$`) }).click()
      } else if (step.do === 'release') {
        await page.mouse.up()
      } else if (step.do === 'snapshot') {
        snaps[step.name] = { dumps: await dumps(), exports: await grabAll() }
      } else if (step.do === 'assert') {
        await settle(page)
        await doAssert(step)
        continue
      }
      await settle(page)
    }

    // ---- after the steps: P3 needs the preview now, P2 needs the export (round 1 specs list the checks that apply) ----
    const wants = (k) => !spec.checks || spec.checks.includes(k)
    if (wants('P2') || wants('P3') || wants('P4')) {
    const afterDump = await dumps()
    const exports = await grabAll()
    for (const [f, t] of Object.entries(exports)) exported.set(f, t)
    // P2: the export, loaded fresh, against the preview.
    const p2 = []
    for (const w of widths) {
      const fresh = await ctx.newPage()
      await fresh.setViewportSize({ width: w, height: specsFile.previewHeight })
      await fresh.goto(`http://127.0.0.1:${exportPort}/${src.primary}`)
      await fresh.evaluate(PAGE_HELPERS.replace("document.querySelector('iframe[title=\"Preview\"]')", 'null'))
      const freshDump = await fresh.evaluate(() => window.__gate.dump(document))
      await fresh.close()
      p2.push(...p2Violations(afterDump[w], freshDump).map((v) => `@${w}: ${v}`))
    }
    res.P2 = { ok: p2.length === 0, detail: p2.slice(0, 5) }
    // P3
    const againstSnap = spec.p3.against.startsWith('snapshot:') ? snaps[spec.p3.against.slice(9)] : null
    const baseDump = againstSnap ? againstSnap.dumps : originalDump
    const targetKey = await page.evaluate((s) => window.__gate.keyFor(s), spec.p3.target)
    const p3 = []
    for (const w of widths) p3.push(...p3Violations(baseDump[w], afterDump[w], { targetKey, class: spec.p3.class, pair: spec.p3.pair ?? 'index' }).map((v) => `@${w}: ${v}`))
    res.P3 = { ok: p3.length === 0, detail: p3.slice(0, 6) }
    // P4
    const p4 = []
    for (const f of src.order) {
      const a = src.files[f], b = exports[f]
      const limit = spec.p4.files[f]
      if (limit === undefined) { if (a !== b) p4.push(`${f} changed but the spec allows no change`) ; continue }
      const { removed, added } = diffLines(a, b)
      const changed = Math.max(removed.length, added.length)
      if (changed > limit) p4.push(`${f}: ${changed} changed lines, budget ${limit}`)
      if (spec.p4.permutation && !sameShape(removed, added)) p4.push(`${f}: not a pure permutation of lines`)
    }
    if (spec.p4.sameAs) {
      const snap = snaps[spec.p4.sameAs.slice(9)]
      for (const f of src.order) if (snap.exports[f] !== exports[f]) p4.push(`${f}: differs from the export recorded before the undo`)
    }
    res.P4 = { ok: p4.length === 0, detail: p4 }
    res.exports = exports
    }
  } catch (e) {
    res.notes.push('runner error: ' + (e?.stack ?? e))
  }
  await ctx.close()
  res.outcome = spec.checks ? outcomeOfRound1(res) : outcomeOf(res)
  return res
}

// ---- no-op round trips: every sample, no edits, every file byte-identical ----
async function noop() {
  const rows = []
  for (const id of Object.keys(sources)) {
    const ctx = await browser.newContext({ viewport: specsFile.hostViewport, acceptDownloads: true })
    const page = await ctx.newPage()
    await page.goto(baseUrl)
    await page.evaluate(PAGE_HELPERS)
    // Through the gallery card when the page has one (round 1), else through the Sample picker.
    await page.locator('[data-editor]').first().waitFor()
    if (await page.locator('[data-sample-card]').count()) await page.locator(`[data-sample-card="${id}"]`).click()
    else await page.getByLabel('Sample', { exact: true }).selectOption(id)
    await page.waitForFunction((s) => !!document.querySelector('iframe[title="Preview"]')?.contentDocument?.querySelector(s), READY[id])
    await settle(page)
    for (const f of sources[id].order) {
      const sel = page.getByLabel('File', { exact: true })
      if (await sel.count()) await sel.selectOption({ label: f })
      const dl = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Download', exact: true }).click()
      const d = await dl
      const chunks = []
      for await (const c of await d.createReadStream()) chunks.push(c)
      const text = Buffer.concat(chunks).toString('utf8')
      rows.push({ sample: id, file: f, ok: text === sources[id].files[f], bytes: text.length })
    }
    await ctx.close()
  }
  return rows
}

let exitCode = 0
if (flag('--noop')) {
  const rows = await noop()
  for (const r of rows) console.log(`${r.ok ? 'PASS' : 'FAIL'}  no-op ${r.sample}/${r.file} (${r.bytes} bytes)`)
  writeFileSync(join(outDir, 'noop.json'), JSON.stringify(rows, null, 1))
  exitCode = rows.every((r) => r.ok) ? 0 : 1
} else {
  const retired = Object.keys(round2File.retired ?? {})
  const list = [...specsFile.specs, ...round1File.specs.filter((s) => !retired.includes(s.id)), ...round2File.specs].filter((s) => !only || only.includes(s.id))
  for (const id of retired) if (!only || only.includes(id)) console.log(`${id}  RETIRED  ${round2File.retired[id]}`)
  const results = []
  for (const spec of list) {
    const r = await runSpec(spec)
    results.push(r)
    const fails = [...r.setup, ...r.P1, ...r.P5, ...r.P6].filter((c) => !c.ok)
    const mark = (ok) => (ok === null ? '-' : ok ? 'ok' : 'XX')
    const pOf = (arr) => (arr.length ? (arr.every((c) => c.ok) ? 'ok' : 'XX') : '-')
    console.log(`${r.id}  ${r.outcome.padEnd(7)} P1 ${pOf(r.P1)} P2 ${mark(r.P2?.ok ?? null)} P3 ${mark(r.P3?.ok ?? null)} P4 ${mark(r.P4?.ok ?? null)} P5 ${pOf(r.P5)}${r.checks ? ` P6 ${pOf(r.P6)}` : ''}  ${r.name}`)
    for (const c of fails.slice(0, 4)) console.log(`      ${c.name}: ${c.detail}`)
    for (const k of ['P2', 'P3', 'P4']) if (r[k] && !r[k].ok) for (const d of (r[k].detail ?? []).slice(0, 3)) console.log(`      ${k}: ${d}`)
    for (const n of r.notes) console.log('      ' + n.split('\n')[0])
  }
  const count = (o) => results.filter((r) => r.outcome === o).length
  const orig = results.filter((r) => !r.checks), round1 = results.filter((r) => r.checks && !r.id.startsWith('R')), round2 = results.filter((r) => r.id.startsWith('R'))
  const tally = (rs, o) => rs.filter((r) => r.outcome === o).length
  const summary = { fault, url: baseUrl, originals: { pass: tally(orig, 'PASS'), refused: tally(orig, 'REFUSED'), fail: tally(orig, 'FAIL'), total: orig.length }, round1: { pass: tally(round1, 'PASS'), fail: tally(round1, 'FAIL'), total: round1.length, retired: retired.length }, round2: { pass: tally(round2, 'PASS'), fail: tally(round2, 'FAIL'), total: round2.length } }
  if (orig.length) console.log(`\nOriginals: PASS ${summary.originals.pass}  REFUSED ${summary.originals.refused}  FAIL ${summary.originals.fail}  of ${summary.originals.total}`)
  if (round1.length) console.log(`Round 1:   PASS ${summary.round1.pass}  FAIL ${summary.round1.fail}  of ${summary.round1.total} (N01 and N02 RETIRED, not run)`)
  if (round2.length) console.log(`Round 2:   PASS ${summary.round2.pass}  FAIL ${summary.round2.fail}  of ${summary.round2.total}`)
  writeFileSync(join(outDir, `results${fault ? '-' + fault : ''}${only ? '-' + only.join('') : ''}.json`), JSON.stringify({ summary, results: results.map(({ exports, ...r }) => r) }, null, 1))
  // Pass line: originals 18 PASS + 2 REFUSED + 0 FAIL when all 20 ran; round 1 N03 to N11 all PASS (N01 and N02 retired); round 2 R01 to R16 all PASS.
  const o = summary.originals, n = summary.round1
  const origOk = orig.length !== 20 || (o.pass + o.refused >= 20 && o.pass >= 18 && o.fail === 0)
  const r1Ok = round1.length !== 9 || (n.pass === 9 && n.fail === 0)
  const r2Ok = round2.length !== 16 || (summary.round2.pass === 16 && summary.round2.fail === 0)
  exitCode = origOk && r1Ok && r2Ok ? 0 : 1
}
await browser.close()
exportServer.close()
stubServer?.close()
process.exit(exitCode)
