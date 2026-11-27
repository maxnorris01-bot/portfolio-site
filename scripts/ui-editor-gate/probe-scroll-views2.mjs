// Read-only probe (UI Editor, the scroll fix): does the selection outline follow the selected element when the preview is scrolled?
//   PLAYWRIGHT_DIR=<folder with playwright> node scripts/ui-editor-gate/probe-scroll-views2.mjs --url http://127.0.0.1:4173/ui-editor [--out file] [--rebuilds] [--only-rebuilds]
// For each sample (landing, email, chart) and view (Phone and Tablet upright and sideways, Desktop) and for two selected elements (one near the middle, one lower down) it scrolls the preview by
// (1) the mouse wheel over it, (2) the keyboard (PageDown, End, Space with the focus on the pointer layer), (3) a direct scrollTo of the preview's window; the scrollbar is not reachable (the pointer
// layer covers the frame) and is reported as such. After each scroll, in the next animation frame and after 200 ms, the outline's box (`[data-selection]`, host coordinates) is compared with the
// selected element's real box (the iframe's box plus the element's own box times the scale): the largest difference of left, top, width and height, in px. Also whether the outline sticks out
// of the device's screen. With --rebuilds (landing, Phone upright) the same sequence is repeated after a first edit, Undo, Redo, Phone to Tablet and back, a rotate and back, a view Reset (when the
// page has one), a Delete and an Insert, each of which rebuilds the preview; and the number of `scroll` listeners left on every preview document the page has dropped (CDP DOMDebugger), and on the live one.
// It writes nothing but the JSON it prints (and `--out`).
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
const { chromium } = require(require.resolve('playwright', process.env.PLAYWRIGHT_DIR ? { paths: [process.env.PLAYWRIGHT_DIR] } : undefined))
const args = process.argv.slice(2)
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d)
const url = opt('--url'), outFile = opt('--out'), rebuilds = args.includes('--rebuilds'), onlyRebuilds = args.includes('--only-rebuilds')
if (!url) { console.error('give --url <page>'); process.exit(2) }
const browser = await chromium.launch({ headless: true })
const SAMPLES = { landing: { ready: '#headline', picks: ['.lead', '#card-plan h3'] }, email: { ready: '#hello', picks: ['#pick-one', '#fine'] }, chart: { ready: '#bar-tue', picks: ['#bar-mon', '#bar-thu'] } }
const VIEWS = [['Desktop', false], ['Phone', false], ['Tablet', false], ['Phone', true], ['Tablet', true]]
const rnd = (n) => Math.round(n * 10) / 10
async function open(sample, count = false) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  // The scroll listeners are counted by the probe, from the host window only (a script of ours inside the sandboxed preview would change how it behaves): when a preview iframe has loaded,
  // the probe replaces addEventListener and removeEventListener on that frame's EventTarget with host-side wrappers that keep the net count of `scroll` listeners per target in `window.__sl`.
  if (count) await ctx.addInitScript(() => {
    if (window !== window.top) return
    const m = (window.__sl = new Map())
    const patch = (f) => {
      const w = f.contentWindow
      if (!w || w.__probed) return
      w.__probed = true
      const proto = w.EventTarget.prototype, add = proto.addEventListener, rem = proto.removeEventListener
      proto.addEventListener = function (type, l, o) { if (type === 'scroll' && l) m.set(this, (m.get(this) ?? 0) + 1); return add.call(this, type, l, o) }
      proto.removeEventListener = function (type, l, o) { if (type === 'scroll' && l && (m.get(this) ?? 0) > 0) m.set(this, m.get(this) - 1); return rem.call(this, type, l, o) }
    }
    new MutationObserver((ms) => { for (const r of ms) for (const n of r.addedNodes) if (n.nodeType === 1) for (const f of n.localName === 'iframe' ? [n] : n.querySelectorAll('iframe')) f.addEventListener('load', () => patch(f)) }).observe(document, { childList: true, subtree: true })
  })
  const page = await ctx.newPage()
  await page.goto(url)
  await page.locator(`[data-sample-card="${sample}"]`).click()
  await page.waitForFunction((s) => !!document.querySelector('iframe[title="Preview"]')?.contentDocument?.querySelector(s), SAMPLES[sample].ready)
  await page.waitForTimeout(500)
  return { ctx, page }
}
const view = async (page, name) => { await page.getByRole('group', { name: 'View' }).getByRole('button', { name: new RegExp(`^${name}(, customised)?$`) }).click(); await page.waitForTimeout(600) }
const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))).then(() => page.waitForFunction(() => !document.querySelector('[aria-busy="true"]')))
// the element's real box in host coordinates, and the outline's
const measure = (page, sel) => page.evaluate((s) => {
  const f = document.querySelector('iframe[title="Preview"]'); const fr = f.getBoundingClientRect(); const k = fr.width / f.offsetWidth
  const el = f.contentDocument.querySelector(s); const outline = document.querySelector('[data-selection]')
  if (!el) return { error: 'no element' }
  if (!outline) return { error: 'no outline' }
  const er = el.getBoundingClientRect(), o = outline.getBoundingClientRect()
  const real = { left: fr.left + er.left * k, top: fr.top + er.top * k, width: er.width * k, height: er.height * k }
  const d = Math.max(Math.abs(o.left - real.left), Math.abs(o.top - real.top), Math.abs(o.width - real.width), Math.abs(o.height - real.height))
  const sticks = o.top < fr.top - 1 || o.left < fr.left - 1 || o.bottom > fr.bottom + 1 || o.right > fr.right + 1
  const visible = real.top + real.height > fr.top && real.top < fr.bottom
  return { d, sticks, visible, scrollY: Math.round(f.contentWindow.scrollY), hostY: Math.round(scrollY) }
}, sel)
async function select(page, sel) {
  const p = await page.evaluate((s) => {
    const f = document.querySelector('iframe[title="Preview"]'); const w = f.contentWindow; const el = f.contentDocument.querySelector(s)
    const r0 = el.getBoundingClientRect(); w.scrollTo(0, Math.max(0, r0.top + w.scrollY - 200))
    const fr0 = f.getBoundingClientRect(); const r1 = el.getBoundingClientRect(); scrollTo(0, Math.max(0, fr0.top + r1.top + scrollY - 400))
    const fr = f.getBoundingClientRect(); const k = fr.width / f.offsetWidth; const r = el.getBoundingClientRect()
    return { x: fr.left + (r.left + r.width / 2) * k, y: fr.top + (r.top + r.height / 2) * k }
  }, sel)
  await page.mouse.click(p.x, p.y); await page.waitForTimeout(350)
  return !!(await page.$('[data-selection]'))
}
const SCROLLS = {
  wheel: async (page) => { const c = await page.evaluate(() => { const r = document.querySelector('iframe[title="Preview"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: Math.min(r.top + r.height / 2, innerHeight - 100) } }); await page.mouse.move(c.x, c.y); await page.mouse.wheel(0, 140) },
  pagedown: async (page) => { await page.evaluate(() => document.querySelector('.ue-overlay')?.focus({ preventScroll: true })); await page.keyboard.press('PageDown') },
  end: async (page) => { await page.evaluate(() => document.querySelector('.ue-overlay')?.focus({ preventScroll: true })); await page.keyboard.press('End') },
  space: async (page) => { await page.evaluate(() => document.querySelector('.ue-overlay')?.focus({ preventScroll: true })); await page.keyboard.press('Space') },
  scrollTo: async (page) => { await page.evaluate(() => { const w = document.querySelector('iframe[title="Preview"]').contentWindow; w.scrollTo(0, Math.max(0, w.scrollY - 90)) }) },
  scrollTo2: async (page) => { await page.evaluate(() => { const w = document.querySelector('iframe[title="Preview"]').contentWindow; w.scrollTo(0, w.scrollY + 160) }) },
}
async function scrollRun(page, sel, names = Object.keys(SCROLLS)) {
  const out = {}
  if (!(await page.$('[data-selection]'))) return 'no outline to follow'
  for (const n of names) {
    const before = await measure(page, sel)
    await SCROLLS[n](page)
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)))
    const a = await measure(page, sel)
    await page.waitForTimeout(200)
    const b = await measure(page, sel)
    out[n] = a.error ? a.error : { frame: rnd(a.d), at200ms: b.error ? b.error : rnd(b.d), moved: before.error ? null : (before.scrollY !== a.scrollY || before.hostY !== a.hostY), sticks: !!(a.sticks || b?.sticks), visible: a.visible }
  }
  return out
}
const result = { url, scroll: {}, rebuilds: {}, scrollbar: 'not reachable: the pointer layer covers the frame, so a scrollbar is never under the pointer' }
for (const [sample, def] of onlyRebuilds ? [] : Object.entries(SAMPLES)) for (const [vname, land] of VIEWS) for (const sel of def.picks) {
  const { ctx, page } = await open(sample)
  try {
    if (vname !== 'Desktop') { await view(page, vname); if (land) { await page.getByRole('button', { name: 'Rotate', exact: true }).click(); await page.waitForTimeout(500) } }
    if (!(await select(page, sel))) { result.scroll[`${sample} ${vname}${land ? ' sideways' : ''} ${sel}`] = 'could not select'; continue }
    result.scroll[`${sample} ${vname}${land ? ' sideways' : ''} ${sel}`] = await scrollRun(page, sel)
  } catch (e) { result.scroll[`${sample} ${vname}${land ? ' sideways' : ''} ${sel}`] = 'error: ' + String(e).split('\n')[0] }
  await ctx.close()
}
// pages whose scrolling is not the document's: an inner scrolling element and a scrolling body (pasted through Paste), and a plain scrolling document for comparison
const ROWS = Array.from({ length: 30 }, (_, i) => `<p class="row" id="r${i}">Row ${i} of a long list</p>`).join('')
const FIX = {
  'inner scroller': `<!doctype html><html><head><style>html,body{margin:0;height:100%;overflow:hidden}#scroller{height:100%;overflow:auto}.row{margin:0;padding:24px;border-bottom:1px solid #ccc}</style></head><body><div id="scroller">${ROWS}</div></body></html>`,
  'scrolling body': `<!doctype html><html><head><style>html{height:100%;overflow:hidden}body{margin:0;height:100%;overflow-y:auto}.row{margin:0;padding:24px;border-bottom:1px solid #ccc}</style></head><body>${ROWS}</body></html>`,
  'scrolling document': `<!doctype html><html><head><style>body{margin:0}.row{margin:0;padding:24px;border-bottom:1px solid #ccc}</style></head><body>${ROWS}</body></html>`,
}
result.fixtures = {}
for (const [name, html] of Object.entries(FIX)) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } }); const page = await ctx.newPage()
  try {
    await page.goto(url)
    await page.getByRole('button', { name: 'Samples', exact: true }).click(); await page.waitForTimeout(300)
    await page.locator('[data-sample-card="own"]').getByRole('button', { name: 'Paste', exact: true }).click()
    await page.getByLabel('HTML or SVG', { exact: true }).fill(html); await page.getByRole('button', { name: 'Open pasted code', exact: true }).click()
    await page.waitForFunction(() => !!document.querySelector('iframe[title="Preview"]')?.contentDocument?.querySelector('#r5')); await page.waitForTimeout(600)
    await view(page, 'Phone')
    if (!(await select(page, '#r5'))) { result.fixtures[name] = 'could not select'; continue }
    // the preview's own scroller is scrolled directly (a wheel over the pointer layer scrolls the window or the host, never an inner element)
    const r = {}
    for (const by of [60, 140]) {
      await page.evaluate((by) => { const d = document.querySelector('iframe[title="Preview"]').contentDocument; const s = d.querySelector('#scroller') ?? (getComputedStyle(d.body).overflowY === 'auto' ? d.body : null); if (s) s.scrollTop += by; else d.defaultView.scrollBy(0, by) }, by)
      await page.evaluate(() => new Promise((q) => requestAnimationFrame(q)))
      const a = await measure(page, '#r5'); await page.waitForTimeout(200); const b = await measure(page, '#r5')
      r[`scroll by ${by}`] = { frame: rnd(a.d), at200ms: rnd(b.d), sticks: !!(a.sticks || b.sticks) }
    }
    result.fixtures[name] = r
  } catch (e) { result.fixtures[name] = 'error: ' + String(e).split('\n')[0] }
  await ctx.close()
}
if (rebuilds) {
  const { ctx, page } = await open('landing', true)
  // The scroll listeners are counted by the probe itself: an init script, run in every frame before the page's own code, wraps addEventListener and removeEventListener and keeps the net count of
  // `scroll` listeners for each document or window (in a map on the top window). It reads nothing of the page's state.
  const listeners = () => page.evaluate(() => {
    const m = window.__sl ?? new Map(); const f = document.querySelector('iframe[title="Preview"]')
    const liveDoc = f?.contentDocument, liveWin = f?.contentWindow
    let live = 0, dropped = 0, droppedListeners = 0
    for (const [k, n] of m) {
      const isPreviewTarget = (k.nodeType === 9 && k !== document) || (k.window === k && k !== window)
      if (!isPreviewTarget) continue
      if (k === liveDoc || k === liveWin) live += n
      else if (n > 0) { dropped++; droppedListeners += n }
    }
    return { live, droppedDocumentsWithAScrollListener: dropped, droppedListeners }
  })
  const keepDoc = () => page.evaluate(() => { (window.__docs ??= []).push(document.querySelector('iframe[title="Preview"]').contentDocument) })
  await view(page, 'Phone')
  const SEL = '#card-plan h3'
  await select(page, SEL)
  const ops = {
    'first edit': async () => { await page.getByRole('button', { name: 'Increase Font size', exact: true }).click(); await settle(page) },
    'Undo': async () => { await page.getByRole('button', { name: 'Undo', exact: true }).click(); await settle(page) },
    'Redo': async () => { await page.getByRole('button', { name: 'Redo', exact: true }).click(); await settle(page) },
    'view switch Tablet and back': async () => { await view(page, 'Tablet'); await view(page, 'Phone') },
    'rotate and back': async () => { const r = page.getByRole('button', { name: 'Rotate', exact: true }); await r.click(); await page.waitForTimeout(500); await r.click(); await page.waitForTimeout(500) },
    'view Reset': async () => { const b = page.getByRole('button', { name: 'Reset to Desktop view', exact: true }); if (!(await b.count()) || !(await b.first().isEnabled())) throw new Error('no Reset to Desktop view button on this page'); await b.first().click(); await page.getByRole('group', { name: 'Confirm' }).getByRole('button', { name: /^Reset (Phone|Tablet) view$/ }).click(); await settle(page) },
    'Delete another element': async () => { await select(page, '#card-ship'); await page.getByRole('button', { name: 'Delete', exact: true }).click(); await settle(page) },
    'Insert a Rectangle': async () => { await select(page, '#card-build'); await page.getByRole('button', { name: 'Insert', exact: true }).click(); await page.getByRole('menuitem', { name: 'Rectangle', exact: true }).click(); const p = await page.evaluate(() => { const f = document.querySelector('iframe[title="Preview"]'); const el = f.contentDocument.querySelector('#card-build'); const fr = f.getBoundingClientRect(); const k = fr.width / f.offsetWidth; const r = el.getBoundingClientRect(); return { x: fr.left + (r.left + r.width / 2) * k, y: fr.top + (r.top + 4) * k } }); await page.mouse.move(p.x, p.y); await page.mouse.click(p.x, p.y); await settle(page) },
  }
  for (const [name, op] of Object.entries(ops)) {
    try {
      await keepDoc()
      await page.evaluate(() => { const w = document.querySelector('iframe[title="Preview"]').contentWindow; w.scrollTo(0, 150) }); await page.waitForTimeout(150)
      const keptBefore = await page.evaluate(() => Math.round(document.querySelector('iframe[title="Preview"]').contentWindow.scrollY))
      await op()
      const keptAfter = await page.evaluate(() => Math.round(document.querySelector('iframe[title="Preview"]').contentWindow.scrollY))
      await select(page, SEL)
      const target = SEL
      result.rebuilds[name] = { previewScrollBeforeAfterTheOp: `${keptBefore} -> ${keptAfter}`, scroll: await scrollRun(page, target, ['wheel', 'pagedown', 'scrollTo', 'scrollTo2']), listeners: await listeners() }
    } catch (e) { result.rebuilds[name] = 'error: ' + String(e).split('\n')[0] }
  }
  // twenty replays: how many scroll listeners are left on the documents the page dropped
  try {
    for (let i = 0; i < 20; i++) { await keepDoc(); await page.getByRole('button', { name: 'Undo', exact: true }).click().catch(() => {}); await settle(page); await keepDoc(); await page.getByRole('button', { name: 'Redo', exact: true }).click().catch(() => {}); await settle(page) }
    result.rebuilds['20 Undo and Redo replays'] = { listeners: await listeners() }
  } catch (e) { result.rebuilds['20 replays'] = 'error: ' + String(e).split('\n')[0] }
  await ctx.close()
}
await browser.close()
const text = JSON.stringify(result, null, 1)
if (outFile) writeFileSync(outFile, text + '\n')
const flat = Object.entries(result.scroll).map(([k, v]) => typeof v === 'string' ? `${k}: ${v}` : `${k}: ` + Object.entries(v).map(([n, x]) => `${n} ${typeof x === 'string' ? x : x.frame + '/' + x.at200ms + (x.sticks ? 's' : '') + (x.moved ? '' : '(no scroll)')}`).join(', '))
console.log(flat.join('\n'))
console.log('fixtures', JSON.stringify(result.fixtures))
if (rebuilds) console.log(JSON.stringify(result.rebuilds, null, 1))
