// The wait screensaver's engine: three classic line patterns drawn on a canvas while a search runs (a spirograph bloom, Mystify, 2D pipes).
// No library. Everything the browser provides (animation frames, the observer, the tab's visibility, randomness) comes in through `Deps`,
// so tests drive it with fakes. The simulation clock is the frame count (30 per second), so a run is the same on every machine.

export type Pattern = 'spirograph' | 'mystify' | 'pipes'
export const PATTERNS: readonly Pattern[] = ['spirograph', 'mystify', 'pipes']
export const MAX_FPS = 30
export const TRAIL = 20 // Mystify: positions kept per polygon
export const MYSTIFY_POLYS = 3
export const MYSTIFY_VERTICES = 5
/** Frames the static picture (reduced motion) and a resized picture are fast-forwarded: about 4 s. */
export const FAST_FORWARD = 120

export type Colors = { bg: string; navy: string; coral: string; slate: string; amber: string }
/** The site's palette (src/styles/tokens.css) on the card's off-white, used when the page's tokens cannot be read. */
export const DEFAULT_COLORS: Colors = { bg: '#F6F6F3', navy: '#0B1B33', coral: '#E85D3F', slate: '#3C5A87', amber: '#E0A63E' }

export type Ctx = {
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void
  fillRect(x: number, y: number, w: number, h: number): void
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
  /** 0..1 from completed steps over all steps; each pattern adds a layer as it grows. Without it the picture develops with time. */
  progress?: number
}

const TAU = Math.PI * 2
const palette = (c: Colors) => [c.navy, c.coral, c.slate, c.amber]

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
/** A colour sliding around the palette: phase 0 is the first colour, 1 the second, and so on, wrapping. */
export function slide(colors: string[], phase: number): string {
  const n = colors.length
  const p = ((phase % n) + n) % n
  const i = Math.floor(p)
  const f = p - i
  const a = rgb(colors[i])
  const b = rgb(colors[(i + 1) % n])
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(',')})`
}

/** One pattern: `frame` advances it by 1/30 s and draws the change. `ramp` (0..1) says how developed the picture should be. */
type Impl = { frame(n: number, ramp: number): void }
type Make = (ctx: Ctx, w: number, h: number, random: () => number, c: Colors) => Impl

const layers = (min: number, max: number, ramp: number) => min + Math.round(Math.max(0, Math.min(1, ramp)) * (max - min))

function paintBg(ctx: Ctx, w: number, h: number, c: Colors, alpha = 1) {
  ctx.globalAlpha = alpha
  ctx.fillStyle = c.bg
  ctx.fillRect(0, 0, w, h)
  ctx.globalAlpha = 1
}

// ---- Spirograph bloom: 3 to 5 hypotrochoids drawn at once; the strokes stay and build a rosette; the whole drawing turns slowly ----
const RATIOS: [number, number][] = [[5, 12], [3, 8], [2, 5], [5, 16], [3, 10], [7, 20], [4, 9]] // rolling over fixed circle (they close within 44 rad)
export const SPIRO_CURVES = { min: 3, max: 5 }
const SPIRO_SUBSTEPS = 10 // per frame, more on a taller canvas so a big one fills as fast as a small one
const SPIRO_FADE = 0.02 // of the picture per second, applied once a second
const SPIRO_TURN = 0.12 // rad per second

export function spiroPoint(r: number, d: number, t: number): { x: number; y: number } {
  const k = (1 - r) / r
  const reach = 1 - r + d
  return { x: ((1 - r) * Math.cos(t) + d * Math.cos(k * t)) / reach, y: ((1 - r) * Math.sin(t) - d * Math.sin(k * t)) / reach }
}

const makeSpiro: Make = (ctx, w, h, random, c) => {
  paintBg(ctx, w, h, c)
  const colors = palette(c)
  const pool = [...RATIOS]
  const curves = Array.from({ length: SPIRO_CURVES.max }, (_, i) => {
    const [a, b] = pool.splice(Math.floor(random() * pool.length), 1)[0]
    const r = a / b
    return { r, d: r * (0.7 + random() * 0.6), size: 0.72 + random() * 0.28, t: random() * TAU, dt: 0.022 + random() * 0.022, color: colors[i % colors.length], px: NaN, py: NaN, width: 1.5 + random() }
  })
  const ky = h / 2 - 8
  const kx = Math.min(w / 2 - 8, ky * 1.7) // a little wider than tall, so a wide panel is used
  const spin = random() * TAU
  const substeps = Math.round(SPIRO_SUBSTEPS * Math.max(1, Math.min(2.5, h / 300)))
  const thick = Math.max(1, Math.min(1.4, h / 500)) // strokes stay 1.5 to 2.5 px at 1x, a little more on a big canvas
  return {
    frame(n, ramp) {
      const phi = spin + (n / MAX_FPS) * SPIRO_TURN
      const cos = Math.cos(phi)
      const sin = Math.sin(phi)
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      for (const cv of curves.slice(0, layers(SPIRO_CURVES.min, SPIRO_CURVES.max, ramp))) {
        ctx.strokeStyle = cv.color
        ctx.lineWidth = Math.min(2.5, cv.width * thick)
        ctx.globalAlpha = 0.42
        ctx.beginPath()
        for (let s = 0; s < substeps; s++) {
          const p = spiroPoint(cv.r, cv.d, cv.t)
          cv.t += cv.dt
          const x = w / 2 + (p.x * cos - p.y * sin) * kx * cv.size
          const y = h / 2 + (p.x * sin + p.y * cos) * ky * cv.size
          if (Number.isNaN(cv.px)) ctx.moveTo(x, y)
          else {
            if (s === 0) ctx.moveTo(cv.px, cv.py)
            ctx.lineTo(x, y)
          }
          cv.px = x
          cv.py = y
        }
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      if (n % MAX_FPS === MAX_FPS - 1) paintBg(ctx, w, h, c, SPIRO_FADE)
    },
  }
}

// ---- Mystify: three polygons of five vertices bounce in the box, each drawn with its last 20 positions; the colour slides ----
type Vertex = { x: number; y: number; vx: number; vy: number }
export type MystifyState = { polys: Vertex[][]; trails: { x: number; y: number }[][][] }

export function mystifyInit(random: () => number): MystifyState {
  const poly = () =>
    Array.from({ length: MYSTIFY_VERTICES }, (): Vertex => {
      const a = random() * TAU
      const v = 0.006 + random() * 0.006
      return { x: 0.05 + random() * 0.9, y: 0.05 + random() * 0.9, vx: Math.cos(a) * v, vy: Math.sin(a) * v }
    })
  return { polys: Array.from({ length: MYSTIFY_POLYS }, poly), trails: Array.from({ length: MYSTIFY_POLYS }, () => []) }
}

/** Moves polygon `i`: keeps its position before the move in the trail (at most TRAIL) and bounces every vertex off the edges. */
export function mystifyStep(s: MystifyState, i: number): void {
  const poly = s.polys[i]
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
}

export const MYSTIFY_COUNT = { min: 1, max: MYSTIFY_POLYS }

const makeMystify: Make = (ctx, w, h, random, c) => {
  const s = mystifyInit(random)
  const colors = palette(c)
  const phase0 = [random() * 4, random() * 4, random() * 4]
  const inset = 6
  const X = (x: number) => inset + x * (w - 2 * inset)
  const Y = (y: number) => inset + y * (h - 2 * inset)
  return {
    frame(n, ramp) {
      paintBg(ctx, w, h, c)
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.lineWidth = 2
      const count = layers(MYSTIFY_COUNT.min, MYSTIFY_COUNT.max, ramp)
      for (let i = 0; i < count; i++) {
        mystifyStep(s, i)
        const frames = [...s.trails[i], s.polys[i]]
        const base = phase0[i] + (n / MAX_FPS) * 0.18
        frames.forEach((pts, k) => {
          const age = (k + 1) / frames.length
          ctx.strokeStyle = ctx.fillStyle = slide(colors, base - (1 - age) * 0.5)
          ctx.beginPath()
          pts.forEach((p, j) => (j === 0 ? ctx.moveTo(X(p.x), Y(p.y)) : ctx.lineTo(X(p.x), Y(p.y))))
          ctx.closePath()
          ctx.globalAlpha = 0.02 + 0.035 * age
          ctx.fill()
          ctx.globalAlpha = 0.1 + 0.6 * age
          ctx.stroke()
        })
      }
      ctx.globalAlpha = 1
    },
  }
}

// ---- Pipes: pipes grow along a grid with round elbows and a coral joint at every turn; at 70% covered the picture fades and restarts ----
export const PIPES_COUNT = { min: 4, max: 6 }
export const PIPES_COVERAGE = 0.7
/** Cells a pipe grows per frame: about 70% of the grid is covered after about 10 s whatever the canvas size. */
const pipeSpeed = (cells: number) => Math.max(0.1, Math.min(0.4, cells / 2300))
const PIPE_TURN = 0.22
const PIPE_CLEAR_FRAMES = 12
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]

/** The grid's cell size in CSS px: about 600 cells on any canvas, never under 16. */
export const pipeCell = (w: number, h: number) => Math.max(16, Math.round(Math.sqrt((w * h) / 600)))

type Pipe = { x: number; y: number; dir: number; color: string; acc: number }

const makePipes: Make = (ctx, w, h, random, c) => {
  const cell = pipeCell(w, h)
  const cols = Math.max(2, Math.floor(w / cell))
  const rows = Math.max(2, Math.floor(h / cell))
  const ox = (w - cols * cell) / 2
  const oy = (h - rows * cell) / 2
  const colors = palette(c).slice(0, 4)
  const cx = (x: number) => ox + (x + 0.5) * cell
  const cy = (y: number) => oy + (y + 0.5) * cell
  const speed = pipeSpeed(cols * rows)
  const tube = cell * 0.64
  const joint = Math.max(3, cell * 0.17)
  let used = new Uint8Array(cols * rows)
  let covered = 0
  let pipes: Pipe[] = []
  let colorAt = Math.floor(random() * colors.length)
  let clearing = 0

  const dot = (x: number, y: number, r: number, color: string, alpha: number) => {
    ctx.globalAlpha = alpha
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y, r, 0, TAU)
    ctx.fill()
  }
  const occupy = (x: number, y: number) => {
    used[y * cols + x] = 1
    covered++
  }
  const free = (x: number, y: number) => x >= 0 && y >= 0 && x < cols && y < rows && !used[y * cols + x]
  const spawn = (): Pipe | null => {
    for (let tries = 0; tries < 40; tries++) {
      const x = Math.floor(random() * cols)
      const y = Math.floor(random() * rows)
      if (!free(x, y)) continue
      colorAt = (colorAt + 1) % colors.length
      occupy(x, y)
      dot(cx(x), cy(y), tube / 2, colors[colorAt], 0.5)
      return { x, y, dir: Math.floor(random() * 4), color: colors[colorAt], acc: random() }
    }
    return null
  }
  const segment = (p: Pipe, nx: number, ny: number) => {
    ctx.strokeStyle = p.color
    ctx.beginPath()
    ctx.moveTo(cx(p.x), cy(p.y))
    ctx.lineTo(cx(nx), cy(ny))
    ctx.lineWidth = tube
    ctx.globalAlpha = 0.24
    ctx.stroke()
    ctx.lineWidth = 2
    ctx.globalAlpha = 0.9
    ctx.stroke()
  }
  /** Moves the pipe one cell; returns false when it ended (the edge, or boxed in). */
  const move = (p: Pipe): boolean => {
    const turn = random() < PIPE_TURN
    const side = random() < 0.5 ? 1 : 3
    const order = turn ? [side, (side + 2) % 4, 0] : [0, side, (side + 2) % 4]
    if (!turn && !(p.x + DIRS[p.dir][0] >= 0 && p.x + DIRS[p.dir][0] < cols && p.y + DIRS[p.dir][1] >= 0 && p.y + DIRS[p.dir][1] < rows)) return false // the edge
    for (const o of order) {
      const d = (p.dir + o) % 4
      const nx = p.x + DIRS[d][0]
      const ny = p.y + DIRS[d][1]
      if (!free(nx, ny)) continue
      segment(p, nx, ny)
      if (d !== p.dir) dot(cx(p.x), cy(p.y), joint, c.coral, 0.95) // a coral joint at every turn
      occupy(nx, ny)
      p.x = nx
      p.y = ny
      p.dir = d
      return true
    }
    return false
  }
  const restart = () => {
    used = new Uint8Array(cols * rows)
    covered = 0
    pipes = []
    paintBg(ctx, w, h, c)
  }
  paintBg(ctx, w, h, c)

  return {
    frame(_n, ramp) {
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      if (clearing > 0) {
        paintBg(ctx, w, h, c, 0.3)
        if (--clearing === 0) restart()
        return
      }
      const want = layers(PIPES_COUNT.min, PIPES_COUNT.max, ramp)
      while (pipes.length < want) {
        const p = spawn()
        if (!p) break
        pipes.push(p)
      }
      for (let i = 0; i < pipes.length; i++) {
        const p = pipes[i]
        p.acc += speed
        while (p.acc >= 1) {
          p.acc -= 1
          if (!move(p)) {
            const q = spawn()
            if (q) pipes[i] = q
            else clearing = PIPE_CLEAR_FRAMES // nowhere left to start
            p.acc = 0
            break
          }
        }
      }
      ctx.globalAlpha = 1
      if (covered >= PIPES_COVERAGE * cols * rows) clearing = PIPE_CLEAR_FRAMES
    },
  }
}

const MAKERS: Record<Pattern, Make> = { spirograph: makeSpiro, mystify: makeMystify, pipes: makePipes }

export type Screensaver = { stop: () => void; pattern: Pattern; setProgress: (p: number | undefined) => void }

/** Starts the screensaver on the canvas. `stop` cancels the pending frame, disconnects the observer and the visibility listener. */
export function startScreensaver(d: Deps): Screensaver {
  const ctx = d.canvas.getContext('2d')
  const colors = d.colors ?? DEFAULT_COLORS
  const pattern = d.pattern ?? PATTERNS[Math.min(PATTERNS.length - 1, Math.floor(d.random() * PATTERNS.length))]
  const reduced = d.reducedMotion()
  let progress = d.progress
  let id: number | null = null
  let last = -Infinity
  let stopped = false
  let impl: Impl | null = null
  let n = 0

  const ramp = () => progress ?? Math.min(1, n / FAST_FORWARD)
  const advance = () => impl?.frame(n++, ramp())
  /** Builds the pattern for the canvas's size and runs it `ff` frames at once (a resize clears the canvas; the picture grows back). */
  const build = (ff: number) => {
    const { w, h } = d.size()
    impl = ctx ? MAKERS[pattern](ctx, w, h, d.random, colors) : null
    n = 0
    for (let i = 0; i < ff; i++) advance()
  }
  const resize = () => {
    const { w, h } = d.size()
    const dpr = Math.max(1, d.dpr())
    d.canvas.width = Math.max(1, Math.round(w * dpr))
    d.canvas.height = Math.max(1, Math.round(h * dpr))
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
    build(reduced ? FAST_FORWARD : Math.min(n, FAST_FORWARD))
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

  resize() // reduced motion: this already drew the one static frame, fast-forwarded about 4 s
  const unobserve = d.observe(resize)
  d.doc.addEventListener('visibilitychange', onVisibility)
  start()

  return {
    pattern,
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
