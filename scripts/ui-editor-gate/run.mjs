// The UI Editor gate runner (rules: docs/ui-editor-gate-rules.md, specs: scripts/ui-editor-gate/specs.json).
//   node scripts/ui-editor-gate/run.mjs --url http://127.0.0.1:4173/ui-editor            the real page (vite preview, flag ON)
//   node scripts/ui-editor-gate/run.mjs --stub [--fault half-drag] [--only S04,S05]      the scorer-check stub (see reference/)
//   node scripts/ui-editor-gate/run.mjs --url ... --noop                                  load each sample, export, compare to the source
// Needs Playwright with Chromium (not a dependency of this repo): installed here, or in PLAYWRIGHT_DIR (a folder whose node_modules has it).
// Headless Chromium, a fresh context per action, real mouse events, no retries. Results go to UI_GATE_OUT (default scripts/ui-editor-gate/out, git-ignored).
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { diffLines, sameShape, p3Violations, p2Violations, outcomeOf } from './checks.mjs'

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
if (flag('--stub')) {
  const refDir = join(here, 'reference')
  const engine = process.env.ENGINE_JS ?? join(root, 'src', 'ui-editor', 'vendor', 'engine.js')
  stubServer = createServer((q, r) => {
    const u = new URL(q.url, 'http://x'); const p = u.pathname
    try {
      let body
      if (p === '/' || p === '/index.html') body = readFileSync(join(refDir, 'index.html'))
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
    keyFor(sel) { const e = frame().contentDocument.querySelector(sel); return e ? keyOf(e) : null },
    point(sel, at) {
      const f = frame(); const fr = f.getBoundingClientRect(); const e = f.contentDocument.querySelector(sel)
      if (!e) return null
      const b = e.getBoundingClientRect()
      return at === 'inset' ? { x: fr.left + b.left + 12, y: fr.top + b.top + 12 } : { x: fr.left + b.left + b.width / 2, y: fr.top + b.top + b.height / 2 }
    },
    elementBox(sel) { const f = frame(); const fr = f.getBoundingClientRect(); const b = f.contentDocument.querySelector(sel).getBoundingClientRect(); return { left: fr.left + b.left, top: fr.top + b.top, width: b.width, height: b.height } },
    blankPoint() { const fr = frame().getBoundingClientRect(); return { x: fr.left + 20, y: fr.bottom - 8 } },
  }
})()`

const settle = async (page) => {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'))
}

// ---- running one spec ----
async function runSpec(spec) {
  const src = sources[spec.sample]
  const ctx = await browser.newContext({ viewport: specsFile.hostViewport, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  const res = { id: spec.id, name: spec.name, sample: spec.sample, expected: spec.expected, P1: [], P2: null, P3: null, P4: null, P5: [], setup: [], notes: [], errors }
  const snaps = {}
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

  async function doAssert(a) {
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
        const t = await page.getByRole('button', { name: /^Review unlinked \(\d+\)$/ }).first().innerText().catch(() => '')
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
        const t = (await region().innerText()).toLowerCase()
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
      case 'fieldDisabled': return R(await fieldOf(a.label).isDisabled(), 'field disabled')
      case 'buttonDisabled': {
        const d = await page.getByRole('button', { name: a.name, exact: true }).isDisabled()
        return R(d === a.disabled, `disabled ${d}`)
      }
      case 'copy': {
        const f = page.getByLabel('File', { exact: true })
        if (await f.count()) await f.selectOption({ label: a.file })
        await page.getByRole('button', { name: 'Copy code', exact: true }).click()
        await settle(page)
        const clip = await page.evaluate(() => navigator.clipboard.readText())
        const dl = await grab(a.file)
        return R(clip === dl.text && clip.length > 0, `clipboard ${clip.length} chars, download ${dl.text.length} chars, equal ${clip === dl.text}`)
      }
      case 'downloadName': {
        const dl = await grab(a.file)
        return R(dl.name === a.name, `saved as ${dl.name}`)
      }
      default: return R(false, 'unknown assertion ' + a.k)
    }
  }

  try {
    for (const step of spec.steps) {
      if (step.do === 'load') {
        await page.goto(baseUrl)
        await page.evaluate(PAGE_HELPERS)
        await page.getByLabel('Sample', { exact: true }).selectOption(step.sample)
        await page.waitForFunction((s) => { const f = document.querySelector('iframe[title="Preview"]'); return !!f?.contentDocument?.querySelector(s) }, READY[step.sample])
        await settle(page)
        // The "before" values and the original dumps.
        for (const s of spec.steps.filter((x) => x.do === 'assert' && x.k === 'measure')) {
          for (const [sel] of [[s.sel], [s.of]].filter((p) => p[0])) before[`${s.at}|${sel}|${s.q}`] = await measureNum(s.at, sel, s.q)
          if (s.mode === 'same' || s.mode === 'delta') before[`${s.at}|${s.sel}|${s.q}`] = await measureNum(s.at, s.sel, s.q)
        }
        originalDump = await dumps()
        for (const b of spec.baseline ?? []) {
          const v = await measureNum(b.at, b.sel, b.q)
          rec('setup', `baseline ${b.sel} ${b.q} @${b.at}`, v !== null && Math.abs(v - b.value) <= b.tol, `got ${v}, want ${b.value} +-${b.tol}`)
        }
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
        await page.mouse.move(p.x, p.y)
        await page.mouse.down()
        const n = Math.max(2, Math.ceil(Math.max(Math.abs(step.dx), Math.abs(step.dy)) / 4))
        for (let i = 1; i <= n; i++) await page.mouse.move(p.x + (step.dx * i) / n, p.y + (step.dy * i) / n)
        await page.mouse.up()
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
      } else if (step.do === 'snapshot') {
        snaps[step.name] = { dumps: await dumps(), exports: await grabAll() }
      } else if (step.do === 'assert') {
        await settle(page)
        await doAssert(step)
        continue
      }
      await settle(page)
    }

    // ---- after the steps: P3 needs the preview now, P2 needs the export ----
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
  } catch (e) {
    res.notes.push('runner error: ' + (e?.stack ?? e))
  }
  await ctx.close()
  res.outcome = outcomeOf(res)
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
    await page.getByLabel('Sample', { exact: true }).selectOption(id)
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
  const list = specsFile.specs.filter((s) => !only || only.includes(s.id))
  const results = []
  for (const spec of list) {
    const r = await runSpec(spec)
    results.push(r)
    const fails = [...r.setup, ...r.P1, ...r.P5].filter((c) => !c.ok)
    const mark = (ok) => (ok === null ? '-' : ok ? 'ok' : 'XX')
    const pOf = (arr) => (arr.length ? (arr.every((c) => c.ok) ? 'ok' : 'XX') : '-')
    console.log(`${r.id}  ${r.outcome.padEnd(7)} P1 ${pOf(r.P1)} P2 ${mark(r.P2?.ok ?? null)} P3 ${mark(r.P3?.ok ?? null)} P4 ${mark(r.P4?.ok ?? null)} P5 ${pOf(r.P5)}  ${r.name}`)
    for (const c of fails.slice(0, 4)) console.log(`      ${c.name}: ${c.detail}`)
    for (const k of ['P2', 'P3', 'P4']) if (r[k] && !r[k].ok) for (const d of (r[k].detail ?? []).slice(0, 3)) console.log(`      ${k}: ${d}`)
    for (const n of r.notes) console.log('      ' + n.split('\n')[0])
  }
  const count = (o) => results.filter((r) => r.outcome === o).length
  const summary = { fault, url: baseUrl, pass: count('PASS'), refused: count('REFUSED'), fail: count('FAIL'), total: results.length }
  console.log(`\nPASS ${summary.pass}  REFUSED ${summary.refused}  FAIL ${summary.fail}  of ${summary.total}`)
  writeFileSync(join(outDir, `results${fault ? '-' + fault : ''}.json`), JSON.stringify({ summary, results: results.map(({ exports, ...r }) => r) }, null, 1))
  exitCode = list.length === 20 ? (summary.pass + summary.refused >= 20 && summary.pass >= 18 && summary.fail === 0 ? 0 : 1) : 0
}
await browser.close()
exportServer.close()
stubServer?.close()
process.exit(exitCode)
