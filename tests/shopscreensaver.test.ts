import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FAST_FORWARD, MAX_FPS, MYSTIFY_POLYS, MYSTIFY_VERTICES, mystifyInit, mystifyStep, PATTERNS, pipeCell, slide, spiroPoint, startScreensaver, TRAIL, type Ctx, type Deps, type Pattern } from '../src/shop/screensaver.ts'

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
function fake(over: { reduced?: boolean; pattern?: Pattern; hidden?: boolean; random?: () => number; progress?: number } = {}) {
  let nextId = 1
  const frames = new Map<number, (t: number) => void>()
  const cancelled: number[] = []
  const listeners = new Set<() => void>()
  const observers = { count: 0, disconnected: 0, fire: [] as (() => void)[] }
  const calls = { clear: 0, stroke: 0, fill: 0, transforms: [] as number[][], pts: [] as number[][], alphas: [] as number[], widths: new Set<number>(), fillStyles: new Set<string>(), strokeStyles: new Set<string>() }
  const ctx = {
    fillRect: () => void (calls.clear++, calls.alphas.push(ctx.globalAlpha)), // every frame paints the background first
    setTransform: (...a: number[]) => void calls.transforms.push(a),
    beginPath: () => {},
    moveTo: (x: number, y: number) => void calls.pts.push([x, y]),
    lineTo: (x: number, y: number) => void calls.pts.push([x, y]),
    closePath: () => {},
    stroke: () => void (calls.stroke++, calls.widths.add(ctx.lineWidth), calls.strokeStyles.add(String(ctx.strokeStyle))),
    arc: () => {},
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
    pattern: over.pattern,
    progress: over.progress,
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

const ALL = PATTERNS

test('mount: sizes the canvas for the device pixel ratio, watches the container, starts one frame loop', () => {
  const f = fake({ pattern: 'mystify' })
  startScreensaver(f.deps)
  assert.deepEqual([f.canvas.width, f.canvas.height], [800, 440])
  assert.deepEqual(f.calls.transforms[0], [2, 0, 0, 2, 0, 0])
  assert.equal(f.observers.count, 1)
  assert.equal(f.listeners.size, 1)
  assert.equal(f.frames.size, 1)
})

test('resize: the observer resizes the canvas again (DPR-aware) and the picture is rebuilt', () => {
  for (const pattern of ALL) {
    const f = fake({ pattern })
    startScreensaver(f.deps)
    f.size.w = 1000
    f.size.h = 300
    f.observers.fire[0]()
    assert.deepEqual([f.canvas.width, f.canvas.height], [2000, 600], pattern)
  }
})

test('unmount: stop cancels the pending frame, disconnects the observer and removes the listener; nothing runs afterwards', () => {
  const f = fake({ pattern: 'mystify' })
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
  const f = fake({ pattern: 'spirograph' })
  const s = startScreensaver(f.deps)
  f.tick(0)
  f.tick(34)
  assert.equal(f.frames.size, 1)
  s.stop()
  assert.equal(f.frames.size, 0)
})

test('frame rate is capped at 30 fps: a 60 Hz display draws every other frame', () => {
  // Mystify paints its background once per drawn frame; Spirograph draws one stroke per curve per frame (3 at progress 0)
  const m = fake({ pattern: 'mystify' })
  startScreensaver(m.deps)
  const sp = fake({ pattern: 'spirograph', progress: 0 })
  startScreensaver(sp.deps)
  let t = 0
  m.tick(t)
  sp.tick(t)
  const [m0, s0] = [m.calls.clear, sp.calls.stroke]
  for (let i = 0; i < 60; i++) {
    t += 1000 / 60
    m.tick(t)
    sp.tick(t)
  }
  const drawn = m.calls.clear - m0
  assert.ok(drawn >= 28 && drawn <= 31, `${drawn} frames drawn in one second at 60 Hz (cap ${MAX_FPS})`)
  const spFrames = (sp.calls.stroke - s0) / 3
  assert.ok(spFrames >= 28 && spFrames <= 31, `${spFrames} spirograph frames`)
})

test('reduced motion: ONE static frame fast-forwarded about 4 s (rich, not blank), no animation frames; a resize redraws it', () => {
  assert.equal(FAST_FORWARD, 120)
  for (const pattern of ALL) {
    const f = fake({ reduced: true, pattern })
    startScreensaver(f.deps)
    assert.equal(f.frames.size, 0, pattern)
    assert.ok(f.calls.stroke >= 100, `${pattern} drew its static frame after the fast-forward (${f.calls.stroke} strokes)`)
    f.toggleHidden(false)
    assert.equal(f.frames.size, 0, pattern)
    const strokes = f.calls.stroke
    f.size.w = 500
    f.observers.fire[0]()
    assert.ok(f.calls.stroke >= strokes + 100, `${pattern} redrew after a resize`)
  }
})

test('hidden tab: no frames while hidden; the pending frame is cancelled; it resumes when visible again', () => {
  const f = fake({ pattern: 'mystify' })
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
  const f = fake({ pattern: 'spirograph', hidden: true })
  startScreensaver(f.deps)
  assert.equal(f.frames.size, 0)
  f.toggleHidden(false)
  assert.equal(f.frames.size, 1)
})

test('pattern choice: injectable; otherwise random, one of the three', () => {
  for (const p of ALL) assert.equal(startScreensaver(fake({ pattern: p }).deps).pattern, p)
  assert.equal(startScreensaver(fake({ random: () => 0.1 }).deps).pattern, 'spirograph')
  assert.equal(startScreensaver(fake({ random: () => 0.5 }).deps).pattern, 'mystify')
  assert.equal(startScreensaver(fake({ random: () => 0.9 }).deps).pattern, 'pipes')
  assert.deepEqual(new Set(Array.from({ length: 60 }, (_, i) => startScreensaver(fake({ random: seeded(i + 1) }).deps).pattern)), new Set(ALL))
})

test('mystify: three polygons of five vertices stay in the box, bounce, and keep a trail of 20 positions', () => {
  const s = mystifyInit(seeded(3))
  assert.equal(s.polys.length, MYSTIFY_POLYS)
  assert.equal(MYSTIFY_POLYS, 3)
  assert.ok(s.polys.every((p) => p.length === MYSTIFY_VERTICES && p.length === 5))
  for (let k = 0; k < 2000; k++) for (let i = 0; i < MYSTIFY_POLYS; i++) mystifyStep(s, i)
  assert.ok(s.polys.flat().every((v) => v.x >= 0 && v.x <= 1 && v.y >= 0 && v.y <= 1))
  assert.equal(TRAIL, 20)
  assert.ok(s.trails.every((t) => t.length === TRAIL && t.every((frame) => frame.length === 5)))
})

test('mystify colours slide between the four palette colours and wrap', () => {
  const colors = ['#000000', '#ff0000', '#00ff00', '#0000ff']
  assert.equal(slide(colors, 0), 'rgb(0,0,0)')
  assert.equal(slide(colors, 0.5), 'rgb(128,0,0)')
  assert.equal(slide(colors, 1), 'rgb(255,0,0)')
  assert.equal(slide(colors, 4), 'rgb(0,0,0)')
  assert.equal(slide(colors, -1), 'rgb(0,0,255)')
})

test('spirograph: the pen stays inside the unit circle for any rolling radius and pen offset', () => {
  for (const [r, k] of [[5 / 12, 1], [3 / 8, 1.3], [2 / 5, 0.7], [7 / 20, 1]]) for (let t = 0; t < 200; t += 0.37) {
    const p = spiroPoint(r, r * k, t)
    assert.ok(Math.hypot(p.x, p.y) <= 1.0001, `r=${r} t=${t}`)
  }
})

test('the palette is the site\'s: navy, coral, slate and amber on the off-white; no glow (no shadow is ever set)', async () => {
  const { DEFAULT_COLORS } = await import('../src/shop/screensaver.ts')
  assert.deepEqual(DEFAULT_COLORS, { bg: '#F6F6F3', navy: '#0B1B33', coral: '#E85D3F', slate: '#3C5A87', amber: '#E0A63E' })
  const { readFileSync } = await import('node:fs')
  assert.doesNotMatch(readFileSync(new URL('../src/shop/screensaver.ts', import.meta.url), 'utf8'), /shadow/i)
})

test('spirograph: 3 curves at the start, up to 5 as progress grows; lines 1.5 to 2.5 px; every point inside the canvas; the palette is used', () => {
  const strokes = (progress: number) => {
    const f = fake({ pattern: 'spirograph', reduced: true, progress })
    startScreensaver(f.deps)
    return f
  }
  const a = strokes(0)
  const b = strokes(1)
  assert.equal(a.calls.strokeStyles.size, 3)
  assert.equal(b.calls.strokeStyles.size, 4) // five curves in four palette colours
  assert.ok(b.calls.stroke > a.calls.stroke)
  for (const w of b.calls.widths) assert.ok(w >= 1.5 && w <= 2.5, `line width ${w}`)
  assert.ok(b.calls.pts.every(([x, y]) => x >= 0 && x <= 400 && y >= 0 && y <= 220))
})

test('mystify: more polygons as progress grows (1 to 3), all points inside the canvas, trails of 20', () => {
  const run = (progress: number) => {
    const f = fake({ pattern: 'mystify', reduced: true, progress })
    startScreensaver(f.deps)
    return f
  }
  const a = run(0)
  const b = run(1)
  assert.ok(b.calls.stroke > 2.5 * a.calls.stroke, `${a.calls.stroke} strokes at progress 0, ${b.calls.stroke} at 1`)
  assert.ok(b.calls.pts.every(([x, y]) => x >= 0 && x <= 400 && y >= 0 && y <= 220))
})

test('pipes: more pipes as progress grows, round caps, a coral joint at every turn, drawn on the grid inside the canvas', () => {
  const run = (progress?: number) => {
    const f = fake({ pattern: 'pipes', reduced: true, progress })
    startScreensaver(f.deps)
    return f
  }
  const a = run(0)
  const b = run(1)
  assert.ok(b.calls.stroke > a.calls.stroke)
  assert.ok(b.calls.fillStyles.has('#E85D3F'), 'coral joints')
  assert.ok(b.calls.pts.every(([x, y]) => x >= 0 && x <= 400 && y >= 0 && y <= 220))
  const cell = pipeCell(400, 220)
  assert.ok(cell >= 16)
  const xs = new Set(b.calls.pts.map(([x]) => Math.round((x - (400 - Math.floor(400 / cell) * cell) / 2 - cell / 2) / cell)))
  assert.ok([...xs].every((x) => x >= 0 && x < Math.floor(400 / cell)), 'every point is a cell centre')
})

test('pipes restart: at about 70% covered the picture fades quickly and starts again (the canvas never fills for good)', () => {
  const f = fake({ pattern: 'pipes', progress: 1 })
  startScreensaver(f.deps)
  let t = 0
  for (let i = 0; i < 1500; i++) f.tick((t += 1000 / 30)) // 50 s
  const fades = f.calls.alphas.filter((a) => a < 1 && a > 0.2).length
  assert.ok(fades >= 24 && fades % 12 === 0, `${fades} fade frames (12 per restart): at least two restarts in 50 s`)
  assert.ok(fades <= 12 * 8, 'but not endless restarts')
})

test('progress: setProgress changes how many layers are drawn; without it the picture grows with time', () => {
  const f = fake({ pattern: 'mystify' })
  const s = startScreensaver(f.deps)
  s.setProgress(0)
  let t = 0
  const frameStrokes = () => {
    const before = f.calls.stroke
    t += 40
    f.tick(t)
    return f.calls.stroke - before
  }
  for (let i = 0; i < 40; i++) frameStrokes()
  const low = frameStrokes()
  s.setProgress(1)
  for (let i = 0; i < 25; i++) frameStrokes() // the new polygons' trails fill up
  const high = frameStrokes()
  assert.ok(high >= 2.5 * low, `${low} strokes per frame at progress 0, ${high} at 1`)
  s.setProgress(undefined)
  for (let i = 0; i < 200; i++) frameStrokes()
  assert.equal(frameStrokes(), high, 'by time alone it reaches the full picture')
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
})
