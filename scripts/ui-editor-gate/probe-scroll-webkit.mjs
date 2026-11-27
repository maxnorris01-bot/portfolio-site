// Read-only probe (UI Editor, the scroll fix 2): does the selection outline follow a scrolling Phone preview in WebKit as it does in Chromium?
//   PLAYWRIGHT_DIR=<folder with playwright> node scripts/ui-editor-gate/probe-scroll-webkit.mjs --url http://127.0.0.1:4173/ui-editor [--browsers chromium,webkit] [--out file]
// For each browser: the landing sample, Phone upright, the headline and a lower element (#card-plan h3) selected in turn; the preview is scrolled by (1) the real mouse wheel over it in 16 small steps
// (a trackpad's burst), (2) `scrollTo` of the preview window, (3) PageDown on the pointer layer. After each, at the next animation frame, after 100 ms and after 500 ms, the outline's box (`[data-selection]`)
// is compared with the element's real box (the iframe's box plus the element's box times the scale): the largest difference of left, top, width, height, in px. The probe also logs, with timestamps, every
// `wheel` event the page receives (window, capture) and every `scroll` event of the preview document (a listener put on it from the host window), and sums them up: how many, when the first scroll event
// came after the first wheel event, the longest gap, and the last scroll event after the last wheel. It writes nothing but the JSON it prints (and `--out`).
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
const pw = require(require.resolve('playwright', process.env.PLAYWRIGHT_DIR ? { paths: [process.env.PLAYWRIGHT_DIR] } : undefined))
const args = process.argv.slice(2)
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d)
const url = opt('--url'), outFile = opt('--out'), browsers = opt('--browsers', 'chromium,webkit').split(',')
if (!url) { console.error('give --url <page>'); process.exit(2) }
const rnd = (n) => Math.round(n * 10) / 10
const result = {}
for (const name of browsers) {
  let browser
  try { browser = await pw[name].launch({ headless: true }) } catch (e) { result[name] = { unavailable: String(e).split('\n')[0] }; continue }
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  // host-side event log: wheel on the window (capture), scroll on every preview document once its frame has loaded
  await ctx.addInitScript(() => {
    if (window !== window.top) return
    const log = (window.__log = [])
    const t0 = performance.now()
    window.addEventListener('wheel', (e) => log.push({ t: performance.now() - t0, what: 'wheel', dy: e.deltaY }), { capture: true, passive: true })
    const hook = (f) => { const d = f.contentDocument; if (!d || d.__hooked) return; d.__hooked = true; d.addEventListener('scroll', () => log.push({ t: performance.now() - t0, what: 'scroll', y: Math.round(f.contentWindow.scrollY) }), { capture: true, passive: true }); f.contentWindow.addEventListener('scroll', () => log.push({ t: performance.now() - t0, what: 'windowscroll', y: Math.round(f.contentWindow.scrollY) }), { passive: true }) }
    new MutationObserver((ms) => { for (const r of ms) for (const n of r.addedNodes) if (n.nodeType === 1) for (const f of n.localName === 'iframe' ? [n] : n.querySelectorAll('iframe')) { hook(f); f.addEventListener('load', () => hook(f)) } }).observe(document, { childList: true, subtree: true })
  })
  const page = await ctx.newPage()
  const out = { inputs: {}, events: {} }
  try {
    await page.goto(url)
    await page.locator('[data-sample-card="landing"]').click()
    await page.waitForFunction(() => !!document.querySelector('iframe[title="Preview"]')?.contentDocument?.querySelector('#headline'))
    await page.waitForTimeout(500)
    await page.getByRole('group', { name: 'View' }).getByRole('button', { name: /^Phone/ }).click(); await page.waitForTimeout(700)
    const measure = (sel) => page.evaluate((s) => {
      const f = document.querySelector('iframe[title="Preview"]'); const fr = f.getBoundingClientRect(); const k = fr.width / f.offsetWidth
      const el = f.contentDocument.querySelector(s); const o = document.querySelector('[data-selection]')
      if (!el) return { error: 'no element' }
      if (!o) return { error: 'no outline' }
      const er = el.getBoundingClientRect(), r = o.getBoundingClientRect()
      return { d: Math.max(Math.abs(r.left - (fr.left + er.left * k)), Math.abs(r.top - (fr.top + er.top * k)), Math.abs(r.width - er.width * k), Math.abs(r.height - er.height * k)), y: Math.round(f.contentWindow.scrollY) }
    }, sel)
    const select = async (sel) => {
      const p = await page.evaluate((s) => { const f = document.querySelector('iframe[title="Preview"]'); const w = f.contentWindow; const el = f.contentDocument.querySelector(s); const r0 = el.getBoundingClientRect(); w.scrollTo(0, Math.max(0, r0.top + w.scrollY - 200)); const fr0 = f.getBoundingClientRect(); const r1 = el.getBoundingClientRect(); scrollTo(0, Math.max(0, fr0.top + r1.top + scrollY - 400)); const fr = f.getBoundingClientRect(); const k = fr.width / f.offsetWidth; const r = el.getBoundingClientRect(); return { x: fr.left + (r.left + r.width / 2) * k, y: fr.top + (r.top + r.height / 2) * k } }, sel)
      await page.mouse.click(p.x, p.y); await page.waitForTimeout(400)
      await page.evaluate(() => { document.querySelector('iframe[title="Preview"]').contentWindow.scrollTo(0, 0) }); await page.waitForTimeout(300)
    }
    const INPUTS = {
      'wheel x16 (dy 14)': async () => { const c = await page.evaluate(() => { const r = document.querySelector('iframe[title="Preview"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: Math.min(r.top + r.height / 2, innerHeight - 100) } }); await page.mouse.move(c.x, c.y); for (let i = 0; i < 16; i++) { await page.mouse.wheel(0, 14); await page.waitForTimeout(16) } },
      'scrollTo 120': async () => { await page.evaluate(() => document.querySelector('iframe[title="Preview"]').contentWindow.scrollTo(0, 120)) },
      'PageDown': async () => { await page.evaluate(() => document.querySelector('.ue-overlay')?.focus({ preventScroll: true })); await page.keyboard.press('PageDown') },
    }
    for (const sel of ['#headline', '#card-plan h3']) {
      await select(sel)
      for (const [iname, run] of Object.entries(INPUTS)) {
        await page.evaluate(() => { document.querySelector('iframe[title="Preview"]').contentWindow.scrollTo(0, 0) }); await page.waitForTimeout(400)
        const mark = await page.evaluate(() => window.__log.length)
        await run()
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)))
        const a = await measure(sel); await page.waitForTimeout(100); const b = await measure(sel); await page.waitForTimeout(400); const c = await measure(sel)
        out.inputs[`${sel} | ${iname}`] = a.error ? a.error : { frame: rnd(a.d), ms100: rnd(b.d), ms500: rnd(c.d), scrolledTo: c.y }
        const ev = await page.evaluate((m) => window.__log.slice(m), mark)
        const w = ev.filter((e) => e.what === 'wheel'), s = ev.filter((e) => e.what === 'scroll')
        out.events[`${sel} | ${iname}`] = { wheelEvents: w.length, scrollEvents: s.length, windowScrollEvents: ev.filter((e) => e.what === 'windowscroll').length, firstScrollAfterFirstWheelMs: w.length && s.length ? rnd(s[0].t - w[0].t) : null, lastScrollAfterLastWheelMs: w.length && s.length ? rnd(s[s.length - 1].t - w[w.length - 1].t) : null, longestScrollGapMs: s.length > 1 ? rnd(Math.max(...s.slice(1).map((e, i) => e.t - s[i].t))) : null }
      }
    }
  } catch (e) { out.error = String(e).split('\n')[0] }
  result[name] = out
  await browser.close()
}
const text = JSON.stringify(result, null, 1)
if (outFile) writeFileSync(outFile, text + '\n')
for (const [b, v] of Object.entries(result)) {
  console.log(`== ${b}${v.unavailable ? ': ' + v.unavailable : v.error ? ' error: ' + v.error : ''}`)
  for (const [k, x] of Object.entries(v.inputs ?? {})) console.log(`  ${k.padEnd(32)} ${typeof x === 'string' ? x : `outline off by ${x.frame} px at 1 frame, ${x.ms100} at 100 ms, ${x.ms500} at 500 ms (scrolled to ${x.scrolledTo})`} | ${JSON.stringify(v.events[k])}`)
}
