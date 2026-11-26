// Read-only probe (views round 1 nudge fix): what do the Nudge X / Nudge Y boxes and a 20 px drag really do, per sample, element and view?
//   PLAYWRIGHT_DIR=<folder with playwright> node scripts/ui-editor-gate/probe-nudge-views1.mjs --url http://127.0.0.1:4173/ui-editor [--samples landing,email,chart] [--json out.json]
// The page is served by `vite preview` of a build with VITE_SHOW_UI_EDITOR=true (branch or main). For every sample, five elements, Desktop / Tablet / Phone and three actions
// (a: one arrow click on Nudge X, b: typing 10 in Nudge Y, c: a 20 px drag) it opens the sample afresh, selects the element in Desktop, switches view, acts, and reads: the status line,
// the edits in the page's list, the element's box before and after at 1280, 768 and 390 (the frame is set to each width), and the lines the export adds. Writes nothing but the report.
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const require = createRequire(import.meta.url)
const { chromium } = require(require.resolve('playwright', process.env.PLAYWRIGHT_DIR ? { paths: [process.env.PLAYWRIGHT_DIR] } : undefined))
const args = process.argv.slice(2)
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d)
const url = opt('--url')
if (!url) { console.error('give --url <page>'); process.exit(2) }
const only = opt('--samples', 'landing,email,chart').split(',')
const SAMPLES = {
  landing: { files: ['landing.html', 'landing.css'], ready: '#headline', els: [['#headline', 'heading'], ['.lead', 'paragraph'], ['#cta', 'link button'], ['#art', 'box'], ['#card-plan', 'card']] },
  email: { files: ['email.html'], ready: '#hello', els: [['#hello', 'heading in a cell'], ['#plans-none', ''], ['#button', 'button cell'], ['#pick-one', 'table cell'], ['#brand', 'brand cell']] },
  chart: { files: ['chart.svg'], ready: '#bar-tue', els: [['#heading', 'svg text'], ['#bar-mon', 'bar'], ['#bar-tue', 'bar'], ['#bar-wed', 'bar'], ['#axis', 'line']] },
}
SAMPLES.email.els[1] = ['td > p', 'paragraph']
const orig = (s) => Object.fromEntries(SAMPLES[s].files.map((f) => [f, readFileSync(join(repo, 'src/ui-editor/samples', f), 'utf8')]))
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const settle = async (p) => { await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); await p.waitForFunction(() => !document.querySelector('[aria-busy="true"]')); await p.waitForTimeout(120) }
const box = (p, sel, w) => p.evaluate(([s, w]) => { const f = document.querySelector('iframe[title="Preview"]'); const old = f.style.width; f.style.width = w + 'px'; void f.contentDocument.documentElement.offsetWidth; const e = f.contentDocument.querySelector(s); const b = e ? e.getBoundingClientRect() : null; f.style.width = old; void f.contentDocument.documentElement.offsetWidth; return b ? [Math.round(b.left * 10) / 10, Math.round(b.top * 10) / 10] : null }, [sel, w])
const boxes = async (p, sel) => ({ 1280: await box(p, sel, 1280), 768: await box(p, sel, 768), 390: await box(p, sel, 390) })
const rawPoint = (p, sel) => p.evaluate((s) => { const f = document.querySelector('iframe[title="Preview"]'); const fr = f.getBoundingClientRect(); const k = fr.width / f.offsetWidth; const e = f.contentDocument.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: fr.left + (b.left + b.width / 2) * k, y: fr.top + (b.top + b.height / 2) * k } }, sel)
// the window is scrolled (never the preview) until the point is in view, as the gate does
const point = async (p, sel) => { let pt = await rawPoint(p, sel); if (!pt) return null; if (pt.y > 1000 || pt.y < 80) { await p.evaluate((y) => window.scrollBy(0, y - 500), pt.y); await p.waitForTimeout(100); pt = await rawPoint(p, sel) } return pt }
const selectionOn = (p, sel) => p.evaluate((s) => { const sb = document.querySelector('[data-selection]'); const e = document.querySelector('iframe[title="Preview"]').contentDocument.querySelector(s); if (!sb || !e) return false; const b = e.getBoundingClientRect(); return Math.abs(b.left - parseFloat(sb.style.left)) < 1 && Math.abs(b.top - parseFloat(sb.style.top)) < 1 && Math.abs(b.width - parseFloat(sb.style.width)) < 1 }, sel)
async function exportAdded(p, s) {
  const got = []
  const on = (d) => got.push(d)
  p.on('download', on)
  await p.getByRole('button', { name: 'Download', exact: true }).click()
  const t0 = Date.now(); while (got.length < SAMPLES[s].files.length && Date.now() - t0 < 4000) await p.waitForTimeout(50)
  await p.waitForTimeout(200); p.off('download', on)
  const o = orig(s), added = []
  let bytes = 0
  for (const d of got) {
    const chunks = []; for await (const c of await d.createReadStream()) chunks.push(c)
    const text = Buffer.concat(chunks).toString('utf8'), name = SAMPLES[s].files.find((f) => d.suggestedFilename() === f || d.suggestedFilename() === f.replace(/(\.[^.]+)$/, '-edited$1'))
    if (!name) continue
    bytes += text.length - o[name].length
    const have = new Set(o[name].split('\n')); added.push(...text.split('\n').filter((l) => !have.has(l)).map((l) => l.trim().slice(0, 90)))
  }
  return { bytes, added }
}
const rows = []
for (const s of only) for (const [sel, what] of SAMPLES[s].els) for (const view of ['Desktop', 'Tablet', 'Phone']) for (const action of ['arrow', 'type', 'drag']) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true })
  const p = await ctx.newPage()
  const row = { sample: s, el: sel, what, view, action }
  try {
    await p.goto(url)
    await p.locator(`[data-sample-card="${s}"]`).click()
    await p.waitForFunction((r) => !!document.querySelector('iframe[title="Preview"]')?.contentDocument?.querySelector(r), SAMPLES[s].ready)
    await settle(p)
    const pt = await point(p, sel)
    if (!pt) throw new Error('element not found')
    await p.mouse.click(pt.x, pt.y); await settle(p)
    row.selected = (await p.locator('[data-selected-label]').first().innerText().catch(() => '')).trim()
    if (!(await selectionOn(p, sel))) throw new Error(`the click selected "${row.selected}", not ${sel}`)
    if (view !== 'Desktop') { await p.getByRole('group', { name: 'View' }).getByRole('button', { name: view, exact: true }).click(); await settle(p) }
    row.before = await boxes(p, sel)
    const field = action === 'arrow' ? 'Nudge X' : 'Nudge Y'
    const disabled = action === 'drag' ? false : await p.getByLabel(field, { exact: true }).isDisabled()
    if (disabled) row.note = 'nudge box disabled'
    else if (action === 'arrow') await p.locator(`[data-ribbon] [data-spin="up"][data-for="Nudge X"]`).click()
    else if (action === 'type') { const f = p.getByLabel('Nudge Y', { exact: true }); await f.click({ clickCount: 3 }); await p.keyboard.type('10'); await p.keyboard.press('Enter') }
    else {
      const pt2 = await point(p, sel)
      await p.mouse.move(pt2.x, pt2.y); await p.mouse.down(); for (let i = 1; i <= 5; i++) await p.mouse.move(pt2.x + 4 * i, pt2.y + 4 * i); await p.mouse.up()
    }
    await settle(p)
    row.status = (await p.getByRole('status', { name: 'Edit result' }).innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
    row.edits = JSON.parse((await p.locator('[data-editor]').first().getAttribute('data-edit-list')) ?? '[]').map((e) => `${e.op}${e.environment ? ' ' + e.environment : ''}${e.link === false ? ' link:false' : ''} ${e.dx ?? ''},${e.dy ?? ''}`.trim())
    row.after = await boxes(p, sel)
    const d = (w) => (row.before[w] && row.after[w] ? [Math.round((row.after[w][0] - row.before[w][0]) * 10) / 10, Math.round((row.after[w][1] - row.before[w][1]) * 10) / 10] : null)
    row.moved = { 1280: d(1280), 768: d(768), 390: d(390) }
    const ex = await exportAdded(p, s); row.bytes = ex.bytes; row.added = ex.added.slice(0, 3)
  } catch (e) { row.error = String(e).split('\n')[0] }
  rows.push(row)
  await ctx.close()
}
// a second part: after a Desktop nudge, do a Tablet and a Phone nudge of the same element still work, and what do the boxes show?
const seq = []
for (const s of only) {
  const [sel] = SAMPLES[s].els[0]
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true })
  const p = await ctx.newPage()
  const r = { sample: s, el: sel, steps: [] }
  try {
    await p.goto(url); await p.locator(`[data-sample-card="${s}"]`).click()
    await p.waitForFunction((x) => !!document.querySelector('iframe[title="Preview"]')?.contentDocument?.querySelector(x), SAMPLES[s].ready); await settle(p)
    const pt = await point(p, sel); await p.mouse.click(pt.x, pt.y); await settle(p)
    for (const view of ['Desktop', 'Tablet', 'Phone']) {
      if (view !== 'Desktop') { await p.getByRole('group', { name: 'View' }).getByRole('button', { name: view, exact: true }).click(); await settle(p) }
      const before = await boxes(p, sel)
      const dis = await p.getByLabel('Nudge X', { exact: true }).isDisabled()
      if (!dis) { await p.locator('[data-ribbon] [data-spin="up"][data-for="Nudge X"]').click(); await settle(p) }
      const after = await boxes(p, sel)
      const mv = (w) => (before[w] && after[w] ? [Math.round((after[w][0] - before[w][0]) * 10) / 10, Math.round((after[w][1] - before[w][1]) * 10) / 10] : null)
      r.steps.push({ view, disabled: dis, status: (await p.getByRole('status', { name: 'Edit result' }).innerText().catch(() => '')).replace(/\s+/g, ' ').trim(), moved: { 1280: mv(1280), 768: mv(768), 390: mv(390) }, edits: JSON.parse((await p.locator('[data-editor]').first().getAttribute('data-edit-list')) ?? '[]').length })
    }
  } catch (e) { r.error = String(e).split('\n')[0] }
  seq.push(r)
  await ctx.close()
}
await browser.close()
const cell = (m) => (m ? (m[0] === 0 && m[1] === 0 ? '.' : `${m[0]},${m[1]}`) : '-')
console.log('sample  element           view    action | edits | moved@1280 | @768 | @390 | status')
for (const r of rows) console.log(`${r.sample.padEnd(7)} ${r.el.padEnd(17)} ${r.view.padEnd(7)} ${r.action.padEnd(6)} | ${r.error ? 'ERROR ' + r.error : r.note ? r.note : `${r.edits.length} ${r.edits.join('; ')} | ${cell(r.moved[1280])} | ${cell(r.moved[768])} | ${cell(r.moved[390])} | ${r.status.slice(0, 110)} | +${r.bytes}b ${r.added[0] ?? ''}`}`)
console.log('\nDesktop nudge, then Tablet, then Phone nudge of the same element (one arrow click each):')
for (const r of seq) { console.log(`${r.sample} ${r.el}${r.error ? ' ERROR ' + r.error : ''}`); for (const s of r.steps) console.log(`   ${s.view}: ${s.disabled ? 'box disabled' : 'moved ' + ['1280', '768', '390'].map((w) => `${w}:${cell(s.moved[w])}`).join(' ')}; edits now ${s.edits}; ${s.status.slice(0, 120)}`) }
if (opt('--json')) writeFileSync(opt('--json'), JSON.stringify({ rows, seq }, null, 1))
