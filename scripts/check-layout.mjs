// Measures the Home page's layout in headless Chromium and fails when a target is missed:
//   npm run check:layout           (needs Playwright with Chromium installed; it is not a dependency of this repo)
// Home is two columns (49% / 2% / 49% of the content width Wc): on the left the title and two text cards, on the right the solar
// system and the chosen planet's card. All Home text is on the shared scale in src/styles/tokens.css. For each window size and each
// chosen planet it checks:
//   no scroll        the page is no taller than the window
//   alignment        the left column's bottom is the right column's bottom (1px); the system's top is the title's top (2px)
//   columns          49% / 2% / 49% of Wc (within 1%)
//   type             the body, card text, card label and title sizes are the tokens' (exactly); Home's body size is within 1px of
//                    the body text of the Résumé, SatPOV and ShopAI pages (a side-by-side table is printed)
//   left cards       against the visible card's inner rectangle (border and padding excluded): the longest line's right end over
//                    the inner width >= 0.85 and the text block over the inner height >= 0.80; lines of 45 to 80 characters
//                    (the last line of a paragraph, and one-line texts, are not counted); nothing outside the card
//   rows             how much room each text row has above and below its text (printed; the brief allows up to 16px)
//   planet card      heading row included: width fill >= 0.85, height fill >= 0.85, 45 to 80 characters a line
//   system           the picture is at least 0.40 Wc wide (the ratio is printed)
//   title            one or two lines, not clipped, inside the left column
//   style mode      (node scripts/check-layout.mjs --style, or as part of the default run; --home runs only the Home checks above)
//                   for every page and state, at 1280x720, 1440x900, 1920x1080 and 390x844: h1 size and weight, body size, no text under
//                   14px, card padding, paragraph line lengths (desktop) and no sideways scroll, all against the tokens' computed values;
//                   one side-by-side table is printed. A page whose `onScale` flag below is false is measured and printed, not asserted.
// Known, explained misses are listed in scripts/check-layout.expected.json and do not fail the run.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const ALL = [[1280, 720], [1366, 768], [1440, 900], [1920, 1080]]
// CHECK_SIZES=1440x900,1920x1080 limits the run to some sizes.
const SIZES = process.env.CHECK_SIZES ? ALL.filter(([w, h]) => process.env.CHECK_SIZES.split(',').includes(`${w}x${h}`)) : ALL
const PLANETS = ['SatPOV', 'ShopAI', 'Résumé']
const TARGET = { hFill: 0.85, vFill: 0.8, cplMin: 45, cplMax: 80, slotFill: 0.85, system: 0.4, rowPad: 16 }
const expectedFile = fileURLToPath(new URL('./check-layout.expected.json', import.meta.url))
const expected = new Set(JSON.parse(readFileSync(expectedFile, 'utf8')).misses)
const expectedReasons = JSON.parse(readFileSync(expectedFile, 'utf8')).reasons ?? {}
const outDir = process.env.CHECK_LAYOUT_OUT
const MODE = process.argv.includes('--style') ? 'style' : process.argv.includes('--home') ? 'home' : 'all'

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
    // A one-line text has no full line to count: it is left out.
    return { min: cpl.length ? Math.min(...cpl) : 45, max: cpl.length ? Math.max(...cpl) : 45, lines: [...blocks.values()].reduce((a, ls) => a + ls.length, 0) }
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
  const left = [boxOf('Background card', cards[0], ['.home-row-text']), boxOf('About card', cards[1], ['.home-row-text'])]
  // The room each row has above and below its text.
  let rowPad = 0
  for (const row of document.querySelectorAll('.home-row')) {
    if (!row.getClientRects().length) continue
    const ls = linesOf(row.querySelector('.home-row-text')), rr = R(row)
    rowPad = Math.max(rowPad, ((rr.h - (Math.max(...ls.map((l) => l.bottom)) - Math.min(...ls.map((l) => l.top)))) / 2))
  }
  // The type, against the tokens.
  const rootCs = getComputedStyle(document.documentElement)
  const tok = (n) => px(rootCs.getPropertyValue(n))
  const fsOf = (sel) => px(getComputedStyle(document.querySelector(sel)).fontSize)
  const type = {
    body: fsOf('.home-page'), card: fsOf('.home-row-text'), label: fsOf('.home-info .home-panel-title'), slotText: fsOf('.home-slot p'), slotLabel: fsOf('.home-slot .home-panel-title'), button: fsOf('.home-panel-link'), title: fsOf('.home-title'),
    labelWeight: getComputedStyle(document.querySelector('.home-info .home-panel-title')).fontWeight, titleWeight: getComputedStyle(document.querySelector('.home-title')).fontWeight, lineHeight: px(getComputedStyle(document.querySelector('.home-row-text')).lineHeight) / fsOf('.home-row-text'),
    tokens: { body: tok('--text-body'), card: tok('--text-card'), small: tok('--text-small'), label: tok('--text-label') },
  }
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
    rowPad, type,
    Wc, scroll: doc.scrollHeight, vh: innerHeight, hscroll: doc.scrollWidth - innerWidth,
    bottomL: colL.b, bottomR: colR.b, sysTop: sys.t, titleTop: tr.t,
    left: colL.w / Wc, gutter: (colR.l - colL.r) / Wc, right: colR.w / Wc,
    system: svg.w / Wc, systemH: sys.h, systemFull: svg.w / Wc >= 0.4895,
    titleLines, titleFs: Math.round(px(tcs.fontSize) * 10) / 10, titleClipped: title.scrollWidth > title.clientWidth + 1 || tr.r > colL.r + 1, titleInside: tr.l >= colL.l - 1 && tr.r <= colL.r + 1,
    cardH: slotEl.getBoundingClientRect().height, colH: colR.h,
  }
  return { left, slot, g }
}

// ---- style mode: every page against the shared tokens ----

// Each page and state: how to open it and where its h1, body text, card shells and paragraphs are. `onScale` is true once the page is on the
// shared scale (its rules are then asserted); `body` is which token its body text uses.
const STYLE_PAGES = [
  { name: 'Home (SatPOV)', path: '/', planet: 'SatPOV', ready: '.home-slot-live', h1: '.home-title', body: '.home-row-text', bodyToken: 'card', cards: '.home-info', paras: '.home-row-text, .home-slot p', onScale: true },
  { name: 'Home (ShopAI)', path: '/', planet: 'ShopAI', ready: '.home-slot-live', h1: '.home-title', body: '.home-row-text', bodyToken: 'card', cards: '.home-info', paras: '.home-row-text, .home-slot p', onScale: true },
  { name: 'Home (Résumé)', path: '/', planet: 'Résumé', ready: '.home-slot-live', h1: '.home-title', body: '.home-row-text', bodyToken: 'card', cards: '.home-info', paras: '.home-row-text, .home-slot p', onScale: true },
  { name: 'Résumé', path: '/resume', ready: '.resume-name', h1: '.resume-name', body: '.resume-job-bullets li', bodyToken: 'card', cards: '.resume-rail, .resume-main, .resume-project-card', paras: '.resume-job-bullets li, .resume-project-card p', onScale: true },
  { name: 'SatPOV', path: '/satellite-conjunction-screening', ready: '.page-title', wait: 3500, h1: '.page-title', body: '.page-lede', bodyToken: 'body', cards: '.sat-risk-card', paras: '.page-lede', extra: 'sat', onScale: true },
  { name: 'SatPOV (credits)', path: '/satellite-conjunction-screening', ready: '#sat-credits', wait: 3500, scroll: '#sat-credits', h1: '.page-title', body: '.sat-credits-body p', bodyToken: 'card', cards: '.sat-step, .globe-history-event', paras: '.sat-credits-body p, .sat-credits-body li, .globe-history-event p, .globe-history-lede', onScale: true },
  { name: 'ShopAI (idle)', path: '/shop?fixture=empty', ready: '.page-title', h1: '.page-title', body: '.page-lede', bodyToken: 'body', cards: '.shop-about', paras: '.page-lede, .shop-about-text', extra: 'shopIdle', onScale: true },
  { name: 'ShopAI (results)', path: '/shop?fixture=rated', ready: '.shop-card', h1: '.page-title', body: '.page-lede', bodyToken: 'body', cards: '.shop-card, .shop-saved-card, .shop-again, .shop-about', paras: '.page-lede, .shop-about-text, .shop-short', extra: 'shopResults', onScale: true },
  { name: '404', path: '/nope', ready: '.page-title', h1: '.page-title', body: '', bodyToken: 'body', cards: '', paras: '', onScale: true },
]

// Runs in the page. Reads the tokens' computed values from probes inside the page container, then the page's own styles.
function measureStyle({ h1, body, cards, paras, scroll }) {
  const px = (v) => parseFloat(v) || 0
  const vis = (e) => e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden'
  const first = (sel) => (sel ? [...document.querySelectorAll(sel)].find(vis) : null)
  const host = document.querySelector('main .page-container')
  // The tokens' computed values, probed inside the element they apply to (cqw is relative to its nearest size container).
  const probe = (css, prop, at) => {
    const el = document.createElement('div')
    el.style.cssText = `position:absolute;visibility:hidden;${css}`
    ;(at ?? host).appendChild(el)
    const v = getComputedStyle(el)[prop]
    el.remove()
    return px(v)
  }
  const h1Probe = first(h1)
  const tokens = {
    title: probe('font-size:var(--text-title)', 'fontSize', h1Probe?.parentElement),
    pad: probe('padding:var(--card-pad)', 'paddingLeft', first(cards)?.parentElement),
    body: probe('font-size:var(--text-body)', 'fontSize'),
    card: probe('font-size:var(--text-card)', 'fontSize'),
    small: probe('font-size:var(--text-small)', 'fontSize'),
  }
  const h1El = first(h1), h1cs = h1El ? getComputedStyle(h1El) : null
  const bodyEl = first(body)
  // Every piece of text in <main> under 14px (svg text is the Home drawing's labels).
  const small = new Map()
  let minFont = Infinity
  const walker = document.createTreeWalker(document.querySelector('main'), NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement
    if (!n.textContent.trim() || !vis(el) || el.closest('svg, .visually-hidden, script, style')) continue
    const fs = px(getComputedStyle(el).fontSize)
    minFont = Math.min(minFont, fs)
    if (fs < 13.99) { const k = `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : ''}`; small.set(k, Math.round(fs * 100) / 100) }
  }
  const pads = [...(cards ? document.querySelectorAll(cards) : [])].filter(vis).map((e) => { const cs = getComputedStyle(e); return { k: `${e.tagName.toLowerCase()}.${String(e.className).trim().split(/\s+/)[0]}`, p: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map(px) } })
  // Characters per line of each paragraph (every line but its last), from the character boxes.
  const cpl = []
  for (const el of paras ? [...document.querySelectorAll(paras)].filter(vis) : []) {
    const lines = []
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    const range = document.createRange()
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.textContent.trim() || !vis(n.parentElement)) continue
      for (let i = 0; i < n.textContent.length; i++) {
        range.setStart(n, i); range.setEnd(n, i + 1)
        const r = range.getClientRects()[0]
        if (!r) continue
        const cur = lines[lines.length - 1]
        if (!cur || Math.abs(r.top - cur.top) > r.height / 2) lines.push({ top: r.top, text: '' })
        lines[lines.length - 1].text += n.textContent[i]
      }
    }
    lines.slice(0, -1).forEach((l) => cpl.push(l.text.trim().length))
  }
  return {
    h1: h1cs ? { size: px(h1cs.fontSize), weight: h1cs.fontWeight } : null,
    body: bodyEl ? px(getComputedStyle(bodyEl).fontSize) : null,
    tokens, minFont, small: [...small], pads, cpl: cpl.length ? [Math.min(...cpl), Math.max(...cpl)] : null,
    hscroll: document.documentElement.scrollWidth - innerWidth, scaled: host.classList.contains('is-scaled') || !!document.querySelector('.home-page'),
  }
}


// Runs in the page: the layout measurements that belong to one page (SatPOV's header, the shop's two columns).
function measureExtra(kind) {
  const px = (v) => parseFloat(v) || 0
  const R = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height } }
  const textBox = (root) => {
    let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), rg = document.createRange()
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.textContent.trim() || n.parentElement.getClientRects().length === 0) continue
      rg.selectNodeContents(n)
      for (const q of rg.getClientRects()) { l = Math.min(l, q.left); r = Math.max(r, q.right); t = Math.min(t, q.top); b = Math.max(b, q.bottom) }
    }
    return { l, r, t, b }
  }
  const doc = document.documentElement
  if (kind === 'sat') {
    const hd = document.querySelector('.sat-header'), main = hd.querySelector('.page-header-main'), aside = hd.querySelector('.page-header-aside')
    const tb = textBox(main)
    let right = tb.r
    for (const e of main.querySelectorAll('.chip')) right = Math.max(right, e.getBoundingClientRect().right)
    const Wc = hd.getBoundingClientRect().width, a = R(aside)
    const dd = [...hd.querySelectorAll('.sat-stat dd')]
    return { Wc, headerH: R(hd).h, gapPct: (a.l - right) / Wc, bottomDiff: a.b - tb.b, asideBottom: a.b, numeral: px(getComputedStyle(dd[0]).fontSize), ddOverflow: dd.some((e) => e.scrollWidth > e.clientWidth + 1), clock: R(document.querySelector('.globe-timebar')).t, vw: innerWidth }
  }
  if (kind === 'shopIdle' || kind === 'shopResults') {
    const sh = document.querySelector('.shop'), cs = getComputedStyle(sh)
    const Wc = sh.getBoundingClientRect().width - px(cs.paddingLeft) - px(cs.paddingRight)
    const form = R(document.querySelector('.shop-form')), card = document.querySelector('.shop-about'), cr = R(card), out = document.querySelector('.shop-output')
    const input = R(document.querySelector('.shop-input'))
    const chips = [...document.querySelectorAll('.shop-examples .chip')].map(R)
    const ccs = getComputedStyle(card)
    const inner = { l: cr.l + px(ccs.borderLeftWidth) + px(ccs.paddingLeft), r: cr.r - px(ccs.borderRightWidth) - px(ccs.paddingRight), t: cr.t + px(ccs.borderTopWidth) + px(ccs.paddingTop), b: cr.b - px(ccs.borderBottomWidth) - px(ccs.paddingBottom) }
    const tb = textBox(card)
    let rowPad = 0
    for (const row of card.querySelectorAll('.shop-about-row')) { const t = textBox(row); rowPad = Math.max(rowPad, (R(row).h - (t.b - t.t)) / 2) }
    const grid = document.querySelector('.shop-grid')
    const o = R(out)
    return { Wc, left: form.w / Wc, gutter: (cr.l - form.r) / Wc, right: cr.w / Wc, leftBottom: o.b, rightBottom: cr.b, topDiff: cr.t - R(document.querySelector('.page-title')).t, hFill: (tb.r - inner.l) / (inner.r - inner.l), vFill: (tb.b - tb.t) / (inner.b - inner.t), rowPad,
      inputInside: input.r <= form.r + 1 && input.l >= form.l - 1, chipsInside: chips.every((q) => q.r <= form.r + 1), page: doc.scrollHeight, vh: innerHeight, gridW: grid ? R(grid).w : null, gridWanted: Wc, stacked: getComputedStyle(sh).display !== 'grid' }
  }
  return null
}

// Header heights and clock-bar position of the SatPOV page before the header rework (main plus PR 54), at each window size.
const HEADER_BEFORE = {
  '1280x720': { headerH: 265, clock: 845 }, '1366x768': { headerH: 224, clock: 807 }, '1440x900': { headerH: 224, clock: 809 },
  '1920x1080': { headerH: 233, clock: 975 }, '2000x1100': { headerH: 233, clock: 995 }, '2560x1440': { headerH: 202, clock: 1335 },
}

async function runStyle(browser, base) {
  const STYLE_SIZES = [[1280, 720], [1366, 768], [1440, 900], [1920, 1080], [2000, 1100], [2560, 1440], [390, 844]]
  const rows = []
  for (const cfg of STYLE_PAGES) {
    for (const [w, h] of STYLE_SIZES) {
      const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage()
      await page.goto(base + cfg.path.slice(1), { waitUntil: 'load' })
      await page.waitForSelector(cfg.ready, { timeout: 30000 })
      if (cfg.planet) { await page.locator(`.solar-planet[aria-label="${cfg.planet}"]`).click({ force: true }); await page.mouse.move(2, 2) }
      await page.waitForTimeout(cfg.wait ?? 500)
      if (cfg.scroll) { await page.evaluate((s) => document.querySelector(s)?.scrollIntoView(), cfg.scroll); await page.waitForTimeout(300) }
      if (cfg.extra === 'sat') await page.waitForSelector('.sat-risk-card', { timeout: 20000 }).catch(() => {})
      const m = await page.evaluate(measureStyle, cfg)
      const x = cfg.extra ? await page.evaluate(measureExtra, cfg.extra) : null
      if (outDir && w === 1440) await page.screenshot({ path: `${outDir}/style-${cfg.name.replace(/[^A-Za-z0-9]+/g, '-')}-${w}x${h}.png` })
      await page.context().close()
      const t = m.tokens, bad = []
      const desktop = w >= 1280
      if (!m.h1 || Math.abs(m.h1.size - t.title) > 0.1 || m.h1.weight !== '700') bad.push(`h1 is ${m.h1 ? `${m.h1.size}px/${m.h1.weight}` : 'missing'}, the title token is ${t.title}px/700`)
      if (cfg.body) {
        const want = cfg.bodyToken === 'card' ? t.card : t.body
        if (m.body === null || Math.abs(m.body - want) > 0.5) bad.push(`body text is ${m.body}px, the ${cfg.bodyToken} token is ${want}px`)
      }
      if (m.small.length) bad.push(`text under 14px: ${m.small.map(([k, v]) => `${k} ${v}px`).join(', ')}`)
      for (const c of m.pads) if (c.p.some((v) => Math.abs(v - t.pad) > 0.5)) bad.push(`card padding of ${c.k} is ${c.p.join(' ')}, the card-pad token is ${t.pad}px`)
      if (desktop && m.cpl && (m.cpl[0] < TARGET.cplMin || m.cpl[1] > TARGET.cplMax)) bad.push(`paragraph lines of ${m.cpl[0]}-${m.cpl[1]} characters (45-80)`)
      if (m.hscroll > 1) bad.push(`the page scrolls sideways by ${m.hscroll}px`)
      if (x && cfg.extra === 'sat' && w >= 1100) {
        const oldNumeral = Math.min(23.2, Math.max(16.8, 0.015 * w)) // the numerals before: clamp(1.05rem, 1.5vw, 1.45rem)
        if (x.gapPct > 0.04) bad.push(`the title block and the stats panel are ${(x.gapPct * 100).toFixed(1)}% of the width apart (4% allowed)`)
        if (Math.abs(x.bottomDiff) > 4) bad.push(`the stats panel's bottom is ${x.bottomDiff.toFixed(1)}px from the title block's (4px allowed)`)
        if (x.numeral < Math.max(28, 1.5 * oldNumeral) - 0.1) bad.push(`the numerals are ${x.numeral.toFixed(1)}px (28px, and 1.5x the old ${oldNumeral.toFixed(1)}px, wanted)`)
        if (x.ddOverflow) bad.push('a numeral overflows its tile')
        const base = HEADER_BEFORE[`${w}x${h}`]
        if (base && w <= 1440 && x.headerH > base.headerH + 2) bad.push(`the header is ${x.headerH.toFixed(0)}px tall, it was ${base.headerH}px`)
        if (base && w === 1440 && Math.abs(x.clock - base.clock) > 1) bad.push(`the clock bar is at ${x.clock.toFixed(0)}px, it was at ${base.clock}px`)
      }
      if (x && cfg.extra === 'shopIdle' && w >= 1100) {
        if (Math.abs(x.left - 0.49) > 0.01 || Math.abs(x.gutter - 0.02) > 0.01 || Math.abs(x.right - 0.49) > 0.01) bad.push(`columns are ${x.left.toFixed(3)} / ${x.gutter.toFixed(3)} / ${x.right.toFixed(3)} of the width (49 / 2 / 49 wanted)`)
        if (Math.abs(x.leftBottom - x.rightBottom) > 2) bad.push(`the columns' bottoms differ by ${(x.leftBottom - x.rightBottom).toFixed(1)}px`)
        if (Math.abs(x.topDiff) > 2) bad.push(`the About card's top is ${x.topDiff.toFixed(1)}px from the title's`)
        if (x.hFill < TARGET.hFill) bad.push(`About card hFill ${x.hFill.toFixed(2)} < ${TARGET.hFill}`)
        if (x.vFill < TARGET.vFill) bad.push(`About card vFill ${x.vFill.toFixed(2)} < ${TARGET.vFill}`)
        if (x.rowPad > TARGET.rowPad + 0.5) bad.push(`the About rows have ${x.rowPad.toFixed(1)}px above and below their text (${TARGET.rowPad}px allowed)`)
        if (!x.inputInside || !x.chipsInside) bad.push('the input or the chips are outside the left column')
        if (w <= 1920 && x.page > x.vh) bad.push(`the page scrolls (${x.page}/${x.vh})`)
      }
      if (x && cfg.extra === 'shopResults' && w >= 1100 && x.gridW !== null && Math.abs(x.gridW - x.gridWanted) > 2) bad.push(`the results grid is ${x.gridW.toFixed(0)}px wide, the content is ${x.gridWanted.toFixed(0)}px`)
      rows.push({ cfg, w, h, m, x, bad })
    }
  }
  console.log('\n=== style: page-specific layout ===')
  for (const { cfg, w, h, x } of rows) {
    if (!x || w < 1100) continue
    if (cfg.extra === 'sat') console.log(`${cfg.name.padEnd(18)}${`${w}x${h}`.padEnd(11)}gap ${(x.gapPct * 100).toFixed(1)}% of Wc | stats bottom ${x.bottomDiff >= 0 ? '+' : ''}${x.bottomDiff.toFixed(0)}px | numerals ${x.numeral.toFixed(1)}px | header ${x.headerH.toFixed(0)}px | clock bar ${x.clock.toFixed(0)}px`)
    else if (cfg.extra === 'shopIdle') console.log(`${cfg.name.padEnd(18)}${`${w}x${h}`.padEnd(11)}columns ${x.left.toFixed(3)} / ${x.gutter.toFixed(3)} / ${x.right.toFixed(3)} | bottoms ${(x.leftBottom - x.rightBottom).toFixed(0)}px | top ${x.topDiff.toFixed(0)}px | card fill ${x.hFill.toFixed(2)} x ${x.vFill.toFixed(2)} | row pad ${x.rowPad.toFixed(1)}px | page ${x.page}/${x.vh}`)
    else if (cfg.extra === 'shopResults') console.log(`${cfg.name.padEnd(18)}${`${w}x${h}`.padEnd(11)}results grid ${x.gridW === null ? '-' : x.gridW.toFixed(0)}px of ${x.gridWanted.toFixed(0)}px`)
  }
  console.log('\n=== style: every page against the tokens ===')
  console.log('page'.padEnd(18) + 'window'.padEnd(11) + 'h1 px'.padEnd(10) + 'body px'.padEnd(9) + 'min text'.padEnd(10) + 'card padding'.padEnd(26) + 'chars/line'.padEnd(11) + 'status')
  for (const { cfg, w, h, m, bad } of rows) {
    const pad = m.pads.length ? [...new Set(m.pads.map((c) => c.p.every((v) => v === c.p[0]) ? String(+c.p[0].toFixed(1)) : c.p.map((v) => +v.toFixed(1)).join('/')))].join(', ') : '-'
    console.log(cfg.name.padEnd(18) + `${w}x${h}`.padEnd(11) + String(m.h1 ? +m.h1.size.toFixed(1) : '-').padEnd(10) + String(m.body === null ? '-' : +m.body.toFixed(2)).padEnd(9) + String(+m.minFont.toFixed(1)).padEnd(10) + pad.padEnd(26) + (m.cpl ? `${m.cpl[0]}-${m.cpl[1]}` : '-').padEnd(11) + (bad.length ? (cfg.onScale ? (bad.every((b) => [...expected].some((e) => `${w}x${h} ${cfg.name} | ${b}`.startsWith(e))) ? 'known miss' : 'MISS') : 'not on the scale yet') : 'ok'))
    if (!cfg.onScale) continue
    for (const b of bad) {
      const key = `${w}x${h} ${cfg.name} | ${b}`
      const hit = [...expected].find((e) => key.startsWith(e))
      if (hit) reasonsUsed.add(hit)
      else misses.push(key)
    }
  }
}

const reasonsUsed = new Set()
const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'silent' })
await server.listen()
const url = `http://127.0.0.1:${server.httpServer.address().port}/`
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const misses = []
const fmt = (n, d = 3) => n.toFixed(d)
try {
  for (const [w, h] of MODE === 'style' ? [] : SIZES) {
    const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage()
    await page.goto(url, { waitUntil: 'load' })
    await page.waitForSelector('.home-slot-live')
    console.log(`\n=== ${w}x${h} ===`)
    // The body text of the other pages, at this window size.
    const other = await page.context().newPage()
    const bodyOf = async (path, sel) => {
      await other.goto(url.slice(0, -1) + path, { waitUntil: 'load' })
      await other.waitForSelector(sel, { timeout: 30000 })
      return other.evaluate((q) => parseFloat(getComputedStyle(document.querySelector(q)).fontSize), sel)
    }
    const others = { 'Résumé': await bodyOf('/resume', '.resume-job-bullets li'), SatPOV: await bodyOf('/satellite-conjunction-screening', '.page-lede'), ShopAI: await bodyOf('/shop?fixture=empty', '.page-lede') }
    await other.close()
    let sideBySide = false
    for (const planet of PLANETS) {
      await page.locator(`.solar-planet[aria-label="${planet}"]`).click({ force: true })
      await page.mouse.move(2, 2)
      await page.waitForTimeout(450)
      const { left, slot, g } = await page.evaluate(measure)
      const t = g.type, wantCard = w >= 1920 ? 18 : 17
      if (!sideBySide) {
        sideBySide = true
        console.log(`   body text, side by side:  Home ${t.body}px | ${Object.entries(others).map(([k, v]) => `${k} ${v}px`).join(' | ')}`)
        // A page's text is the body token or the card token (card text), so the match is to either of Home's.
        for (const [k, v] of Object.entries(others)) if (Math.abs(t.body - v) > 1.001 && Math.abs(t.card - v) > 1.001) misses.push(`${w}x${h} | ${k}'s text ${v}px is not within 1px of Home's body ${t.body}px or card text ${t.card}px`)
        console.log(`   Home type: body ${t.body} (token ${t.tokens.body}) | card text ${t.card} (token ${t.tokens.card}) | label ${t.label}/${t.labelWeight} (token ${t.tokens.label}) | planet card text ${t.slotText}, name ${t.slotLabel}, button ${t.button} (token ${t.tokens.small}) | title ${t.title}/${t.titleWeight} | line-height ${t.lineHeight.toFixed(2)}`)
      }
      console.log(`-- ${planet}   Wc ${g.Wc.toFixed(0)}  columns ${fmt(g.left)} / ${fmt(g.gutter)} / ${fmt(g.right)}  system ${fmt(g.system)} Wc wide (${g.systemH.toFixed(0)}px tall${g.systemFull ? '' : ', shortened by the window'})  page ${g.scroll}/${g.vh}  title ${g.titleLines} line(s) ${g.titleFs}px  planet card ${g.cardH.toFixed(0)}px  row padding ${g.rowPad.toFixed(1)}px`)
      const bad = []
      const wantTitle = Math.min(36, Math.max(28, 0.02 * g.Wc))
      const typeWhy = []
      if (t.body !== 16 || t.tokens.body !== 16) typeWhy.push(`body ${t.body}`)
      if (t.card !== wantCard || t.tokens.card !== wantCard || t.slotText !== wantCard) typeWhy.push(`card text ${t.card}/${t.slotText}, token ${t.tokens.card}, wanted ${wantCard}`)
      if (t.label !== 18 || t.slotLabel !== 18 || t.tokens.label !== 18 || t.labelWeight !== '600') typeWhy.push(`label ${t.label}/${t.slotLabel}/${t.labelWeight}`)
      if (t.button !== 14 || t.tokens.small !== 14) typeWhy.push(`button ${t.button}`)
      if (Math.abs(t.title - wantTitle) > 0.1 || t.titleWeight !== '700') typeWhy.push(`title ${t.title}, wanted ${wantTitle.toFixed(1)}`)
      if (Math.abs(t.lineHeight - 1.55) > 0.01) typeWhy.push(`line-height ${t.lineHeight.toFixed(2)}`)
      for (const m of typeWhy) bad.push(`type: ${m}`)
      if (g.rowPad > TARGET.rowPad + 0.5) bad.push(`the rows have ${g.rowPad.toFixed(1)}px above and below their text (the brief allows ${TARGET.rowPad}px)`)
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
  if (MODE !== 'home') await runStyle(browser, url)
} finally {
  await browser.close()
  await server.close()
}
if (misses.length) {
  console.error(`\n${misses.length} target(s) missed:`)
  for (const m of misses) console.error('  ' + m)
  process.exit(1)
}
for (const e of reasonsUsed) console.log(`known miss: ${e} (${expectedReasons[e] ?? 'no reason given'})`)
console.log('\nAll layout targets met (apart from the known misses in scripts/check-layout.expected.json).')
