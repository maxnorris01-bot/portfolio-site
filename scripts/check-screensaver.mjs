// Measures how rich the wait screensaver's oscilloscope waves are, in headless Chromium (software rendering; the numbers are pixels, not speed):
//   npm run check:screensaver     (Playwright from PLAYWRIGHT_DIR if it is not installed here)
// The waves run with a seeded RNG on a real canvas, for several seeds and sizes, simulated at 30 fps. It fails unless
//   the drawn waves span >= 25% of the canvas width at 4 s, >= 50% at 8 s and >= 75% at 14 s,
//   their combined vertical extent is >= 35% of the canvas height at 14 s, and
//   the picture differs (>= 1% of the pixels) between 6 s and 8 s.
// "Drawn" means ink: a pixel whose colour is far from the background (the faint dashed centre line does not count).
// SHOTS=<dir> also saves the wave picture after 4 s, 8 s and 14 s at 2000x1100, and after 8 s at 390x844, as PNGs.
import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'vite'

const require = createRequire(import.meta.url)
let chromium
try {
  ;({ chromium } = require(require.resolve('playwright', process.env.PLAYWRIGHT_DIR ? { paths: [process.env.PLAYWRIGHT_DIR] } : undefined)))
} catch {
  console.error('check:screensaver needs Playwright with Chromium (set PLAYWRIGHT_DIR to a folder whose node_modules has it).')
  process.exit(2)
}

const SIZES = [[640, 300], [390, 220], [2000, 1100], [390, 844]]
const SEEDS = [1, 2, 3]
const SPAN = { 4: 0.25, 8: 0.5, 14: 0.75 }
const MIN_HEIGHT = 0.35
const MIN_CHANGE = 0.01
const shots = process.env.SHOTS

const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' })
await server.listen()
const url = `http://127.0.0.1:${server.config.server.port}/`
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext()).newPage()
page.on('pageerror', (e) => console.error('page error:', e.message))
await page.goto(url)

// Runs in the page: 14 s of simulated time, with a snapshot of the pixels at each of `at`.
async function run({ seed, w, h, at, png }) {
  const { startScreensaver, DEFAULT_COLORS } = await import('/src/shop/screensaver.ts')
  const rng = (() => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } })()
  const canvas = document.createElement('canvas')
  let cb = null
  const saver = startScreensaver({
    canvas, size: () => ({ w, h }), dpr: () => 1, raf: (f) => ((cb = f), 1), caf: () => {}, observe: () => () => {},
    doc: { hidden: false, addEventListener() {}, removeEventListener() {} }, reducedMotion: () => false, random: rng,
  })
  const ctx = canvas.getContext('2d')
  const bg = DEFAULT_COLORS.bg.slice(1).match(/../g).map((x) => parseInt(x, 16))
  const ink = (d, i) => Math.max(Math.abs(d[i] - bg[0]), Math.abs(d[i + 1] - bg[1]), Math.abs(d[i + 2] - bg[2])) > 60
  const snaps = {}
  const out = { spans: {}, pngs: {} }
  const last = Math.max(...at)
  for (let i = 1; i <= last * 30; i++) {
    cb((i - 1) * (1000 / 30))
    for (const s of at) {
      if (i !== Math.round(s * 30)) continue
      const d = ctx.getImageData(0, 0, w, h).data
      snaps[s] = d
      let x0 = w, x1 = -1, y0 = h, y1 = -1
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ink(d, (y * w + x) * 4)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
      out.spans[s] = { width: x1 < 0 ? 0 : (x1 - x0 + 1) / w, height: y1 < 0 ? 0 : (y1 - y0 + 1) / h }
      if (png) out.pngs[s] = canvas.toDataURL('image/png')
    }
  }
  saver.stop()
  if (snaps[6] && snaps[8]) {
    let diff = 0
    for (let i = 0; i < snaps[6].length; i += 4) if (Math.max(Math.abs(snaps[6][i] - snaps[8][i]), Math.abs(snaps[6][i + 1] - snaps[8][i + 1]), Math.abs(snaps[6][i + 2] - snaps[8][i + 2])) > 6) diff++
    out.change = diff / (snaps[6].length / 4)
  }
  return out
}

let failed = false
const pct = (v) => `${(v * 100).toFixed(1).padStart(5)}%`
console.log('size       seed  span@4s  span@8s  span@14s  height@14s  change(6s->8s)')
for (const [w, h] of SIZES) {
  for (const seed of SEEDS) {
    const r = await page.evaluate(run, { seed, w, h, at: [4, 6, 8, 14], png: false })
    const ok = Object.entries(SPAN).every(([s, min]) => r.spans[s].width >= min) && r.spans[14].height >= MIN_HEIGHT && r.change >= MIN_CHANGE
    if (!ok) failed = true
    console.log(`${`${w}x${h}`.padEnd(10)} ${String(seed).padEnd(5)} ${pct(r.spans[4].width)}  ${pct(r.spans[8].width)}  ${pct(r.spans[14].width)}   ${pct(r.spans[14].height)}     ${pct(r.change)}  ${ok ? 'ok' : 'FAIL'}`)
  }
}
if (shots) {
  mkdirSync(shots, { recursive: true })
  for (const [w, h, at] of [[2000, 1100, [4, 8, 14]], [390, 844, [8]]]) {
    const r = await page.evaluate(run, { seed: 7, w, h, at, png: true })
    for (const s of at) {
      const file = `${shots}/waves-${w}x${h}-${s}s.png`
      writeFileSync(file, Buffer.from(r.pngs[s].split(',')[1], 'base64'))
      console.log(`saved ${file}`)
    }
  }
}
await browser.close()
await server.close()
if (failed) { console.error(`FAIL: the waves span less than ${JSON.stringify(SPAN)} of the width, are under ${MIN_HEIGHT * 100}% tall, or change less than ${MIN_CHANGE * 100}% between 6 s and 8 s.`); process.exit(1) }
console.log('screensaver richness ok')
