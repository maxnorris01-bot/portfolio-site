// Headless screenshots of the UI Editor page for Max's review of the look (never committed): the empty state, each sample, an element selected
// with its handles, the Phone view with Link off and a dot showing, a refusal message and Review unlinked open, at 1440x900 and 390x844.
//   node scripts/ui-editor-gate/screenshots.mjs --url http://127.0.0.1:4173/ui-editor [--out dir]
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

let chromium
try {
  const require = createRequire(import.meta.url)
  const entry = require.resolve('playwright', process.env.PLAYWRIGHT_DIR ? { paths: [process.env.PLAYWRIGHT_DIR] } : undefined)
  ;({ chromium } = require(entry))
} catch {
  console.error('needs Playwright with Chromium (set PLAYWRIGHT_DIR).')
  process.exit(2)
}
const args = process.argv.slice(2)
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined)
const url = opt('--url')
const out = opt('--out') ?? process.env.UI_SHOTS_OUT
if (!url || !out) { console.error('give --url and --out (or UI_SHOTS_OUT)'); process.exit(2) }
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const settle = async (page) => {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'))
}
const centre = (page, sel) => page.evaluate((s) => { const f = document.querySelector('iframe[title="Preview"]'); const fr = f.getBoundingClientRect(); const b = f.contentDocument.querySelector(s).getBoundingClientRect(); return { x: fr.left + b.left + b.width / 2, y: fr.top + b.top + b.height / 2 } }, sel)
const inset = (page, sel) => page.evaluate((s) => { const f = document.querySelector('iframe[title="Preview"]'); const fr = f.getBoundingClientRect(); const b = f.contentDocument.querySelector(s).getBoundingClientRect(); return { x: fr.left + b.left + 12, y: fr.top + b.top + 12 } }, sel)
const pick = async (page, sel, where = centre) => {
  let p = await where(page, sel)
  // The window must show the point for a real mouse to reach it: scroll the page, then measure again.
  const vh = page.viewportSize().height
  if (p.y > vh - 80 || p.y < 80) { await page.evaluate((dy) => window.scrollBy(0, dy), p.y - vh / 2); p = await where(page, sel) }
  await page.mouse.click(p.x, p.y); await settle(page)
}
const pickSample = async (page, id) => { await page.locator('[data-editor]').first().waitFor(); const samples = page.getByRole('button', { name: 'Samples', exact: true }); if (!(await page.locator('[data-sample-card]').count()) && (await samples.count())) await samples.click(); if (await page.locator('[data-sample-card]').count()) await page.locator(`[data-sample-card="${id}"]`).click(); else await page.getByLabel('Sample', { exact: true }).selectOption(id) }
const choose = async (page, id) => { await pickSample(page, id); await page.waitForFunction(() => (document.querySelector('iframe[title="Preview"]')?.contentDocument?.documentElement?.getElementsByTagName('*').length ?? 0) > 3); await settle(page) }

for (const [w, h] of [[1440, 900], [390, 844]]) {
  const tag = `${w}x${h}`
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, acceptDownloads: true })
  const page = await ctx.newPage()
  const shot = (name, full = false) => { console.log(tag, name); return page.screenshot({ path: join(out, `${tag}-${name}.png`), fullPage: full }) }
  await page.goto(url)
  await page.locator('[data-editor]').first().waitFor()
  await settle(page)
  await shot('01-empty')
  await shot('01-empty-fullpage', true)
  await choose(page, 'landing'); await shot('02-sample-landing')
  await pick(page, '#headline'); await shot('03-landing-selected-headline')
  await pick(page, '#art'); await shot('04-landing-selected-art-with-handles')
  await choose(page, 'email'); await shot('05-sample-email')
  await choose(page, 'chart'); await shot('06-sample-chart')
  await pick(page, '#bar-tue'); await shot('07-chart-selected')
  await choose(page, 'landing')
  await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Phone', exact: true }).click(); await settle(page)
  await pick(page, '#headline')
  await page.getByLabel('Link to Desktop').uncheck()
  const f = page.getByLabel('Font size', { exact: true }); await f.click({ clickCount: 3 }); await page.keyboard.type('40'); await page.keyboard.press('Enter'); await settle(page)
  await shot('08-phone-link-off-dot')
  await page.getByRole('button', { name: /^Review unlinked/ }).click(); await settle(page)
  await shot('09-review-unlinked-open')
  await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Desktop', exact: true }).click(); await settle(page)
  await pick(page, '#card-build', inset)
  await page.locator('[data-handle="e"]').first().scrollIntoViewIfNeeded()
  const hb = await page.locator('[data-handle="e"]').first().boundingBox()
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.mouse.down(); await page.mouse.move(hb.x + 40, hb.y + hb.height / 2, { steps: 8 }); await page.mouse.up(); await settle(page)
  await shot('10-refusal-message')
  await ctx.close()
}
await browser.close()
console.log('saved to', out)
