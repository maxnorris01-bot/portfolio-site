// Checks beyond the 20 scored actions (not part of the pass line): Paste, Upload and their refusals and warnings, the confirm before
// discarding edits, Escape cancelling a drag, arrow-key nudging, Ctrl/Cmd-Z, the Tablet view, the 44 px hit areas on a phone, no network
// request from the page, and the preview staying a scripts-off sandbox. Run against the built page:
//   node scripts/ui-editor-gate/extras.mjs --url http://127.0.0.1:4173/ui-editor
import { createRequire } from 'node:module'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let chromium
try {
  const require = createRequire(import.meta.url)
  ;({ chromium } = require(require.resolve('playwright', process.env.PLAYWRIGHT_DIR ? { paths: [process.env.PLAYWRIGHT_DIR] } : undefined)))
} catch { console.error('needs Playwright (set PLAYWRIGHT_DIR).'); process.exit(2) }
const url = process.argv[process.argv.indexOf('--url') + 1]
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`) }
const settle = async (page) => { await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]')) }
const tmp = mkdtempSync(join(tmpdir(), 'ue-'))
const file = (name, text) => { const p = join(tmp, name); writeFileSync(p, text); return p }
const status = (page) => page.getByRole('status', { name: 'Edit result' }).innerText()
const point = (page, sel) => page.evaluate((s) => { const f = document.querySelector('iframe[title="Preview"]'); const fr = f.getBoundingClientRect(); const b = f.contentDocument.querySelector(s).getBoundingClientRect(); return { x: fr.left + b.left + b.width / 2, y: fr.top + b.top + b.height / 2 } }, sel)
const pickSample = async (page, id) => { await page.locator('[data-editor]').first().waitFor(); const samples = page.getByRole('button', { name: 'Samples', exact: true }); if (!(await page.locator('[data-sample-card]').count()) && (await samples.count())) await samples.click(); if (await page.locator('[data-sample-card]').count()) await page.locator(`[data-sample-card="${id}"]`).click(); else await page.getByLabel('Sample', { exact: true }).selectOption(id) }
const open = async (ctx) => { const page = await ctx.newPage(); await page.goto(url); await page.locator('[data-editor]').first().waitFor(); return page }

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true })
// The site's shared font stylesheet is on every page, not the editor's, so it is not counted.
const requests = []
ctx.on('request', (r) => { const u = new URL(r.url()); if (u.protocol !== 'blob:' && u.protocol !== 'data:' && u.hostname !== '127.0.0.1' && u.hostname !== 'localhost' && !/^fonts\.g(oogleapis|static)\.com$/.test(u.hostname)) requests.push(r.url()) })
let page = await open(ctx)

// Upload: html + css matched by name; a script warning; refusals
await page.locator('input[type=file]').setInputFiles([file('page.html', '<!doctype html><link rel="stylesheet" href="css/site.css"><script>1</script><h1 id="t">Hi</h1>'), file('site.css', 'h1 { font-size: 30px; }\n')])
await page.waitForFunction(() => !!document.querySelector('iframe[title="Preview"]')?.contentDocument?.querySelector('#t'))
await settle(page)
check('Upload opens an HTML file with its stylesheet', (await page.getByLabel('File', { exact: true }).locator('option').allInnerTexts()).join() === 'page.html,css/site.css')
check('Upload warns about a script', /script/i.test(await page.locator('.ue-warnings').innerText()))
await page.locator('input[type=file]').setInputFiles([file('x.png', 'x')])
check('Upload refuses another type, plainly', /Only \.html/.test(await status(page)))
await page.locator('input[type=file]').setInputFiles([file('a.html', '<p>a</p>'), file('b.html', '<p>b</p>')])
check('Upload refuses two pages', /one HTML or SVG/.test(await status(page)))
await page.locator('input[type=file]').setInputFiles([{ name: 'big.html', mimeType: 'text/html', buffer: Buffer.alloc(1_100_000, 'a') }])
check('Upload refuses over 1 MB, and says so', /1 MB/.test(await status(page)))
await page.locator('input[type=file]').setInputFiles([file('page.html', '<link rel="stylesheet" href="missing.css"><p id="t">x</p>')])
await page.waitForFunction(() => !!document.querySelector('iframe[title="Preview"]')?.contentDocument?.querySelector('#t'))
check('Upload warns about a stylesheet that was not supplied', /missing\.css/.test(await page.locator('.ue-warnings').innerText()))

// Paste
await page.getByRole('button', { name: 'Paste', exact: true }).click()
await page.getByLabel('HTML or SVG', { exact: true }).fill('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect id="r" width="40" height="20" fill="red"/></svg>')
await page.getByRole('button', { name: 'Open pasted code' }).click()
await page.waitForFunction(() => !!document.querySelector('iframe[title="Preview"]')?.contentDocument?.querySelector('#r'))
await settle(page)
check('Paste opens an SVG', (await page.getByLabel('File', { exact: true }).inputValue()) === 'pasted.svg')

// Scripts stay off; nothing injected into the preview
const sandbox = await page.evaluate(() => document.querySelector('iframe[title="Preview"]').getAttribute('sandbox'))
check('the preview is sandbox="allow-same-origin" (scripts off)', sandbox === 'allow-same-origin', sandbox ?? '')

// Landing: keyboard nudge, Ctrl-Z, Escape, confirm, Tablet
await pickSample(page, 'landing')
await page.waitForFunction(() => !!document.querySelector('iframe[title="Preview"]')?.contentDocument?.querySelector('#cta'))
await settle(page)
const p = await point(page, '#cta')
await page.mouse.click(p.x, p.y); await settle(page)
const left = () => page.evaluate(() => document.querySelector('iframe[title="Preview"]').contentDocument.querySelector('#cta').getBoundingClientRect().left)
const l0 = await left()
await page.locator('.ue-overlay').focus()
for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
await page.keyboard.press('Shift+ArrowRight')
await settle(page)
check('arrow keys nudge by 1 px, Shift by 10 px (3 + 10 = 13)', Math.abs((await left()) - l0 - 13) < 0.6, `moved ${(await left()) - l0}`)
await page.getByRole('button', { name: 'Undo', exact: true }).click(); await settle(page)
check('nudges are one edit: a single Undo takes all 13 px back', Math.abs((await left()) - l0) < 0.6)
await page.keyboard.press('Control+Shift+z'); await settle(page)
check('Ctrl-Shift-Z redoes while the editor has focus', Math.abs((await left()) - l0 - 13) < 0.6, `moved ${(await left()) - l0}, redo ${await page.getByRole('button', { name: 'Redo', exact: true }).isEnabled() ? 'still enabled' : 'used'}`)
await page.keyboard.press('Control+z'); await settle(page)
check('Ctrl-Z undoes', Math.abs((await left()) - l0) < 0.6)
const q = await point(page, '#cta')
await page.mouse.move(q.x, q.y); await page.mouse.down(); await page.mouse.move(q.x + 60, q.y + 30, { steps: 10 })
check('a drag shows feedback in the host layer only', (await page.locator('.ue-ghost').count()) === 1 && Math.abs((await left()) - l0) < 0.6)
await page.keyboard.press('Escape'); await page.mouse.up(); await settle(page)
check('Escape cancels a drag: no edit, no ghost', (await page.locator('.ue-ghost').count()) === 0 && Math.abs((await left()) - l0) < 0.6 && await page.getByRole('button', { name: 'Undo', exact: true }).isDisabled())
await page.keyboard.press('ArrowRight'); await settle(page)
await pickSample(page, 'email')
check('choosing a sample with unsaved edits asks first', await page.getByRole('button', { name: 'Discard edits' }).isVisible())
await page.getByRole('button', { name: 'Keep editing' }).click()
check('Keep editing keeps the page and the edit', (await page.getByRole('button', { name: 'Undo', exact: true }).isEnabled()) && Math.abs((await left()) - l0 - 1) < 0.6)
await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Tablet', exact: true }).click(); await settle(page)
check('Tablet: handles and fields are off, with one plain sentence', (await page.locator('[data-handle]').count()) === 0 && (await page.getByLabel('Font size', { exact: true }).isDisabled()) && /view-only/.test(await page.locator('.ue-note').innerText()))
await page.close()

// A phone: every control is at least 44 CSS px tall
const phone = await browser.newContext({ viewport: { width: 390, height: 844 } })
const pp = await phone.newPage()
await pp.goto(url); await pickSample(pp, 'landing')
await pp.waitForFunction(() => !!document.querySelector('iframe[title="Preview"]')?.contentDocument?.querySelector('#headline')); await settle(pp)
const small = await pp.evaluate(() => [...document.querySelectorAll('.ue-bar button, .ue-bar select, .ue-panel input, .ue-panel select, .ue-panel button')].filter((e) => e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().height < 43.5).map((e) => (e.getAttribute('aria-label') || e.textContent || e.id).trim().slice(0, 24)))
check('on a phone every tappable control is at least 44 px tall', small.length === 0, small.join(', '))
check('no horizontal page scroll on a phone', await pp.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
await phone.close()

check('the page made no request to any other site', requests.length === 0, requests.join(' '))
await browser.close()
console.log(`\n${results.filter(Boolean).length} of ${results.length} checks passed`)
process.exit(results.every(Boolean) ? 0 : 1)
