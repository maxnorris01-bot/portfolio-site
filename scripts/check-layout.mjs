// Measures the Home page's layout in headless Chromium and fails when a target is missed:
//   npm run check:layout           (needs Playwright with Chromium installed; it is not a dependency of this repo)
// Home is two columns (49% / 2% / 49% of the content width Wc): on the left the title and two text cards, on the right the solar
// system and the chosen planet's card. For each window size and each chosen planet it checks:
//   no scroll        the page is no taller than the window
//   alignment        the left column's bottom is the right column's bottom (1px); the system's top is the title's top (2px)
//   columns          49% / 2% / 49% of Wc (within 1%)
//   left cards       against the visible card's inner rectangle (border and padding excluded): the longest line's right end
//                    over the inner width >= 0.90 and the text block (Range rects) over the inner height >= 0.88;
//                    body text 45 to 80 characters a line (the last line of a paragraph is ignored); nothing outside the card
//   planet card      heading row included: width fill >= 0.85, height fill >= 0.85, 45 to 80 characters a line
//   system           the picture is at least 0.40 Wc wide (the ratio is printed)
//   title            one or two lines, not clipped, inside the left column
// Known, explained misses are listed in scripts/check-layout.expected.json and do not fail the run.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const ALL = [[1280, 720], [1366, 768], [1440, 900], [1920, 1080]]
// CHECK_SIZES=1440x900,1920x1080 limits the run to some sizes.
const SIZES = process.env.CHECK_SIZES ? ALL.filter(([w, h]) => process.env.CHECK_SIZES.split(',').includes(`${w}x${h}`)) : ALL
const PLANETS = ['SatPOV', 'ShopAI', 'Résumé']
const TARGET = { hFill: 0.9, vFill: 0.88, cplMin: 45, cplMax: 80, slotFill: 0.85, system: 0.4 }
const expectedFile = fileURLToPath(new URL('./check-layout.expected.json', import.meta.url))
const expected = new Set(JSON.parse(readFileSync(expectedFile, 'utf8')).misses)
const outDir = process.env.CHECK_LAYOUT_OUT

// Playwright is not a dependency of this repo: use the one installed here, or the one in PLAYWRIGHT_DIR (a folder whose node_modules has it).
let chromium
try {
  const require = createRequire(import.meta.url)
  const entry = require.resolve('playwright', process.env.PLAYWRIGHT_DIR ? { paths: [process.env.PLAYWRIGHT_DIR] } : undefined)
  ;({ chromium } = require(entry))
} catch {
  console.error('check:layout needs Playwright with Chromium (npm install --no-save playwright && npx playwright install chromium, or set PLAYWRIGHT_DIR).')
  process.exit(2)
}

// Runs in the page.
function measure() {
  const px = (v) => parseFloat(v) || 0
  const inner = (el) => {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el)
    return { l: r.left + px(cs.borderLeftWidth) + px(cs.paddingLeft), r: r.right - px(cs.borderRightWidth) - px(cs.paddingRight), t: r.top + px(cs.borderTopWidth) + px(cs.paddingTop), b: r.bottom - px(cs.borderBottomWidth) - px(cs.paddingBottom) }
  }
  const R = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height } }
  const visible = (n) => { for (let e = n.parentElement; e; e = e.parentElement) if (getComputedStyle(e).display === 'none') return false; return true }
  // Every rendered line of the text inside `root`: its rect, its characters, and the block it belongs to.
  const linesOf = (root) => {
    const out = []
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim() || !visible(n)) continue
      const block = n.parentElement.closest('p, h2, .home-row-text, .home-row-label')
      const range = document.createRange()
      let current = null
      for (let i = 0; i < n.textContent.length; i++) {
        range.setStart(n, i); range.setEnd(n, i + 1)
        const rects = range.getClientRects()
        if (!rects.length) continue
        const r = rects[0]
        if (!current || Math.abs(r.top - current.top) > r.height / 2) { current = { block, top: r.top, bottom: r.bottom, left: r.left, right: r.right, text: '' }; out.push(current) }
        current.right = Math.max(current.right, r.right); current.left = Math.min(current.left, r.left); current.bottom = Math.max(current.bottom, r.bottom)
        current.text += n.textContent[i]
      }
    }
    return out
  }
  // Characters per line of body text: every line but the last of each block.
  const cplOf = (lines, body) => {
    const blocks = new Map()
    for (const l of lines) if (l.block && body.some((s) => l.block.matches(s))) { if (!blocks.has(l.block)) blocks.set(l.block, []); blocks.get(l.block).push(l) }
    const cpl = []
    for (const ls of blocks.values()) ls.slice(0, -1).forEach((l) => cpl.push(l.text.trim().length))
    const last = [...blocks.values()].map((ls) => ls[ls.length - 1].text.trim().length)
    const use = cpl.length ? cpl : last
    return { min: use.length ? Math.min(...use) : 0, max: use.length ? Math.max(...use) : 0, lines: [...blocks.values()].reduce((a, ls) => a + ls.length, 0) }
  }
  const boxOf = (name, el, body, extra = []) => {
    const box = inner(el), lines = linesOf(el)
    const right = Math.max(...lines.map((l) => l.right), ...extra.map((e) => e.right)), left = Math.min(...lines.map((l) => l.left))
    const top = Math.min(...lines.map((l) => l.top), ...extra.map((e) => e.top)), bottom = Math.max(...lines.map((l) => l.bottom), ...extra.map((e) => e.bottom))
    const cpl = cplOf(lines, body)
    const overflow = right > box.r + 1 || bottom > box.b + 2 || top < box.t - 2 || left < box.l - 1
    const first = lines.find((l) => l.block && body.some((s) => l.block.matches(s)))
    return { name, hFill: (right - box.l) / (box.r - box.l), vFill: (bottom - top) / (box.b - box.t), cplMin: cpl.min, cplMax: cpl.max, lines: cpl.lines, overflow, w: Math.round(box.r - box.l), h: Math.round(box.b - box.t), fs: first ? Math.round(parseFloat(getComputedStyle(first.block).fontSize) * 10) / 10 : 0 }
  }
  const cards = [...document.querySelectorAll('.home-info')]
  const left = [boxOf('Background card', cards[0], ['p']), boxOf('About card', cards[1], ['.home-row-text'])]
  const slotEl = document.querySelector('.home-slot')
  const btn = slotEl.querySelector('.home-panel-link').getBoundingClientRect()
  const slot = boxOf('Planet card', slotEl, ['p'], [{ right: btn.right, top: btn.top, bottom: btn.bottom }])
  // Layout.
  const pc = document.querySelector('.page-container'), pcs = getComputedStyle(pc), pcr = pc.getBoundingClientRect()
  const Wc = pcr.width - px(pcs.paddingLeft) - px(pcs.paddingRight)
  const colL = R(document.querySelector('.home-left')), colR = R(document.querySelector('.home-right'))
  const title = document.querySelector('.home-title'), tr = R(title), tcs = getComputedStyle(title)
  const sys = R(document.querySelector('.home-system')), svg = R(document.querySelector('.home-system .solar'))
  const titleLines = Math.round(tr.h / (px(tcs.lineHeight) || px(tcs.fontSize) * 1.15))
  const doc = document.documentElement
  const g = {
    Wc, scroll: doc.scrollHeight, vh: innerHeight, hscroll: doc.scrollWidth - innerWidth,
    bottomL: colL.b, bottomR: colR.b, sysTop: sys.t, titleTop: tr.t,
    left: colL.w / Wc, gutter: (colR.l - colL.r) / Wc, right: colR.w / Wc,
    system: svg.w / Wc, systemH: sys.h, systemFull: svg.w / Wc >= 0.4895,
    titleLines, titleFs: Math.round(px(tcs.fontSize) * 10) / 10, titleClipped: title.scrollWidth > title.clientWidth + 1 || tr.r > colL.r + 1, titleInside: tr.l >= colL.l - 1 && tr.r <= colL.r + 1,
    cardH: slotEl.getBoundingClientRect().height, colH: colR.h,
  }
  return { left, slot, g }
}

const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'silent' })
await server.listen()
const url = `http://127.0.0.1:${server.httpServer.address().port}/`
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const misses = []
const fmt = (n, d = 3) => n.toFixed(d)
try {
  for (const [w, h] of SIZES) {
    const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage()
    await page.goto(url, { waitUntil: 'load' })
    await page.waitForSelector('.home-slot-live')
    console.log(`\n=== ${w}x${h} ===`)
    for (const planet of PLANETS) {
      await page.locator(`.solar-planet[aria-label="${planet}"]`).click({ force: true })
      await page.mouse.move(2, 2)
      await page.waitForTimeout(450)
      const { left, slot, g } = await page.evaluate(measure)
      console.log(`-- ${planet}   Wc ${g.Wc.toFixed(0)}  columns ${fmt(g.left)} / ${fmt(g.gutter)} / ${fmt(g.right)}  system ${fmt(g.system)} Wc wide (${g.systemH.toFixed(0)}px tall${g.systemFull ? '' : ', shortened by the window'})  page ${g.scroll}/${g.vh}  title ${g.titleLines} line(s) ${g.titleFs}px  planet card ${g.cardH.toFixed(0)}px`)
      const bad = []
      if (g.scroll > g.vh) bad.push(`the page scrolls (${g.scroll} > ${g.vh})`)
      if (g.hscroll) bad.push('horizontal scroll')
      if (Math.abs(g.bottomL - g.bottomR) > 1) bad.push(`the columns' bottoms differ (${g.bottomL.toFixed(1)} vs ${g.bottomR.toFixed(1)})`)
      if (Math.abs(g.sysTop - g.titleTop) > 2) bad.push(`the system's top is ${(g.sysTop - g.titleTop).toFixed(1)}px from the title's`)
      if (Math.abs(g.left - 0.49) > 0.01 || Math.abs(g.gutter - 0.02) > 0.01 || Math.abs(g.right - 0.49) > 0.01) bad.push(`columns ${fmt(g.left)} / ${fmt(g.gutter)} / ${fmt(g.right)}`)
      if (g.system < TARGET.system) bad.push(`the system is ${fmt(g.system)} Wc wide, under ${TARGET.system}`)
      if (g.titleLines > 2 || g.titleClipped || !g.titleInside) bad.push(`the title (${g.titleLines} lines, clipped ${g.titleClipped})`)
      console.log('   box                    size      font   lines hFill  vFill  chars/line')
      for (const b of left) {
        const why = []
        if (b.hFill < TARGET.hFill) why.push(`hFill ${fmt(b.hFill, 2)} < ${TARGET.hFill}`)
        if (b.vFill < TARGET.vFill) why.push(`vFill ${fmt(b.vFill, 2)} < ${TARGET.vFill}`)
        if (b.cplMin < TARGET.cplMin || b.cplMax > TARGET.cplMax) why.push(`chars/line ${b.cplMin}-${b.cplMax}`)
        if (b.overflow) why.push('overflow or clipped')
        console.log(`   ${b.name.padEnd(22)} ${`${b.w}x${b.h}`.padEnd(9)} ${String(b.fs).padEnd(6)} ${String(b.lines).padEnd(5)} ${fmt(b.hFill, 2)}   ${fmt(b.vFill, 2)}   ${String(b.cplMin).padStart(2)}-${String(b.cplMax).padEnd(3)}   ${why.length ? 'MISS: ' + why.join('; ') : ''}`)
        for (const w2 of why) bad.push(`${b.name}: ${w2}`)
      }
      const sWhy = []
      if (slot.hFill < TARGET.slotFill) sWhy.push(`hFill ${fmt(slot.hFill, 2)} < ${TARGET.slotFill}`)
      if (slot.vFill < TARGET.slotFill) sWhy.push(`vFill ${fmt(slot.vFill, 2)} < ${TARGET.slotFill}`)
      if (slot.cplMin < TARGET.cplMin || slot.cplMax > TARGET.cplMax) sWhy.push(`chars/line ${slot.cplMin}-${slot.cplMax}`)
      if (slot.overflow) sWhy.push('overflow or clipped')
      console.log(`   ${slot.name.padEnd(22)} ${`${slot.w}x${slot.h}`.padEnd(9)} ${String(slot.fs).padEnd(6)} ${String(slot.lines).padEnd(5)} ${fmt(slot.hFill, 2)}   ${fmt(slot.vFill, 2)}   ${String(slot.cplMin).padStart(2)}-${String(slot.cplMax).padEnd(3)}   ${sWhy.length ? 'MISS: ' + sWhy.join('; ') : ''}`)
      for (const w2 of sWhy) bad.push(`Planet card: ${w2}`)
      for (const m of bad) {
        const key = `${w}x${h} ${planet} | ${m}`
        const known = [...expected].some((e) => key.startsWith(e) || e === `${w}x${h} * | ${m.split(':')[0]}`)
        if (!known) misses.push(key)
      }
      if (outDir) await page.screenshot({ path: `${outDir}/home-${w}x${h}-${planet.replace('é', 'e')}.png` })
    }
    await page.context().close()
  }
} finally {
  await browser.close()
  await server.close()
}
if (misses.length) {
  console.error(`\n${misses.length} target(s) missed:`)
  for (const m of misses) console.error('  ' + m)
  process.exit(1)
}
console.log('\nAll layout targets met (apart from the known misses in scripts/check-layout.expected.json).')
