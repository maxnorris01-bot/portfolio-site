// The wait screensaver's engine: two quiet line patterns on a canvas while a search runs. No library. Everything the browser provides
// (animation frames, the observer, the tab's visibility, the clock, randomness) comes in through `Deps`, so tests drive it with fakes.

export type Pattern = 'mystify' | 'spirograph'
export const PATTERNS: readonly Pattern[] = ['mystify', 'spirograph']
export const MAX_FPS = 30
export const TRAIL = 12 // Mystify: positions kept per polygon
const SPIRO_TRAIL = 420 // Spirograph: samples kept
const SPIRO_PER_FRAME = 4
const SPIRO_DT = 0.022

export type Colors = { navy: string; coral: string }
/** The site's navy and coral (src/styles/tokens.css), used when the page's tokens cannot be read. */
export const DEFAULT_COLORS: Colors = { navy: '#0B1B33', coral: '#E85D3F' }

export type Ctx = {
  clearRect(x: number, y: number, w: number, h: number): void
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  closePath(): void
  stroke(): void
  arc(x: number, y: number, r: number, a0: number, a1: number): void
  fill(): void
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
  /** Fix the pattern (tests); otherwise one is chosen at random. */
  pattern?: Pattern
}

// ---- Mystify: two polygons of four vertices bouncing in the unit square, each drawn with its last 12 positions ----
type Vertex = { x: number; y: number; vx: number; vy: number }
export type MystifyState = { polys: Vertex[][]; trails: { x: number; y: number }[][][] }

export function mystifyInit(random: () => number): MystifyState {
  const poly = () =>
    Array.from({ length: 4 }, (): Vertex => {
      const a = random() * Math.PI * 2
      const v = 0.004 + random() * 0.004
      return { x: 0.1 + random() * 0.8, y: 0.1 + random() * 0.8, vx: Math.cos(a) * v, vy: Math.sin(a) * v }
    })
  return { polys: [poly(), poly()], trails: [[], []] }
}

/** Moves every vertex, bounces it off the edges, and keeps the position before the move in the polygon's trail (at most TRAIL). */
export function mystifyStep(s: MystifyState): void {
  s.polys.forEach((poly, i) => {
    s.trails[i].push(poly.map((v) => ({ x: v.x, y: v.y })))
    if (s.trails[i].length > TRAIL) s.trails[i].shift()
    for (const v of poly) {
      v.x += v.vx
      v.y += v.vy
      if (v.x < 0 || v.x > 1) {
        v.vx = -v.vx
        v.x = Math.min(1, Math.max(0, v.x))
      }
      if (v.y < 0 || v.y > 1) {
        v.vy = -v.vy
        v.y = Math.min(1, Math.max(0, v.y))
      }
    }
  })
}

function drawMystify(ctx: Ctx, s: MystifyState, w: number, h: number, c: Colors) {
  const inset = 8
  const X = (x: number) => inset + x * (w - 2 * inset)
  const Y = (y: number) => inset + y * (h - 2 * inset)
  s.polys.forEach((poly, i) => {
    ctx.strokeStyle = i === 0 ? c.navy : c.coral
    const frames = [...s.trails[i], poly]
    frames.forEach((pts, k) => {
      ctx.globalAlpha = 0.08 + (0.62 * (k + 1)) / frames.length
      ctx.beginPath()
      pts.forEach((p, j) => (j === 0 ? ctx.moveTo(X(p.x), Y(p.y)) : ctx.lineTo(X(p.x), Y(p.y))))
      ctx.closePath()
      ctx.stroke()
    })
  })
}

// ---- Spirograph: a hypotrochoid pen with a fading trail ----
export type SpiroParams = { R: number; r: number; d: number }
export type SpiroState = { p: SpiroParams; t: number; ts: number[] }

/** Randomised per search: the rolling circle is 0.18 to 0.46 of the fixed one, the pen 0.55 to 1.05 of the rolling radius. */
export function spiroInit(random: () => number): SpiroState {
  const r = 0.18 + random() * 0.28
  return { p: { R: 1, r, d: r * (0.55 + random() * 0.5) }, t: random() * Math.PI * 2, ts: [] }
}

/** The pen at parameter t, as a point of [-1, 1] x [-1, 1] (scaled so the largest reach is 1). */
export function spiroPoint(p: SpiroParams, t: number): { x: number; y: number } {
  const k = (p.R - p.r) / p.r
  const reach = p.R - p.r + p.d
  return { x: ((p.R - p.r) * Math.cos(t) + p.d * Math.cos(k * t)) / reach, y: ((p.R - p.r) * Math.sin(t) - p.d * Math.sin(k * t)) / reach }
}

export function spiroStep(s: SpiroState): void {
  for (let i = 0; i < SPIRO_PER_FRAME; i++) {
    s.ts.push(s.t)
    s.t += SPIRO_DT
  }
  if (s.ts.length > SPIRO_TRAIL) s.ts.splice(0, s.ts.length - SPIRO_TRAIL)
}

function drawSpiro(ctx: Ctx, s: SpiroState, w: number, h: number, c: Colors) {
  const k = Math.min(w, h) / 2 - 10
  const X = (x: number) => w / 2 + x * k
  const Y = (y: number) => h / 2 + y * k
  const pts = s.ts.map((t) => spiroPoint(s.p, t))
  if (pts.length < 2) return
  ctx.strokeStyle = c.navy
  const bands = 14
  const per = Math.ceil((pts.length - 1) / bands)
  for (let b = 0; b < bands; b++) {
    const from = b * per
    const to = Math.min(pts.length - 1, from + per)
    if (from >= to) break
    ctx.globalAlpha = 0.06 + (0.64 * (b + 1)) / bands
    ctx.beginPath()
    ctx.moveTo(X(pts[from].x), Y(pts[from].y))
    for (let i = from + 1; i <= to; i++) ctx.lineTo(X(pts[i].x), Y(pts[i].y))
    ctx.stroke()
  }
  const head = pts[pts.length - 1]
  ctx.globalAlpha = 0.9
  ctx.fillStyle = c.coral
  ctx.beginPath()
  ctx.arc(X(head.x), Y(head.y), 3, 0, Math.PI * 2)
  ctx.fill()
}

/** How many steps the single static frame of reduced motion is advanced, so it shows trails. */
const STATIC_STEPS = { mystify: 60, spirograph: 70 }

export type Screensaver = { stop: () => void; pattern: Pattern }

/** Starts the screensaver on the canvas. `stop` cancels the pending frame, disconnects the observer and the visibility listener. */
export function startScreensaver(d: Deps): Screensaver {
  const ctx = d.canvas.getContext('2d')
  const colors = d.colors ?? DEFAULT_COLORS
  const pattern = d.pattern ?? PATTERNS[Math.min(PATTERNS.length - 1, Math.floor(d.random() * PATTERNS.length))]
  const reduced = d.reducedMotion()
  const mystify = pattern === 'mystify' ? mystifyInit(d.random) : null
  const spiro = pattern === 'spirograph' ? spiroInit(d.random) : null
  let id: number | null = null
  let last = -Infinity
  let stopped = false
  let size = d.size()

  const step = () => {
    if (mystify) mystifyStep(mystify)
    if (spiro) spiroStep(spiro)
  }
  const draw = () => {
    if (!ctx) return
    ctx.clearRect(0, 0, size.w, size.h)
    ctx.lineWidth = 1.5
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    if (mystify) drawMystify(ctx, mystify, size.w, size.h, colors)
    if (spiro) drawSpiro(ctx, spiro, size.w, size.h, colors)
    ctx.globalAlpha = 1
  }
  const resize = () => {
    size = d.size()
    const dpr = Math.max(1, d.dpr())
    d.canvas.width = Math.max(1, Math.round(size.w * dpr))
    d.canvas.height = Math.max(1, Math.round(size.h * dpr))
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (reduced || id === null) draw() // a paused or static canvas redraws at once (a resize clears it)
  }
  const frame = (t: number) => {
    id = null
    if (stopped || d.doc.hidden) return
    id = d.raf(frame)
    if (t - last < 1000 / MAX_FPS - 2) return
    last = t
    step()
    draw()
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

  resize()
  if (reduced) {
    for (let i = 0; i < STATIC_STEPS[pattern]; i++) step()
    draw()
  }
  const unobserve = d.observe(resize)
  d.doc.addEventListener('visibilitychange', onVisibility)
  start()

  return {
    pattern,
    stop: () => {
      stopped = true
      if (id !== null) d.caf(id)
      id = null
      unobserve()
      d.doc.removeEventListener('visibilitychange', onVisibility)
    },
  }
}
