// Measures the Home page's layout in headless Chromium and fails when a target is missed:
//   npm run check:layout           (needs Playwright with Chromium installed; it is not a dependency of this repo)
// For each window size and each chosen planet it measures every text box (the Background card, the About card and each of its
// rows, the two text zones of the strip):
//   horizontal fill  the right end of the longest line, from the box's inner left edge, over the box's inner width  >= 0.90
//   vertical fill    the text block (first line's top to last line's bottom, from Range rects) over the box's inner height >= 0.88
//   characters per line  45 to 80 for body text (the last line of a paragraph is ignored)
//   no overflow      no text outside its box
// and the page's proportions (row 1 and its columns, the cards' 1 : 2, the strip) and that the strip is inside the window.
// Known, explained misses are listed in scripts/check-layout.expected.json and do not fail the run.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const ALL = [[1280, 720], [1366, 768], [1440, 900], [1920, 1080]]
// CHECK_SIZES=1440x900,1920x1080 limits the run to some sizes.
const SIZES = process.env.CHECK_SIZES ? ALL.filter(([w, h]) => process.env.CHECK_SIZES.split(',').includes(`${w}x${h}`)) : ALL
const PLANETS = ['SatPOV', 'ShopAI', 'Résumé']
const TARGET = { hFill: 0.9, vFill: 0.88, cplMin: 45, cplMax: 80 }
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

// Runs in the page: for a box element and the text elements inside it, the rendered lines.
function measureBoxes() {
  const px = (v) => parseFloat(v) || 0
  const inner = (el) => {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el)
    return { l: r.left + px(cs.borderLeftWidth) + px(cs.paddingLeft), r: r.right - px(cs.borderRightWidth) - px(cs.paddingRight), t: r.top + px(cs.borderTopWidth) + px(cs.paddingTop), b: r.bottom - px(cs.borderBottomWidth) - px(cs.paddingBottom) }
  }
  const visible = (n) => { for (let e = n.parentElement; e; e = e.parentElement) if (getComputedStyle(e).display === 'none') return false; return true }
  // Every rendered line of the text inside `root`: its rect, its characters, and the block (p, li, h2) it belongs to.
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
        if (!current || Math.abs(r.top - current.top) > r.height / 2) { current = { block, top: r.top, bottom: r.bottom, left: r.left, right: r.right, chars: 0, text: '' }; out.push(current) }
        current.right = Math.max(current.right, r.right); current.left = Math.min(current.left, r.left); current.bottom = Math.max(current.bottom, r.bottom)
        current.chars += 1; current.text += n.textContent[i]
      }
    }
    return out
  }
  const boxOf = (name, el, textRoot, body) => {
    const box = inner(el), lines = linesOf(textRoot ?? el)
    const left = Math.min(...lines.map((l) => l.left)), right = Math.max(...lines.map((l) => l.right))
    const top = Math.min(...lines.map((l) => l.top)), bottom = Math.max(...lines.map((l) => l.bottom))
    // Characters per line of body text: every line but the last of each block.
    const cpl = []
    const blocks = new Map()
    for (const l of lines) if (body.some((s) => l.block?.matches(s))) { if (!blocks.has(l.block)) blocks.set(l.block, []); blocks.get(l.block).push(l) }
    for (const ls of blocks.values()) ls.slice(0, -1).forEach((l) => cpl.push(l.text.trim().length))
    const lastLines = [...blocks.values()].map((ls) => ls[ls.length - 1].text.trim().length)
    const overflow = right > box.r + 1 || bottom > box.b + 2 || top < box.t - 2 || left < box.l - 1
    return { name, hFill: (right - box.l) / (box.r - box.l), vFill: (bottom - top) / (box.b - box.t), cplMin: cpl.length ? Math.min(...cpl) : lastLines.length ? Math.min(...lastLines) : 0, cplMax: cpl.length ? Math.max(...cpl) : lastLines.length ? Math.max(...lastLines) : 0, overflow, lines: lines.filter((l) => l.block?.matches('p, .home-row-text')).length, w: Math.round(box.r - box.l), h: Math.round(box.b - box.t), fs: Math.round(parseFloat(getComputedStyle(blocks.keys().next().value ?? el).fontSize) * 10) / 10 }
  }
  const cards = [...document.querySelectorAll('.home-info')]
  const rows = [...cards[1].querySelectorAll('.home-row')]
  const zones = [...document.querySelectorAll('.home-slot-live .home-zone')]
  const boxes = [
    boxOf('Background card', cards[0], null, ['p']),
    boxOf('About card (whole)', cards[1], null, ['.home-row-text']),
    ...rows.map((r, i) => boxOf(`About row ${i + 1}`, r, null, ['.home-row-text'])),
    ...zones.map((z, i) => boxOf(`Strip zone ${i + 1}`, z, null, ['p'])),
  ]
  // The page's proportions.
  const R = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height } }
  const pc = document.querySelector('.page-container'), pcs = getComputedStyle(pc), pcr = pc.getBoundingClientRect()
  const Wc = pcr.width - px(pcs.paddingLeft) - px(pcs.paddingRight)
  const sys = R(document.querySelector('.home-system')), col = R(document.querySelector('.home-info-col')), slot = R(document.querySelector('.home-slot')), title = R(document.querySelector('h1'))
  const [c1, c2] = cards.map(R)
  const geometry = { Wc, left: sys.w / Wc, gutter: (col.l - sys.r) / Wc, right: col.w / Wc, row: col.h / Wc, rowPx: col.h, top: c1.h / col.h, gap: (c2.t - c1.b) / col.h, bottom: c2.h / col.h, stripOffset: (slot.t - col.b) / Wc, stripPx: slot.h, stripBottom: slot.b, vh: innerHeight, edgesEqual: Math.abs(slot.l - sys.l) < 0.6 && Math.abs(slot.r - col.r) < 0.6, alignEqual: Math.abs(col.t - sys.t) < 0.6 && Math.abs(col.b - sys.b) < 0.6, titleGap: (sys.t - title.b) / Wc, hscroll: document.documentElement.scrollWidth - innerWidth }
  return { boxes, geometry }
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
      const { boxes, geometry: g } = await page.evaluate(measureBoxes)
      console.log(`-- ${planet}   Wc ${g.Wc.toFixed(0)}  left ${fmt(g.left)}  gutter ${fmt(g.gutter)}  right ${fmt(g.right)}  row ${fmt(g.row)} (${g.rowPx.toFixed(0)}px)  cards ${fmt(g.top)}:${fmt(g.gap)}:${fmt(g.bottom)}  strip +${fmt(g.stripOffset)} ${g.stripPx.toFixed(0)}px, bottom ${g.stripBottom.toFixed(0)}/${g.vh}`)
      const bad = []
      if (!g.edgesEqual) bad.push('row 1 and the strip do not share their left and right edges')
      if (!g.alignEqual) bad.push('the cards and the system do not share their top and bottom')
      if (g.stripBottom > g.vh) bad.push(`the strip is not inside the window (${g.stripBottom.toFixed(0)} > ${g.vh})`)
      if (g.hscroll) bad.push('horizontal scroll')
      if (Math.abs(g.gutter - 0.02) > 0.0015) bad.push(`gutter ${fmt(g.gutter)}`)
      if (Math.abs(g.top - 0.32) > 0.005 || Math.abs(g.gap - 0.04) > 0.005 || Math.abs(g.bottom - 0.64) > 0.005) bad.push(`cards ${fmt(g.top)}:${fmt(g.gap)}:${fmt(g.bottom)}`)
      if (Math.abs(g.stripOffset - 0.016) > 0.001) bad.push(`strip offset ${fmt(g.stripOffset)}`)
      if (Math.abs(g.titleGap - 0.024) > 0.001) bad.push(`title gap ${fmt(g.titleGap)}`)
      console.log('   box                    size      font   lines hFill  vFill  chars/line  ')
      for (const b of boxes) {
        const why = []
        if (b.hFill < TARGET.hFill) why.push(`hFill ${fmt(b.hFill, 2)} < ${TARGET.hFill}`)
        if (b.vFill < TARGET.vFill) why.push(`vFill ${fmt(b.vFill, 2)} < ${TARGET.vFill}`)
        if (b.cplMin < TARGET.cplMin || b.cplMax > TARGET.cplMax) why.push(`chars/line ${b.cplMin}-${b.cplMax}`)
        if (b.overflow) why.push('overflow or clipped')
        console.log(`   ${b.name.padEnd(22)} ${`${b.w}x${b.h}`.padEnd(9)} ${String(b.fs).padEnd(6)} ${String(b.lines).padEnd(5)} ${fmt(b.hFill, 2)}   ${fmt(b.vFill, 2)}   ${String(b.cplMin).padStart(2)}-${String(b.cplMax).padEnd(3)}   ${why.length ? 'MISS: ' + why.join('; ') : ''}`)
        for (const w2 of why) bad.push(`${b.name}: ${w2}`)
      }
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
