// Read-only engine probe for round 5 (docs/ui-editor-baseline-round5.md): how to resize from the WEST or NORTH edge so that the dragged edge follows the pointer and the
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

const cases = [
  ['landing', 'landing.html', 'html', ['landing.css'], [['#cta', 'inline-block link'], ['#headline', 'block'], ['#art', 'flex item, fixed width, right of its row'], ['#card-plan', 'flex item that grows'], ['.lead', 'paragraph'], ['#footer', 'block at the page edge']]],
  ['email', 'email.html', 'html', [], [['#hello', 'heading in a table cell'], ['#pick-two', 'table cell']]],
]
const out = await p.evaluate(async ([port, cases]) => {
  const E = await import(`http://127.0.0.1:${port}/engine.js`)
  const get = async (f) => (await fetch(`http://127.0.0.1:${port}/s/${f}`)).text()
  const rows = []
  for (const [id, main, kind, comp, sels] of cases) for (const [sel, what] of sels) for (const handle of ['w', 'n']) for (const way of ['A margin', 'B offset']) {
    const companions = {}; for (const c of comp) companions[c] = await get(c)
    const model = E.createModel(await get(main), kind, companions, main)
    const host = document.createElement('div'); document.body.appendChild(host)
    const pv = await E.createPreview(model, host, { width: 1280, height: 800 })
    const el = pv.doc.querySelector(sel)
    const idx = E.select(model, E.describe(model, pv.elements.indexOf(el)))
    const win = pv.doc.defaultView
    const all = () => pv.elements.map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom] })
    const before = all()
    const cs = win.getComputedStyle(pv.elements[idx])
    const row = { id, sel, what, handle, way }
    const D = 40
    const horiz = handle === 'w'
    const size = parseFloat(horiz ? cs.width : cs.height)
    const box = cs.boxSizing === 'border-box' ? 0 : 0
    const props = horiz ? { width: `${Math.round(size + D)}px` } : { height: `${Math.round(size + D)}px` }
    const steps = []
    if (way === 'A margin') {
      const m = parseFloat(horiz ? cs.marginLeft : cs.marginTop) || 0
      Object.assign(props, horiz ? { 'margin-left': `${m - D}px` } : { 'margin-top': `${m - D}px` })
      steps.push({ op: 'set', target: idx, properties: props, environment: 'desktop', link: false })
    } else {
      steps.push({ op: 'set', target: idx, properties: props, environment: 'desktop', link: false })
      steps.push({ op: 'offset', target: idx, dx: horiz ? -D : 0, dy: horiz ? 0 : -D, environment: 'desktop', link: false })
    }
    try {
      const run = E.applyEditSteps(pv, steps, E.emptyState())
      const bad = run.results.find((r) => !r.ok)
      if (bad) row.refused = bad.refusal.message
      else {
        const after = all()
        const t = pv.elements[idx]
        const inside = (i) => t.contains(pv.elements[i])
        row.target = { dL: after[idx][0] - before[idx][0], dT: after[idx][1] - before[idx][1], dR: after[idx][2] - before[idx][2], dB: after[idx][3] - before[idx][3] }
        row.others = before.map((b, i) => i).filter((i) => i !== idx && !inside(i) && before[i].some((v, k) => Math.abs(v - after[i][k]) > 0.5)).map((i) => pv.elements[i].localName + (pv.elements[i].id ? '#' + pv.elements[i].id : ''))
        const orig = {}
        row.files = run.files
      }
    } catch (e) { row.error = String(e) }
    pv.dispose(); host.remove()
    rows.push(row)
  }
  return rows
}, [port, cases])
const f2 = (n) => (Math.round(n * 100) / 100).toString()
for (const r of out) {
  const head = `${r.id} ${r.sel} (${r.what}) ${r.handle === 'w' ? 'west' : 'north'} drag 40 px, way ${r.way}:`
  if (r.refused || r.error) { console.log(`${head} ${r.refused ? 'REFUSED: ' + r.refused : 'ERROR ' + r.error}`); continue }
  const t = r.target
  console.log(`${head} edges L ${f2(t.dL)} T ${f2(t.dT)} R ${f2(t.dR)} B ${f2(t.dB)}; ${r.others.length} other elements moved${r.others.length ? ': ' + r.others.slice(0, 5).join(', ') : ''}`)
}
await b.close(); srv.close()
