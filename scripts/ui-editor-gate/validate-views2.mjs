// UI Editor views stage 2: validates the hand-checked expected values of specs-views2.json ("truth") in plain Chromium WITHOUT the editor page.
//   PLAYWRIGHT_DIR=<folder whose node_modules has playwright> node scripts/ui-editor-gate/validate-views2.mjs
// For each truth entry the vendored engine (a page of its own, no editor UI) applies the listed edits (selectors stand for element indexes) to the landing sample, the exported files are
// served, and the computed value of each check is read in plain Chromium at each width and compared with the one the spec states (lengths within 0.01 px). Exit 1 when any value differs.
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
let chromium
try { const require = createRequire(import.meta.url); ;({ chromium } = require(require.resolve('playwright', { paths: [process.env.PLAYWRIGHT_DIR ?? ''] }))) } catch { console.error('needs Playwright (set PLAYWRIGHT_DIR).'); process.exit(2) }
const file = JSON.parse(readFileSync(join(here, 'specs-views2.json'), 'utf8'))
const samples = join(root, 'src', 'ui-editor', 'samples')
const files0 = { 'landing.html': readFileSync(join(samples, 'landing.html'), 'utf8'), 'landing.css': readFileSync(join(samples, 'landing.css'), 'utf8') }
const served = new Map()
const srv = createServer((q, r) => {
  const p = decodeURIComponent(new URL(q.url, 'http://x').pathname.slice(1))
  if (p === 'engine.js') { r.setHeader('content-type', 'text/javascript'); return r.end(readFileSync(join(root, 'src', 'ui-editor', 'vendor', 'engine.js'))) }
  if (served.has(p)) { r.setHeader('content-type', p.endsWith('.css') ? 'text/css' : 'text/html'); return r.end(served.get(p)) }
  r.setHeader('content-type', 'text/html'); r.end('<!doctype html><div id="h"></div>')
})
await new Promise((res) => srv.listen(0, '127.0.0.1', res))
const port = srv.address().port
const browser = await chromium.launch({ headless: true })
const page = await (await browser.newContext()).newPage()
await page.goto(`http://127.0.0.1:${port}/ref.html`)
const same = (have, want) => (/^-?[\d.]+px$/.test(want) && /^-?[\d.]+px$/.test(have ?? '') ? Math.abs(parseFloat(have) - parseFloat(want)) <= 0.01 : have === want)
let bad = 0, n = 0
for (const [id, t] of Object.entries(file.truth)) {
  const out = await page.evaluate(async ({ files, edits }) => {
    const E = await import('/engine.js')
    const model = E.createModel(files['landing.html'], 'html', { 'landing.css': files['landing.css'] }, 'landing.html')
    const preview = await E.createPreview(model, document.getElementById('h'), { width: 1280, height: 800 })
    const list = edits.map(({ sel, ...e }) => ({ ...e, target: preview.elements.indexOf(preview.doc.querySelector(sel)) }))
    const run = E.applyEditSteps(preview, list, E.emptyState())
    preview.dispose()
    return run.files
  }, { files: files0, edits: t.edits })
  for (const [f, text] of Object.entries(out)) served.set(f, text)
  const problems = []
  for (const c of t.checks) for (const [w, want] of Object.entries(c.at)) {
    const ctx = await browser.newContext({ viewport: { width: Number(w), height: 900 } })
    const p = await ctx.newPage()
    await p.goto(`http://127.0.0.1:${port}/landing.html`)
    const have = await p.evaluate(([s, pr]) => getComputedStyle(document.querySelector(s)).getPropertyValue(pr), [c.sel, c.prop])
    n++
    if (!same(have, want)) problems.push(`${c.sel} ${c.prop} @${w}: ${have}, expected ${want}`)
    await ctx.close()
  }
  bad += problems.length
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  truth ${id}${problems.length ? '\n      ' + problems.join('\n      ') : ''}`)
}
await browser.close(); srv.close()
console.log(`\n${n - bad} of ${n} values equal the engine's export in plain Chromium`)
process.exit(bad ? 1 : 0)
