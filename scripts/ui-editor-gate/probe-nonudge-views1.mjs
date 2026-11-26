// Read-only probe (views round 1, fix 3: the Nudge boxes are removed): records the baseline the Q specs compare with, on the page as it is.
//   PLAYWRIGHT_DIR=<folder with playwright> node scripts/ui-editor-gate/probe-nonudge-views1.mjs --url http://127.0.0.1:4173/ui-editor [--out file]
// (1) the buttons in the Arrange group and which are enabled, for a first, a middle and a last card (#card-plan, #card-build, #card-ship) of the landing sample in Desktop, Tablet and Phone;
// (2) the SHA-1 of the exported files after Move up / Move down scenarios (a Download of each file, read from disk);
// (3) the ribbon: how many bands, and the x, width and top of every group at 1000, 1280, 1440 and 1920 px with the headline selected; whether the Nudge boxes exist (they do, on this page).
// It writes nothing but the JSON it prints (and `--out`).
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { writeFileSync, readFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
const { chromium } = require(require.resolve('playwright', process.env.PLAYWRIGHT_DIR ? { paths: [process.env.PLAYWRIGHT_DIR] } : undefined))
const args = process.argv.slice(2)
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d)
const url = opt('--url'), outFile = opt('--out')
if (!url) { console.error('give --url <page>'); process.exit(2) }
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const sha = (t) => createHash('sha1').update(t).digest('hex')
async function open(width = 1920) {
  const ctx = await browser.newContext({ viewport: { width, height: 1080 }, acceptDownloads: true })
  const page = await ctx.newPage()
  await page.goto(url)
  await page.locator('[data-sample-card="landing"]').click()
  await page.waitForFunction(() => !!document.querySelector('iframe[title="Preview"]')?.contentDocument?.querySelector('#headline'))
  await page.waitForTimeout(500)
  return { ctx, page }
}
const select = async (page, sel) => {
  const p = await page.evaluate((s) => { const f = document.querySelector('iframe[title="Preview"]'); const e = f.contentDocument.querySelector(s); const r0 = e.getBoundingClientRect(); const fr0 = f.getBoundingClientRect(); const y = fr0.top + r0.top + scrollY - 300; window.scrollTo(0, Math.max(0, y)); const fr = f.getBoundingClientRect(); const k = fr.width / f.offsetWidth; const r = e.getBoundingClientRect(); return { x: fr.left + (r.left + 12) * k, y: fr.top + (r.top + 12) * k } }, sel)
  await page.mouse.click(p.x, p.y); await page.waitForTimeout(350)
}
const view = async (page, v) => { if (v !== 'Desktop') { await page.getByRole('group', { name: 'View' }).getByRole('button', { name: v, exact: true }).click(); await page.waitForTimeout(500) } }
const arrange = (page) => page.evaluate(() => { const g = document.querySelector('[data-ribbon-group="position"]'); return { name: g.getAttribute('aria-label'), buttons: [...g.querySelectorAll('button')].map((b) => ({ name: b.getAttribute('aria-label') || b.textContent.trim(), disabled: b.disabled })), inputs: g.querySelectorAll('input').length } })
async function exportHash(page) {
  const files = {}
  const done = new Promise((res) => { const got = []; page.on('download', async (d) => { got.push(d); if (got.length === 2) res(got) }) })
  await page.getByRole('button', { name: 'Download', exact: true }).click()
  for (const d of await done) files[d.suggestedFilename()] = readFileSync(await d.path(), 'utf8')
  return sha(Object.keys(files).sort().map((k) => k + '\n' + files[k]).join('\n---\n'))
}
const out = { url, arrange: {}, moves: {}, ribbon: {} }
for (const v of ['Desktop', 'Tablet', 'Phone']) for (const [label, sel] of [['first', '#card-plan'], ['middle', '#card-build'], ['last', '#card-ship']]) {
  const { ctx, page } = await open(); await select(page, sel); await view(page, v)
  out.arrange[`${v} ${label} ${sel}`] = await arrange(page); await ctx.close()
}
for (const [name, v, sel, btn] of [['desktop card-build up', 'Desktop', '#card-build', 'Move up'], ['desktop card-plan down', 'Desktop', '#card-plan', 'Move down'], ['desktop card-ship up', 'Desktop', '#card-ship', 'Move up'], ['tablet art up', 'Tablet', '#art', 'Move up'], ['phone art up', 'Phone', '#art', 'Move up'], ['phone card-build up', 'Phone', '#card-build', 'Move up']]) {
  const { ctx, page } = await open(); await select(page, sel); await view(page, v)
  const b = page.locator('[data-ribbon-group="position"]').getByRole('button', { name: btn, exact: true })
  if (await b.isDisabled()) { out.moves[name] = { disabled: true }; await ctx.close(); continue }
  await b.click(); await page.waitForTimeout(600)
  out.moves[name] = { status: (await page.getByRole('status', { name: 'Edit result' }).innerText()).replace(/\s+/g, ' '), sha1: await exportHash(page) }
  await ctx.close()
}
for (const w of [1000, 1280, 1440, 1920]) {
  const { ctx, page } = await open(w); await select(page, '#headline'); await page.waitForTimeout(300)
  out.ribbon[w] = await page.evaluate(() => {
    const gs = [...document.querySelectorAll('[data-ribbon-group]')].map((g) => { const r = g.getBoundingClientRect(); return { id: g.getAttribute('data-ribbon-group'), name: g.getAttribute('aria-label'), x: Math.round(r.left * 100) / 100, width: Math.round(r.width * 100) / 100, top: Math.round((r.top + scrollY) * 100) / 100, height: Math.round(r.height * 100) / 100 } })
    const rb = document.querySelector('[data-ribbon]').getBoundingClientRect()
    return { bands: new Set(gs.map((g) => Math.round(g.top))).size, ribbon: { x: Math.round(rb.left), width: Math.round(rb.width), height: Math.round(rb.height) }, groups: gs, nudgeInputs: document.querySelectorAll('input[aria-label^="Nudge"]').length }
  })
  await page.screenshot({ path: (outFile ? outFile.replace(/\.json$/, '') : '/dev/null') + `-ribbon-${w}.png`, clip: { x: 0, y: Math.max(0, out.ribbon[w].groups[0].top - 40), width: w, height: Math.min(300, 1080) } }).catch(() => {})
  await ctx.close()
}
await browser.close()
const text = JSON.stringify(out, null, 1)
if (outFile) writeFileSync(outFile, text + '\n')
console.log(text)
