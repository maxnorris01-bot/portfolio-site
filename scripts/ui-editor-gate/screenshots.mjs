// Headless screenshots of the UI Editor page for Max's review of the look (never committed): the empty state, each sample with an element selected (the ribbon and
// the status line at the top of the window), Tablet view-only, the Sides popover, the Phone view with Link off and a dot showing, Review unlinked open and a refusal
// message, at 1920x1080, 1440x900, 1280x800 and 390x844.
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
// Scale-aware (round 1): a device that does not fit the window is drawn smaller, so preview px times k are screen px.
const where = (page, sel, at) => page.evaluate(([s, a]) => { const f = document.querySelector('iframe[title="Preview"]'); const fr = f.getBoundingClientRect(); const k = f.offsetWidth ? fr.width / f.offsetWidth : 1; const b = f.contentDocument.querySelector(s).getBoundingClientRect(); return a === 'inset' ? { x: fr.left + (b.left + 12) * k, y: fr.top + (b.top + 12) * k } : { x: fr.left + (b.left + b.width / 2) * k, y: fr.top + (b.top + b.height / 2) * k } }, [sel, at])
const centre = (page, sel) => where(page, sel, 'centre')
const inset = (page, sel) => where(page, sel, 'inset')
const pick = async (page, sel, where = centre) => {
  let p = await where(page, sel)
  // The window must show the point for a real mouse to reach it: scroll the page, then measure again.
  const vh = page.viewportSize().height
  if (p.y > vh - 80 || p.y < 80) { await page.evaluate((dy) => window.scrollBy(0, dy), p.y - vh / 2); p = await where(page, sel) }
  await page.mouse.click(p.x, p.y); await settle(page)
}
const pickSample = async (page, id) => { await page.locator('[data-editor]').first().waitFor(); const samples = page.getByRole('button', { name: 'Samples', exact: true }); if (!(await page.locator('[data-sample-card]').count()) && (await samples.count())) await samples.click(); if (await page.locator('[data-sample-card]').count()) await page.locator(`[data-sample-card="${id}"]`).click(); else await page.getByLabel('Sample', { exact: true }).selectOption(id) }
const choose = async (page, id) => { await pickSample(page, id); await page.waitForFunction(() => (document.querySelector('iframe[title="Preview"]')?.contentDocument?.documentElement?.getElementsByTagName('*').length ?? 0) > 3); await settle(page) }

for (const [w, h] of [[1920, 1080], [1440, 900], [1280, 800], [390, 844]]) {
  const tag = `${w}x${h}`
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, acceptDownloads: true })
  const page = await ctx.newPage()
  const shot = (name, full = false) => { console.log(tag, name); return page.screenshot({ path: join(out, `${tag}-${name}.png`), fullPage: full }) }
  await page.goto(url)
  await page.locator('[data-editor]').first().waitFor()
  await settle(page)
  // The quick bar at the top of the window, so a shot shows the bar, the strip, the ribbon and the status line (round 4).
  const top = () => page.evaluate(() => { const b = document.querySelector('.ue-bar'); if (b) window.scrollTo(0, Math.max(0, b.getBoundingClientRect().top + scrollY - 76)) })
  await shot('01-empty')
  await shot('01-empty-fullpage', true)
  await choose(page, 'landing')
  await pick(page, '#headline'); await top(); await shot('02-landing-selected-headline')
  await pick(page, '#art'); await top(); await shot('03-landing-selected-art-with-handles')
  await pick(page, '#card-build', w < 700 ? centre : inset) // the 1280 px page is drawn small in a 390 px window: a 12 px inset is 3 screen px there
  await page.getByRole('button', { name: 'Padding sides' }).click(); await settle(page); await top(); await shot('04-sides-popover-open')
  await page.keyboard.press('Escape')
  await choose(page, 'email'); await pick(page, '#hello'); await top(); await shot('05-email-selected')
  await choose(page, 'chart'); await pick(page, '#bar-tue'); await top(); await shot('06-chart-svg-selected')
  await choose(page, 'landing'); await pick(page, '#headline')
  await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Tablet', exact: true }).click(); await settle(page); await top(); await shot('07-tablet-view-only')
  await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Phone', exact: true }).click(); await settle(page)
  await pick(page, '#headline')
  await page.getByLabel('Link to Desktop').uncheck()
  const f = page.getByLabel('Font size', { exact: true }); await f.click({ clickCount: 3 }); await page.keyboard.type('40'); await page.keyboard.press('Enter'); await settle(page)
  await top(); await shot('08-phone-link-off-dot')
  await page.getByRole('button', { name: /^Review unlinked/ }).click(); await settle(page); await top()
  await shot('09-review-unlinked-open')
  await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Desktop', exact: true }).click(); await settle(page)
  await pick(page, '#card-build', w < 700 ? centre : inset)
  await page.locator('[data-handle="e"]').first().scrollIntoViewIfNeeded()
  const hb = await page.locator('[data-handle="e"]').first().boundingBox()
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.mouse.down(); await page.mouse.move(hb.x + 40, hb.y + hb.height / 2, { steps: 8 }); await page.mouse.up(); await settle(page)
  await top(); await shot('10-refusal-message')
  await ctx.close()
}
await browser.close()
console.log('saved to', out)
