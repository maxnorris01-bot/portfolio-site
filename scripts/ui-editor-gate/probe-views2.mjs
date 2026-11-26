// Read-only probe (UI Editor views stage 2): the baseline the layout spec (H13) compares with, on the page as it is.
//   PLAYWRIGHT_DIR=<folder with playwright> node scripts/ui-editor-gate/probe-views2.mjs --url http://127.0.0.1:4173/ui-editor [--out file]
// With the landing sample open and the headline selected, in Desktop, Tablet (upright) and Phone (upright), at 1000, 1280, 1440 and 1920 px of host width: the x, width, top and height
// of every ribbon group, the number of bands, and the x, y, width and height of every button of the quick bar ("Editor controls"), its number of rows and the name of each button.
// Nothing is edited, so no view is customised. It writes nothing but the JSON it prints (and `--out`).
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
const { chromium } = require(require.resolve('playwright', process.env.PLAYWRIGHT_DIR ? { paths: [process.env.PLAYWRIGHT_DIR] } : undefined))
const args = process.argv.slice(2)
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d)
const url = opt('--url'), outFile = opt('--out')
if (!url) { console.error('give --url <page>'); process.exit(2) }
const browser = await chromium.launch({ headless: true })
const out = { url, widths: {} }
for (const w of [1000, 1280, 1440, 1920]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 1080 } })
  const page = await ctx.newPage()
  await page.goto(url)
  await page.locator('[data-sample-card="landing"]').click()
  await page.waitForFunction(() => !!document.querySelector('iframe[title="Preview"]')?.contentDocument?.querySelector('#headline'))
  await page.waitForTimeout(500)
  out.widths[w] = {}
  for (const view of ['Desktop', 'Tablet', 'Phone']) {
    if (view !== 'Desktop') { await page.getByRole('group', { name: 'View' }).getByRole('button', { name: view, exact: true }).click(); await page.waitForTimeout(600) }
    const p = await page.evaluate(() => { const f = document.querySelector('iframe[title="Preview"]'); const e = f.contentDocument.querySelector('#headline'); const r0 = e.getBoundingClientRect(); const fr0 = f.getBoundingClientRect(); window.scrollTo(0, Math.max(0, fr0.top + r0.top + scrollY - 300)); const fr = f.getBoundingClientRect(); const k = fr.width / f.offsetWidth; const r = e.getBoundingClientRect(); return { x: fr.left + (r.left + 12) * k, y: fr.top + (r.top + 12) * k } })
    await page.mouse.click(p.x, p.y); await page.waitForTimeout(350)
    await page.evaluate(() => scrollTo(0, 0))
    out.widths[w][view] = await page.evaluate(() => {
      const round = (n) => Math.round(n * 100) / 100
      const groups = [...document.querySelectorAll('[data-ribbon-group]')].map((g) => { const r = g.getBoundingClientRect(); return { id: g.getAttribute('data-ribbon-group'), x: round(r.left), width: round(r.width), top: round(r.top + scrollY), height: round(r.height) } })
      const bar = document.querySelector('[role=group][aria-label="Editor controls"]')
      const buttons = [...bar.querySelectorAll('button')].filter((b) => b.getClientRects().length).map((b) => { const r = b.getBoundingClientRect(); return { name: b.getAttribute('aria-label') || b.textContent.trim(), x: round(r.left), y: round(r.top + scrollY), width: round(r.width), height: round(r.height) } })
      const br = bar.getBoundingClientRect()
      return { ribbonBands: new Set(groups.map((g) => Math.round(g.top))).size, groups, bar: { x: round(br.left), y: round(br.top + scrollY), width: round(br.width), height: round(br.height), rows: new Set(buttons.map((b) => Math.round(b.y / 10))).size, buttons } }
    })
  }
  await ctx.close()
}
await browser.close()
const text = JSON.stringify(out, null, 1)
if (outFile) writeFileSync(outFile, text + '\n')
console.log(`recorded ${Object.keys(out.widths).length} widths`)
