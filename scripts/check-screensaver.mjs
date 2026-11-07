// Measures how rich each wait-screensaver pattern is, in headless Chromium (software rendering; the numbers are pixels, not speed):
//   npm run check:screensaver     (Playwright from PLAYWRIGHT_DIR if it is not installed here)
// Each pattern runs 6 s of simulated time (180 frames at 30 fps) with a seeded RNG on a real canvas, for several seeds. It fails unless
//   coverage   >= 25% of the canvas pixels differ from the background (a channel differs by more than 6 of 255), and
//   change     >= 1% of the pixels differ between the pictures at 3 s and at 6 s.
// SHOTS=<dir> also saves each pattern after 8 s at 2000x1100, and the first pattern at 390x844, as PNGs.
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

const SIZES = [[640, 300], [390, 220]]
const SEEDS = [1, 2, 3]
const MIN_COVERAGE = 0.25
const MIN_CHANGE = 0.01
const shots = process.env.SHOTS

const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' })
await server.listen()
const url = `http://127.0.0.1:${server.config.server.port}/`
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext()).newPage()
page.on('pageerror', (e) => console.error('page error:', e.message))
await page.goto(url)

// Runs in the page: `seconds` of simulated time, with a snapshot of the pixels at each of `at`.
async function run({ pattern, seed, w, h, seconds, at, png }) {
  const { startScreensaver, DEFAULT_COLORS } = await import('/src/shop/screensaver.ts')
  const rng = (() => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } })()
  const canvas = document.createElement('canvas')
  let cb = null
  const saver = startScreensaver({
    canvas, size: () => ({ w, h }), dpr: () => 1, raf: (f) => ((cb = f), 1), caf: () => {}, observe: () => () => {},
    doc: { hidden: false, addEventListener() {}, removeEventListener() {} }, reducedMotion: () => false, random: rng, pattern,
  })
  const ctx = canvas.getContext('2d')
  const snaps = {}
  const frames = Math.round(seconds * 30)
  for (let i = 1; i <= frames; i++) {
    const f = cb
    f((i - 1) * (1000 / 30))
    for (const s of at) if (i === Math.round(s * 30)) snaps[s] = ctx.getImageData(0, 0, w, h).data
  }
  saver.stop()
  const bg = DEFAULT_COLORS.bg.slice(1).match(/../g).map((x) => parseInt(x, 16))
  const differs = (d, i, ref) => Math.max(Math.abs(d[i] - ref[0]), Math.abs(d[i + 1] - ref[1]), Math.abs(d[i + 2] - ref[2])) > 6
  const last = snaps[at[at.length - 1]]
  let cover = 0, change = 0
  for (let i = 0; i < last.length; i += 4) {
    if (differs(last, i, bg)) cover++
    if (at.length > 1 && differs(last, i, [snaps[at[0]][i], snaps[at[0]][i + 1], snaps[at[0]][i + 2]])) change++
  }
  const px = last.length / 4
  return { coverage: cover / px, change: change / px, png: png ? canvas.toDataURL('image/png') : null }
}

let failed = false
console.log('pattern     size      seed  coverage  change(3s->6s)')
for (const pattern of ['spirograph', 'mystify', 'pipes']) {
  for (const [w, h] of SIZES) {
    for (const seed of SEEDS) {
      const r = await page.evaluate(run, { pattern, seed, w, h, seconds: 6, at: [3, 6], png: false })
      const ok = r.coverage >= MIN_COVERAGE && r.change >= MIN_CHANGE
      if (!ok) failed = true
      console.log(`${pattern.padEnd(11)} ${`${w}x${h}`.padEnd(9)} ${String(seed).padEnd(5)} ${(r.coverage * 100).toFixed(1).padStart(5)}%   ${(r.change * 100).toFixed(1).padStart(5)}%  ${ok ? 'ok' : 'FAIL'}`)
    }
  }
}
if (shots) {
  mkdirSync(shots, { recursive: true })
  for (const [pattern, w, h] of [['spirograph', 2000, 1100], ['mystify', 2000, 1100], ['pipes', 2000, 1100], [process.env.MOBILE_PATTERN ?? 'spirograph', 390, 844]]) {
    const r = await page.evaluate(run, { pattern, seed: 7, w, h, seconds: 8, at: [8], png: true })
    const file = `${shots}/${pattern}-${w}x${h}.png`
    writeFileSync(file, Buffer.from(r.png.split(',')[1], 'base64'))
    console.log(`saved ${file} (coverage ${(r.coverage * 100).toFixed(1)}%)`)
  }
}
await browser.close()
await server.close()
if (failed) { console.error(`FAIL: a pattern is under ${MIN_COVERAGE * 100}% coverage or changes less than ${MIN_CHANGE * 100}% between 3 s and 6 s.`); process.exit(1) }
console.log('screensaver richness ok')
