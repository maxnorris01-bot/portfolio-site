// Read-only probe (gate flakes round): what differs in the four toolbar icons in L07's pair of screenshots?
//   PLAYWRIGHT_DIR=<folder with playwright> node scripts/ui-editor-gate/probe-l07-icons.mjs --url http://127.0.0.1:4173/ui-editor [--n 10] [--out dir]
// Replays L07's Tablet step (landing, Tablet, click the headline, scroll the preview to 70, the host to 0) and takes the band above the screen the way `outlineClipped` does. Variants, each run --n times with a fresh page:
//   shown-hidden   the outline shown, then hidden (L07 as it is)        hidden-shown   the same pair in the other order
//   same-same      two shots, nothing toggled (the noise floor)          away           the mouse moved to the page's corner first, then shown-hidden
//   notrans        transitions and animations switched off by an injected style, then shown-hidden
//   wait600        a wait of 600 ms before the first shot, then shown-hidden
//   warm           before the pair, the outline is hidden and shown once with a throwaway screenshot in between (a repaint the pair does not use), then shown-hidden
//   unrelated      the pair with the outline untouched and a style written on an unrelated element (the page's <html>) between the shots
//   triple         shown, hidden, shown again: the three shots compared (A-B, B-C, A-C)
//   opacity, display, offscreen   the outline hidden by opacity 0, display none, or moved 20000 px away, instead of visibility hidden
// For each pair: the number of differing pixels (channel sum above 40, as L07), their box, and the state of the four view buttons (:hover, focus, :active, aria-pressed), the animations running on the page, the mouse position.
// Writes nothing but the PNGs of the first differing pair of each variant (with --out) and the JSON printed.
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
const { chromium } = require(require.resolve('playwright', process.env.PLAYWRIGHT_DIR ? { paths: [process.env.PLAYWRIGHT_DIR] } : undefined))
const args = process.argv.slice(2)
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d)
const url = opt('--url'), N = Number(opt('--n', '10')), outDir = opt('--out')
if (!url) { console.error('give --url <page>'); process.exit(2) }
if (outDir) mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const VARIANTS = (opt('--variants') ?? 'shown-hidden,hidden-shown,same-same,away,notrans,wait600,opacity,display,offscreen').split(',')
const HIDE = { opacity: ['opacity', '0', ''], display: ['display', 'none', ''], offscreen: ['translate', '20000px 0', ''] }
const result = {}
const decode = (page, a, b) => page.evaluate(async ([a, b]) => {
  const px = async (s) => { const bmp = await createImageBitmap(await (await fetch('data:image/png;base64,' + s)).blob()); const c = new OffscreenCanvas(bmp.width, bmp.height); const x = c.getContext('2d'); x.drawImage(bmp, 0, 0); return [x.getImageData(0, 0, bmp.width, bmp.height).data, bmp.width] }
  const [A, w] = await px(a), [B] = await px(b); let k = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1
  for (let i = 0; i < A.length; i += 4) if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > 40) { k++; const q = i / 4; x0 = Math.min(x0, q % w); x1 = Math.max(x1, q % w); y0 = Math.min(y0, Math.floor(q / w)); y1 = Math.max(y1, Math.floor(q / w)) }
  return { k, box: k ? [x0, x1, y0, y1] : null }
}, [a.toString('base64'), b.toString('base64')])
for (const v of VARIANTS) {
  const rows = []
  let saved = false
  for (let i = 0; i < N; i++) {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
    const page = await ctx.newPage()
    await page.goto(url); await page.locator('[data-sample-card="landing"]').click()
    await page.waitForFunction(() => !!document.querySelector('iframe[title="Preview"]')?.contentDocument?.querySelector('#headline'))
    await page.getByRole('group', { name: 'View' }).getByRole('button', { name: /^Tablet/ }).click()
    if (v === 'notrans') await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' })
    const p = await page.evaluate(() => { const f = document.querySelector('iframe[title="Preview"]'); const fr = f.getBoundingClientRect(); const k = fr.width / f.offsetWidth; const r = f.contentDocument.querySelector('#headline').getBoundingClientRect(); return { x: fr.left + (r.left + r.width / 2) * k, y: fr.top + (r.top + r.height / 2) * k } })
    await page.mouse.click(p.x, p.y)
    await page.evaluate(() => { document.querySelector('iframe[title="Preview"]').contentWindow.scrollTo(0, 70); window.scrollTo(0, 0) })
    if (v === 'away') await page.mouse.move(3, 3)
    if (v === 'wait600') await page.waitForTimeout(600)
    const g = await page.evaluate(() => { const r = document.querySelector('iframe[title="Preview"]').getBoundingClientRect(); return { left: r.left, top: r.top, w: r.width } })
    const clip = { x: g.left, y: Math.max(0, g.top - 8 - 500), width: g.w, height: 500 }
    const [prop, on, off] = HIDE[v] ?? ['visibility', 'hidden', '']
    const hide = (h) => page.evaluate(([h, prop, on, off]) => { for (const e of document.querySelectorAll('[data-selection]')) e.style[prop] = h ? on : off }, [h, prop, on, off])
    let A, B
    if (v === 'warm') { await hide(true); await page.screenshot({ clip }); await hide(false) }
    if (v === 'unrelated') { A = await page.screenshot({ clip }); await page.evaluate(() => { document.documentElement.style.setProperty('--probe', String(Math.random())) }); B = await page.screenshot({ clip }) }
    else if (v === 'triple') { A = await page.screenshot({ clip }); await hide(true); B = await page.screenshot({ clip }); await hide(false); const C = await page.screenshot({ clip }); const ab = await decode(page, A, B), bc = await decode(page, B, C), ac = await decode(page, A, C); rows.push({ k: ab.k, tripleAB: ab.k, tripleBC: bc.k, tripleAC: ac.k }); await ctx.close(); continue }
    else if (v === 'hidden-shown') { await hide(true); A = await page.screenshot({ clip }); await hide(false); B = await page.screenshot({ clip }) }
    else if (v === 'same-same') { A = await page.screenshot({ clip }); B = await page.screenshot({ clip }) }
    else { A = await page.screenshot({ clip }); await hide(true); B = await page.screenshot({ clip }); await hide(false) }
    const d = await decode(page, A, B)
    const state = await page.evaluate(() => ({
      buttons: [...document.querySelectorAll('[data-view-button]')].map((b) => `${b.textContent.trim()}${b.matches(':hover') ? ' :hover' : ''}${b.matches(':focus') ? ' :focus' : ''}${b.matches(':focus-visible') ? ' :focus-visible' : ''}${b.matches(':active') ? ' :active' : ''}${b.getAttribute('aria-pressed') ? ' pressed=' + b.getAttribute('aria-pressed') : ''}`),
      animations: document.getAnimations().map((a) => `${a.constructor.name}:${a.playState}:${a.effect?.target?.className?.toString().slice(0, 30) ?? ''}`),
      active: document.activeElement ? document.activeElement.localName + '.' + String(document.activeElement.className).slice(0, 30) : null,
    }))
    rows.push({ k: d.k, box: d.box, mouse: v === 'away' ? [3, 3] : [Math.round(p.x), Math.round(p.y)], ...(d.k ? state : {}) })
    if (d.k && outDir && !saved) { saved = true; writeFileSync(`${outDir}/${v}-A.png`, A); writeFileSync(`${outDir}/${v}-B.png`, B) }
    await ctx.close()
  }
  result[v] = { ...(v === 'triple' ? { AB: rows.map((r) => r.tripleAB), BC: rows.map((r) => r.tripleBC), AC: rows.map((r) => r.tripleAC) } : {}), runsWithDiff: rows.filter((r) => r.k > 0).length, of: N, pixels: rows.map((r) => r.k), example: rows.find((r) => r.k > 0) ?? null }
}
await browser.close()
console.log(JSON.stringify(result, null, 1))
