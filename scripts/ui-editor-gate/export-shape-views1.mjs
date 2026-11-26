// Views round 1, deliverable 6: the real before/after export shape, generated from the three built-in sample pages (and the hand-written bp768 fixture for the page whose phone breakpoint is 768).
//   PLAYWRIGHT_DIR=<folder whose node_modules has playwright> node scripts/ui-editor-gate/export-shape-views1.mjs [out file]     (default docs/ui-editor-views1-export-shape.md)
// Every block is `diff -U0` of the export against the original file after the edits listed so far (cumulative): (a) a Desktop heading font-size edit, (b) then a Phone custom font-size edit,
// (c) then another Desktop edit of the same heading, (d) a Tablet custom padding edit, (e) the same list on a page with B = 768, where the Tablet edit is refused. The engine is the vendored one
// (src/ui-editor/vendor/engine.js, or ENGINE_JS). No real page is used.
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const require = createRequire(import.meta.url)
const { chromium } = require(require.resolve('playwright', process.env.PLAYWRIGHT_DIR ? { paths: [process.env.PLAYWRIGHT_DIR] } : undefined))
const engineFile = process.env.ENGINE_JS ?? join(root, 'src', 'ui-editor', 'vendor', 'engine.js')
const out = process.argv[2] ?? join(root, 'docs', 'ui-editor-views1-export-shape.md')
const samples = join(root, 'src', 'ui-editor', 'samples')
const read = (p) => readFileSync(p, 'utf8')
const banner = /commit ([0-9a-f]{7,40})/.exec(read(engineFile).slice(0, 400))?.[1] ?? 'unknown'

const pages = {
  landing: { title: 'landing (landing.html and landing.css; B 640, T 1024: no tablet rule of its own, so Tablet is 641 to 1024)', order: ['landing.html', 'landing.css'], kind: 'html', files: { 'landing.html': read(join(samples, 'landing.html')), 'landing.css': read(join(samples, 'landing.css')) }, list: { sel: '#headline', name: 'h1 #headline', a: '52px', b: '36px', c: '60px', pad: { sel: '#card-plan', name: 'article #card-plan', v: '30px' } } },
  email: { title: 'email (email.html; B 480, T 1024)', order: ['email.html'], kind: 'html', files: { 'email.html': read(join(samples, 'email.html')) }, list: { sel: '#hello', name: 'h1 #hello', a: '32px', b: '22px', c: '36px', pad: { sel: '#pick-one', name: 'td #pick-one', v: '20px' } } },
  chart: { title: 'chart (chart.svg; an SVG document has no environments)', order: ['chart.svg'], kind: 'svg', files: { 'chart.svg': read(join(samples, 'chart.svg')) }, list: { sel: '#heading', name: 'text #heading', a: '26', b: '22', c: '30', pad: null } },
  bp768: { title: 'bp768 (a hand-written page, reference/views1-bp768.html: its own phone breakpoint is 768, so the Tablet width is already a phone width and there is no Tablet range)', order: ['views1-bp768.html'], kind: 'html', files: { 'views1-bp768.html': read(join(here, 'reference', 'views1-bp768.html')) }, list: { sel: '#title', name: 'h1 #title', a: '50px', b: '30px', c: '56px', pad: { sel: '#panel', name: 'div #panel', v: '30px' } } },
}

const srv = createServer((q, r) => {
  const p = new URL(q.url, 'http://x').pathname
  if (p === '/engine.js') { r.setHeader('content-type', 'text/javascript'); return r.end(readFileSync(engineFile)) }
  r.setHeader('content-type', 'text/html'); r.end('<!doctype html><meta charset="utf-8"><div id="h"></div>')
})
await new Promise((res) => srv.listen(0, '127.0.0.1', res))
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext()
const page = await ctx.newPage()
await page.goto(`http://127.0.0.1:${srv.address().port}/ref.html`)

// the export after the first k edits, and the refusals (an edit that is refused changes nothing and is not in the list)
async function exportAfter(p, edits) {
  return page.evaluate(async ({ files, order, kind, edits }) => {
    const E = await import('/engine.js')
    const model = E.createModel(files[order[0]], kind, Object.fromEntries(order.slice(1).map((f) => [f, files[f]])), order[0])
    const preview = await E.createPreview(model, document.getElementById('h'), { width: 1280, height: 800 })
    let state = E.emptyState()
    const kept = [], refused = []
    for (const e of edits) {
      const { sel, ...rest } = e
      const edit = { ...rest, target: preview.elements.indexOf(preview.doc.querySelector(sel)) }
      const run = E.applyEditSteps(preview, [edit], state)
      if (run.results[0].ok) { state = run.state; kept.push(edit) } else refused.push(run.results[0].refusal.message)
    }
    const m2 = E.createModel(files[order[0]], kind, Object.fromEntries(order.slice(1).map((f) => [f, files[f]])), order[0])
    const p2 = await E.createPreview(m2, document.getElementById('h'), { width: 1280, height: 800 })
    const run2 = E.applyEditSteps(p2, kept, E.emptyState())
    preview.dispose(); p2.dispose()
    return { files: run2.files, refused }
  }, { files: p.files, order: p.order, kind: p.kind, edits })
}
const tmp = mkdtempSync(join(tmpdir(), 'shape-'))
function diff(name, a, b) {
  writeFileSync(join(tmp, 'a'), a); writeFileSync(join(tmp, 'b'), b)
  const r = spawnSync('diff', ['-U0', join(tmp, 'a'), join(tmp, 'b')], { encoding: 'utf8' })
  const lines = (r.stdout ?? '').split('\n').filter((l) => !/^(---|\+\+\+) /.test(l) && l !== '')
  return lines.length ? lines.join('\n') : '(no change)'
}
const set = (sel, prop, v, environment) => ({ op: 'set', sel, properties: { [prop]: v }, environment })

let md = `# UI Editor views round 1: the export shape (generated)

Generated by \`scripts/ui-editor-gate/export-shape-views1.mjs\` with the vendored engine (commit \`${banner}\`) from the three built-in sample pages and the hand-written bp768 page (no real page). Each block is \`diff -U0\` of the export against the original file after the edits listed so far (the edits are cumulative); \`-\` is a line of the original that changed, \`+\` a line the export adds or changes.

`
for (const [id, p] of Object.entries(pages)) {
  const L = p.list
  const prop = p.kind === 'svg' ? 'font-size' : 'font-size'
  const steps = [
    { key: 'a', text: `(a) Desktop: ${L.name} font-size ${L.a}`, edit: set(L.sel, prop, L.a, 'desktop') },
    { key: 'b', text: p.kind === 'svg' ? `(b) then Phone: the same element font-size ${L.b} (an SVG has no environments: the edit is the same kind of edit, and it replaces the value)` : `(b) then Phone, custom: ${L.name} font-size ${L.b}`, edit: set(L.sel, prop, L.b, 'phone') },
    { key: 'c', text: p.kind === 'svg' ? `(c) then Desktop again: font-size ${L.c}` : `(c) then Desktop again: ${L.name} font-size ${L.c} (the Phone value stays)`, edit: set(L.sel, prop, L.c, 'desktop') },
  ]
  if (L.pad) steps.push({ key: 'd', text: id === 'bp768' ? `(e) then Tablet, custom: ${L.pad.name} padding ${L.pad.v}: refused, nothing changes` : `(d) then Tablet, custom: ${L.pad.name} padding ${L.pad.v}`, edit: set(L.pad.sel, 'padding', L.pad.v, 'tablet') })
  else steps.push({ key: 'd', text: '(d) then a Tablet edit of the same element, font-size 24: an SVG has no environments, so it is the same kind of edit and replaces the value', edit: set(L.sel, prop, '24', 'tablet') })
  md += `## ${p.title}\n\n`
  for (let k = 0; k < steps.length; k++) {
    const r = await exportAfter(p, steps.slice(0, k + 1).map((s) => s.edit))
    md += `**${steps[k].text}**${r.refused.length ? `\n\nRefused: ${r.refused[r.refused.length - 1]}` : ''}\n\n`
    for (const f of p.order) md += `\`${f}\`\n\n\`\`\`diff\n${diff(f, p.files[f], r.files[f])}\n\`\`\`\n\n`
  }
}
await browser.close()
srv.close()
writeFileSync(out, md.replace(/\n+$/, '\n'))
console.log(`wrote ${out} (${md.split('\n').length} lines)`)
