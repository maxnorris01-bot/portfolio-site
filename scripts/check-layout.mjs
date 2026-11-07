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
//   product cards   (--cards runs only this; also part of style mode) fixture askcards: in every row of cards the Open buttons, the rating buttons
//                   and the comment lines share a top (1px), and rating or liking a card moves no button in any card
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
const ASK = { panelMax: 460, panelMaxPhone: 560, tileMin: 140, tileMinPhone: 150, tileMax: 340, band: 48, rowDiff: 2, cover: 0.7, cover2: 0.5, sideGap: 24 } // the questions panel (one question at a time): heights and tile widths wanted
const TARGET = { hFill: 0.85, vFill: 0.8, cplMin: 45, cplMax: 80, slotFill: 0.85, system: 0.4, rowPad: 16 }
const expectedFile = fileURLToPath(new URL('./check-layout.expected.json', import.meta.url))
const expected = new Set(JSON.parse(readFileSync(expectedFile, 'utf8')).misses)
const expectedReasons = JSON.parse(readFileSync(expectedFile, 'utf8')).reasons ?? {}
const outDir = process.env.CHECK_LAYOUT_OUT
const MODE = process.argv.includes('--cards') ? 'cards' : process.argv.includes('--style') ? 'style' : process.argv.includes('--home') ? 'home' : 'all'

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
  { name: 'ShopAI (idle)', path: '/shop?fixture=empty', ready: '.page-title', h1: '.page-title', body: '.page-lede', bodyToken: 'body', cards: '', paras: '', extra: 'shopIdle', onScale: true },
  { name: 'ShopAI (first load)', path: '/shop?fixture=savedempty', ready: '.page-title', h1: '.page-title', body: '.page-lede', bodyToken: 'body', cards: '', paras: '', extra: 'shopFresh', onScale: true },
  { name: 'ShopAI (results)', path: '/shop?fixture=rated', ready: '.shop-card', h1: '.page-title', body: '.page-lede', bodyToken: 'body', cards: '.shop-card, .shop-saved-card, .shop-again', paras: '.shop-short', extra: 'shopResults', onScale: true },
  { name: 'ShopAI (wait)', path: '/shop?fixture=running', ready: '.wait-panel', h1: '.page-title', body: '.page-lede', bodyToken: 'body', cards: '.wait-side', paras: '', extra: 'shopWait', onScale: true },
  { name: 'ShopAI (wait, slow)', path: '/shop?fixture=slow', ready: '.wait-panel', h1: '.page-title', body: '.page-lede', bodyToken: 'body', cards: '.wait-side', paras: '', extra: 'shopWait', onScale: true },
  { name: 'ShopAI (wait, again)', path: '/shop?fixture=again', ready: '.wait-panel', h1: '.page-title', body: '.page-lede', bodyToken: 'body', cards: '.wait-side', paras: '', extra: 'shopWait', onScale: true },
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
    h1: h1cs ? { size: px(h1cs.fontSize), weight: h1cs.fontWeight, family: h1cs.fontFamily, color: h1cs.color } : null,
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
  // The header block shared by SatPOV and ShopAI: the chips (height, gap) and the description (lines).
  const headerBlock = () => {
    const chips = [...document.querySelectorAll('main .page-chips .chip')].map(R)
    const lede = document.querySelector('main .page-lede')
    let lines = 0, lastTop = -1
    const w = document.createTreeWalker(lede, NodeFilter.SHOW_TEXT), rg = document.createRange()
    for (let n = w.nextNode(); n; n = w.nextNode()) for (let i = 0; i < n.textContent.length; i++) { rg.setStart(n, i); rg.setEnd(n, i + 1); const q = rg.getClientRects()[0]; if (q && Math.abs(q.top - lastTop) > q.height / 2) { lines++; lastTop = q.top } }
    return { chipH: chips[0].h, chipGap: chips[1].l - chips[0].r, chipCount: chips.length, ledeLines: lines, chipsTop: chips[0].t }
  }
  if (kind === 'sat') {
    const lay = document.querySelector('.sat-layout'), leftEl = document.querySelector('.sat-left'), L = R(leftEl), Rt = R(document.querySelector('.sat-right'))
    const Wc = R(lay).w, stage = R(document.querySelector('.globe-stage')), bar = R(document.querySelector('.globe-timebar'))
    const leftText = textBox(leftEl)
    const dd = [...document.querySelectorAll('.sat-stat dd')]
    const oneLine = dd.every((e) => { const rg = document.createRange(); rg.selectNodeContents(e); const tops = new Set([...rg.getClientRects()].map((q) => Math.round(q.top))); return tops.size === 1 && e.scrollWidth <= e.clientWidth + 1 })
    const modebar = R(document.querySelector('.globe-modebar'))
    const credits = R(document.querySelector('.globe-credits'))
    // How far the content of each tile is from the tile's centre, on both axes.
    let tileDx = 0, tileDy = 0
    for (const e of document.querySelectorAll('.sat-stat')) {
      const r = R(e), t = textBox(e), kids = [...e.children].map(R)
      const top = Math.min(...kids.map((q) => q.t)), bottom = Math.max(...kids.map((q) => q.b))
      // Across: where the text is; down: the block of numeral and caption (their line boxes).
      tileDx = Math.max(tileDx, Math.abs((t.l + t.r) / 2 - (r.l + r.r) / 2)); tileDy = Math.max(tileDy, Math.abs((top + bottom) / 2 - (r.t + r.b) / 2))
    }
    // The left column's spare height S and where it went: the gaps (above their 8px floor), the tiles and the Risk card (above their
    // natural heights), the one flexible gap.
    const gapsAbs = [...document.querySelectorAll('.sat-gap:not(.sat-gap-flex)')].map((e) => R(e).h)
    const gapSum = gapsAbs.reduce((a, v) => a + v, 0), gapBase = gapsAbs.length * 8
    const flexGap = R(document.querySelector('.sat-gap-flex')).h
    const tile = document.querySelector('.sat-stat'), tcs = getComputedStyle(tile), tr = R(tile)
    const tileNatural = px(tcs.paddingTop) + px(tcs.paddingBottom) + px(tcs.borderTopWidth) + px(tcs.borderBottomWidth) + [...tile.children].reduce((a, k) => a + R(k).h, 0) + px(tcs.rowGap)
    const card = document.querySelector('.sat-risk-card'), crs = getComputedStyle(card), cr = R(card)
    const rowEls = [...card.querySelectorAll('.sat-risk-row')]
    const rowNat = Math.max(...[...rowEls[0].children].map((k) => R(k).h))
    const cardNatural = px(crs.paddingTop) + px(crs.paddingBottom) + px(crs.borderTopWidth) + px(crs.borderBottomWidth) + rowEls.length * rowNat + (rowEls.length - 1) * 4
    const rowH = R(rowEls[0]).h
    const S = (gapSum - gapBase) + (tr.h - tileNatural) + (cr.h - cardNatural) + flexGap
    const spare = { S, gaps: gapSum - gapBase, gapEach: (gapSum - gapBase) / gapsAbs.length + 8, tiles: tr.h - tileNatural, tileRatio: tr.h / tileNatural, risk: cr.h - cardNatural, rowH, flexGap, tilePad: (px(tcs.paddingTop) + px(tcs.paddingBottom)) / tr.h, riskPad: (px(crs.paddingTop) + px(crs.paddingBottom)) / cr.h }
    const lastText = (() => { const notes = [...document.querySelectorAll('.sat-left .sat-note')]; return textBox(notes[notes.length - 1]).b })()
    const pipe = document.querySelector('#sat-pipeline').getBoundingClientRect()
    return { ...headerBlock(), spare, lastText, Wc, left: L.w / Wc, gutter: (Rt.l - L.r) / Wc, right: Rt.w / Wc, boxDiff: L.b - Rt.b, leftBottom: leftText.b, creditsBottom: credits.b, mapW: stage.w / Wc, mapH: stage.h, mapInside: stage.r <= Rt.r + 0.5 && stage.l >= Rt.l - 0.5, controlsTop: modebar.t, numeral: px(getComputedStyle(dd[0]).fontSize), oneLine, tileDx, tileDy, page: doc.scrollHeight, vh: innerHeight, barBottom: bar.b, overlap: L.r > Rt.l + 0.5, pipeTop: pipe.top + scrollY, creditsGap: credits.t - bar.b, creditsW: credits.w, mapWpx: stage.w, creditsLeftOk: Math.abs(credits.l - stage.l) <= 1 }
  }
  if (kind === 'shopWait') {
    // The wait panel: inside the container, never over 460px, the animation reserved (220px stacked), two columns from 1280px.
    const sh = document.querySelector('.shop'), cs = getComputedStyle(sh)
    const cont = { l: sh.getBoundingClientRect().left + px(cs.paddingLeft), r: sh.getBoundingClientRect().right - px(cs.paddingRight) }
    const panel = document.querySelector('.wait-panel'), pr = R(panel), anim = R(document.querySelector('.wait-anim')), side = R(document.querySelector('.wait-side')), cv = document.querySelector('.wait-canvas')
    const doc = document.documentElement
    return { panelH: pr.h, panelW: pr.w / (cont.r - cont.l), panelL: pr.l - cont.l, panelR: cont.r - pr.r, animH: anim.h, animW: anim.w, sideW: side.w, sideLeft: side.l - anim.l, animAbove: anim.b <= side.t + 1, canvasW: cv.getBoundingClientRect().width, canvasH: cv.getBoundingClientRect().height, canvasPx: cv.width, clipped: panel.scrollHeight > panel.clientHeight + 1, steps: document.querySelectorAll('.shop-steps').length, timers: document.querySelectorAll('.shop-timer').length, note: document.querySelectorAll('.wait-note').length, hscroll: doc.scrollWidth - innerWidth, wide: innerWidth >= 1280 }
  }
  if (kind === 'shopAsk') {
    // The questions panel (one question at a time): inside the container and the window, slim, equal tiles left-aligned, text at the tokens.
    const sh = document.querySelector('.shop'), cs = getComputedStyle(sh)
    const cont = { l: sh.getBoundingClientRect().left + px(cs.paddingLeft), r: sh.getBoundingClientRect().right - px(cs.paddingRight) }
    const Wc = cont.r - cont.l
    const panel = document.querySelector('.clarify'), pr = R(panel), main = document.querySelector('.clarify-main'), mcs = getComputedStyle(main), mr = R(main), pin = { l: mr.l + px(mcs.paddingLeft), w: mr.w - px(mcs.paddingLeft) - px(mcs.paddingRight) }
    const side = document.querySelector('.clarify-side'), sr = side ? R(side) : null, scs = side ? getComputedStyle(side) : null
    const tiles = [...document.querySelectorAll('.clarify-tile')], pics = [...document.querySelectorAll('.clarify-pic:not(.is-text)')]
    const rects = tiles.map(R)
    const rowsByTop = new Map()
    rects.forEach((q) => { const k = [...rowsByTop.keys()].find((t) => Math.abs(t - q.t) <= 2) ?? q.t; rowsByTop.set(k, [...(rowsByTop.get(k) ?? []), q]) })
    const rowDiff = Math.max(0, ...[...rowsByTop.values()].map((r) => Math.max(...r.map((q) => q.h)) - Math.min(...r.map((q) => q.h))))
    const rowWDiff = Math.max(0, ...[...rowsByTop.values()].map((r) => Math.max(...r.map((q) => q.w)) - Math.min(...r.map((q) => q.w))))
    const labelFs = [...document.querySelectorAll('.clarify-label')].map((e) => px(getComputedStyle(e).fontSize))
    const over = [...panel.querySelectorAll('*')].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'hidden' && e.clientWidth > 0).map((e) => e.className || e.tagName)
    const imgs = [...document.querySelectorAll('.clarify-pic img')]
    const fitOk = imgs.every((i) => getComputedStyle(i).objectFit === 'contain')
    const heading = px(getComputedStyle(document.querySelector('.clarify-q-title')).fontSize), head2 = px(getComputedStyle(document.querySelector('.clarify-title')).fontSize)
    const probe = (css, prop) => { const el = document.createElement('div'); el.style.cssText = `position:absolute;visibility:hidden;${css}`; sh.appendChild(el); const v = px(getComputedStyle(el)[prop]); el.remove(); return v }
    const doc = document.documentElement
    const progress = document.querySelector('.shop-steps')
    const dots = [...document.querySelectorAll('.clarify-dot')].map(R)
    const smalls = ['.clarify-sub', '.clarify-count', '.clarify-nopref'].map((q) => px(getComputedStyle(document.querySelector(q)).fontSize))
    const first = rects[0]
    const rowRects = rects.filter((q) => Math.abs(q.t - first.t) <= 2)
    const grid = document.querySelector('.clarify-options'), gap = px(getComputedStyle(grid).columnGap)
    const sideInfo = side ? (() => {
      const last = side.lastElementChild, lr = R(last), top = sr.t + px(scs.borderTopWidth) + px(scs.paddingTop), bottom = sr.b - px(scs.borderBottomWidth) - px(scs.paddingBottom)
      const pk = side.querySelector('.clarify-picks'), nt = side.querySelector('.clarify-side-note'), chips = [...side.querySelectorAll('.clarify-picks li')]
      return { band: R(nt).t - (chips.length ? Math.max(...chips.map((c) => R(c).b)) : R(pk).b), sideW: sr.w, share: sr.w / pr.w, chips: chips.length, equal: Math.abs(sr.h - mr.h), hairline: scs.borderLeftWidth, hairlineColor: scs.borderLeftColor, border: (() => { const el = document.createElement('div'); el.style.cssText = 'position:absolute;visibility:hidden;border:1px solid var(--color-border)'; sh.appendChild(el); const v = getComputedStyle(el).borderTopColor; el.remove(); return v })(), gap: bottom - lr.b, vFill: (lr.b - top) / (bottom - top), overflow: [...side.children].filter((k) => R(k).b > bottom + 0.5 || k.scrollWidth > k.clientWidth + 1).map((k) => k.className), stepsIn: !!side.querySelector('.shop-steps'), picks: side.querySelectorAll('.clarify-picks li').length, w: sr.w / pr.w, left: mr.w / pr.w }
    })() : null
    return {
      Wc, panelWpx: pr.w, panelL: pr.l - cont.l, panelR: cont.r - pr.r, panelW: pr.w / Wc, panelH: pr.h, questions: document.querySelectorAll('.clarify-q-title').length, count: document.querySelector('.clarify-count').textContent.trim(),
      tiles: tiles.length, tileMin: tiles.length ? Math.min(...rects.map((q) => q.w)) : 0, tileMax: tiles.length ? Math.max(...rects.map((q) => q.w)) : 0, tileH: rects.map((q) => Math.round(q.h)), rowDiff, rowWDiff, tileLeft: first ? first.l - pin.l : 99,
      textTiles: document.querySelectorAll('.clarify-pic.is-text').length, labelMin: Math.min(...labelFs), labelWant: probe('font-size:var(--text-card)', 'fontSize'),
      headWant: probe('font-size:var(--text-label)', 'fontSize'), smallWant: probe('font-size:var(--text-small)', 'fontSize'), heading, head2, smalls,
      picRatio: pics.map((p) => R(p).w / R(p).h), fitOk, over, dotCount: dots.length, dotMin: dots.length ? Math.min(...dots.map((d) => Math.min(d.w, d.h))) : 0,
      page: doc.scrollHeight, vh: innerHeight, hscroll: doc.scrollWidth - innerWidth, scrollY: Math.round(scrollY),
      cover: rowRects.length ? (rowRects.reduce((a, q) => a + q.w, 0) + gap * (rowRects.length - 1)) / pin.w : 0, rowTiles: rowRects.length, sideInfo, stepsCount: document.querySelectorAll('.shop-steps').length, timers: document.querySelectorAll('.shop-timer').length, wide: innerWidth >= 1280,
      stepsAbove: progress ? R(progress).b <= pr.t + 0.5 : false, panelTop: pr.t + scrollY, panelBottom: pr.b + scrollY, inWindow: pr.t >= -0.5 && pr.b <= innerHeight + 0.5, winTop: pr.t, winBottom: pr.b,
    }
  }
  if (kind === 'shopIdle' || kind === 'shopResults' || kind === 'shopFresh') {
    const sh = document.querySelector('.shop'), cs = getComputedStyle(sh)
    const Wc = sh.getBoundingClientRect().width - px(cs.paddingLeft) - px(cs.paddingRight)
    const stages = [...document.querySelectorAll('.shop-stage')]
    // A tile clips when something inside it reaches past its edge (the arrow between tiles is drawn outside on purpose).
    const clipped = stages.some((e) => { const b = e.getBoundingClientRect(); return [...e.children].some((k) => { const q = k.getBoundingClientRect(); return q.right > b.right + 0.5 || q.bottom > b.bottom + 0.5 || k.scrollWidth > k.clientWidth + 1 }) })
    const sr = stages.map(R), grid = document.querySelector('.shop-results .shop-grid') ?? document.querySelector('.shop-grid')
    const gcard = document.querySelector('.shop-guard-card')
    let guard = null
    if (gcard) {
      const gr = R(gcard), gcs = getComputedStyle(gcard), t = textBox(gcard)
      const inner = { l: gr.l + px(gcs.borderLeftWidth) + px(gcs.paddingLeft), r: gr.r - px(gcs.borderRightWidth) - px(gcs.paddingRight), t: gr.t + px(gcs.borderTopWidth) + px(gcs.paddingTop), b: gr.b - px(gcs.borderBottomWidth) - px(gcs.paddingBottom) }
      guard = { hFill: (t.r - t.l) / (inner.r - inner.l), vFill: (t.b - t.t) / (inner.b - inner.t), widthPct: gr.w / Wc }
    }
    const tileFill = stages.map((e) => { const r = R(e), s = getComputedStyle(e), t = textBox(e); return { h: (t.r - t.l) / (r.w - px(s.paddingLeft) - px(s.paddingRight)), v: (t.b - t.t) / (r.h - px(s.paddingTop) - px(s.paddingBottom)) } })
    const input = R(document.querySelector('.shop-input')), form = R(document.querySelector('.shop-form')), lede = R(document.querySelector('main .page-lede')), row = R(document.querySelector('.shop-form-row'))
    const stageText = Math.min(...stages.map((e) => { const q = getComputedStyle(e); return e.getBoundingClientRect().width - px(q.paddingLeft) - px(q.paddingRight) - px(q.borderLeftWidth) - px(q.borderRightWidth) }))
    const stageFont = Math.min(...stages.map((e) => px(getComputedStyle(e.querySelector('p')).fontSize)))
    return { ...headerBlock(), Wc, stageText, stageFont, stageRows: new Set(sr.map((q) => Math.round(q.t))).size, stages: stages.length, stagesRow: new Set(sr.map((q) => Math.round(q.t))).size === 1, clipped, guard, tileFillMin: Math.min(...tileFill.map((q) => q.h)), tileFillV: Math.min(...tileFill.map((q) => q.v)), inputW: input.w / Wc, formW: form.w / Wc, ledeW: lede.w, rowW: row.w, ledeLeft: lede.l - row.l, guardRows: document.querySelectorAll('.shop-guard-row').length, page: doc.scrollHeight, vh: innerHeight, gridW: grid ? R(grid).w : null, gridWanted: Wc, stacked2x2: new Set(sr.map((q) => Math.round(q.l))).size }
  }
  return null
}

// The stepper's behaviour in a real page (the dev fixture keeps the choices): choose and advance, Back, clear, keyboard, dots, the last
// question, No preference, Show results, focus and reduced motion. Returns the failures.
async function interact(browser, base, w, h) {
  const bad = []
  const open = async (opts = {}) => {
    const page = await (await browser.newContext({ viewport: { width: w, height: h }, ...opts })).newPage()
    await page.goto(`${base}shop?fixture=askpics`, { waitUntil: 'load' })
    await page.waitForSelector('.clarify-q-title', { timeout: 30000 })
    await page.waitForTimeout(500)
    return page
  }
  const title = (page) => page.locator('.clarify-q-title').innerText()
  const count = (page) => page.locator('.clarify-count').innerText()
  const checked = (page) => page.locator('.clarify-tile[aria-checked="true"], .clarify-btn[aria-checked="true"]').count()
  const focusIs = (page, cls) => page.evaluate((c) => document.activeElement?.classList.contains(c) ?? false, cls)
  const Q = ['Which colour do you like?', 'What should it be made of?', 'Which shape do you want?', 'Which look do you prefer?', 'How big should it be?']
  const page = await open()
  const expect = (ok, msg) => { if (!ok) bad.push(msg) }
  expect((await title(page)) === Q[0] && (await count(page)) === '1 of 5', 'does not open on question 1 of 5')
  const t0 = await page.locator('.shop-timer').first().innerText()
  await page.waitForTimeout(1300)
  expect((await page.locator('.shop-timer').first().innerText()) !== t0, 'the timer does not update')
  expect(await page.locator('.clarify-back.is-hidden').count() === 1, 'Back is not hidden on question 1')
  // choose: advances after the pause, moves focus to the question text
  await page.locator('.clarify-tile, .clarify-btn').first().click()
  await page.waitForTimeout(600)
  expect((await title(page)) === Q[1] && (await count(page)) === '2 of 5', 'choosing a tile does not move on to question 2')
  expect(await focusIs(page, 'clarify-q-title'), 'focus does not move to the question text on advance')
  expect(await page.locator('.clarify-back:not(.is-hidden)').count() === 1, 'Back is not shown on question 2')
  expect((await page.locator('.clarify-dot.is-answered').count()) === 1 && (await page.locator('.clarify-dot.is-current').count()) === 1, 'the dots do not show 1 answered and 1 current')
  if (w >= 1280) {
    // the picks column lists the answer; its x clears it (and the dot goes back to unanswered)
    expect((await page.locator('.clarify-picks li').count()) === 1 && (await page.locator('.clarify-picks li').innerText()).includes('Cream'), 'the picks column does not list the answer')
    await page.locator('.clarify-picks .shop-chip-x').click()
    await page.waitForTimeout(100)
    expect((await page.locator('.clarify-picks li').count()) === 0 && (await page.locator('.clarify-picks-empty').count()) === 1 && (await page.locator('.clarify-dot.is-answered').count()) === 0, 'clearing a pick does not clear the answer')
    await page.locator('.clarify-back').click()
    await page.locator('.clarify-tile, .clarify-btn').first().click()
    await page.waitForTimeout(600)
  }
  // back: the answer is still there; choosing it again clears it and does not advance
  await page.locator('.clarify-back').click()
  await page.waitForTimeout(100)
  expect((await title(page)) === Q[0] && (await checked(page)) === 1, 'Back does not return to question 1 with its answer')
  await page.locator('.clarify-tile, .clarify-btn').first().click()
  await page.waitForTimeout(600)
  expect((await title(page)) === Q[0] && (await checked(page)) === 0, 'choosing the chosen tile again does not clear it in place')
  // keyboard: the arrows move focus without choosing; Enter chooses and advances
  await page.locator('.clarify-tile').first().focus()
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(600)
  expect((await page.evaluate(() => document.activeElement?.textContent)) === 'Walnut or brown' && (await checked(page)) === 0 && (await title(page)) === Q[0], 'ArrowRight does not just move focus to the next tile')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
  expect((await title(page)) === Q[1], 'Enter does not choose and advance')
  // dots, the No preference chip, the last question
  await page.locator('.clarify-dot').nth(2).click()
  await page.waitForTimeout(100)
  expect((await title(page)) === Q[2] && (await count(page)) === '3 of 5' && (await focusIs(page, 'clarify-q-title')), 'a dot does not go to its question')
  await page.locator('.clarify-nopref').click()
  await page.waitForTimeout(600)
  expect((await title(page)) === Q[3], 'No preference does not choose and advance')
  await page.locator('.clarify-dot').nth(4).click()
  await page.waitForTimeout(100)
  await page.locator('.clarify-tile, .clarify-btn').first().click()
  await page.waitForTimeout(600)
  expect((await title(page)) === Q[4] && (await count(page)) === '5 of 5', 'the last question moved on')
  expect(await page.locator('.clarify-submit:not([disabled])').isVisible(), 'Show results is not visible and enabled on the last question')
  await page.locator('.clarify-submit').click()
  await page.waitForTimeout(100)
  expect((await page.locator('.clarify-tile[disabled], .clarify-btn[disabled]').count()) > 0 && (await page.locator('.clarify-note').innerText()).length > 0, 'Show results does not lock the tiles and say so')
  await page.context().close()
  // reduced motion: no pause before moving on, no fade
  const rm = await open({ reducedMotion: 'reduce' })
  await rm.locator('.clarify-tile').first().click()
  await rm.waitForTimeout(60)
  expect((await title(rm)) === Q[1], 'with reduced motion the panel does not move on at once')
  await rm.locator('.clarify-back').click()
  await rm.waitForTimeout(50)
  expect(await rm.evaluate(() => [...document.querySelectorAll('.clarify-pic img')].every((i) => getComputedStyle(i).animationName === 'none')), 'with reduced motion a picture still fades')
  await rm.context().close()
  return bad
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
      if (cfg.extra === 'shopAsk') { let last = -1; for (let i = 0; i < 30; i++) { const y = await page.evaluate(() => scrollY); if (y === last) break; last = y; await page.waitForTimeout(150) } } // the panel's own smooth scroll into view settles
      const m = await page.evaluate(measureStyle, cfg)
      const x = cfg.extra ? await page.evaluate(measureExtra, cfg.extra) : null
      if (x && cfg.interact && [1280, 1440, 390].includes(w)) x.interact = await interact(browser, base, w, h)
      // The sources line's "Data and credits" link must still take the page to the credits.
      let creditsTop = null
      if (cfg.extra === 'sat' && w >= 1280) { await page.click('.globe-credits a'); await page.waitForTimeout(1500); creditsTop = await page.evaluate(() => { const t = document.querySelector('#sat-credits').getBoundingClientRect().top; const atEnd = scrollY + innerHeight >= document.documentElement.scrollHeight - 2; return atEnd && t > 0 ? 0 : t }) } // (a page already scrolled to its end cannot bring the credits higher)
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
      if (x && cfg.extra === 'sat' && w >= 1280) {
        const want = w >= 1600 ? [0.32, 0.03, 0.65] : [0.36, 0.03, 0.61]
        if (Math.abs(x.left - want[0]) > 0.015 || Math.abs(x.gutter - want[1]) > 0.015 || Math.abs(x.right - want[2]) > 0.015) bad.push(`columns are ${x.left.toFixed(3)} / ${x.gutter.toFixed(3)} / ${x.right.toFixed(3)} of the width (${want.join(' / ')} wanted)`)
        if (Math.abs(x.boxDiff) > 2) bad.push(`the columns' bottoms differ by ${x.boxDiff.toFixed(1)}px`)
        if (Math.abs(x.chipsTop - x.controlsTop) > 2) bad.push(`the chips row and the controls row are ${(x.chipsTop - x.controlsTop).toFixed(1)}px apart`)
        if (x.mapW < 0.6 || x.mapH < 420 - 0.5) bad.push(`the map is ${(x.mapW * 100).toFixed(0)}% x ${x.mapH.toFixed(0)}px (60% and 420px wanted)`)
        if (!x.mapInside) bad.push('the map overflows its column')
        if (!x.oneLine) bad.push('a numeral wraps or overflows its tile')
        if (x.numeral < 22) bad.push(`the numerals are ${x.numeral.toFixed(1)}px (22px wanted)`)
        if (x.tileDx > 2 || x.tileDy > 2) bad.push(`tile content is ${x.tileDx.toFixed(1)}px / ${x.tileDy.toFixed(1)}px off the tile's centre`)
        if (x.overlap) bad.push('the columns overlap')
        if (Math.abs(x.lastText - x.barBottom) > 2) bad.push(`the left column's last line ends ${(x.lastText - x.barBottom).toFixed(1)}px from the clock bar's bottom`)
        if (x.spare.tileRatio > 1.8 + 0.02) bad.push(`the Latest run tiles are ${x.spare.tileRatio.toFixed(2)}x their natural height (1.8x allowed)`)
        if (x.spare.rowH > 44.5) bad.push(`a Risk row is ${x.spare.rowH.toFixed(0)}px (44px allowed)`)
        if (x.spare.tilePad > 0.45 || x.spare.riskPad > 0.45) bad.push('a tile or card has more than 45% vertical padding')
        if ((w === 1920 || w === 2000) && x.spare.flexGap > 160.5) bad.push(`the flexible gap is ${x.spare.flexGap.toFixed(0)}px (160px allowed)`)
        if (x.pipeTop < x.vh - 0.5) bad.push(`the Pipeline heading starts at ${x.pipeTop.toFixed(0)}px, above the window's bottom edge (${x.vh}px)`)
        if (x.creditsGap < 0 || x.creditsGap > 8 + 0.5 + 8 || Math.abs(x.creditsW - x.mapWpx) > 1 || !x.creditsLeftOk) bad.push(`the sources line is ${x.creditsGap.toFixed(1)}px under the clock bar and ${x.creditsW.toFixed(0)}px wide (the map is ${x.mapWpx.toFixed(0)}px)`)
        if (creditsTop !== null && (creditsTop < -2 || creditsTop > x.vh * 0.5)) bad.push(`the Data and credits link leaves the credits at ${creditsTop.toFixed(0)}px from the window's top`)
        if (w >= 1440 && x.barBottom > x.vh + 0.5) bad.push(`the clock bar's bottom is at ${x.barBottom.toFixed(0)}px, below the ${x.vh}px window`)
      }
      if (x && cfg.extra === 'shopIdle' && w >= 1100) {
        if (x.stages !== 5) bad.push(`${x.stages} pipeline tiles (5 wanted: Understand, Search, Check photos, Rank, Results)`)
        if (w >= 1600 && !x.stagesRow) bad.push('the five pipeline tiles are not in one row from 1600px')
        if (w < 1600 && x.stageRows !== 2) bad.push(`the pipeline tiles are in ${x.stageRows} rows (three, then two, from 1100px to 1599px)`)
        if (x.stageText < 150) bad.push(`pipeline tile text is ${x.stageText.toFixed(0)}px wide (150px wanted)`)
        if (x.stageFont < 16.99) bad.push(`pipeline tile text is ${x.stageFont}px (the card token, 17px, wanted)`)
        if (x.clipped) bad.push('a pipeline tile clips its text')
        if (x.guard && (x.guard.hFill < TARGET.hFill || x.guard.vFill < TARGET.hFill)) bad.push(`Guardrails card fill ${x.guard.hFill.toFixed(2)} x ${x.guard.vFill.toFixed(2)} (more than 15% dead space)`)
        if (x.formW < 0.97 || x.inputW < 0.85) bad.push(`the form is ${(x.formW * 100).toFixed(0)}% and the input ${(x.inputW * 100).toFixed(0)}% of the content width`)
        if (Math.abs(x.ledeW - x.rowW) > 1 || Math.abs(x.ledeLeft) > 1) bad.push(`the description is ${x.ledeW.toFixed(0)}px wide and the search row ${x.rowW.toFixed(0)}px`)
        if (x.guardRows < 3) bad.push(`Guardrails shows ${x.guardRows} rows`)
        if (w >= 1440 && x.page > x.vh + 0.5) bad.push(`the idle page is ${x.page}px tall in a ${x.vh}px window`)
      }
      if (x && cfg.extra === 'shopWait') {
        if (x.clipped) bad.push('the wait panel clips its content (taller than its 460px cap)')
        if (x.panelH > 460.5) bad.push(`the wait panel is ${x.panelH.toFixed(0)}px tall (460px at most)`)
        if (x.panelL < -0.5 || x.panelR < -0.5) bad.push('the wait panel leaves the container')
        if (x.panelW < 0.995) bad.push(`the wait panel is ${(x.panelW * 100).toFixed(1)}% of the content width`)
        if (x.canvasW < x.animW - 1 || x.canvasH < x.animH - 1 || x.canvasPx < 2) bad.push(`the canvas (${x.canvasW.toFixed(0)}x${x.canvasH.toFixed(0)}, ${x.canvasPx}px) does not fill the animation box (${x.animW.toFixed(0)}x${x.animH.toFixed(0)})`)
        if (x.steps !== 1 || x.timers !== 1 || x.note !== 1) bad.push(`steps ${x.steps}, timers ${x.timers}, notes ${x.note} (one each wanted)`)
        if (x.hscroll > 1) bad.push(`the page scrolls sideways ${x.hscroll}px`)
        if (x.wide) {
          if (x.animAbove || x.sideLeft < x.animW - 1) bad.push('the animation is not in the left column from 1280px')
        } else {
          if (Math.abs(x.animH - (w < 720 ? 200 : 220)) > 1) bad.push(`the animation is ${x.animH.toFixed(0)}px tall (about 220px stacked wanted: 220, 200 on a phone)`)
          if (!x.animAbove) bad.push('the animation is not above the steps below 1280px')
        }
      }
      if (x && cfg.extra === 'shopAsk') {
        const phone = w < 720
        const wide = w >= 1280
        if (x.panelL < -0.5 || x.panelR < -0.5) bad.push(`the questions panel leaves the container by ${Math.min(x.panelL, x.panelR).toFixed(1)}px`)
        if (x.panelW < 0.995) bad.push(`the questions panel is ${(x.panelW * 100).toFixed(1)}% of the content width`)
        if (x.questions !== 1) bad.push(`${x.questions} questions visible (one at a time wanted)`)
        if (cfg.wantStep && x.count !== cfg.wantStep) bad.push(`the panel shows "${x.count}" (${cfg.wantStep} wanted)`)
        if (x.panelH > (phone ? ASK.panelMaxPhone : ASK.panelMax) + 0.5) bad.push(`the questions panel is ${x.panelH.toFixed(0)}px tall (${phone ? ASK.panelMaxPhone : ASK.panelMax}px wanted)`)
        if (x.tileMin < (phone ? ASK.tileMinPhone : ASK.tileMin)) bad.push(`an option tile is ${x.tileMin.toFixed(0)}px wide (${phone ? ASK.tileMinPhone : ASK.tileMin}px wanted)`)
        if (x.tileMax > ASK.tileMax + 0.5) bad.push(`an option tile is ${x.tileMax.toFixed(0)}px wide (${ASK.tileMax}px at most)`)
        if (x.rowDiff > ASK.rowDiff) bad.push(`tiles in a row differ in height by ${x.rowDiff.toFixed(1)}px (${ASK.rowDiff}px allowed)`)
        if (x.rowWDiff > 1) bad.push(`tiles in a row differ in width by ${x.rowWDiff.toFixed(1)}px`)
        if (Math.abs(x.tileLeft) > 1) bad.push(`the first tile is ${x.tileLeft.toFixed(1)}px from the panel's left edge (left-aligned wanted)`)
        if (Math.abs(x.labelMin - x.labelWant) > 0.5) bad.push(`tile labels are ${x.labelMin}px, the card token is ${x.labelWant}px`)
        if (Math.abs(x.heading - x.headWant) > 0.5 || Math.abs(x.head2 - x.headWant) > 0.5) bad.push(`question headings are ${x.heading}px / ${x.head2}px, the label token is ${x.headWant}px`)
        if (x.smalls.some((v) => Math.abs(v - x.smallWant) > 0.5)) bad.push(`the sub-line, count or chip is ${x.smalls.join('/')}px, the small token is ${x.smallWant}px`)
        if (x.picRatio.some((r) => Math.abs(r - (w >= 1600 ? 3 / 2 : 4 / 3)) > 0.02)) bad.push(`a picture area is not ${w >= 1600 ? '3:2' : '4:3'}`)
        if (!x.fitOk) bad.push('a picture is not object-fit: contain')
        if (x.over.length) bad.push(`content overflows inside the panel: ${x.over.slice(0, 3).join(', ')}`)
        if (x.dotCount !== (cfg.wantDots ?? 5)) bad.push(`${x.dotCount} progress dots (${cfg.wantDots ?? 5} in the fixture)`)
        if (x.dotMin < 43.5) bad.push(`a progress dot's touch target is ${x.dotMin.toFixed(0)}px (44px wanted)`)
        if (x.stepsCount !== 1) bad.push(`the progress steps are in the page ${x.stepsCount} times (once wanted)`)
        if (x.timers !== 1) bad.push(`${x.timers} timers (one wanted)`)
        if (wide) {
          const si = x.sideInfo
          if (!si) bad.push('no right column in the questions panel at 1280px or wider')
          else {
            if (si.equal > 1) bad.push(`the panel's columns differ in height by ${si.equal.toFixed(1)}px`)
            if (si.hairline !== '1px' || si.hairlineColor !== si.border) bad.push(`no hairline in the card border colour between the columns (${si.hairline} ${si.hairlineColor})`)
            if (!si.stepsIn) bad.push('the progress steps are not in the right column')
            if (si.gap > ASK.sideGap + 0.5) bad.push(`the right column's last block ends ${si.gap.toFixed(0)}px above its inner bottom (${ASK.sideGap}px wanted; fill ${si.vFill.toFixed(2)})`)
            if (si.vFill < 0.85) bad.push(`the right column's vertical fill is ${si.vFill.toFixed(2)} (0.85 wanted)`)
            const wantW = Math.min(440, Math.max(280, 0.26 * x.panelWpx))
            if (Math.abs(si.sideW - wantW) > 1.5) bad.push(`the right column is ${si.sideW.toFixed(0)}px wide (clamp(280px, 26%, 440px) = ${wantW.toFixed(0)}px wanted)`)
            if (cfg.picks && si.chips !== cfg.picks) bad.push(`${si.chips} picks (${cfg.picks} in the fixture)`)
            if (cfg.picks && si.band > ASK.band + 0.5) bad.push(`the band between the picks and the note is ${si.band.toFixed(0)}px (${ASK.band}px wanted with ${cfg.picks} picks)`)
            if (si.overflow.length) bad.push(`right column blocks overflow: ${si.overflow.join(', ')}`)
            const want = x.rowTiles >= 3 ? ASK.cover : ASK.cover2
            if (x.cover < want) bad.push(`the tile row covers ${x.cover.toFixed(2)} of the left column (${want} wanted for ${x.rowTiles} options)`)
          }
        } else {
          if (x.sideInfo) bad.push('the right column shows below 1280px')
          if (!x.stepsAbove) bad.push('the progress steps are not above the questions')
        }
        if (!x.inWindow) bad.push(`the panel is not fully in the window after the auto-scroll (${x.winTop.toFixed(0)} to ${x.winBottom.toFixed(0)} in a ${x.vh}px window)`)
        for (const m of x.interact ?? []) bad.push(`interaction: ${m}`)
      }
      if (x && cfg.extra === 'shopFresh' && x.guardRows < 3) bad.push(`Guardrails shows ${x.guardRows} rows on a first load`)
      if (x && cfg.extra === 'shopIdle' && w < 1100 && x.stages) {
        if (w > 520 && x.stacked2x2 !== 2) bad.push('the pipeline tiles are not two across')
        if (w <= 520 && x.stacked2x2 !== 1) bad.push('the pipeline tiles are not one column')
        if (x.clipped) bad.push('a pipeline tile clips its text')
      }
      if (x && cfg.extra === 'shopResults' && w >= 1100 && x.gridW !== null && Math.abs(x.gridW - x.gridWanted) > 2) bad.push(`the results grid is ${x.gridW.toFixed(0)}px wide, the content is ${x.gridWanted.toFixed(0)}px`)
      rows.push({ cfg, w, h, m, x, bad })
    }
  }
  // ShopAI against SatPOV, window by window: the title's computed style, the chips and the description.
  const sat = (w, h) => rows.find((r) => r.cfg.name === 'SatPOV' && r.w === w && r.h === h)
  for (const r of rows) {
    if (!r.cfg.name.startsWith('ShopAI')) continue
    const s = sat(r.w, r.h)
    if (!s || !r.m.h1 || !s.m.h1) continue
    const a = r.m.h1, b = s.m.h1
    if (a.family !== b.family || a.weight !== b.weight || a.color !== b.color || Math.abs(a.size - b.size) > 0.1) r.bad.push(`the title (${a.size}px ${a.weight}) differs from SatPOV's (${b.size}px ${b.weight})`)
    if (r.x && s.x && r.w >= 1100) {
      if (Math.abs(r.x.chipH - s.x.chipH) > 0.5 || Math.abs(r.x.chipGap - s.x.chipGap) > 0.5) r.bad.push(`the chips (${r.x.chipH}px high, ${r.x.chipGap}px apart) differ from SatPOV's (${s.x.chipH}px, ${s.x.chipGap}px)`)
    }
  }
  console.log('\n=== style: page-specific layout ===')
  for (const { cfg, w, h, x } of rows) {
    if (!x || (w < 1100 && cfg.extra !== 'shopAsk' && cfg.extra !== 'shopWait')) continue
    const tag = `${cfg.name.padEnd(18)}${`${w}x${h}`.padEnd(11)}`
    if (cfg.extra === 'sat') console.log(`${tag}columns ${x.left.toFixed(3)} / ${x.gutter.toFixed(3)} / ${x.right.toFixed(3)} | map ${(x.mapW * 100).toFixed(0)}% x ${x.mapH.toFixed(0)}px | Pipeline top ${x.pipeTop.toFixed(0)} (window ${x.vh}) | tile centre off ${x.tileDx.toFixed(1)}/${x.tileDy.toFixed(1)}px | numerals ${x.numeral.toFixed(1)}px | S ${x.spare.S.toFixed(0)}px = gaps ${x.spare.gaps.toFixed(0)} (${x.spare.gapEach.toFixed(0)} each) + tiles ${x.spare.tiles.toFixed(0)} (${x.spare.tileRatio.toFixed(2)}x) + risk card ${x.spare.risk.toFixed(0)} (rows ${x.spare.rowH.toFixed(0)}px) + flexible gap ${x.spare.flexGap.toFixed(0)} | left last line ${(x.lastText - x.barBottom).toFixed(0)}px from the clock bar | sources line ${x.creditsGap.toFixed(0)}px under the bar, ${x.creditsW.toFixed(0)}px wide | bar bottom ${x.barBottom.toFixed(0)}`)
    else if (cfg.extra === 'shopIdle') console.log(`${tag}title+chips+text: chips ${x.chipCount} (${x.chipH}px, gap ${x.chipGap}px), description ${x.ledeLines} lines (${x.ledeW.toFixed(0)}px, search row ${x.rowW.toFixed(0)}px), Guardrails rows ${x.guardRows} | ${x.stages} tiles in ${x.stageRows} row(s), text ${x.stageText.toFixed(0)}px wide ${x.stageFont}px${x.clipped ? ' CLIPPED' : ''}, tile fill ${x.tileFillMin.toFixed(2)} | Guardrails ${x.guard ? `${(x.guard.widthPct * 100).toFixed(0)}% wide, fill ${x.guard.hFill.toFixed(2)} x ${x.guard.vFill.toFixed(2)}` : 'none'} | page ${x.page}/${x.vh}`)
    else if (cfg.extra === 'shopWait') console.log(`${tag}wait panel ${(x.panelW * 100).toFixed(1)}% wide ${x.panelH.toFixed(0)}px tall, animation ${x.animW.toFixed(0)}x${x.animH.toFixed(0)}px, side ${x.sideW.toFixed(0)}px, canvas ${x.canvasPx}px`)
    else if (cfg.extra === 'shopAsk') console.log(`${tag}questions panel ${(x.panelW * 100).toFixed(1)}% wide ${x.panelH.toFixed(0)}px tall, "${x.count}", ${x.tiles} tiles (${x.textTiles} text) ${x.tileMin.toFixed(0)}-${x.tileMax.toFixed(0)}px wide, heights ${[...new Set(x.tileH)].join('/')}px (row diff ${x.rowDiff.toFixed(1)}), labels ${x.labelMin}px, headings ${x.heading}px | ${x.sideInfo ? `columns ${(x.sideInfo.left * 100).toFixed(0)}/${(x.sideInfo.w * 100).toFixed(0)}% (height diff ${x.sideInfo.equal.toFixed(1)}), cover ${x.cover.toFixed(2)} of ${x.rowTiles} tiles, right column ${x.sideInfo.sideW.toFixed(0)}px = ${(x.sideInfo.share * 100).toFixed(0)}% (${x.sideInfo.chips} picks, band ${x.sideInfo.band.toFixed(0)}px), fill ${x.sideInfo.vFill.toFixed(2)}, steps inside` : `one column, steps ${x.stepsAbove ? 'above' : 'NOT ABOVE'}`} | auto-scroll ${x.scrollY}px, panel ${x.winTop.toFixed(0)}-${x.winBottom.toFixed(0)} of ${x.vh} ${x.inWindow ? 'in view' : 'NOT IN VIEW'} | page ${x.page}${x.hscroll > 1 ? ` | SCROLLS SIDEWAYS ${x.hscroll}px` : ''}${x.interact ? (x.interact.length ? ' | INTERACTION FAILED' : ' | interaction ok') : ''}`)
    else if (cfg.extra === 'shopFresh') console.log(`${tag}Guardrails rows on a first load: ${x.guardRows}`)
    else if (cfg.extra === 'shopResults') console.log(`${tag}results grid ${x.gridW === null ? '-' : x.gridW.toFixed(0)}px of ${x.gridWanted.toFixed(0)}px`)
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

// Product cards (fixture askcards): the cards are subgrid rows, so within one row of cards each section starts at the same height, and the
// comment popover is a floating layer that changes no card. Measured at five desktop windows and the phone.
async function runCards(browser, base) {
  const SIZES_CARDS = [[1280, 720], [1440, 900], [1920, 1080], [2000, 1100], [2560, 1440], [390, 844]]
  const tops = () => {
    const cards = [...document.querySelectorAll('.shop-grid > .shop-card')]
    const sy = -document.querySelector('.shop-grid').getBoundingClientRect().top // positions are relative to the grid (the Saved row above it may grow when a card is saved)
    const top = (el) => (el ? Math.round((el.getBoundingClientRect().top + sy) * 100) / 100 : null)
    const info = cards.map((c, i) => {
      const r = c.getBoundingClientRect()
      return { i, row: Math.round(r.top + sy), left: Math.round(r.left), h: r.height, open: top(c.querySelector('.shop-open')), rate: top(c.querySelector('.shop-rate')), slot: top(c.querySelector('.shop-comment-slot')), price: top(c.querySelector('.shop-card-price')), btns: [...c.querySelectorAll('.shop-rate-btn')].map((b) => { const q = b.getBoundingClientRect(); return [q.left, q.top + sy, q.width, q.height].map((v) => Math.round(v * 100) / 100) }), wraps: [...c.querySelectorAll('.shop-rate-btn')].some((b) => b.scrollWidth > b.clientWidth + 1 || b.getBoundingClientRect().height > 40), slotH: c.querySelector('.shop-comment-slot').getBoundingClientRect().height }
    })
    return info
  }
  const out = []
  for (const [w, h] of SIZES_CARDS) {
    const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage()
    await page.goto(base + 'shop?fixture=askcards', { waitUntil: 'load' })
    await page.waitForSelector('.shop-grid > .shop-card', { timeout: 30000 })
    await page.waitForTimeout(500)
    const before = await page.evaluate(tops)
    const rows = new Map()
    for (const c of before) { const k = Math.round(c.row / 4); const key = [...rows.keys()].find((q) => Math.abs(q - k) <= 1) ?? k; rows.set(key, [...(rows.get(key) ?? []), c]) }
    const dev = (key, list) => Math.max(...list.map((c) => c[key])) - Math.min(...list.map((c) => c[key]))
    const bad = []
    let maxOpen = 0, maxRate = 0, maxSlot = 0, maxPrice = 0, perRow = []
    for (const list of rows.values()) {
      const d = { open: dev('open', list), rate: dev('rate', list), slot: dev('slot', list), price: dev('price', list) }
      perRow.push(`${list.length}c o${d.open.toFixed(2)} r${d.rate.toFixed(2)}`)
      maxOpen = Math.max(maxOpen, d.open); maxRate = Math.max(maxRate, d.rate); maxSlot = Math.max(maxSlot, d.slot); maxPrice = Math.max(maxPrice, d.price)
    }
    if (maxOpen > 1) bad.push(`Open buttons differ by ${maxOpen.toFixed(2)}px within a row`)
    if (maxRate > 1) bad.push(`rating buttons differ by ${maxRate.toFixed(2)}px within a row`)
    if (maxSlot > 1) bad.push(`comment lines differ by ${maxSlot.toFixed(2)}px within a row`)
    if (before.some((c) => c.slotH < 19.5 || c.slotH > 20.5)) bad.push('a comment line is not 20px high')
    if (before.some((c) => c.wraps)) bad.push('a rating button wraps or is clipped')
    if (w < 520 && new Set(before.map((c) => c.left)).size !== 1) bad.push('the phone layout is not one column')
    // Rating or liking cards, with the popover opening each time: no button of any card moves, no card changes height.
    let shift = 0
    for (const idx of [2, 3, 0]) {
      const card = page.locator('.shop-grid > .shop-card').nth(idx)
      await card.locator('.shop-rate-btn.is-like').click()
      await page.waitForTimeout(150)
      const open = await page.evaluate(tops)
      if (!(await card.locator('.shop-pop').count())) bad.push(`card ${idx + 1}: no popover after rating`)
      for (let i = 0; i < before.length; i++) {
        const a = before[i], b = open[i]
        if (process.env.DEBUG_CARDS) for (const k of ['open', 'rate', 'slot', 'h']) if (Math.abs(a[k] - b[k]) > 1) console.log(`  card ${i + 1} ${k}: ${a[k]} -> ${b[k]} (rated card ${idx + 1})`)
        shift = Math.max(shift, Math.abs(a.open - b.open), Math.abs(a.rate - b.rate), Math.abs(a.slot - b.slot), Math.abs(a.h - b.h), ...a.btns.flatMap((q, k) => q.map((v, j) => (j < 2 ? Math.abs(v - b.btns[k][j]) : Math.abs(v - b.btns[k][j])))))
      }
      if (idx === 3) await page.keyboard.press('Escape')
      before.splice(0, before.length, ...(await page.evaluate(tops)))
    }
    if (shift > 1) bad.push(`rating a card moved something by ${shift.toFixed(2)}px`)
    // The popover is fully inside the window (or flipped above) and not clipped.
    await page.locator('.shop-grid > .shop-card').nth(7).scrollIntoViewIfNeeded()
    await page.locator('.shop-grid > .shop-card').nth(7).locator('.shop-rate-btn.is-love').click()
    await page.waitForTimeout(150)
    const pop = await page.evaluate(() => { const p = document.querySelector('.shop-pop'); const r = p.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, vh: innerHeight, vw: innerWidth, above: p.classList.contains('is-above'), focus: document.activeElement?.tagName } })
    if (pop.top < 0 || pop.bottom > pop.vh + 0.5 || pop.left < 0 || pop.right > pop.vw + 0.5) bad.push(`the popover is outside the window (${pop.top.toFixed(0)}-${pop.bottom.toFixed(0)} of ${pop.vh})`)
    if (pop.focus !== 'TEXTAREA') bad.push(`focus is on ${pop.focus}, not the textarea`)
    const cols = new Set(before.map((c) => c.left)).size
    out.push({ w, h, cols, maxOpen, maxRate, maxSlot, maxPrice, shift, perRow, bad })
    await page.context().close()
  }
  console.log('\n=== product cards (askcards): alignment within each row of cards ===')
  console.log('window'.padEnd(11) + 'cols'.padEnd(6) + 'max dev Open'.padEnd(14) + 'rating btns'.padEnd(13) + 'comment line'.padEnd(14) + 'price'.padEnd(8) + 'shift on rate'.padEnd(15) + 'rows (cards, Open dev, rating dev)')
  for (const r of out) console.log(`${r.w}x${r.h}`.padEnd(11) + String(r.cols).padEnd(6) + `${r.maxOpen.toFixed(2)}px`.padEnd(14) + `${r.maxRate.toFixed(2)}px`.padEnd(13) + `${r.maxSlot.toFixed(2)}px`.padEnd(14) + `${r.maxPrice.toFixed(2)}px`.padEnd(8) + `${r.shift.toFixed(2)}px`.padEnd(15) + r.perRow.join(' | '))
  for (const r of out) for (const b of r.bad) misses.push(`${r.w}x${r.h} product cards | ${b}`)
}

const reasonsUsed = new Set()
const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'silent' })
await server.listen()
const url = `http://127.0.0.1:${server.httpServer.address().port}/`
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const misses = []
const fmt = (n, d = 3) => n.toFixed(d)
try {
  for (const [w, h] of MODE === 'style' || MODE === 'cards' ? [] : SIZES) {
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
  if (MODE === 'cards' || MODE === 'style' || MODE === 'all') await runCards(browser, url)
  if (MODE !== 'home' && MODE !== 'cards') await runStyle(browser, url)
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
