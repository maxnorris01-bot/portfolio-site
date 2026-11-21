// Read-only engine probe for round 6 (docs/ui-editor-baseline-round6.md): what the engine writes for the properties the round 6 menus set (line width and style, colours, gradient, shadow, italic, underline, line-height) on the sample elements, and which of them it refuses. Writes nothing.
// (old header follows) the
// opposite edge stays. Two ways are tried on each element kind of the samples: (A) the size plus a compensating NEGATIVE margin (margin-left for the west edge,
// margin-top for the north), (B) the size plus a compensating offset (transform). For each the target's four edges and how many OTHER elements moved are reported.
// Writes nothing.   PLAYWRIGHT_DIR=<folder whose node_modules has playwright> node scripts/ui-editor-gate/probe-west.mjs
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const require = createRequire(import.meta.url)
const { chromium } = require(require.resolve('playwright', process.env.PLAYWRIGHT_DIR ? { paths: [process.env.PLAYWRIGHT_DIR] } : undefined))
const files = { '/engine.js': [repo + '/src/ui-editor/vendor/engine.js', 'text/javascript'] }
for (const f of ['landing.html', 'landing.css', 'email.html', 'chart.svg']) files['/s/' + f] = [repo + '/src/ui-editor/samples/' + f, 'text/plain']
const srv = createServer((q, r) => { const e = files[q.url.split('?')[0]]; if (!e) { r.statusCode = 404; return r.end('<!doctype html><title>x</title>') } r.setHeader('content-type', q.url === '/' ? 'text/html' : e[1]); r.end(readFileSync(e[0])) })
await new Promise((r) => srv.listen(0, '127.0.0.1', r))
const port = srv.address().port
const b = await chromium.launch({ headless: true })
const p = await (await b.newContext()).newPage()
await p.goto(`http://127.0.0.1:${port}/s/landing.html`)

const sets = {
  'border 3px solid (width+style)': { 'border-width': '3px', 'border-style': 'solid' },
  'border-width 1px only': { 'border-width': '1px' },
  'border-color #c00000': { 'border-color': '#c00000' },
  'background-color #c00000': { 'background-color': '#c00000' },
  'background-color transparent': { 'background-color': 'transparent' },
  'gradient': { 'background-image': 'linear-gradient(to right, #c00000, #0070c0)' },
  'box-shadow subtle': { 'box-shadow': '0 1px 3px rgba(0,0,0,.2)' },
  'italic': { 'font-style': 'italic' },
  'underline': { 'text-decoration-line': 'underline' },
  'text-decoration underline': { 'text-decoration': 'underline' },
  'line-height 1.5': { 'line-height': '1.5' },
  'color #7030a0': { color: '#7030a0' },
}
const cases = [
  ['landing', 'landing.html', 'html', ['landing.css'], ['#headline', '#cta', '#art', '#card-build', '#card-plan', '#footer', '.lead']],
  ['email', 'email.html', 'html', [], ['#hello', '#button', '#fine', '#pick-two']],
  ['chart', 'chart.svg', 'svg', [], ['#bar-tue', '#heading', '#plot']],
]
const out = await p.evaluate(async ([port, cases, sets]) => {
  const E = await import(`http://127.0.0.1:${port}/engine.js`)
  const get = async (f) => (await fetch(`http://127.0.0.1:${port}/s/${f}`)).text()
  const rows = []
  for (const [id, main, kind, comp, sels] of cases) for (const sel of sels) for (const [what, props] of Object.entries(sets)) {
    const companions = {}; for (const c of comp) companions[c] = await get(c)
    const model = E.createModel(await get(main), kind, companions, main)
    const host = document.createElement('div'); document.body.appendChild(host)
    const pv = await E.createPreview(model, host, { width: 1280, height: 800 })
    const el = pv.doc.querySelector(sel)
    const row = { id, sel, what }
    try {
      const idx = E.select(model, E.describe(model, pv.elements.indexOf(el)))
      const run = E.applyEditSteps(pv, [{ op: 'set', target: idx, properties: props, environment: 'desktop', link: false }], E.emptyState())
      const bad = run.results.find((r) => !r.ok)
      if (bad) row.refused = bad.refusal.message
      else {
        const orig = { [main]: await get(main) }; for (const c of comp) orig[c] = await get(c)
        row.diff = Object.keys(run.files).map((f) => { const a = (orig[f] ?? '').split('\n'), b = run.files[f].split('\n'); const ch = b.filter((l, i) => l !== a[i]); return ch.length ? f + ': ' + ch.map((l) => l.trim().slice(0, 150)).join(' | ') : '' }).filter(Boolean)
        const cs = pv.doc.defaultView.getComputedStyle(pv.elements[idx])
        row.cs = { bw: cs.borderTopWidth, bs: cs.borderTopStyle, bg: cs.backgroundColor, bi: cs.backgroundImage.slice(0, 40), sh: cs.boxShadow, fs: cs.fontStyle, td: cs.textDecorationLine, lh: cs.lineHeight }
      }
    } catch (e) { row.error = String(e).slice(0, 200) }
    pv.dispose(); host.remove()
    rows.push(row)
  }
  return rows
}, [port, cases, sets])
for (const r of out) console.log(`${r.id} ${r.sel} | ${r.what} | ${r.refused ? 'REFUSED: ' + r.refused : r.error ? 'ERROR ' + r.error : (r.diff.join(' ;; ') || 'no change') + ' => ' + JSON.stringify(r.cs)}`)
await b.close(); srv.close()
