// Read-only probe (views round 1, nudge fix 2): does the preview flash when an element is nudged or dragged, and what do the Nudge boxes show?
//   PLAYWRIGHT_DIR=<folder with playwright> node scripts/ui-editor-gate/probe-flash-views1.mjs --url http://127.0.0.1:4173/ui-editor [--view Desktop|Tablet|Phone]
// Opens the landing sample, selects the headline, clicks the Nudge X up arrow 5 times and drags the element once, with a frame recorder in the page: a requestAnimationFrame loop that notes, for
// EVERY frame, how many preview iframes are in the document and how many are visible (visibility not hidden, height above 0), their heights, the stage's height, the window's scroll position and
// whether the selection overlay exists; plus a MutationObserver that counts the iframes added and removed. Reports the flash frames (no visible preview iframe, or one of zero height), the stage
// height range, the scroll range, the most iframes at once, and the values of the Nudge boxes after each step. Writes nothing.
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require(require.resolve('playwright', process.env.PLAYWRIGHT_DIR ? { paths: [process.env.PLAYWRIGHT_DIR] } : undefined))
const args = process.argv.slice(2)
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d)
const url = opt('--url'), view = opt('--view', 'Desktop')
if (!url) { console.error('give --url <page>'); process.exit(2) }
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
const page = await ctx.newPage()
await page.goto(url)
await page.locator('[data-sample-card="landing"]').click()
await page.waitForFunction(() => !!document.querySelector('iframe[title="Preview"]')?.contentDocument?.querySelector('#headline'))
await page.waitForTimeout(500)
if (view !== 'Desktop') { await page.getByRole('group', { name: 'View' }).getByRole('button', { name: view, exact: true }).click(); await page.waitForTimeout(500) }
const at = () => page.evaluate(() => { const f = document.querySelector('iframe[title="Preview"]'); const fr = f.getBoundingClientRect(); const k = fr.width / f.offsetWidth; const b = f.contentDocument.querySelector('#headline').getBoundingClientRect(); return { x: fr.left + (b.left + b.width / 2) * k, y: fr.top + (b.top + b.height / 2) * k } })
const p0 = await at(); await page.mouse.click(p0.x, p0.y); await page.waitForTimeout(400)
await page.evaluate(() => {
  const rec = { frames: [], added: 0, removed: 0, on: true }
  window.__rec = rec
  new MutationObserver((ms) => { for (const m of ms) { for (const n of m.addedNodes) if (n.nodeType === 1 && (n.matches?.('iframe') || n.querySelector?.('iframe'))) rec.added++; for (const n of m.removedNodes) if (n.nodeType === 1 && (n.matches?.('iframe') || n.querySelector?.('iframe'))) rec.removed++ } }).observe(document.body, { childList: true, subtree: true })
  const tick = () => {
    if (!rec.on) return
    const fs = [...document.querySelectorAll('iframe[title="Preview"]')]
    const vis = fs.filter((f) => getComputedStyle(f).visibility !== 'hidden' && f.getBoundingClientRect().height > 0 && f.getBoundingClientRect().left > -5000)
    const st = document.querySelector('.ue-frame')
    rec.frames.push({ n: fs.length, vis: vis.length, h: vis.map((f) => Math.round(f.getBoundingClientRect().height)), stage: st ? Math.round(st.getBoundingClientRect().height) : -1, sy: Math.round(scrollY), sel: !!document.querySelector('[data-selection]') })
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})
const boxes = () => page.evaluate(() => ({ x: document.querySelector('input[aria-label="Nudge X"]')?.value, y: document.querySelector('input[aria-label="Nudge Y"]')?.value }))
const steps = []
for (let i = 1; i <= 5; i++) {
  await page.locator('[data-ribbon] [data-spin="up"][data-for="Nudge X"]').click()
  await page.waitForTimeout(450)
  steps.push(`arrow ${i}: Nudge X shows "${(await boxes()).x}"`)
}
const p1 = await at()
await page.mouse.move(p1.x, p1.y); await page.mouse.down(); for (let i = 1; i <= 5; i++) await page.mouse.move(p1.x + 4 * i, p1.y + 4 * i); await page.mouse.up()
await page.waitForTimeout(600)
const b = await boxes(); steps.push(`drag 20,20: Nudge X "${b.x}", Nudge Y "${b.y}"`)
const rec = await page.evaluate(() => { window.__rec.on = false; return window.__rec })
const fr = rec.frames
const flash = fr.filter((f) => f.vis === 0 || f.h.some((h) => h === 0))
const stages = fr.map((f) => f.stage), sy = fr.map((f) => f.sy)
console.log(`view ${view}: ${fr.length} frames sampled; iframes added ${rec.added}, removed ${rec.removed}`)
console.log(`flash frames (no visible preview iframe, or a visible one of zero height): ${flash.length}`)
console.log(`frames with no selection overlay: ${fr.filter((f) => !f.sel).length}; most iframes at once ${Math.max(...fr.map((f) => f.n))}, most visible ${Math.max(...fr.map((f) => f.vis))}`)
console.log(`stage height ${Math.min(...stages)}..${Math.max(...stages)}; scroll ${Math.min(...sy)}..${Math.max(...sy)}`)
for (const s of steps) console.log('  ' + s)
await browser.close()
