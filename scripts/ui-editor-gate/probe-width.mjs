// Read-only engine probe for round 2 (docs/ui-editor-baseline-round2.md): width 100% and 50% on an element of each sample, linked and unlinked,
// on Desktop and on Phone. Prints what the engine refuses, what each viewport measures afterwards and what changes in the files. Writes nothing.
//   PLAYWRIGHT_DIR=<folder whose node_modules has playwright> node scripts/ui-editor-gate/probe-width.mjs
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
  ['landing', 'landing.html', 'html', ['landing.css'], ['#art', '#headline', '#card-plan']],
  ['email', 'email.html', 'html', [], ['#hello', '#pick-one']],
  ['chart', 'chart.svg', 'svg', [], ['#bar-tue']],
]
const out = await p.evaluate(async ([port, cases]) => {
  const E = await import(`http://127.0.0.1:${port}/engine.js`)
  const get = async (f) => (await fetch(`http://127.0.0.1:${port}/s/${f}`)).text()
  const rows = []
  for (const [id, main, kind, comp, sels] of cases) {
    for (const sel of sels) for (const val of ['100%', '50%']) for (const link of [true, false]) for (const env of ['desktop', 'phone']) {
      if (kind === 'svg' && !link) continue
      const companions = {}; for (const c of comp) companions[c] = await get(c)
      const model = E.createModel(await get(main), kind, companions, main)
      const host = document.createElement('div'); document.body.appendChild(host)
      const pv = await E.createPreview(model, host, { width: env === 'phone' ? 390 : 1280, height: 800 })
      const idx = E.select(model, E.describe(model, pv.elements.indexOf(pv.doc.querySelector(sel))))
      const el = pv.elements[idx]
      const cw = (w) => { pv.setWidth(w); const e = pv.elements[idx]; return Math.round(e.getBoundingClientRect().width * 100) / 100 }
      const before = { d: cw(1280), p: cw(390) }; pv.setWidth(env === 'phone' ? 390 : 1280)
      let row = { id, sel, val, link, env, before }
      try {
        const run = E.applyEditSteps(pv, [{ op: 'set', target: idx, properties: { width: val }, environment: env, link }], E.emptyState())
        const r = run.results[0]
        if (!r.ok) row.refused = r.refusal.message
        else {
          row.notes = (r.notes ?? []).map((n) => `${n.condition}:${n.property} ${n.reason}`)
          row.after = { d: cw(1280), p: cw(390) }
          const f = Object.entries(run.files).map(([k, t]) => [k, t.split('\n').filter((l, i) => l !== (k === main ? '' : '')).length])
          row.exportChanged = Object.keys(run.files).filter(async () => true)
          row.files = run.files
        }
      } catch (e) { row.error = String(e) }
      pv.dispose(); host.remove()
      rows.push(row)
    }
  }
  return rows
}, [port, cases])
// diff vs original
const orig = {}
for (const f of ['landing.html', 'landing.css', 'email.html', 'chart.svg']) orig[f] = readFileSync(`${repo}/src/ui-editor/samples/${f}`, 'utf8')
for (const r of out) {
  const ch = r.files ? Object.entries(r.files).filter(([k, t]) => t !== orig[k]).map(([k, t]) => { const a = orig[k].split('\n'), c = t.split('\n'); return `${k}: ${c.filter((l) => !a.includes(l)).map((l) => l.trim()).join(' | ').slice(0, 110)}` }) : []
  console.log(`${r.id} ${r.sel} width:${r.val} ${r.link ? 'linked' : 'UNLINKED'} in ${r.env}: before D${r.before.d}/P${r.before.p}`, r.refused ? `REFUSED: ${r.refused}` : r.error ? `ERROR ${r.error}` : `after D${r.after.d}/P${r.after.p}; notes [${r.notes.join('; ')}]; export: ${ch.join(' ; ')}`)
}
await b.close(); srv.close()
