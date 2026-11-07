import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MAX_FPS, mystifyInit, mystifyStep, spiroInit, spiroPoint, startScreensaver, TRAIL, type Ctx, type Deps, type Pattern } from '../src/shop/screensaver.ts'

// A fake browser: frames run when the test says so, the observer and the visibility listener are recorded, the context counts strokes.
function fake(over: { reduced?: boolean; pattern?: Pattern; hidden?: boolean; random?: () => number } = {}) {
  let nextId = 1
  const frames = new Map<number, (t: number) => void>()
  const cancelled: number[] = []
  const listeners = new Set<() => void>()
  const observers = { count: 0, disconnected: 0, fire: [] as (() => void)[] }
  const calls = { clear: 0, stroke: 0, fill: 0, transforms: [] as number[][] }
  const ctx = {
    clearRect: () => void calls.clear++,
    setTransform: (...a: number[]) => void calls.transforms.push(a),
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    stroke: () => void calls.stroke++,
    arc: () => {},
    fill: () => void calls.fill++,
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
    random: over.random ?? (() => 0.37),
    pattern: over.pattern,
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

test('mount: sizes the canvas for the device pixel ratio, watches the container, starts one frame loop', () => {
  const f = fake({ pattern: 'mystify' })
  startScreensaver(f.deps)
  assert.deepEqual([f.canvas.width, f.canvas.height], [800, 440])
  assert.deepEqual(f.calls.transforms[0], [2, 0, 0, 2, 0, 0])
  assert.equal(f.observers.count, 1)
  assert.equal(f.listeners.size, 1)
  assert.equal(f.frames.size, 1)
})

test('resize: the observer resizes the canvas again (DPR-aware) and the picture is redrawn', () => {
  const f = fake({ pattern: 'spirograph' })
  startScreensaver(f.deps)
  f.size.w = 1000
  f.size.h = 300
  f.observers.fire[0]()
  assert.deepEqual([f.canvas.width, f.canvas.height], [2000, 600])
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
  const f = fake({ pattern: 'mystify' })
  startScreensaver(f.deps)
  let t = 0
  const before = f.calls.clear
  for (let i = 0; i < 60; i++) {
    f.tick(t)
    t += 1000 / 60
  }
  const drawn = f.calls.clear - before
  assert.ok(drawn >= 28 && drawn <= 31, `${drawn} frames drawn in one second at 60 Hz (cap ${MAX_FPS})`)
})

test('reduced motion: ONE static frame, no animation frames, no loop; a resize redraws it', () => {
  for (const pattern of ['mystify', 'spirograph'] as const) {
    const f = fake({ reduced: true, pattern })
    startScreensaver(f.deps)
    assert.equal(f.frames.size, 0, pattern)
    assert.ok(f.calls.stroke > 0, `${pattern} drew its one frame (with trails)`)
    const clears = f.calls.clear
    assert.equal(clears, 2, `${pattern}: once at mount from the resize, once for the frame`) // resize() draws, then the static frame
    f.toggleHidden(false)
    assert.equal(f.frames.size, 0, pattern)
  }
})

test('hidden tab: no frames while hidden; the pending frame is cancelled; it resumes when visible again', () => {
  const f = fake({ pattern: 'mystify' })
  startScreensaver(f.deps)
  assert.equal(f.frames.size, 1)
  f.toggleHidden(true)
  assert.equal(f.frames.size, 0)
  assert.equal(f.cancelled.length, 1)
  const clears = f.calls.clear
  f.toggleHidden(true) // a repeat event does nothing
  assert.equal(f.frames.size, 0)
  f.toggleHidden(false)
  assert.equal(f.frames.size, 1)
  f.tick(1000)
  assert.equal(f.calls.clear, clears + 1)
})

test('starting in a hidden tab schedules nothing until it is visible', () => {
  const f = fake({ pattern: 'spirograph', hidden: true })
  startScreensaver(f.deps)
  assert.equal(f.frames.size, 0)
  f.toggleHidden(false)
  assert.equal(f.frames.size, 1)
})

test('pattern choice: injectable; otherwise random, one of the two', () => {
  assert.equal(startScreensaver(fake({ pattern: 'spirograph' }).deps).pattern, 'spirograph')
  assert.equal(startScreensaver(fake({ pattern: 'mystify' }).deps).pattern, 'mystify')
  assert.equal(startScreensaver(fake({ random: () => 0.1 }).deps).pattern, 'mystify')
  assert.equal(startScreensaver(fake({ random: () => 0.9 }).deps).pattern, 'spirograph')
})

test('mystify: two polygons of four vertices stay in the box, bounce, and keep a trail of 12 positions', () => {
  let n = 0
  const rand = () => ((n = (n * 7 + 3) % 101) + 0.5) / 102
  const s = mystifyInit(rand)
  assert.equal(s.polys.length, 2)
  assert.ok(s.polys.every((p) => p.length === 4))
  for (let i = 0; i < 2000; i++) mystifyStep(s)
  assert.ok(s.polys.flat().every((v) => v.x >= 0 && v.x <= 1 && v.y >= 0 && v.y <= 1))
  assert.ok(s.trails.every((t) => t.length === TRAIL && t.every((frame) => frame.length === 4)))
})

test('spirograph: parameters are randomised per search and the pen stays inside the unit circle', () => {
  const a = spiroInit(() => 0.2)
  const b = spiroInit(() => 0.8)
  assert.notDeepEqual(a.p, b.p)
  for (const s of [a, b]) for (let t = 0; t < 200; t += 0.37) {
    const p = spiroPoint(s.p, t)
    assert.ok(Math.hypot(p.x, p.y) <= 1.0001)
  }
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
  assert.match(tsx, /return saver\.stop/)
  assert.match(tsx, /ResizeObserver/)
})
