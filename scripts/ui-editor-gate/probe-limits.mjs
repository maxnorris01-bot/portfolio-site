// Read-only check of the Limits sentence of round 4 (docs/ui-editor-gate-rules-round4.md section 4, spec U13), run before the sentence is written:
//   "With Snap on, a dragged edge lands on a grid line only when that edge can move; an element fixed to the right of its row keeps its right edge."
// Two facts are measured on the real page with a real mouse: (A) the east edge of #cta, which sits at the left of its row, lands on the nearest grid line of the
// preview's document when Snap is on; (B) the east edge of #art, which is fixed to the right end of its flex row, does not move at all when it is dragged (its
// width is changed but the right edge stays), so it cannot land on a line. Nothing is written anywhere.
//   PLAYWRIGHT_DIR=<folder whose node_modules has playwright> node scripts/ui-editor-gate/probe-limits.mjs --url http://127.0.0.1:4173/ui-editor
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require(require.resolve('playwright', process.env.PLAYWRIGHT_DIR ? { paths: [process.env.PLAYWRIGHT_DIR] } : undefined))
const url = process.argv[process.argv.indexOf('--url') + 1]
const b = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const rows = []
const edge = (page, sel) => page.evaluate((s) => { const r = document.querySelector('iframe[title="Preview"]').contentDocument.querySelector(s).getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width, top: r.top } }, sel)
for (const [sel, handle, dx, alt] of [['#cta', 'e', 37, false], ['#cta', 'e', 43, false], ['#cta', 'e', 37, true], ['#art', 'e', 40, false], ['#art', 'e', 37, false], ['#art', 'w', -37, false]]) {
  const page = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage()
  await page.goto(url)
  await page.locator('[data-sample-card="landing"]').click()
  await page.waitForFunction(() => !!document.querySelector('iframe[title="Preview"]')?.contentDocument?.querySelector('#cta'))
  const settle = async () => { await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]')) }
  await settle()
  const f = await page.locator('iframe[title="Preview"]').boundingBox()
  const b0 = await edge(page, sel)
  await page.mouse.click(f.x + b0.left + b0.width / 2, f.y + b0.top + Math.min(12, 6))
  if (await page.locator('[role=tab]').count()) await page.getByRole('tab', { name: 'Layout' }).click()
  await page.getByRole('button', { name: 'Snap', exact: true }).click()
  const hb = await page.locator(`[data-handle="${handle}"]`).boundingBox()
  const p = { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 }
  await page.mouse.move(p.x, p.y)
  if (alt) await page.keyboard.down('Alt')
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(p.x + (dx * i) / 12, p.y)
  await page.mouse.up()
  if (alt) await page.keyboard.up('Alt')
  await settle()
  const b1 = await edge(page, sel)
  const key = handle === 'e' ? 'right' : 'left'
  const raw = b0[key] + dx
  const near = Math.round(raw / 8) * 8
  const moved = Math.abs(b1[key] - b0[key]) > 0.5
  rows.push({ sel, handle, dx, alt, before: b0[key], after: b1[key], raw, near, moved, onGrid: Math.abs(b1[key] - near) <= 0.5, fixed: !moved })
  await page.context().close()
}
for (const r of rows) {
  const claim = r.sel === '#cta' ? (r.alt ? 'edge follows the pointer (Alt skips snap)' : `edge lands on the nearest line (${r.near})`) : r.handle === 'e' ? 'right edge keeps its place' : 'left edge (informational)'
  const ok = r.sel === '#cta' ? (r.alt ? Math.abs(r.after - r.raw) <= 1.5 : r.onGrid) : r.handle === 'e' ? r.fixed : true
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${r.sel} ${r.handle} handle ${r.dx} px${r.alt ? ' with Alt' : ''}: ${r.handle === 'e' ? 'right' : 'left'} edge ${r.before.toFixed(2)} -> ${r.after.toFixed(2)}; ${claim}`)
}
const A = rows.filter((r) => r.sel === '#cta' && !r.alt).every((r) => r.onGrid)
const B = rows.filter((r) => r.sel === '#art' && r.handle === 'e').every((r) => r.fixed)
console.log(`\nA (a left-anchored element's dragged edge lands on a grid line): ${A ? 'verified' : 'NOT verified'}\nB (an element fixed to the right of its row keeps its right edge): ${B ? 'verified' : 'NOT verified'}`)
await b.close()
process.exit(A && B ? 0 : 1)
