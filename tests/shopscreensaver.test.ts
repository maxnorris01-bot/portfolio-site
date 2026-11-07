import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_COLORS, envelope, MAX_FPS, pen, PEN_STOP, PEAK, progressLook, RAMP_SECONDS, startScreensaver, STILL_SECONDS, type Ctx, type Deps } from '../src/shop/screensaver.ts'

function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// A fake browser: frames run when the test says so, the observer and the visibility listener are recorded, the context counts strokes.
function fake(over: { reduced?: boolean; hidden?: boolean; random?: () => number; progress?: number; phase?: number | null; rampSeconds?: number } = {}) {
  let nextId = 1
  const frames = new Map<number, (t: number) => void>()
  const cancelled: number[] = []
  const listeners = new Set<() => void>()
  const observers = { count: 0, disconnected: 0, fire: [] as (() => void)[] }
  const calls = { clear: 0, stroke: 0, fill: 0, transforms: [] as number[][], pts: [] as number[][], alphas: [] as number[], dashes: [] as number[][], arcs: [] as number[][], widths: new Set<number>(), fillStyles: new Set<string>(), strokeStyles: new Set<string>() }
  const ctx = {
    fillRect: () => void (calls.clear++, calls.alphas.push(ctx.globalAlpha)), // every frame paints the background first
    setTransform: (...a: number[]) => void calls.transforms.push(a),
    beginPath: () => {},
    // the points of the waves only (the dashed centre line is drawn in its own colour)
    moveTo: (x: number, y: number) => void (ctx.strokeStyle !== '#DEDDD6' && calls.pts.push([x, y])),
    lineTo: (x: number, y: number) => void (ctx.strokeStyle !== '#DEDDD6' && calls.pts.push([x, y])),
    setLineDash: (seg: number[]) => void calls.dashes.push(seg),
    stroke: () => void (calls.stroke++, calls.widths.add(ctx.lineWidth), calls.strokeStyles.add(String(ctx.strokeStyle))),
    arc: (x: number, y: number) => void calls.arcs.push([x, y]),
    fill: () => void (calls.fill++, calls.fillStyles.add(String(ctx.fillStyle))),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    lineJoin: 'round',
    lineCap: 'round',
  } as unknown as Ctx
  const canvas = { width: 0, height: 0, getContext: () => ctx }
  const size = { w: 400, h: 220 }
  const doc = {
    hidden: over.hidden ?? false,
    addEventListener: (_t: 'visibilitychange', cb: () => void) => void listeners.add(cb),
    removeEventListener: (_t: 'visibilitychange', cb: () => void) => void listeners.delete(cb),
  }
  let dpr = 2
  const deps: Deps = {
    canvas,
    size: () => size,
    dpr: () => dpr,
    raf: (cb) => {
      const id = nextId++
      frames.set(id, cb)
      return id
    },
    caf: (id) => {
      cancelled.push(id)
      frames.delete(id)
    },
    observe: (cb) => {
      observers.count++
      observers.fire.push(cb)
      return () => void observers.disconnected++
    },
    doc,
    reducedMotion: () => over.reduced ?? false,
    random: over.random ?? seeded(5),
    progress: over.progress,
    phase: over.phase === null ? undefined : (over.phase ?? 0.7),
    rampSeconds: over.rampSeconds,
  }
  /** Runs the one pending frame at time t (a real browser has at most one). */
  const tick = (t: number) => {
    const [id, cb] = [...frames][0] ?? []
    if (id === undefined || !cb) return false
    frames.delete(id)
    cb(t)
    return true
  }
  const toggleHidden = (hidden: boolean) => {
    doc.hidden = hidden
    listeners.forEach((l) => l())
  }
  return { deps, frames, cancelled, listeners, observers, calls, canvas, size, tick, toggleHidden, setDpr: (v: number) => (dpr = v) }
}

/** Runs `frames` drawn frames at 30 fps. */
function run(f: ReturnType<typeof fake>, frames: number) {
  for (let i = 0; i < frames; i++) f.tick(i * (1000 / MAX_FPS))
}
const widest = (pts: number[][]) => pts.reduce((m, [x]) => Math.max(m, x), 0)

test('mount: sizes the canvas for the device pixel ratio, watches the container, starts one frame loop', () => {
  const f = fake()
  startScreensaver(f.deps)
  assert.deepEqual([f.canvas.width, f.canvas.height], [800, 440])
  assert.deepEqual(f.calls.transforms[0], [2, 0, 0, 2, 0, 0])
  assert.equal(f.observers.count, 1)
  assert.equal(f.listeners.size, 1)
  assert.equal(f.frames.size, 1)
})

test('resize: the observer resizes the canvas again (DPR-aware) and the picture is redrawn straight away', () => {
  const f = fake()
  startScreensaver(f.deps)
  run(f, 30)
  const strokes = f.calls.stroke
  f.size.w = 1000
  f.size.h = 300
  f.observers.fire[0]()
  assert.deepEqual([f.canvas.width, f.canvas.height], [2000, 600])
  assert.ok(f.calls.stroke > strokes)
})

test('unmount: stop cancels the pending frame, disconnects the observer and removes the listener; nothing runs afterwards', () => {
  const f = fake()
  const s = startScreensaver(f.deps)
  const [pending] = [...f.frames.keys()]
  s.stop()
  assert.deepEqual(f.cancelled, [pending])
  assert.equal(f.frames.size, 0)
  assert.equal(f.observers.disconnected, 1)
  assert.equal(f.listeners.size, 0)
  const strokes = f.calls.stroke
  f.toggleHidden(false)
  assert.equal(f.frames.size, 0)
  assert.equal(f.calls.stroke, strokes)
})

test('stop in the middle of a frame loop leaves no frame scheduled', () => {
  const f = fake()
  const s = startScreensaver(f.deps)
  f.tick(0)
  f.tick(34)
  assert.equal(f.frames.size, 1)
  s.stop()
  assert.equal(f.frames.size, 0)
})

test('frame rate is capped at 30 fps: a 60 Hz display draws every other frame', () => {
  const f = fake()
  startScreensaver(f.deps)
  let t = 0
  f.tick(t)
  const before = f.calls.clear
  for (let i = 0; i < 60; i++) {
    t += 1000 / 60
    f.tick(t)
  }
  const drawn = f.calls.clear - before
  assert.ok(drawn >= 28 && drawn <= 31, `${drawn} frames drawn in one second at 60 Hz (cap ${MAX_FPS})`)
})

test('reduced motion: ONE still frame as if 10 s had passed (waves across about 65% of the width), no animation frames; a resize redraws it', () => {
  assert.equal(STILL_SECONDS, 10)
  const f = fake({ reduced: true })
  startScreensaver(f.deps)
  assert.equal(f.frames.size, 0)
  assert.equal(f.calls.stroke, 4, 'the centre line and three waves')
  const reach = widest(f.calls.pts) / 400
  assert.ok(reach > 0.6 && reach < 0.72, `the waves reach ${(reach * 100).toFixed(0)}% of the width`)
  f.toggleHidden(false)
  assert.equal(f.frames.size, 0)
  const strokes = f.calls.stroke
  f.size.w = 500
  f.observers.fire[0]()
  assert.equal(f.calls.stroke, strokes + 4, 'redrawn after a resize')
})

test('hidden tab: no frames while hidden; the pending frame is cancelled; it resumes when visible again', () => {
  const f = fake()
  startScreensaver(f.deps)
  assert.equal(f.frames.size, 1)
  f.toggleHidden(true)
  assert.equal(f.frames.size, 0)
  assert.equal(f.cancelled.length, 1)
  f.toggleHidden(true) // a repeat event does nothing
  assert.equal(f.frames.size, 0)
  f.toggleHidden(false)
  assert.equal(f.frames.size, 1)
  const before = f.calls.clear
  f.tick(1000)
  assert.equal(f.calls.clear, before + 1)
})

test('starting in a hidden tab schedules nothing until it is visible', () => {
  const f = fake({ hidden: true })
  startScreensaver(f.deps)
  assert.equal(f.frames.size, 0)
  f.toggleHidden(false)
  assert.equal(f.frames.size, 1)
})

test('the pen starts at the left edge, reaches 80% of the width after 14 s (configurable), then holds while the drawing scrolls left, smoothly', () => {
  assert.equal(RAMP_SECONDS, 14)
  assert.equal(PEN_STOP, 0.8)
  assert.deepEqual(pen(0, 400), { x: 0, scroll: 0 })
  assert.ok(Math.abs(pen(14, 400).x - 320) < 1e-9 && pen(14, 400).scroll === 0)
  assert.ok(pen(4, 400).x / 400 >= 0.25 && pen(8, 400).x / 400 >= 0.5)
  let prev = 0
  for (let t = 0.1; t <= 14; t += 0.1) {
    const x = pen(t, 400).x
    assert.ok(x >= prev, `the pen never moves back (t=${t})`)
    prev = x
  }
  let scroll = 0
  for (let t = 14; t < 120; t += 1 / 30) {
    const p = pen(t, 400)
    assert.equal(p.x, 320)
    assert.ok(p.scroll >= scroll && p.scroll - scroll < 3, `scroll ${p.scroll} after ${scroll} at t=${t}`)
    scroll = p.scroll
  }
  assert.ok(scroll > 5000, 'it keeps scrolling, never freezes')
  assert.ok(Math.abs(pen(7, 400, 7).x - 320) < 1e-9, 'rampSeconds sets how long the pen takes')
  assert.ok(pen(10, 400).x / 400 > 0.6 && pen(10, 400).x / 400 < 0.72, '10 s: about 65%')
})

test('the waves: strokes in navy, coral and slate at 1.9 / 1.7 / 1.4 px, no glow, a dashed centre line and a dot at each leading end', () => {
  assert.deepEqual(DEFAULT_COLORS, { bg: '#F6F6F3', navy: '#0B1B33', coral: '#E85D3F', slate: '#3C5A87', centre: '#DEDDD6' })
  const f = fake()
  startScreensaver(f.deps)
  run(f, 90)
  assert.deepEqual([...f.calls.strokeStyles].sort(), ['#0B1B33', '#3C5A87', '#DEDDD6', '#E85D3F'].sort())
  assert.deepEqual([...f.calls.widths].sort(), [1, 1.4, 1.7, 1.9])
  assert.ok(f.calls.dashes.some((d) => d.length > 0), 'a dashed centre line')
  assert.equal(f.calls.arcs.length, 3 * 90, 'one leading dot per wave per frame')
  assert.deepEqual([...f.calls.fillStyles].sort(), ['#0B1B33', '#3C5A87', '#E85D3F'].sort())
})

test('the drawing never leaves the canvas, the peak is at most 38% of the height, and the envelope breathes between .35 and 1', () => {
  let lo = Infinity
  let hi = -Infinity
  for (let x = 0; x < 3000; x += 0.5) {
    lo = Math.min(lo, envelope(x))
    hi = Math.max(hi, envelope(x))
  }
  assert.ok(lo >= 0.34 && lo < 0.5, `envelope low ${lo}`)
  assert.ok(hi > 0.8 && hi <= 1.0001, `envelope high ${hi}`)
  const f = fake()
  startScreensaver(f.deps)
  run(f, 30 * 40)
  assert.ok(f.calls.pts.every(([x, y]) => x >= 0 && x <= 400 && y >= 0 && y <= 220))
  const dev = f.calls.pts.reduce((m, [, y]) => Math.max(m, Math.abs(y - 110)), 0) / 220
  assert.ok(dev <= PEAK + 1e-9, `deviation ${dev}`)
  assert.ok(dev > 0.2, 'and the waves do swing wide')
})

test('the waves are drawn left to right from the left edge, and never past the pen', () => {
  const f = fake()
  startScreensaver(f.deps)
  f.tick(0)
  assert.equal(widest(f.calls.pts), 0, 'the first frame has the pen at the left edge')
  run(f, 30 * 4 + 1)
  const reach = widest(f.calls.pts.slice(-3 * 200)) / 400
  assert.ok(reach <= pen(4, 400).x / 400 + 0.01 && reach >= 0.25 - 0.01, `${reach}`)
})

test('progress: each finished step swells the waves and spreads the frequencies; without it, full amplitude', () => {
  assert.deepEqual(progressLook(undefined), { amp: 1, spread: 0 })
  assert.ok(progressLook(0).amp < progressLook(0.5).amp && progressLook(0.5).amp < progressLook(1).amp)
  assert.ok(Math.abs(progressLook(1).amp - progressLook(0.8).amp - 0.08) < 0.005, 'about 8% (of the peak) per step of five')
  assert.ok(progressLook(1).spread > progressLook(0).spread)
  const swing = (progress?: number) => {
    const f = fake({ progress, reduced: true })
    startScreensaver(f.deps)
    return Math.max(...f.calls.pts.map(([, y]) => Math.abs(y - 110)))
  }
  assert.ok(swing(1) > swing(0), 'more progress, bigger waves')
  const f = fake({ progress: 0 })
  const s = startScreensaver(f.deps)
  run(f, 30 * 5)
  const peak = (n: number) => Math.max(...f.calls.pts.slice(-n).map(([, y]) => Math.abs(y - 110)))
  const before = peak(1200)
  s.setProgress(1)
  for (let i = 0; i < 90; i++) f.tick(10000 + i * 34)
  assert.ok(peak(1200) > before * 0.99, 'setProgress swells it (eased, not a jump)')
})

test('a seeded phase (or seeded random) makes the picture the same every run; another phase changes it', () => {
  const draw = (over: Parameters<typeof fake>[0]) => {
    const f = fake({ reduced: true, ...over })
    startScreensaver(f.deps)
    return JSON.stringify(f.calls.pts)
  }
  assert.equal(draw({ phase: 1 }), draw({ phase: 1 }))
  assert.notEqual(draw({ phase: 1 }), draw({ phase: 2 }))
  assert.equal(draw({ phase: null, random: seeded(9) }), draw({ phase: null, random: seeded(9) }))
  assert.notEqual(draw({ phase: null, random: seeded(9) }), draw({ phase: null, random: seeded(10) }))
})

test('the wait panel fades out over 300 ms, honours reduced motion, reserves the animation box (220px stacked), and the panel is capped at 460px', async () => {
  const { readFileSync } = await import('node:fs')
  const css = readFileSync(new URL('../src/shop/WaitPanel.css', import.meta.url), 'utf8')
  assert.match(css, /\.wait-panel\.is-leaving \{[^}]*animation: wait-fade 0\.3s/s)
  assert.match(css, /prefers-reduced-motion: reduce\) \{\s*\.wait-panel\.is-leaving \{\s*animation: none/)
  assert.match(css, /\.wait-anim \{[^}]*height: 220px/s)
  assert.match(css, /\.wait-panel \{[^}]*max-height: 460px/s)
  assert.match(css, /@media \(min-width: 1280px\)/)
  const tsx = readFileSync(new URL('../src/shop/WaitScreensaver.tsx', import.meta.url), 'utf8')
  assert.match(tsx, /started\.stop\(\)/)
  assert.match(tsx, /setProgress\(progress\)/)
  assert.match(tsx, /ResizeObserver/)
  assert.doesNotMatch(readFileSync(new URL('../src/shop/screensaver.ts', import.meta.url), 'utf8'), /shadow/i, 'no glow')
})
