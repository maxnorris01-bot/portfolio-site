// Supplementary, NOT part of the pass line (docs/ui-editor-baseline-round3.md, spec flaw 1): the snapped resize of T10 on an element that is anchored at its LEFT edge, so the
// dragged east edge can really land on a grid line. T10 itself drags #art, which sits at the right end of its flex row (its right edge cannot move).
//   PLAYWRIGHT_DIR=<folder whose node_modules has playwright> node scripts/ui-editor-gate/supplementary-snap.mjs --url http://127.0.0.1:4173/ui-editor
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require(require.resolve('playwright', process.env.PLAYWRIGHT_DIR ? { paths: [process.env.PLAYWRIGHT_DIR] } : undefined))
const url = process.argv[process.argv.indexOf('--url') + 1]
const b = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const rows = []
for (const [dx, alt] of [[37, false], [43, false], [37, true]]) {
  const page = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage()
  await page.goto(url)
  await page.locator('[data-sample-card="landing"]').click()
  await page.waitForFunction(() => !!document.querySelector('iframe[title="Preview"]')?.contentDocument?.querySelector('#cta'))
  const settle = async () => { await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]')) }
  await settle()
  const box = () => page.evaluate(() => { const b = document.querySelector('iframe[title="Preview"]').contentDocument.querySelector('#cta').getBoundingClientRect(); return { left: b.left, right: b.right, width: b.width } })
  const f = await page.locator('iframe[title="Preview"]').boundingBox()
  const b0 = await box()
  await page.mouse.click(f.x + b0.left + 12, f.y + 191.7 + 12)
  await page.getByRole('tab', { name: 'Layout' }).click()
  await page.getByRole('button', { name: 'Snap', exact: true }).click()
  const hb = await page.locator('[data-handle="e"]').boundingBox()
  const p = { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 }
  await page.mouse.move(p.x, p.y)
  if (alt) await page.keyboard.down('Alt')
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(p.x + (dx * i) / 12, p.y)
  await page.mouse.up()
  if (alt) await page.keyboard.up('Alt')
  await settle()
  const b1 = await box()
  const raw = b0.right + dx
  const near = Math.round(raw / 8) * 8
  rows.push({ dx, alt, before: b0.right.toFixed(2), after: b1.right.toFixed(2), want: alt ? `${raw.toFixed(2)} (+-1.5)` : `${near} (nearest to ${raw.toFixed(2)})`, ok: alt ? Math.abs(b1.right - raw) <= 1.5 : Math.abs(b1.right - near) <= 0.5 })
  await page.context().close()
}
for (const r of rows) console.log(`${r.ok ? 'PASS' : 'FAIL'}  #cta east drag ${r.dx} px${r.alt ? ' with Alt' : ''}: right edge ${r.before} -> ${r.after}, want ${r.want}`)
await b.close()
process.exit(rows.every((r) => r.ok) ? 0 : 1)
