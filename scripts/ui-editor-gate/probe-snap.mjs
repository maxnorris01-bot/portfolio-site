// Read-only engine probe for round 3 (docs/ui-editor-baseline-round3.md): how a move's offset is computed for an element in flow, so a snapped final position
// can be reached exactly. For each element kind of the samples it asks the engine for an `offset` that would put the element's top-left on the nearest multiple of 8
// of the preview's document coordinates, with the exact (fractional) delta and with the delta rounded to whole px, and reports where the element really lands, what
// is refused and what the engine writes. Writes nothing.
//   PLAYWRIGHT_DIR=<folder whose node_modules has playwright> node scripts/ui-editor-gate/probe-snap.mjs
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
const cases = [
  ['landing', 'landing.html', 'html', ['landing.css'], [['#headline', 'block'], ['#cta', 'inline-block link'], ['#art', 'flex item (fixed width)'], ['#card-build', 'flex item that grows'], ['.lead', 'paragraph'], ['#footer', 'block at the page edge']]],
  ['email', 'email.html', 'html', [], [['#hello', 'heading in a table cell'], ['#pick-one', 'table cell']]],
  ['chart', 'chart.svg', 'svg', [], [['#bar-tue', 'SVG rect in a transformed group']]],
]
const out = await p.evaluate(async ([port, cases]) => {
  const E = await import(`http://127.0.0.1:${port}/engine.js`)
  const get = async (f) => (await fetch(`http://127.0.0.1:${port}/s/${f}`)).text()
  const rows = []
  for (const [id, main, kind, comp, sels] of cases) for (const [sel, what] of sels) for (const mode of ['exact', 'rounded']) {
    const companions = {}; for (const c of comp) companions[c] = await get(c)
    const model = E.createModel(await get(main), kind, companions, main)
    const host = document.createElement('div'); document.body.appendChild(host)
    const pv = await E.createPreview(model, host, { width: 1280, height: 800 })
    const idx = E.select(model, E.describe(model, pv.elements.indexOf(pv.doc.querySelector(sel))))
    const box = () => { const r = pv.elements[idx].getBoundingClientRect(); return { l: r.left, t: r.top } }
    const b0 = box()
    const near = (v) => Math.round(v / 8) * 8
    // an offset of (dx, dy) from the current place that would reach the nearest grid line of a drag that went about 37 px right and 37 px down
    let dx = near(b0.l + 37) - b0.l, dy = near(b0.t + 37) - b0.t
    if (mode === 'rounded') { dx = Math.round(dx); dy = Math.round(dy) }
    const row = { id, sel, what, mode, b0, dx, dy, want: { l: near(b0.l + 37), t: near(b0.t + 37) } }
    try {
      const run = E.applyEditSteps(pv, [{ op: 'offset', target: idx, dx, dy, environment: 'desktop', link: false }], E.emptyState())
      const r = run.results[0]
      if (!r.ok) row.refused = r.refusal.message
      else {
        row.after = box()
        row.notes = (r.notes ?? []).map((n) => `${n.property} ${n.reason}`)
        row.files = run.files
      }
    } catch (e) { row.error = String(e) }
    pv.dispose(); host.remove()
    rows.push(row)
  }
  return rows
}, [port, cases])
const orig = {}
for (const f of ['landing.html', 'landing.css', 'email.html', 'chart.svg']) orig[f] = readFileSync(`${repo}/src/ui-editor/samples/${f}`, 'utf8')
const f2 = (n) => (Math.round(n * 100) / 100).toString()
for (const r of out) {
  if (r.refused || r.error) { console.log(`${r.id} ${r.sel} (${r.what}) ${r.mode}: ${r.refused ? 'REFUSED: ' + r.refused : 'ERROR ' + r.error}`); continue }
  const ch = Object.entries(r.files).filter(([k, t]) => t !== orig[k]).map(([k, t]) => { const a = orig[k].split('\n'), c = t.split('\n'); return `${k}: ${c.filter((l) => !a.includes(l)).map((l) => l.trim()).join(' | ').slice(0, 120)}` })
  const dl = r.after.l - r.want.l, dt = r.after.t - r.want.t
  console.log(`${r.id} ${r.sel} (${r.what}) ${r.mode}: from (${f2(r.b0.l)}, ${f2(r.b0.t)}) offset (${f2(r.dx)}, ${f2(r.dy)}) -> lands (${f2(r.after.l)}, ${f2(r.after.t)}), grid line wanted (${r.want.l}, ${r.want.t}), off by (${f2(dl)}, ${f2(dt)}) ${Math.abs(dl) <= 0.5 && Math.abs(dt) <= 0.5 ? 'EXACT within 0.5' : 'OFF'}; ${ch.join(' ; ')}`)
}
await b.close(); srv.close()
