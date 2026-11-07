// The wait screensaver's engine: "oscilloscope waves" drawn on a canvas while a search runs. Three layered sine waves under a shared,
// breathing amplitude envelope are traced from the left edge like a live signal; the pen reaches about 80% of the width after RAMP_SECONDS
// and then holds while the drawn waves scroll left. No library. Everything the browser provides (animation frames, the observer, the
// tab's visibility, randomness) comes in through `Deps`, so tests drive it with fakes. The clock is the frame count (30 per second), so a
// run is the same on every machine.

export const MAX_FPS = 30
/** Seconds the pen takes to reach PEN_STOP of the width (configurable through Deps.rampSeconds). */
export const RAMP_SECONDS = 14
/** Where the pen holds, as a share of the canvas width. */
export const PEN_STOP = 0.8
/** The still frame (reduced motion) is drawn as if this many seconds had passed. */
export const STILL_SECONDS = 10
/** Scroll speed once the pen holds, in CSS px per second; it eases in over SCROLL_EASE seconds so nothing jumps. */
export const SCROLL_SPEED = 60
export const SCROLL_EASE = 2
/** Peak amplitude, as a share of the canvas height. */
export const PEAK = 0.38

export type Colors = { bg: string; navy: string; coral: string; slate: string; centre: string }
/** The site's palette (src/styles/tokens.css) on the card's off-white, used when the page's tokens cannot be read. */
export const DEFAULT_COLORS: Colors = { bg: '#F6F6F3', navy: '#0B1B33', coral: '#E85D3F', slate: '#3C5A87', centre: '#DEDDD6' }

export type Ctx = {
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void
  fillRect(x: number, y: number, w: number, h: number): void
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  stroke(): void
  arc(x: number, y: number, r: number, a0: number, a1: number): void
  fill(): void
  setLineDash(segments: number[]): void
  strokeStyle: string | CanvasGradient | CanvasPattern
  fillStyle: string | CanvasGradient | CanvasPattern
  lineWidth: number
  globalAlpha: number
  lineJoin: CanvasLineJoin
  lineCap: CanvasLineCap
}
export type CanvasLike = { width: number; height: number; getContext(kind: '2d'): Ctx | null }

export type Deps = {
  canvas: CanvasLike
  /** The canvas's CSS size in pixels. */
  size: () => { w: number; h: number }
  dpr: () => number
  raf: (cb: (t: number) => void) => number
  caf: (id: number) => void
  /** Watches the container; `cb` runs on every size change. Returns the stop function. */
  observe: (cb: () => void) => () => void
  doc: { hidden: boolean; addEventListener(type: 'visibilitychange', cb: () => void): void; removeEventListener(type: 'visibilitychange', cb: () => void): void }
  reducedMotion: () => boolean
  random: () => number
  colors?: Colors
  /** 0..1 from completed steps over all steps: each step raises the amplitude and spreads the frequencies a little. Without it, full amplitude. */
  progress?: number
  /** Starting phase in radians (tests); otherwise drawn from `random`. */
  phase?: number
  /** Seconds the pen takes to reach 80% of the width. */
  rampSeconds?: number
}

const TAU = Math.PI * 2
/** One wave: colour, line width (px at 1x), frequency relative to the first (about 1 : 1.7 : 2.6), relative amplitude, phase offset. */
const WAVES = [
  { key: 'navy', width: 1.9, freq: 1, amp: 1, phase: 0 },
  { key: 'coral', width: 1.7, freq: 1.7, amp: 0.82, phase: 2.1 },
  { key: 'slate', width: 1.4, freq: 2.6, amp: 0.64, phase: 4.3 },
] as const
/** Wavelength of the slowest wave in CSS px. */
const BASE_WAVELENGTH = 190
const ALPHA = 0.85
const STEP = 2 // px between the points of a polyline
const DOT = 3.6

/** The shared envelope at world position `x` (px): swells and fades between .35 and 1. */
export const envelope = (x: number) => 0.35 + 0.65 * Math.abs(Math.sin(x / 70 + 0.4)) * (0.6 + 0.4 * Math.sin(x / 23))

/** Where the pen is after `t` seconds: its screen x and how far the drawing has scrolled left. */
export function pen(t: number, w: number, ramp = RAMP_SECONDS): { x: number; scroll: number } {
  const stop = PEN_STOP * w
  if (t <= ramp) {
    const k = Math.max(0, t) / ramp
    return { x: stop * (1 - Math.pow(1 - k, 1.5)), scroll: 0 } // eases out, so it is already close to the stop when it holds
  }
  const tau = t - ramp
  return { x: stop, scroll: SCROLL_SPEED * (tau < SCROLL_EASE ? (tau * tau) / (2 * SCROLL_EASE) : tau - SCROLL_EASE / 2) }
}

/** Amplitude factor (of PEAK) and frequency spread for a progress of 0..1 (undefined: full, no spread). */
export const progressLook = (p: number | undefined) => (p === undefined ? { amp: 1, spread: 0 } : { amp: 0.6 + 0.4 * Math.min(1, Math.max(0, p)), spread: 0.18 * Math.min(1, Math.max(0, p)) })

export type Screensaver = { stop: () => void; setProgress: (p: number | undefined) => void }

/** Starts the screensaver on the canvas. `stop` cancels the pending frame, disconnects the observer and the visibility listener. */
export function startScreensaver(d: Deps): Screensaver {
  const ctx = d.canvas.getContext('2d')
  const colors = d.colors ?? DEFAULT_COLORS
  const reduced = d.reducedMotion()
  const ramp = d.rampSeconds ?? RAMP_SECONDS
  const phase0 = d.phase ?? d.random() * TAU
  let progress = d.progress
  let amp = progressLook(progress).amp // eased toward the target so a finished step swells the waves instead of jumping
  let id: number | null = null
  let last = -Infinity
  let stopped = false
  let n = 0

  const draw = (t: number) => {
    if (!ctx) return
    const { w, h } = d.size()
    const look = progressLook(progress)
    amp += (look.amp - amp) * 0.08
    const { x: penX, scroll } = pen(t, w, ramp)
    const cy = h / 2
    ctx.globalAlpha = 1
    ctx.setLineDash([])
    ctx.fillStyle = colors.bg
    ctx.fillRect(0, 0, w, h)
    // the faint dashed centre line
    ctx.strokeStyle = colors.centre
    ctx.lineWidth = 1
    ctx.setLineDash([5, 5])
    ctx.beginPath()
    ctx.moveTo(0, cy)
    ctx.lineTo(w, cy)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    WAVES.forEach((wave, i) => {
      const freq = wave.freq * (1 + look.spread * i * 0.5)
      const k = TAU * freq / BASE_WAVELENGTH
      const a = PEAK * h * amp * wave.amp
      const y = (x: number) => {
        const u = x + scroll
        return cy + a * envelope(u) * Math.sin(k * u + phase0 + wave.phase)
      }
      ctx.strokeStyle = colors[wave.key]
      ctx.fillStyle = colors[wave.key]
      ctx.lineWidth = wave.width
      ctx.globalAlpha = ALPHA
      ctx.beginPath()
      ctx.moveTo(0, y(0))
      for (let x = STEP; x < penX; x += STEP) ctx.lineTo(x, y(x))
      ctx.lineTo(penX, y(penX))
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(penX, y(penX), DOT, 0, TAU) // the leading dot
      ctx.fill()
    })
    ctx.globalAlpha = 1
  }
  const advance = () => draw(n++ / MAX_FPS)

  const resize = () => {
    const { w, h } = d.size()
    const dpr = Math.max(1, d.dpr())
    d.canvas.width = Math.max(1, Math.round(w * dpr))
    d.canvas.height = Math.max(1, Math.round(h * dpr))
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0) // a resize clears the canvas; the next frame redraws it (reduced motion: redraw now)
    if (reduced) {
      amp = progressLook(progress).amp
      draw(STILL_SECONDS)
    } else if (n > 0) draw((n - 1) / MAX_FPS)
  }
  const frame = (t: number) => {
    id = null
    if (stopped || d.doc.hidden) return
    id = d.raf(frame)
    if (t - last < 1000 / MAX_FPS - 2) return
    last = t
    advance()
  }
  const start = () => {
    if (stopped || reduced || id !== null || d.doc.hidden) return
    last = -Infinity
    id = d.raf(frame)
  }
  const onVisibility = () => {
    if (d.doc.hidden) {
      if (id !== null) d.caf(id)
      id = null
    } else start()
  }

  resize() // reduced motion: this already drew the one still frame, as if 10 s had passed
  const unobserve = d.observe(resize)
  d.doc.addEventListener('visibilitychange', onVisibility)
  start()

  return {
    setProgress: (p) => {
      progress = p
    },
    stop: () => {
      stopped = true
      if (id !== null) d.caf(id)
      id = null
      unobserve()
      d.doc.removeEventListener('visibilitychange', onVisibility)
    },
  }
}
