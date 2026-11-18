// The UI Editor gate runner (rules: docs/ui-editor-gate-rules.md, specs: scripts/ui-editor-gate/specs.json).
//   node scripts/ui-editor-gate/run.mjs --url http://127.0.0.1:4173/ui-editor            the real page (vite preview, flag ON)
//   node scripts/ui-editor-gate/run.mjs --stub [--fault half-drag] [--only S04,S05]      the scorer-check stub (see reference/)
//   node scripts/ui-editor-gate/run.mjs --stub2 [--fault no-scale] [--only N01,N05]       the round 1 scorer-check stub (reference/round1.html)
//   node scripts/ui-editor-gate/run.mjs --stub3 [--fault no-wrap] [--only R12]            the round 2 scorer-check stub (reference/round2.html)
//   node scripts/ui-editor-gate/run.mjs --stub4 [--fault no-alt] [--only T09]             the round 3 scorer-check stub (reference/round3.html)
//   node scripts/ui-editor-gate/run.mjs --stub5 [--fault left-packed] [--only U02]         the round 4 scorer-check stub (reference/round4.html)
// All five spec files run: specs.json (S01 to S20), specs-round1.json (N01 to N11), specs-round2.json (R01 to R16), specs-round3.json (T01 to T16) and specs-round4.json (U01 to U13). --only picks ids.
//   --u13-na   the Limits sentence of U13 was not verified: it must be absent and U13 reads NOT APPLICABLE (docs/ui-editor-gate-rules-round4.md section 4)
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
const round3File = JSON.parse(readFileSync(join(here, 'specs-round3.json'), 'utf8'))
const round4File = JSON.parse(readFileSync(join(here, 'specs-round4.json'), 'utf8'))
// ROUND 4 (docs/ui-editor-gate-log.md #25): the retired checks of round 4 apply to the real page and the round 4 stub, not to the earlier stubs (which still have tabs and
// are used to show that the earlier faults are still caught by the earlier specs).
const OLD_STUB = flag('--stub') || flag('--stub2') || flag('--stub3') || flag('--stub4')
const retiredFor = (id) => {
  const a = round3File.retiredChecks?.[id], b = OLD_STUB ? undefined : round4File.retiredChecks?.[id]
  if (!a && !b) return undefined
  return { steps: [...(a?.steps ?? []), ...(b?.steps ?? [])], asserts: [...(a?.asserts ?? []), ...(b?.asserts ?? [])], wholeSpec: !!b?.wholeSpec, replacedBy: [a?.replacedBy, b?.replacedBy].filter(Boolean).join('; '), reason: [a?.reason, b?.reason].filter(Boolean).join(' ') }
}
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
if (OLD_STUB || flag('--stub5')) {
  const refDir = join(here, 'reference')
  const page1 = flag('--stub5') ? 'round4.html' : flag('--stub4') ? 'round3.html' : flag('--stub3') ? 'round2.html' : flag('--stub2') ? 'round1.html' : 'index.html'
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
    // ROUND 4 (log #27): there is no tab to start a Tab walk from. Focus the last focusable element before the ribbon, so the first real Tab press (keyboard, so :focus-visible applies) lands on the ribbon's first control.
    focusBeforeRibbon() {
      const rib = document.querySelector('[data-ribbon]')
      const cands = [...document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')].filter((e) => e.tabIndex >= 0 && !e.matches(':disabled') && e.getClientRects().length && !rib.contains(e) && (rib.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_PRECEDING))
      document.activeElement?.blur()
      const last = cands[cands.length - 1]
      if (last) last.focus()
      return !!last
    },
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

  // ITERATION 1 of round 2 (docs/ui-editor-gate-log.md #19): the runner's own Downloads (for P2, P4 and the export asserts) make the page say "Saved ...";
  // the `message` assert reads the last message the ACTION gave, as it was before the runner downloaded. Cleared by the next step that is not an assert.
  let lastEditMessage = null
  const grab = async (file) => {
    const before = ((await region().innerText().catch(() => '')) ?? '').toLowerCase()
    if (before && !/^(saved|copied)/.test(before)) lastEditMessage = before
    await chooseFile(file)
    const dl = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download', exact: true }).click()
    const d = await dl
    const stream = await d.createReadStream()
    const chunks = []
    for await (const c of stream) chunks.push(c)
    return { name: d.suggestedFilename(), text: Buffer.concat(chunks).toString('utf8') }
  }
  // ROUND 3 (docs/ui-editor-gate-log.md #20): a file is chosen by its option VALUE (the file name; the text now carries a count), and the select is left alone when
  // the file is already shown (a download must not count as the visitor choosing a file).
  const chooseFile = async (file) => {
    const sel = page.getByLabel('File', { exact: true })
    if (!(await sel.count())) return
    if ((await sel.inputValue()) !== file) await sel.selectOption({ value: file })
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
    for (const s of spec.steps.filter((x) => x.do === 'assert' && (x.k === 'snapMove' || x.k === 'snapEdge'))) {
      const at = s.at ?? 'current'
      const key = `pos|${at}|${s.sel}`
      if (!(key in before)) before[key] = { left: await measureNum(at, s.sel, 'left'), top: await measureNum(at, s.sel, 'top'), width: await measureNum(at, s.sel, 'width') }
    }
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
  const memo = {}
  const styles = {}
  const fitLabels = new Set()
  const statusHeights = {}
  // ROUND 3 (log #21): a control on the other ribbon tab is reached by clicking its tab first (the same control, new UI). Both panels stay in the DOM.
  const reveal = async (loc) => {
    if (!(await loc.count().catch(() => 0))) return
    const first = loc.first()
    if (await first.isVisible().catch(() => true)) return
    const tabId = await first.evaluate((e) => e.closest('[role=tabpanel]')?.getAttribute('aria-labelledby') ?? null).catch(() => null)
    if (tabId) { await page.locator(`[id="${tabId}"]`).click(); await settle(page) }
  }

  // ---- round 3: numbers read from the page, and the file asserts (T13, T14). Each reads the page FIRST and downloads the files last (a download through the File select
  // counts as the visitor choosing a file). The expected values come from the runner's own line diff of the downloaded export, never from the page. ----
  const readNumber = (what) => page.evaluate((w) => {
    if (w === 'panelHeight') { const p = [...document.querySelectorAll('[data-ribbon-panel]')].find((e) => e.getClientRects().length > 0); return p ? p.getBoundingClientRect().height : -1 }
    if (w === 'ribbonHeight') return document.querySelector('[data-ribbon]')?.getBoundingClientRect().height ?? -1
    if (w === 'stageTop') return (document.querySelector('[data-stage-area]')?.getBoundingClientRect().top ?? -1) + scrollY
    if (w === 'elementCount') return window.__gate.frame().contentDocument.querySelectorAll('*').length
    return NaN
  }, what)
  const readFileState = () => page.evaluate(() => {
    const lab = [...document.querySelectorAll('label')].find((l) => l.textContent.trim() === 'File'), sel = lab ? document.getElementById(lab.htmlFor) : null
    const btn = (n) => [...document.querySelectorAll('[role=group][aria-label="Editor controls"] button')].find((b) => (b.getAttribute('aria-label') ?? '') === n)
    return {
      value: sel?.value ?? null,
      options: sel ? [...sel.options].map((o) => ({ value: o.value, text: o.textContent.trim() })) : [],
      counter: document.querySelector('[data-change-counter]')?.textContent.trim() ?? '',
      copy: { label: btn('Copy code')?.getAttribute('aria-label') ?? null, title: btn('Copy code')?.getAttribute('title') ?? '' },
      dl: { label: btn('Download')?.getAttribute('aria-label') ?? null, title: btn('Download')?.getAttribute('title') ?? '' },
      lines: [...document.querySelectorAll('[data-code-view] [data-line]')].map((l) => ({ n: Number(l.getAttribute('data-line')), change: l.getAttribute('data-change') })),
      ticks: document.querySelectorAll('[data-change-map] button').length,
    }
  })
  const fileDiffs = async (files) => { const out = {}; for (const f of files) out[f] = hunksOf(src.files[f], (await grab(f)).text); return out }
  const marksProblems = (st, d, files) => {
    const p = []
    for (const f of files) {
      const o = st.options.find((x) => x.value === f)
      const want = d[f].length > 0 ? `${f} (${d[f].length})` : f
      if (!o) p.push(`no option ${f}`)
      else if (o.text !== want) p.push(`option "${o.text}", want "${want}"`)
    }
    return p
  }
  const groupsOfLines = (lines) => {
    const by = new Map()
    for (const l of lines) if (l.change !== null) by.set(l.change, [...(by.get(l.change) ?? []), l.n])
    return [...by.values()].map((ns) => [Math.min(...ns), Math.max(...ns)]).sort((x, y) => x[0] - y[0])
  }
  async function fileAssert(a, R) {
    const st = await readFileState()
    const p = []
    if (a.k === 'walkChanges') {
      const m = /^0 of (\d+)$/.exec(st.counter)
      const n0 = m ? Number(m[1]) : -1
      const log = []
      if (n0 < 1) p.push(`counter "${st.counter}", want "0 of N"`)
      else {
        const press = async (name) => { await page.getByRole('button', { name, exact: true }).click(); await settle(page); const s = await readFileState(); log.push({ counter: s.counter, shown: s.value, ticks: s.ticks }) }
        for (let i = 0; i < n0 + 1; i++) await press('Next change')
        await press('Previous change')
      }
      const d = await fileDiffs(a.files)
      const all = a.files.flatMap((f) => d[f].map((h, i) => ({ f, i })))
      const N = all.length
      if (n0 >= 1 && n0 !== N) p.push(`the page counts ${n0} changes over all files, the diff has ${N}`)
      // READING (docs/ui-editor-gate-log.md #23): "the shown file did not change from the first changed file after the second edit" is read as: after the font size edit
      // (which changes landing.css only, S09 and S20) and then the reorder (landing.html), the shown file is still landing.css.
      if (st.value !== 'landing.css') p.push(`the shown file is ${st.value}, want landing.css (it has changes, so the view stays)`)
      p.push(...marksProblems(st, d, a.files))
      if (n0 >= 1 && N >= 1 && n0 === N && log.length === N + 2) {
        for (let k = 1; k <= N; k++) { const e = log[k - 1]; if (e.counter !== `${k} of ${N}` || e.shown !== all[k - 1].f) p.push(`Next ${k}: counter "${e.counter}" on ${e.shown}, want "${k} of ${N}" on ${all[k - 1].f}`) }
        if (log[N].counter !== `1 of ${N}` || log[N].shown !== all[0].f) p.push(`Next past the end: "${log[N].counter}" on ${log[N].shown}, want "1 of ${N}" on ${all[0].f}`)
        if (log[N + 1].counter !== `${N} of ${N}` || log[N + 1].shown !== all[N - 1].f) p.push(`Previous: "${log[N + 1].counter}" on ${log[N + 1].shown}, want "${N} of ${N}" on ${all[N - 1].f}`)
        for (const e of log) if (e.ticks !== d[e.shown].length) p.push(`change map has ${e.ticks} ticks on ${e.shown}, want ${d[e.shown].length}`)
      }
      return R(p.length === 0, p.length ? p.slice(0, 4).join('; ') : `${N} changes over ${a.files.length} files walked in order, wrapping both ways, the map follows the shown file`)
    }
    const d = await fileDiffs(a.files)
    const changed = a.files.filter((f) => d[f].length > 0)
    const N = changed.reduce((n, f) => n + d[f].length, 0)
    p.push(...marksProblems(st, d, a.files))
    if (a.k === 'codeShowsEdit') {
      if (!changed.length) p.push('the export changed no file')
      if (!changed.includes(st.value)) p.push(`the shown file ${st.value} is not a changed file (changed: ${changed.join(', ') || 'none'})`)
      const got = groupsOfLines(st.lines), want = (d[st.value] ?? []).filter((h) => h.added > 0).map((h) => [h.after + 1, h.after + h.added])
      if (!st.lines.some((l) => l.change !== null)) p.push('no highlighted line in the shown file')
      else if (JSON.stringify(got) !== JSON.stringify(want)) p.push(`highlighted groups ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)
      if (/no changes yet/i.test(st.counter)) p.push('"No changes yet" is shown')
    } else if (a.k === 'bugState') {
      const first = changed[0]
      if (!first || st.value !== first) p.push(`the shown file is ${st.value}, want the first changed file ${first}`)
      if (st.copy.label !== 'Copy code' || st.dl.label !== 'Download') p.push(`accessible names "${st.copy.label}" and "${st.dl.label}"`)
      if (!st.copy.title.includes(st.value ?? '\u0000') || !st.dl.title.includes(st.value ?? '\u0000')) p.push(`tooltips "${st.copy.title}" and "${st.dl.title}" do not name ${st.value}`)
      if (st.counter !== `0 of ${N}`) p.push(`counter "${st.counter}", want "0 of ${N}"`)
    } else if (a.k === 'handPick') {
      if (st.value !== a.hand) p.push(`the shown file is ${st.value}, the visitor chose ${a.hand}`)
      if (!changed.some((f) => f !== a.hand)) p.push('no other file changed, so nothing was tested')
    }
    return R(p.length === 0, p.length ? p.slice(0, 4).join('; ') : `shown ${st.value}; ${a.files.map((f) => (d[f].length ? `${f} (${d[f].length})` : f)).join(', ')}`)
  }

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
        const t = lastEditMessage ?? (await region().innerText()).toLowerCase()
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
        await chooseFile(a.file)
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
        const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, wide: [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1 && e.getBoundingClientRect().width > 0 && !e.closest('iframe') && !e.closest('[data-code-view]')).slice(0, 3).map((e) => `${e.tagName}.${e.className} right ${Math.round(e.getBoundingClientRect().right)}`) }))
        return R(m.sw <= m.iw + 1, `scrollWidth ${m.sw}, window ${m.iw}${m.wide.length ? `; wider than the window: ${m.wide.join(', ')}` : ''}`)
      }
      // ---- round 3 (docs/ui-editor-gate-rules-round3.md) ----
      case 'sameAs': {
        const now = await readNumber(a.what)
        const want = memo[a.name]
        return R(want !== undefined && Math.abs(now - want) <= a.tol, `${a.what} ${now}, remembered ${want} +-${a.tol}`)
      }
      case 'ribbonStructure': {
        const m = await page.evaluate(([tabs, selected, groups]) => {
          const p = []
          const rib = document.querySelector('[data-ribbon]')
          if (!rib) return ['no [data-ribbon]']
          const nameOf = (e) => e.getAttribute('aria-label') || e.textContent.trim()
          const tabEls = [...rib.querySelectorAll('[role=tab]')]
          if (tabEls.map(nameOf).join('|') !== tabs.join('|')) p.push(`tabs ${tabEls.map(nameOf).join(', ')}, want ${tabs.join(', ')}`)
          const list = rib.querySelector('[role=tablist]')
          if (!list || tabEls.some((t) => !list.contains(t))) p.push('tabs are not inside a role=tablist')
          tabEls.forEach((t) => { const sel = t.getAttribute('aria-selected'); if ((sel === 'true') !== (nameOf(t) === selected) || (sel !== 'true' && sel !== 'false')) p.push(`tab ${nameOf(t)} aria-selected ${sel}`) })
          const all = []
          for (const t of tabEls) {
            const name = nameOf(t)
            const panel = [...document.querySelectorAll('[role=tabpanel]')].find((e) => e.getAttribute('aria-labelledby') === t.id)
            if (!panel) { p.push(`no tabpanel for ${name}`); continue }
            const shown = panel.getClientRects().length > 0
            if (shown !== (name === selected)) p.push(`panel ${name} ${shown ? 'shown' : 'hidden'}`)
            const gs = [...panel.querySelectorAll('[data-ribbon-group]')]
            const want = groups[name] ?? {}
            if (gs.map((g) => g.getAttribute('aria-label')).join('|') !== Object.keys(want).join('|')) p.push(`${name} groups ${gs.map((g) => g.getAttribute('aria-label')).join(', ')}, want ${Object.keys(want).join(', ')}`)
            for (const g of gs) {
              if (g.getAttribute('role') !== 'group') p.push(`group ${g.getAttribute('aria-label')} has role ${g.getAttribute('role')}`)
              const ctl = [...g.querySelectorAll('button, input:not([type=hidden]), select')].map(nameOf)
              for (const n of want[g.getAttribute('aria-label')] ?? []) if (!ctl.includes(n)) p.push(`${name}/${g.getAttribute('aria-label')}: no control "${n}"`)
            }
            for (const c of panel.querySelectorAll('button, input:not([type=hidden]), select')) { if (!c.closest('[data-ribbon-group]')) p.push(`outside a group: ${nameOf(c)}`); all.push(nameOf(c)) }
          }
          const dup = all.filter((n, i) => all.indexOf(n) !== i)
          if (dup.length) p.push(`twice: ${[...new Set(dup)].join(', ')}`)
          return p
        }, [a.tabs, a.selected, a.groups])
        return R(m.length === 0, m.length ? m.slice(0, 4).join('; ') : `${a.tabs.length} tabs, ${Object.values(a.groups).reduce((n, g) => n + Object.keys(g).length, 0)} groups, every control once`)
      }
      case 'controlSizes': {
        const m = await page.evaluate(([big, small, large, tol, labelSize]) => {
          const p = []
          const panel = [...document.querySelectorAll('[data-ribbon-panel]')].find((e) => e.getClientRects().length > 0)
          if (!panel) return ['no visible [data-ribbon-panel]']
          const nameOf = (e) => e.getAttribute('aria-label') || e.textContent.trim()
          for (const c of panel.querySelectorAll('button, input:not([type=hidden]), select')) {
            if (!c.getClientRects().length) continue
            const r = c.getBoundingClientRect(), n = nameOf(c)
            if (big.includes(n)) { if (r.height < large[0] - tol || r.height > large[1] + tol || r.width < 40) p.push(`${n} ${r.width.toFixed(0)}x${r.height.toFixed(1)}, want ${large[0]}-${large[1]} high`) }
            else if (r.height < small[0] - tol || r.height > small[1] + tol) p.push(`${n} ${r.height.toFixed(1)} high, want ${small[0]}-${small[1]}`)
          }
          for (const g of panel.querySelectorAll('[data-ribbon-group]')) {
            if (!g.getClientRects().length) continue
            const lab = g.querySelector('[data-group-label]')
            if (!lab || !lab.textContent.trim()) { p.push(`group ${g.getAttribute('aria-label')}: no label`); continue }
            const lb = lab.getBoundingClientRect()
            const bottom = Math.max(...[...g.querySelectorAll('button, input:not([type=hidden]), select')].filter((c) => c.getClientRects().length).map((c) => c.getBoundingClientRect().bottom))
            if (lb.top < bottom - 0.5) p.push(`${g.getAttribute('aria-label')}: label top ${lb.top.toFixed(1)} above the controls' bottom ${bottom.toFixed(1)}`)
            if (getComputedStyle(lab).fontSize !== labelSize) p.push(`${g.getAttribute('aria-label')}: label ${getComputedStyle(lab).fontSize}, want ${labelSize}`)
          }
          return p
        }, [a.largeNames, a.small, a.large, a.tol, a.labelSize])
        return R(m.length === 0, m.length ? m.slice(0, 4).join('; ') : `${a.tab} tab: small controls ${a.small.join('-')} px, large ${a.large.join('-')} px, labels ${a.labelSize} under the controls`)
      }
      case 'quickBarOrder': {
        const m = await page.evaluate((o) => {
          const bar = document.querySelector('[role=group][aria-label="Editor controls"]')
          const nameOf = (e) => e.getAttribute('aria-label') || e.textContent.trim()
          const find = (n) => [...bar.querySelectorAll('button')].find((b) => (n === 'Review unlinked' ? /^Review unlinked/.test(nameOf(b)) : nameOf(b) === n) && b.getClientRects().length > 0)
          const els = o.order.map((n) => [n, find(n)])
          const p = []
          for (const [n, e] of els) if (!e) p.push(`${n} not visible`)
          if (p.length) return p
          const rs = els.map(([n, e]) => [n, e.getBoundingClientRect()])
          for (let i = 1; i < rs.length; i++) if (!(rs[i][1].left + rs[i][1].width / 2 > rs[i - 1][1].left + rs[i - 1][1].width / 2)) p.push(`${rs[i][0]} is not right of ${rs[i - 1][0]}`)
          const cy = rs.map((r) => r[1].top + r[1].height / 2)
          if (Math.max(...cy) - Math.min(...cy) > o.rowTol) p.push(`not on one row (${(Math.max(...cy) - Math.min(...cy)).toFixed(0)} px apart)`)
          const rightMost = Math.max(...[...bar.querySelectorAll('button, select')].filter((e) => e.getClientRects().length).map((e) => e.getBoundingClientRect().right))
          const last = rs[rs.length - 1][1]
          if (Math.abs(rightMost - last.right) > 1) p.push(`${rs[rs.length - 1][0]} is not the right-most control`)
          const [x, y] = o.gapBetween.map((n) => rs.find((r) => r[0] === n)[1])
          if (y.left - x.right < o.gapMin) p.push(`gap ${o.gapBetween.join(' to ')} is ${(y.left - x.right).toFixed(1)} px, want ${o.gapMin}`)
          for (const [n, e] of els) if (e.closest('[aria-haspopup], [role=menu], [role=menuitem]')) p.push(`${n} is inside a menu`)
          return p
        }, a)
        return R(m.length === 0, m.length ? m.slice(0, 4).join('; ') : `${a.order.length} controls in order on one row, Reset all last, gap at least ${a.gapMin} px`)
      }
      case 'viewStyle': {
        const m = await page.evaluate((sel) => {
          const probe = document.createElement('span'); probe.style.color = 'var(--color-text)'; document.body.appendChild(probe)
          const text = getComputedStyle(probe).color; probe.remove()
          const lum = (c) => { const v = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2] }
          const g = document.querySelector('[role=group][aria-label="View"]')
          const bs = [...g.querySelectorAll('button')]
          const pressed = bs.filter((b) => b.getAttribute('aria-pressed') === 'true')
          const out = { p: [] }
          if (pressed.length !== 1 || pressed[0].getAttribute('aria-label') !== sel) out.p.push(`pressed: ${pressed.map((b) => b.getAttribute('aria-label')).join(', ') || 'none'}, want ${sel}`)
          const b = pressed[0]
          if (!b) return out
          const cs = getComputedStyle(b), svg = b.querySelector('svg')
          out.sig = { bg: cs.backgroundColor, color: cs.color, stroke: svg ? getComputedStyle(svg).stroke : '' }
          if (out.sig.bg !== text) out.p.push(`background ${out.sig.bg}, want the text colour ${text}`)
          if (lum(out.sig.color) < 0.85) out.p.push(`text colour ${out.sig.color} is not light`)
          if (svg && out.sig.stroke !== out.sig.color) out.p.push(`icon stroke ${out.sig.stroke}, text ${out.sig.color}`)
          const borders = new Set(bs.filter((x) => x !== b).map((x) => getComputedStyle(x).borderTopColor))
          if (borders.size > 1) out.p.push(`unselected view buttons have ${borders.size} border colours`)
          return out
        }, a.selected)
        if (m.sig) styles[a.key] = m.sig
        return R(m.p.length === 0, m.p.length ? m.p.join('; ') : `${a.key}: ${m.sig.bg} with ${m.sig.color}`)
      }
      case 'viewStylesSame': {
        const sigs = a.keys.map((k) => styles[k])
        const ok = sigs.every((x) => x) && sigs.every((x) => JSON.stringify(x) === JSON.stringify(sigs[0]))
        return R(ok, ok ? `${a.keys.length} views alike` : a.keys.map((k) => `${k}: ${styles[k] ? `${styles[k].bg}/${styles[k].color}` : 'not read'}`).join('; '))
      }
      case 'liveButtons': {
        const m = await page.evaluate((names) => {
          const bar = document.querySelector('[role=group][aria-label="Editor controls"]')
          const nameOf = (e) => e.getAttribute('aria-label') || e.textContent.trim()
          const p = []
          for (const n of names) {
            const e = n === 'File' ? bar.querySelector('select') : [...bar.querySelectorAll('button')].find((b) => nameOf(b) === n)
            if (!e || !e.getClientRects().length) { p.push(`${n} not visible`); continue }
            if (e.disabled || e.hasAttribute('disabled')) p.push(`${n} disabled`)
            if (e.getAttribute('aria-disabled') && e.getAttribute('aria-disabled') !== 'false') p.push(`${n} aria-disabled`)
            for (let x = e; x && x.nodeType === 1 && !x.hasAttribute('data-editor'); x = x.parentElement) if (parseFloat(getComputedStyle(x).opacity) < 1) { p.push(`${n} opacity ${getComputedStyle(x).opacity}`); break }
          }
          return p
        }, a.names)
        return R(m.length === 0, m.length ? m.join('; ') : `${a.names.length} quick-bar controls live`)
      }
      case 'quickBarEnabled': {
        const bad = []
        for (const n of a.names) {
          const loc = n === 'File' ? page.getByLabel('File', { exact: true }) : page.getByRole('group', { name: 'Editor controls' }).getByRole('button', { name: n, exact: true })
          if (!(await loc.count()) || !(await loc.first().isEnabled())) bad.push(n)
        }
        return R(bad.length === 0, bad.length ? `not enabled: ${bad.join(', ')}` : `${a.names.length} quick-bar controls enabled`)
      }
      case 'shownTabEnabled': {
        const m = await page.evaluate(() => {
          const panel = [...document.querySelectorAll('[data-ribbon-panel]')].find((e) => e.getClientRects().length > 0)
          const nameOf = (e) => e.getAttribute('aria-label') || e.textContent.trim()
          const els = [...panel.querySelectorAll('button, input:not([type=hidden]), select')].filter((e) => e.getClientRects().length), link = document.querySelector('[data-ribbon] input[type=checkbox]')
          return { n: els.length, off: [...els, link].filter((e) => e && e.matches(':disabled') && !['Move up', 'Move down'].includes(nameOf(e))).map(nameOf) }
        })
        return R(m.n > 0 && m.off.length === 0, m.off.length ? `disabled: ${m.off.slice(0, 5).join(', ')}` : `${m.n} controls of the ${a.tab} tab enabled`)
      }
      case 'popover': {
        const m = await page.evaluate((o) => {
          const d = [...document.querySelectorAll('[role=dialog], [data-sides-popover]')].find((e) => e.getAttribute('aria-label') === o.name)
          const shown = !!d && d.getClientRects().length > 0
          const out = { shown, inputs: [], inside: false }
          if (d && shown) { const nm = (e) => e.getAttribute('aria-label') || ''; out.inputs = [...d.querySelectorAll('input')].map(nm); out.inside = d.contains(document.activeElement) }
          return out
        }, a)
        const p = []
        if (m.shown !== a.open) p.push(`popover ${a.name} ${m.shown ? 'shown' : 'not shown'}`)
        if (a.open && m.shown) { for (const n of a.inputs) if (!m.inputs.includes(n)) p.push(`no input ${n}`); if (a.focusInside && !m.inside) p.push('focus is not inside') }
        return R(p.length === 0, p.length ? p.join('; ') : a.open ? `popover open with ${a.inputs.length} steppers, focus inside` : 'popover closed')
      }
      case 'focusOn': {
        const n = await page.evaluate(() => { const e = document.activeElement; return e ? (e.getAttribute('aria-label') || e.textContent.trim()) : '' })
        return R(n === a.name, `focus is on "${n}", want "${a.name}"`)
      }
      case 'popoverFits': {
        const m = await page.evaluate((name) => { const d = [...document.querySelectorAll('[role=dialog], [data-sides-popover]')].find((e) => e.getAttribute('aria-label') === name); if (!d || !d.getClientRects().length) return null; const r = d.getBoundingClientRect(); return { l: r.left, r: r.right, w: r.width, iw: innerWidth } }, a.name)
        return R(!!m && m.l >= -0.5 && m.r <= m.iw + 0.5 && m.w <= m.iw, m ? `popover ${m.l.toFixed(0)}..${m.r.toFixed(0)} in a window ${m.iw} wide` : 'popover not shown')
      }
      case 'gridOverlay': {
        const n = await page.evaluate(() => { const o = document.querySelector('[data-grid-overlay]'); return o ? (o.getClientRects().length > 0 && getComputedStyle(o).visibility !== 'hidden' ? 'shown' : 'hidden') : 'absent' })
        return R((n === 'shown') === a.on, `grid overlay ${n}`)
      }
      case 'gridLines': {
        const m = await page.evaluate(() => {
          const o = document.querySelector('[data-grid-overlay]'); if (!o) return null
          const bs = parseFloat(getComputedStyle(o).backgroundSize.split(/[ ,]/)[0])
          const r = o.getBoundingClientRect(); const k = o.offsetWidth ? r.width / o.offsetWidth : 1
          const d = document.querySelector('[data-device-scale]'); let ds = 1
          if (d) { const mm = /matrix\(([^)]+)\)/.exec(getComputedStyle(d).transform); if (mm) ds = parseFloat(mm[1].split(',')[0]) }
          return { bs, screen: bs * k, ds }
        })
        if (!m) return R(false, 'no [data-grid-overlay]')
        const ok = Math.abs(m.bs - a.spacing) <= a.tol && Math.abs(m.screen - a.spacing * m.ds) <= a.tol
        return R(ok, `declared spacing ${m.bs} px (want ${a.spacing}), on screen ${m.screen.toFixed(2)} (want ${(a.spacing * m.ds).toFixed(2)} at scale ${m.ds.toFixed(3)})`)
      }
      case 'gridCovers': {
        const m = await page.evaluate(() => { const o = document.querySelector('[data-grid-overlay]'); const f = window.__gate.frame(); if (!o) return null; const x = o.getBoundingClientRect(), y = f.getBoundingClientRect(); return [x.left - y.left, x.top - y.top, x.width - y.width, x.height - y.height] })
        return R(!!m && m.every((v) => Math.abs(v) <= a.tol), m ? `overlay minus preview: ${m.map((v) => v.toFixed(1)).join(', ')}` : 'no overlay')
      }
      case 'gridAbove': {
        // READING (docs/ui-editor-gate-log.md #22): the locked text says "document.elementsFromPoint lists the overlay before the iframe", but an element with
        // pointer-events none (which the same assert requires) is never hit-tested, so that cannot hold. Read as: the overlay follows the iframe in document order and is positioned.
        const m = await page.evaluate(() => { const o = document.querySelector('[data-grid-overlay]'); const f = window.__gate.frame(); if (!o) return null; const cs = getComputedStyle(o); return { inDoc: !!f.contentDocument.querySelector('[data-grid-overlay]'), pe: cs.pointerEvents, pos: cs.position, z: cs.zIndex, after: !!(f.compareDocumentPosition(o) & Node.DOCUMENT_POSITION_FOLLOWING) } })
        const ok = !!m && !m.inDoc && m.pe === 'none' && m.after && ['absolute', 'fixed'].includes(m.pos) && !(parseInt(m.z, 10) < 0)
        return R(ok, m ? `in the preview document ${m.inDoc}, pointer-events ${m.pe}, position ${m.pos}, z-index ${m.z}, after the iframe ${m.after}` : 'no overlay')
      }
      case 'snapMove': case 'snapEdge': {
        const at = a.at ?? 'current'
        const b = before[`pos|${at}|${a.sel}`]
        const left = await measureNum(at, a.sel, 'left'), top = await measureNum(at, a.sel, 'top'), width = await measureNum(at, a.sel, 'width')
        let dx = a.dx, dy = a.dy
        if (a.screenDx !== undefined) { dx = Math.round(a.screenDx / scaleAtDrag); dy = Math.round(a.screenDy / scaleAtDrag) }
        const s = a.spacing
        const okAt = (got, raw) => { const r = ((raw % s) + s) % s; const near = Math.round(raw / s) * s; const tie = Math.abs(r - s / 2) < 0.05; return Math.abs(got - near) <= a.tol || (tie && Math.abs(got - (near - s)) <= a.tol) }
        if (a.k === 'snapEdge') {
          const raw = b.left + b.width + dx
          return R(okAt(left + width, raw), `right edge ${(left + width).toFixed(2)}, want the multiple of ${s} nearest ${raw.toFixed(2)} (${(Math.round(raw / s) * s)}) +-${a.tol}`)
        }
        const rx = b.left + dx, ry = b.top + dy
        const ok = okAt(left, rx) && okAt(top, ry)
        return R(ok, `left ${left.toFixed(2)} (nearest to ${rx.toFixed(2)}: ${Math.round(rx / s) * s}), top ${top.toFixed(2)} (nearest to ${ry.toFixed(2)}: ${Math.round(ry / s) * s}) +-${a.tol}`)
      }
      case 'snapDisabled': {
        const btn = page.getByRole('button', { name: 'Snap', exact: true })
        const dis = (await btn.count()) ? await btn.first().isDisabled() : false
        const note = page.locator('[data-snap-note]').first()
        const t = ((await note.innerText().catch(() => '')) ?? '').trim()
        const vis = await note.isVisible().catch(() => false)
        return R(dis && vis && t === a.text, `Snap ${dis ? 'disabled' : 'enabled'}, note ${vis ? 'shown' : 'not shown'}: "${t}"`)
      }
      case 'codeShowsEdit': case 'bugState': case 'walkChanges': case 'handPick': return fileAssert(a, R)
      case 'tabArrows': {
        await page.evaluate(() => { document.querySelectorAll('[data-ribbon] [role=tab]')[0].focus() })
        const st = () => page.evaluate(() => [...document.querySelectorAll('[data-ribbon] [role=tab]')].map((t) => ({ sel: t.getAttribute('aria-selected'), idx: t.getAttribute('tabindex'), focus: document.activeElement === t })))
        await page.keyboard.press('ArrowRight')
        const right = await st()
        await page.keyboard.press('ArrowLeft')
        const left = await st()
        const p = []
        if (!(right[1]?.sel === 'true' && right[1].focus && right[1].idx === '0' && right[0].sel !== 'true')) p.push(`after ArrowRight: ${JSON.stringify(right)}`)
        if (!(left[0]?.sel === 'true' && left[0].focus && left[1].sel !== 'true')) p.push(`after ArrowLeft: ${JSON.stringify(left)}`)
        return R(p.length === 0, p.length ? p.join('; ') : 'ArrowRight selects and focuses the second tab, ArrowLeft goes back')
      }
      case 'tabReach': {
        const problems = []
        for (const tab of a.tabs) {
          const hasTabs = (await page.locator('[role=tab]').count()) > 0
          if (hasTabs) { await page.getByRole('tab', { name: tab, exact: true }).click(); await settle(page) }
          await page.evaluate(() => { window.__vis = [] })
          if (!hasTabs) await page.evaluate(() => window.__gate.focusBeforeRibbon())
          for (let i = 0; i < a.max; i++) {
            await page.keyboard.press('Tab')
            const inside = await page.evaluate(() => { const e = document.activeElement; const ok = !!e && !!e.closest('[data-ribbon]'); if (ok && e.getAttribute('role') !== 'tab') { const cs = getComputedStyle(e); window.__vis.push({ el: e, on: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor} ${cs.boxShadow}` }) } return ok })
            if (!inside) break
          }
          const m = await page.evaluate(() => {
            const sig = (e) => { const cs = getComputedStyle(e); return `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor} ${cs.boxShadow}` }
            const nameOf = (e) => e.getAttribute('aria-label') || e.textContent.trim() || e.id
            document.activeElement?.blur()
            const panel = [...document.querySelectorAll('[data-ribbon-panel]')].find((e) => e.getClientRects().length > 0)
            const want = [...panel.querySelectorAll('button, input:not([type=hidden]), select')].filter((e) => e.getClientRects().length && !e.matches(':disabled')); const link = document.querySelector('[data-ribbon] input[type=checkbox]'); if (link && !link.disabled) want.push(link)
            const seen = window.__vis.map((v) => v.el)
            return { missing: want.filter((e) => !seen.includes(e)).map(nameOf), flat: window.__vis.filter((v) => v.on === sig(v.el)).map((v) => nameOf(v.el)), n: want.length, seen: seen.length }
          })
          if (m.missing.length) problems.push(`${tab}: Tab did not reach ${m.missing.slice(0, 4).join(', ')} (${m.missing.length} of ${m.n})`)
          if (m.flat.length) problems.push(`${tab}: no focus indicator on ${m.flat.slice(0, 4).join(', ')}`)
          if (m.n === 0) problems.push(`${tab}: no enabled controls`)
        }
        return R(problems.length === 0, problems.length ? problems.join('; ') : `Tab reached every enabled control of both tabs, each with a focus indicator`)
      }
      case 'iconNames': {
        const bad = await page.evaluate(() => {
          const out = []
          for (const b of document.querySelectorAll('[role=group][aria-label="Editor controls"] button, [data-ribbon] button')) {
            if (!b.getClientRects().length) continue
            const t = (b.innerText ?? '').trim()
            if (t === '' || /^[^\p{L}\p{N}]$/u.test(t)) { if (!(b.getAttribute('aria-label') ?? '').trim() || !(b.getAttribute('title') ?? '').trim()) out.push(b.getAttribute('aria-label') || b.getAttribute('title') || '(unnamed)') }
          }
          return out
        })
        return R(bad.length === 0, bad.length ? `no name or tooltip: ${bad.slice(0, 5).join(', ')}` : 'every icon-only button has a name and a tooltip')
      }
      case 'ribbonWraps': {
        const n = await page.evaluate(() => new Set([...document.querySelectorAll('[data-ribbon-group]')].filter((g) => g.getClientRects().length).map((g) => Math.round(g.getBoundingClientRect().top / 6))).size)
        return R(n >= a.minRows, `${n} rows of groups, want at least ${a.minRows}`)
      }
      case 'noClipped': {
        const bad = await page.evaluate((tol) => {
          const out = []
          const panel = [...document.querySelectorAll('[data-ribbon-panel]')].find((e) => e.getClientRects().length > 0)
          const els = [...(panel ? panel.querySelectorAll('button, input:not([type=hidden]), select') : []), ...document.querySelectorAll('[data-ribbon] [role=tab]'), ...document.querySelectorAll('[role=group][aria-label="Editor controls"] button, [role=group][aria-label="Editor controls"] select')].filter((e) => e.getClientRects().length)
          for (const e of els) {
            const r = e.getBoundingClientRect(); const n = e.getAttribute('aria-label') || e.textContent.trim()
            if (r.left < -tol || r.right > innerWidth + tol) { out.push(`${n} ${r.left.toFixed(0)}..${r.right.toFixed(0)} outside the window`); continue }
            for (let x = e.parentElement; x && !x.hasAttribute('data-editor'); x = x.parentElement) { const cs = getComputedStyle(x); if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') { const b = x.getBoundingClientRect(); if (r.left < b.left - tol || r.right > b.right + tol || r.top < b.top - tol || r.bottom > b.bottom + tol) { out.push(`${n} is clipped by ${x.tagName}.${x.className}`); break } } }
          }
          return out
        }, a.tol)
        return R(bad.length === 0, bad.length ? bad.slice(0, 4).join('; ') : 'no control is outside the window or clipped')
      }
      // ---- round 4 (docs/ui-editor-gate-rules-round4.md; docs/ui-editor-gate-log.md #26) ----
      case 'noTabs': {
        const found = await page.evaluate(() => [...document.querySelectorAll('[role=tablist], [role=tab], [role=tabpanel]')].map((e) => `${e.getAttribute('role')} "${(e.getAttribute('aria-label') || e.textContent.trim()).slice(0, 24)}"`))
        return R(found.length === 0, found.length ? `found ${found.slice(0, 4).join(', ')}` : 'no tablist, tab or tabpanel anywhere')
      }
      case 'ribbonGroups': {
        const m = await page.evaluate(([groups, exempt, visibleAll]) => {
          const p = []
          const rib = document.querySelector('[data-ribbon]')
          if (!rib) return ['no [data-ribbon]']
          const nameOf = (e) => e.getAttribute('aria-label') || (e.labels && e.labels[0] ? e.labels[0].textContent.trim() : '') || e.textContent.trim()
          const panels = [...rib.querySelectorAll('[data-ribbon-panel]')]
          if (panels.length !== 1) p.push(`${panels.length} [data-ribbon-panel] elements inside [data-ribbon], want 1`)
          if (!panels[0]) return p
          const gs = [...panels[0].querySelectorAll('[data-ribbon-group]')]
          const want = Object.keys(groups)
          if (gs.map((g) => g.getAttribute('aria-label')).join('|') !== want.join('|')) p.push(`groups ${gs.map((g) => g.getAttribute('aria-label')).join(', ')}, want ${want.join(', ')}`)
          for (const g of gs) {
            const gname = g.getAttribute('aria-label')
            if (g.getAttribute('role') !== 'group') p.push(`group ${gname} has role ${g.getAttribute('role')}`)
            if (visibleAll) { const r = g.getBoundingClientRect(); if (!g.getClientRects().length || r.width <= 0 || r.left < -0.5 || r.right > innerWidth + 0.5) p.push(`group ${gname} is not visible in the window`) }
            const have = [...g.querySelectorAll('button, input:not([type=hidden]), select')].map(nameOf)
            for (const n of groups[gname] ?? []) if (!have.includes(n)) p.push(`${gname}: no control "${n}"`)
          }
          const all = []
          for (const c of rib.querySelectorAll('button, input:not([type=hidden]), select')) {
            const n = nameOf(c)
            all.push(n)
            if (!c.closest('[data-ribbon-group]')) {
              if (!exempt.includes(n)) p.push(`outside a group: ${n}`)
              else if (!c.closest('[data-ribbon-strip]')) p.push(`${n} is not in [data-ribbon-strip]`)
            }
          }
          const dup = all.filter((n, i) => all.indexOf(n) !== i)
          if (dup.length) p.push(`twice: ${[...new Set(dup)].join(', ')}`)
          return p
        }, [a.groups, a.exempt, !!a.visibleAll])
        return R(m.length === 0, m.length ? m.slice(0, 5).join('; ') : `${Object.keys(a.groups).length} groups in one panel, every control once`)
      }
      case 'ribbonSpread': {
        const m = await page.evaluate((o) => {
          const p = []
          const panel = document.querySelector('[data-ribbon-panel]')
          if (!panel) return { p: ['no [data-ribbon-panel]'] }
          const cs = getComputedStyle(panel), pr = panel.getBoundingClientRect()
          const inL = pr.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft), inR = pr.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight)
          const gs = [...panel.querySelectorAll('[data-ribbon-group]')].filter((g) => g.getClientRects().length)
          const bands = new Map()
          for (const g of gs) { const k = Math.round(g.getBoundingClientRect().top / 6); bands.set(k, [...(bands.get(k) ?? []), g]) }
          const rows = [...bands.entries()].sort((x, y) => x[0] - y[0]).map((e) => e[1].sort((x, y) => x.getBoundingClientRect().left - y.getBoundingClientRect().left))
          if (rows.length > o.maxBands) p.push(`${rows.length} bands, want at most ${o.maxBands}`)
          const ctls = (g) => [...g.querySelectorAll('button, input:not([type=hidden]), select')].filter((c) => c.getClientRects().length && !c.closest('[data-sides-popover]')).map((c) => c.getBoundingClientRect())
          const spread = (a) => (a.length ? Math.max(...a) - Math.min(...a) : 0)
          const sep = (g) => { const c = getComputedStyle(g); return ['Left', 'Right'].some((s) => parseFloat(c['border' + s + 'Width']) >= 1 && c['border' + s + 'Style'] !== 'none' && !/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(c['border' + s + 'Color'])) }
          rows.forEach((row, bi) => {
            const first = row[0].getBoundingClientRect(), last = row[row.length - 1].getBoundingClientRect()
            if (Math.abs(first.left - inL) > o.edgeTol) p.push(`band ${bi + 1}: first group starts ${(first.left - inL).toFixed(1)} px from the inner left edge`)
            if (Math.abs(inR - last.right) > o.edgeTol) p.push(`band ${bi + 1}: last group ends ${(inR - last.right).toFixed(1)} px short of the inner right edge`)
            const gaps = [], cgaps = []
            for (let i = 1; i < row.length; i++) {
              const x = row[i - 1].getBoundingClientRect(), y = row[i].getBoundingClientRect()
              gaps.push(y.left - x.right)
              cgaps.push(Math.min(...ctls(row[i]).map((r) => r.left)) - Math.max(...ctls(row[i - 1]).map((r) => r.right)))
            }
            if (spread(gaps) > o.gapTol) p.push(`band ${bi + 1}: gaps between groups ${gaps.map((v) => v.toFixed(1)).join(', ')} differ by more than ${o.gapTol}`)
            if (spread(cgaps) > o.controlGapTol) p.push(`band ${bi + 1}: gaps between controls ${cgaps.map((v) => v.toFixed(1)).join(', ')} differ by more than ${o.controlGapTol}`)
            for (const g of row.slice(0, -1)) if (!sep(g)) p.push(`band ${bi + 1}: ${g.getAttribute('aria-label')} has no thin separator`)
            for (const g of row) {
              const gr = g.getBoundingClientRect()
              for (const r of ctls(g)) {
                if (r.left < gr.left - 0.5 || r.right > gr.right + 0.5) { p.push(`${g.getAttribute('aria-label')} is split or clipped (a control sticks out of its group by ${Math.max(gr.left - r.left, r.right - gr.right).toFixed(1)} px)`); break }
                if (r.left < pr.left - 0.5 || r.right > pr.right + 0.5) { p.push(`${g.getAttribute('aria-label')} is clipped by the ribbon`); break }
              }
            }
          })
          if (panel.scrollWidth > panel.clientWidth + 1) p.push(`the ribbon scrolls sideways (${panel.scrollWidth} > ${panel.clientWidth})`)
          if (document.documentElement.scrollWidth > innerWidth + 1) p.push(`the page scrolls sideways (${document.documentElement.scrollWidth} > ${innerWidth})`)
          return { p, rows: rows.map((r) => r.length) }
        }, a)
        return R(m.p.length === 0, m.p.length ? m.p.slice(0, 4).join('; ') : `${m.rows.length} band(s) of ${m.rows.join(' + ')} groups, spread to both edges, evenly, separators kept`)
      }
      case 'ribbonLabels': {
        const m = await page.evaluate((o) => {
          const p = []
          const probe = document.createElement('span'); probe.style.color = `var(${o.colour})`; document.body.appendChild(probe)
          const want = getComputedStyle(probe).color; probe.remove()
          const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden'
          const nameOf = (e) => e.getAttribute('aria-label') || (e.labels && e.labels[0] ? e.labels[0].textContent.trim() : '') || e.textContent.trim()
          const labels = [...document.querySelectorAll('[data-ribbon] [data-ctl-label]')].filter(vis)
          const forb = new Set(o.forbidden.map((x) => x.toLowerCase()))
          for (const l of labels) {
            const t = l.textContent.trim(), cs = getComputedStyle(l), fs = parseFloat(cs.fontSize)
            if (!t) { p.push('an empty label'); continue }
            if (fs < o.minFont - 0.01 || fs > o.maxFont + 0.01) p.push(`label "${t}" is ${fs}px, want ${o.minFont}-${o.maxFont}`)
            const words = t.split(/\s+/).length
            if (words > o.maxWords) p.push(`label "${t}" has ${words} words`)
            if (t.length === 1 || forb.has(t.toLowerCase())) p.push(`label "${t}" is a single character or an abbreviation`)
            if (o.sentenceCase && (!/^\p{Lu}/u.test(t) || (t.length > 1 && t === t.toUpperCase()))) p.push(`label "${t}" is not sentence case`)
            if (cs.color !== want) p.push(`label "${t}" is ${cs.color}, want ${want}`)
          }
          const controls = [...document.querySelectorAll('[data-ribbon-panel], [data-ribbon-strip]')].flatMap((s) => [...s.querySelectorAll('button, input:not([type=hidden]), select')]).filter((c) => vis(c) && !c.closest('[data-sides-popover]'))
          const table = Object.fromEntries(Object.entries(o.table).map(([k, v]) => [k.toLowerCase(), v]))
          const labelOfControl = new Map()
          for (const c of controls) {
            const n = nameOf(c)
            if (o.exempt.includes(n)) continue
            const own = c.tagName === 'BUTTON' ? (c.innerText ?? '').trim() : ''
            const cr = c.getBoundingClientRect()
            let best = null
            for (const l of labels) {
              const r = l.getBoundingClientRect()
              const above = r.bottom <= cr.top + 0.5, below = r.top >= cr.bottom - 0.5
              if (!above && !below) continue
              const dy = above ? cr.top - r.bottom : r.top - cr.bottom
              const ox = Math.min(r.right, cr.right) - Math.max(r.left, cr.left)
              if (dy <= o.reach && ox > 0 && (!best || dy < best.dy)) best = { l, dy }
            }
            const ownOk = (own.match(/\p{L}/gu) ?? []).length >= 3
            if (!ownOk && !best) { p.push(`${n}: no visible label within ${o.reach} px`); continue }
            const text = ownOk ? own : best.l.textContent.trim()
            labelOfControl.set(n, best ? best.l.textContent.trim() : own)
            const base = n.replace(/^(Decrease|Increase|Pick) /, '')
            const entry = table[base.toLowerCase()] ?? table[n.toLowerCase()]
            const ok = text.toLowerCase().includes(n.toLowerCase()) || text.toLowerCase().includes(base.toLowerCase()) || (entry !== undefined && entry.toLowerCase() === text.toLowerCase())
            if (!ok) p.push(`${n}: label "${text}" neither contains the name nor matches the table (${entry ?? 'no entry'})`)
          }
          for (const [n, cap] of Object.entries(o.captions ?? {})) {
            const c = controls.find((x) => nameOf(x) === n)
            if (!c) { p.push(`no control ${n}`); continue }
            if (labelOfControl.get(n) !== cap) p.push(`${n}: caption "${labelOfControl.get(n)}", want "${cap}"`)
          }
          for (const w of o.words ?? []) {
            const c = controls.find((x) => nameOf(x) === w.name)
            if (!c) { p.push(`no control ${w.name}`); continue }
            if ((c.innerText ?? '').trim() !== w.text) p.push(`${w.name}: shows "${(c.innerText ?? '').trim()}", want "${w.text}"`)
          }
          return { p, n: controls.length, labels: labels.length }
        }, a)
        return R(m.p.length === 0, m.p.length ? m.p.slice(0, 5).join('; ') : `${m.n} controls, ${m.labels} labels, all visible, 11-12 px, in the table`)
      }
      case 'tooltips': {
        const bad = await page.evaluate((o) => {
          const out = []
          const nameOf = (e) => e.getAttribute('aria-label') || (e.labels && e.labels[0] ? e.labels[0].textContent.trim() : '') || e.textContent.trim()
          for (const c of document.querySelectorAll('[data-ribbon] button, [data-ribbon] input:not([type=hidden]), [data-ribbon] select')) {
            if (!c.getClientRects().length || c.closest('[data-sides-popover]')) continue
            const n = nameOf(c), t = (c.getAttribute('title') ?? '').trim()
            const first = t.split(/\s+/)[0].replace(/[^\p{L}]/gu, '')
            if (!t) out.push(`${n}: no tooltip`)
            else if (t.split(/\s+/).length < o.minWords) out.push(`${n}: tooltip "${t}" is under ${o.minWords} words`)
            else if (!o.verbs.includes(first)) out.push(`${n}: tooltip "${t}" does not start with a verb of the list`)
            else if (t === n) out.push(`${n}: tooltip repeats the name`)
          }
          return out
        }, a)
        return R(bad.length === 0, bad.length ? `${bad.length}: ${bad.slice(0, 4).join('; ')}` : 'every control has a verb-first tooltip')
      }
      case 'fieldsFit': {
        const m = await page.evaluate(() => {
          const out = []
          const nameOf = (e) => e.getAttribute('aria-label') || e.id
          const panel = document.querySelector('[data-ribbon-panel]')
          const label = document.querySelector('[data-selected-label]')?.textContent.trim() ?? ''
          const ctx = document.createElement('canvas').getContext('2d')
          for (const e of panel.querySelectorAll('input:not([type=hidden]):not([type=color]):not([type=checkbox]), select')) {
            if (!e.getClientRects().length) continue
            const cs = getComputedStyle(e)
            if (e.tagName === 'INPUT') { if (e.scrollWidth > e.clientWidth) out.push(`${nameOf(e)} shows "${e.value}" in ${e.clientWidth} px (needs ${e.scrollWidth})`) }
            else {
              const t = e.options[e.selectedIndex]?.text ?? ''
              ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
              const need = ctx.measureText(t).width + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth) + 22
              if (need > e.clientWidth + 0.5) out.push(`${nameOf(e)} shows "${t}" in ${e.clientWidth} px (needs ${need.toFixed(1)})`)
            }
          }
          return { out, label }
        })
        fitLabels.add(m.label)
        const p = [...m.out]
        if (a.minDistinct && fitLabels.size < a.minDistinct) p.push(`${fitLabels.size} distinct elements checked, want ${a.minDistinct}`)
        return R(p.length === 0, p.length ? p.slice(0, 4).join('; ') : `${m.label}: no clipped value (${fitLabels.size} elements so far)`)
      }
      case 'fontShows': {
        const m = await page.evaluate(() => {
          const s = [...document.querySelectorAll('[data-ribbon] select')].find((e) => e.getAttribute('aria-label') === 'Font family')
          if (!s) return null
          return { shown: s.options[s.selectedIndex]?.text ?? '', title: s.getAttribute('title') ?? '', options: [...s.options].map((o) => o.text) }
        })
        if (!m) return R(false, 'no Font family select')
        const p = []
        if (m.shown !== a.expect) p.push(`shows "${m.shown}", want "${a.expect}"`)
        if (!m.title.includes(a.stackContains)) p.push(`tooltip "${m.title}" does not hold the stack (${a.stackContains})`)
        if (m.options.join('|') !== a.options.join('|')) p.push(`options ${m.options.join(', ')}`)
        if (m.options.some((o) => o.includes(','))) p.push('an option shows a whole stack')
        return R(p.length === 0, p.length ? p.join('; ') : `shows "${m.shown}", options by name, stack in the tooltip`)
      }
      case 'fillShows': {
        const m = await page.evaluate(() => { const e = [...document.querySelectorAll('[data-ribbon] input')].find((x) => x.getAttribute('aria-label') === 'Background'); return e ? { v: e.value, fit: e.scrollWidth <= e.clientWidth, sw: e.scrollWidth, cw: e.clientWidth } : null })
        if (!m) return R(false, 'no Background field')
        return R(m.v.toLowerCase() === a.expect.toLowerCase() && m.fit, `shows "${m.v}" (${m.fit ? 'whole' : `clipped: needs ${m.sw}, has ${m.cw}`})`)
      }
      case 'statusLine': {
        const m = await page.evaluate(() => {
          const s = [...document.querySelectorAll('[role=status]')].find((e) => e.getAttribute('aria-label') === 'Edit result')
          if (!s) return null
          const r = s.getBoundingClientRect(), rib = document.querySelector('[data-ribbon]').getBoundingClientRect(), st = document.querySelector('[data-stage-area]')?.getBoundingClientRect()
          const cs = getComputedStyle(s)
          const lh = parseFloat(cs.lineHeight) || 1.2 * parseFloat(cs.fontSize)
          const tops = new Set()
          const w = document.createTreeWalker(s, NodeFilter.SHOW_TEXT)
          for (let n = w.nextNode(); n; n = w.nextNode()) { if (!n.textContent.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(n); for (const q of rg.getClientRects()) if (q.width > 0) tops.add(Math.round(q.top / 3)) }
          const tall = [...s.querySelectorAll('*')].filter((c) => c.getBoundingClientRect().height > 1.6 * lh).length
          return { h: r.height, top: r.top, bottom: r.bottom, ribBottom: rib.bottom, stageTop: st ? st.top : null, lines: tops.size, tall, text: s.textContent.trim() }
        })
        if (!m) return R(false, 'no status region "Edit result"')
        const p = []
        if (m.h > a.maxHeight + 0.5) p.push(`${m.h.toFixed(1)} px high, want at most ${a.maxHeight}`)
        if (m.lines > 1 || m.tall > 0) p.push(`not one line (${m.lines} lines, ${m.tall} tall children)`)
        if (m.top < m.ribBottom - 0.5 || m.top - m.ribBottom > a.gapMax) p.push(`starts ${(m.top - m.ribBottom).toFixed(1)} px below the ribbon, want 0 to ${a.gapMax}`)
        if (m.stageTop === null) p.push('no [data-stage-area]')
        if (m.stageTop !== null && m.stageTop < m.bottom - 0.5) p.push(`the stage starts at ${m.stageTop.toFixed(1)}, above the status line's bottom ${m.bottom.toFixed(1)}`)
        if (a.messageShown && !m.text) p.push('no message is shown')
        if (a.key) statusHeights[a.key] = m.h
        if (a.sameHeightAs) { const was = statusHeights[a.sameHeightAs]; if (was === undefined || Math.abs(was - m.h) > 1) p.push(`height ${m.h.toFixed(1)}, ${a.sameHeightAs} was ${was === undefined ? 'not stored' : was.toFixed(1)} (not reserved)`) }
        return R(p.length === 0, p.length ? p.join('; ') : `${m.h.toFixed(1)} px, one line, ${(m.top - m.ribBottom).toFixed(1)} px under the ribbon, above the stage${m.text ? `: "${m.text.slice(0, 60)}"` : ''}`)
      }
      case 'tabOrder': {
        const exp = await page.evaluate(() => {
          const rib = document.querySelector('[data-ribbon]')
          const nameOf = (e) => e.getAttribute('aria-label') || (e.labels && e.labels[0] ? e.labels[0].textContent.trim() : '') || e.textContent.trim()
          const all = [...rib.querySelectorAll('button, input:not([type=hidden]), select')].filter((e) => e.getClientRects().length && !e.matches(':disabled') && !e.closest('[data-sides-popover]'))
          const groups = [...rib.querySelectorAll('[data-ribbon-group]')].filter((g) => g.getClientRects().length)
          const bandTops = [...new Set(groups.map((g) => Math.round(g.getBoundingClientRect().top / 6)))].sort((x, y) => x - y)
          const key = new Map()
          for (const g of groups) {
            const gr = g.getBoundingClientRect(), band = bandTops.indexOf(Math.round(gr.top / 6))
            const inG = all.filter((c) => g.contains(c))
            const tops = [...new Set(inG.map((c) => Math.round(c.getBoundingClientRect().top)))].sort((x, y) => x - y)
            const rows = []
            for (const t of tops) if (!rows.length || t - rows[rows.length - 1] > 12) rows.push(t)
            for (const c of inG) { const t = c.getBoundingClientRect().top; let ri = 0; rows.forEach((r, i) => { if (t - r >= -1) ri = i }); key.set(c, [band, gr.left, ri, c.getBoundingClientRect().left]) }
          }
          for (const c of all) if (!key.has(c)) key.set(c, [-1, 0, 0, c.getBoundingClientRect().left])
          return [...all].sort((x, y) => { const p = key.get(x), q = key.get(y); for (let i = 0; i < 4; i++) if (p[i] !== q[i]) return p[i] - q[i]; return 0 }).map(nameOf)
        })
        await page.evaluate(() => { window.__vis = []; return window.__gate.focusBeforeRibbon() })
        for (let i = 0; i < a.max; i++) {
          await page.keyboard.press('Tab')
          const inside = await page.evaluate(() => {
            const e = document.activeElement
            const ok = !!e && !!e.closest('[data-ribbon]')
            if (ok) { const cs = getComputedStyle(e); window.__vis.push({ el: e, on: { os: cs.outlineStyle, ow: parseFloat(cs.outlineWidth), oc: cs.outlineColor, bs: cs.boxShadow } }) }
            return ok
          })
          if (!inside) break
        }
        const m = await page.evaluate(() => {
          const nameOf = (e) => e.getAttribute('aria-label') || (e.labels && e.labels[0] ? e.labels[0].textContent.trim() : '') || e.textContent.trim()
          const vis = window.__vis.map((v) => ({ n: nameOf(v.el), el: v.el, on: v.on }))
          document.activeElement?.blur()
          const flat = [], weak = []
          for (const v of vis) {
            if (!v.el.isConnected) continue
            const cs = getComputedStyle(v.el)
            const off = { os: cs.outlineStyle, ow: parseFloat(cs.outlineWidth), oc: cs.outlineColor, bs: cs.boxShadow }
            if (JSON.stringify(off) === JSON.stringify(v.on)) flat.push(v.n)
            const outline = v.on.os !== 'none' && v.on.ow >= 1, shadow = v.on.bs !== 'none'
            if (!outline && !shadow) weak.push(v.n)
          }
          return { seq: vis.map((v) => v.n), flat, weak }
        })
        const p = []
        if (m.seq.join('|') !== exp.join('|')) {
          let i = 0
          while (i < exp.length && m.seq[i] === exp[i]) i++
          p.push(`Tab order differs at step ${i + 1}: visited "${m.seq[i] ?? '(left the ribbon)'}", visual order has "${exp[i] ?? '(end)'}" (${m.seq.length} visited, ${exp.length} expected)`)
        }
        if (m.flat.length) p.push(`the focus indicator does not differ from the unfocused control on ${m.flat.slice(0, 4).join(', ')}`)
        if (m.weak.length) p.push(`no outline of 1 px or box-shadow on ${m.weak.slice(0, 4).join(', ')}`)
        return R(p.length === 0, p.length ? p.join('; ') : `Tab visited all ${exp.length} enabled controls in visual order, each with a focus indicator`)
      }
      case 'enabledOnly': {
        const m = await page.evaluate((names) => {
          const nameOf = (e) => e.getAttribute('aria-label') || (e.labels && e.labels[0] ? e.labels[0].textContent.trim() : '') || e.textContent.trim()
          const els = [...document.querySelectorAll('[data-ribbon] button, [data-ribbon] input:not([type=hidden]), [data-ribbon] select')].filter((e) => e.getClientRects().length && !e.closest('[data-sides-popover]'))
          const bad = []
          for (const n of names) { const e = els.find((x) => nameOf(x) === n); if (!e) bad.push(`no control ${n}`); else if (e.matches(':disabled')) bad.push(`${n} is disabled`) }
          const stray = els.filter((e) => !names.includes(nameOf(e)) && !e.matches(':disabled')).map(nameOf)
          if (stray.length) bad.push(`enabled but should not be: ${stray.slice(0, 5).join(', ')}${stray.length > 5 ? ` (${stray.length})` : ''}`)
          return { bad, n: els.length }
        }, a.names)
        return R(m.bad.length === 0, m.bad.length ? m.bad.join('; ') : `${a.names.join(', ')} enabled, the other ${m.n - a.names.length} controls disabled`)
      }
      case 'quickBarWords': {
        const m = await page.evaluate((o) => {
          const bar = document.querySelector('[role=group][aria-label="Editor controls"]')
          const nameOf = (e) => e.getAttribute('aria-label') || e.textContent.trim()
          const find = (n) => [...bar.querySelectorAll('button')].find((b) => (n === 'Review unlinked' ? /^Review unlinked/.test(nameOf(b)) : nameOf(b) === n) && b.getClientRects().length > 0)
          const p = []
          for (const w of o.words) { const b = find(w.name); if (!b) p.push(`${w.name} is not visible`); else if (!(b.innerText ?? '').trim().includes(w.text)) p.push(`${w.name} shows "${(b.innerText ?? '').trim()}", want the words "${w.text}"`) }
          for (const n of o.iconOnly) { const b = find(n); if (!b) p.push(`${n} is not visible`); else { if ((b.innerText ?? '').trim() !== '') p.push(`${n} shows text "${(b.innerText ?? '').trim()}", want an icon only`); if (!(b.getAttribute('aria-label') ?? '').trim() || !(b.getAttribute('title') ?? '').trim()) p.push(`${n} has no name or tooltip`) } }
          return p
        }, a)
        return R(m.length === 0, m.length ? m.join('; ') : 'the words show where wanted, Undo and Redo are icon-only with a name and a tooltip')
      }
      case 'limitsHas': {
        const has = await page.evaluate((sentence) => {
          const norm = (t) => t.replace(/\s+/g, ' ').trim()
          const h = [...document.querySelectorAll('h2, h3')].find((x) => norm(x.textContent) === 'Limits')
          if (!h) return null
          const sec = h.closest('section') ?? h.parentElement
          return [...sec.querySelectorAll('li')].some((li) => norm(li.textContent).includes(sentence))
        }, a.sentence)
        if (has === null) return R(false, 'no Limits heading')
        if (flag('--u13-na')) return R(!has, has ? 'the sentence is present although it was not verified' : 'not verified, so the sentence is absent (U13 NOT APPLICABLE)')
        return R(has, has ? 'the Limits list has the sentence' : 'the Limits list lacks the sentence')
      }
      default: return R(false, 'unknown assertion ' + a.k)
    }
  }

  try {
    const retired3 = retiredFor(spec.id)
    res.retiredChecks = []
    for (const [stepIndex, step] of spec.steps.entries()) {
      if (retired3?.steps?.includes(stepIndex) || (retired3?.asserts && step.do === 'assert' && retired3.asserts.includes(step.k))) {
        if (!res.retiredChecks.includes(retired3.replacedBy)) res.retiredChecks.push(retired3.replacedBy)
        res.retiredCount = (res.retiredCount ?? 0) + 1
        continue
      }
      if (!(step.do === 'assert' || step.do === 'tick' || step.do === 'openCode' || (step.do === 'button' && /change$/.test(step.name)))) exportMemo.clear()
      if (['load', 'visit', 'openCard', 'clickCard', 'click', 'clickBlank', 'drag', 'release', 'type', 'stepper', 'choose', 'fill', 'unit', 'uncheck', 'ownAction'].includes(step.do) || (step.do === 'button' && !/change$/.test(step.name))) lastEditMessage = null
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
        if (step.alt) await page.keyboard.down('Alt')
        await page.mouse.down()
        const n = Math.max(2, Math.ceil(Math.max(Math.abs(dxv), Math.abs(dyv)) / 4))
        for (let i = 1; i <= n; i++) await page.mouse.move(p.x + (dxv * i) / n, p.y + (dyv * i) / n)
        if (!step.hold) await page.mouse.up()
        if (step.alt) await page.keyboard.up('Alt')
      } else if (step.do === 'tab') {
        // ROUND 4 (log #25): with no tab bar there is nothing to click (every control is in the one ribbon); with tabs (the earlier stubs) it clicks as before.
        if (!(await page.locator('[role=tab]').count())) continue
        await page.getByRole('tab', { name: step.name, exact: true }).click()
      } else if (step.do === 'remember') {
        memo[step.name] = await readNumber(step.what)
        continue
      } else if (step.do === 'key') {
        await page.keyboard.press(step.key)
      } else if (step.do === 'reload') {
        await page.reload()
        await page.evaluate(PAGE_HELPERS)
        await page.locator('[data-editor]').first().waitFor()
        continue
      } else if (step.do === 'type') {
        const f = fieldOf(step.field)
        await reveal(f)
        await f.click({ clickCount: 3 })
        await page.keyboard.type(step.text)
        await page.keyboard.press('Enter')
      } else if (step.do === 'uncheck') {
        await reveal(fieldOf(step.label))
        await fieldOf(step.label).uncheck()
      } else if (step.do === 'button') {
        await reveal(page.getByRole('button', { name: step.name, exact: true, includeHidden: true }))
        await page.getByRole('button', { name: step.name, exact: true }).click()
      } else if (step.do === 'selectFile') {
        await page.getByLabel('File', { exact: true }).selectOption({ value: step.name })
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
        await reveal(page.locator('[data-ribbon]').getByRole('button', { name: `${step.dir === '+' ? 'Increase' : 'Decrease'} ${step.field}`, exact: true, includeHidden: true }))
        for (let i = 0; i < step.times; i++) { await b.click(step.shift ? { modifiers: ['Shift'] } : {}); await settle(page) }
        continue
      } else if (step.do === 'choose') {
        await reveal(fieldOf(step.label))
        await fieldOf(step.label).selectOption({ label: step.option })
      } else if (step.do === 'openCode') {
        const d = page.locator('[data-editor] details').first()
        if (!(await d.evaluate((e) => e.open))) await d.locator('summary').click()
      } else if (step.do === 'unit') {
        await reveal(page.getByRole('group', { name: 'Width unit', includeHidden: true }).getByRole('button', { name: step.unit, exact: true, includeHidden: true }))
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
  // READING (docs/ui-editor-gate-log.md #24): T11 lists P5 but has no P5 assert (my slip in the locked file). A listed check that no assert of the spec belongs to has nothing that
  // can fail: it is reported as vacuous, not scored. Only round 3 specs; the earlier files keep the strict reading.
  res.vacuous = []
  // R07 too: its only P5 assert (step 12) is one of the retired checks, so what is left lists P5 without an assert.
  if (spec.checks && (/^[TU]\d+$/.test(spec.id) || retiredFor(spec.id))) {
    const ret = retiredFor(spec.id)
    const live = spec.steps.filter((x, i) => !(ret?.steps?.includes(i) || (ret?.asserts && x.do === 'assert' && ret.asserts.includes(x.k))))
    res.vacuous = ['P1', 'P5', 'P6'].filter((k) => spec.checks.includes(k) && !live.some((x) => x.do === 'assert' && x.p === k))
    res.checks = spec.checks.filter((k) => !res.vacuous.includes(k))
  }
  res.outcome = spec.checks ? outcomeOfRound1(res) : outcomeOf(res)
  // U13 (rules section 4): with --u13-na the sentence was not verified; absent it reads NOT APPLICABLE, never PASS.
  if (spec.id === 'U13' && flag('--u13-na') && res.outcome === 'PASS') res.outcome = 'NOT APPLICABLE'
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
  const list = [...specsFile.specs, ...round1File.specs.filter((s) => !retired.includes(s.id)), ...round2File.specs, ...round3File.specs, ...round4File.specs].filter((s) => !only || only.includes(s.id))
  for (const id of retired) if (!only || only.includes(id)) console.log(`${id}  RETIRED  ${round2File.retired[id]}`)
  const results = []
  for (const spec of list) {
    // ROUND 4 (log #25): a spec retired as a whole (T01) is reported RETIRED and not run; never counted as passed.
    const whole = retiredFor(spec.id)?.wholeSpec
    if (whole) {
      results.push({ id: spec.id, name: spec.name, outcome: 'RETIRED', checks: spec.checks ?? null, P1: [], P5: [], P6: [], setup: [], notes: [], retiredWhole: true })
      console.log(`${spec.id}  RETIRED  (the whole spec, replaced by ${retiredFor(spec.id).replacedBy}): ${retiredFor(spec.id).reason}`)
      continue
    }
    const r = await runSpec(spec)
    results.push(r)
    const fails = [...r.setup, ...r.P1, ...r.P5, ...r.P6].filter((c) => !c.ok)
    const mark = (ok) => (ok === null ? '-' : ok ? 'ok' : 'XX')
    const pOf = (arr) => (arr.length ? (arr.every((c) => c.ok) ? 'ok' : 'XX') : '-')
    console.log(`${r.id}  ${r.outcome.padEnd(7)} P1 ${pOf(r.P1)} P2 ${mark(r.P2?.ok ?? null)} P3 ${mark(r.P3?.ok ?? null)} P4 ${mark(r.P4?.ok ?? null)} P5 ${pOf(r.P5)}${r.checks ? ` P6 ${pOf(r.P6)}` : ''}  ${r.name}`)
    for (const c of fails.slice(0, 4)) console.log(`      ${c.name}: ${c.detail}`)
    for (const k of ['P2', 'P3', 'P4']) if (r[k] && !r[k].ok) for (const d of (r[k].detail ?? []).slice(0, 3)) console.log(`      ${k}: ${d}`)
    for (const n of r.notes) console.log('      ' + n.split('\n')[0])
    if (r.vacuous?.length) console.log(`      VACUOUS: ${r.vacuous.join(', ')} listed but the spec has no ${r.vacuous.join('/')} assert (log #24)`)
    if (r.retiredCount) console.log(`      RETIRED CHECK (${r.retiredCount} steps skipped, replaced by ${r.retiredChecks.join(', ')}): ${retiredFor(r.id).reason}`)
  }
  const orig = results.filter((r) => !r.checks), round1 = results.filter((r) => r.checks && !/^[RTU]\d/.test(r.id)), round2 = results.filter((r) => r.id.startsWith('R')), round3 = results.filter((r) => r.id.startsWith('T')), round4 = results.filter((r) => r.id.startsWith('U'))
  const tally = (rs, o) => rs.filter((r) => r.outcome === o).length
  const summary = { fault, url: baseUrl, originals: { pass: tally(orig, 'PASS'), refused: tally(orig, 'REFUSED'), fail: tally(orig, 'FAIL'), total: orig.length }, round1: { pass: tally(round1, 'PASS'), fail: tally(round1, 'FAIL'), total: round1.length, retired: retired.length }, round2: { pass: tally(round2, 'PASS'), fail: tally(round2, 'FAIL'), total: round2.length, withRetiredChecks: round2.filter((r) => r.retiredCount).map((r) => r.id) }, round3: { pass: tally(round3, 'PASS'), fail: tally(round3, 'FAIL'), retired: tally(round3, 'RETIRED'), total: round3.length, withRetiredChecks: round3.filter((r) => r.retiredCount).map((r) => r.id) }, round4: { pass: tally(round4, 'PASS'), fail: tally(round4, 'FAIL'), notApplicable: tally(round4, 'NOT APPLICABLE'), total: round4.length } }
  if (orig.length) console.log(`\nOriginals: PASS ${summary.originals.pass}  REFUSED ${summary.originals.refused}  FAIL ${summary.originals.fail}  of ${summary.originals.total}`)
  if (round1.length) console.log(`Round 1:   PASS ${summary.round1.pass}  FAIL ${summary.round1.fail}  of ${summary.round1.total} (N01 and N02 RETIRED, not run)`)
  if (round2.length) console.log(`Round 2:   PASS ${summary.round2.pass}  FAIL ${summary.round2.fail}  of ${summary.round2.total}${summary.round2.withRetiredChecks.length ? ` (retired checks skipped in ${summary.round2.withRetiredChecks.join(', ')})` : ''}`)
  if (round3.length) console.log(`Round 3:   PASS ${summary.round3.pass}  FAIL ${summary.round3.fail}${summary.round3.retired ? `  RETIRED ${summary.round3.retired}` : ''}  of ${summary.round3.total}${summary.round3.withRetiredChecks.length ? ` (retired checks skipped in ${summary.round3.withRetiredChecks.join(', ')})` : ''}`)
  if (round4.length) console.log(`Round 4:   PASS ${summary.round4.pass}  FAIL ${summary.round4.fail}${summary.round4.notApplicable ? `  NOT APPLICABLE ${summary.round4.notApplicable}` : ''}  of ${summary.round4.total}`)
  writeFileSync(join(outDir, `results${fault ? '-' + fault : ''}${only ? '-' + only.join('') : ''}.json`), JSON.stringify({ summary, results: results.map(({ exports, ...r }) => r) }, null, 1))
  // Pass line: originals 18 PASS + 2 REFUSED + 0 FAIL when all 20 ran; round 1 N03 to N11 all PASS (N01 and N02 retired); round 2 R01 to R16 all PASS (retired checks skipped);
  // round 3 T01 to T16 all PASS in the earlier stubs; on the real page and the round 4 stub T01 is retired and T10 is a failed locked spec (docs/ui-editor-gate-rules-round4.md section 1);
  // round 4 U01 to U13 all PASS (U13 NOT APPLICABLE only with --u13-na).
  const o = summary.originals, n = summary.round1
  const origOk = orig.length !== 20 || (o.pass + o.refused >= 20 && o.pass >= 18 && o.fail === 0)
  const r1Ok = round1.length !== 9 || (n.pass === 9 && n.fail === 0)
  const r2Ok = round2.length !== 16 || (summary.round2.pass === 16 && summary.round2.fail === 0)
  const r3Ok = round3.length !== 16 || (OLD_STUB ? summary.round3.pass === 16 && summary.round3.fail === 0 : round3.every((r) => r.outcome === 'PASS' || r.outcome === 'RETIRED' || r.id === 'T10') && round3.find((r) => r.id === 'T10')?.outcome !== undefined)
  const r4Ok = round4.length !== 13 || round4.every((r) => r.outcome === 'PASS' || (r.id === 'U13' && flag('--u13-na') && r.outcome === 'NOT APPLICABLE'))
  exitCode = origOk && r1Ok && r2Ok && r3Ok && r4Ok ? 0 : 1
}
await browser.close()
exportServer.close()
stubServer?.close()
process.exit(exitCode)
