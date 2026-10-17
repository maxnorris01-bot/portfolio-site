import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { GLOW_DEFAULT } from '../src/globe/glowtuning.ts'
import { SKY_DIM_DEFAULT, type SkyDimTargets } from '../src/globe/skydim.ts'
import {
  SKY_TUNING_DEFAULTS,
  SKY_TUNING_KEYS,
  SKY_TUNING_ORIGINAL,
  SKY_TUNING_SLIDERS,
  STORAGE_KEY,
  TuningController,
  applyStored,
  clampValue,
  clearStored,
  loadStored,
  parseJson,
  readValues,
  saveStored,
  toJson,
  writeValue,
  type TuningTarget,
} from '../src/globe/skytuning.ts'
import { STAR_TUNING_NONE, starAppearance, wideLimitWeight } from '../src/globe/stars.ts'

/** A stand-in for the engine's settings, starting at the shipped defaults. */
const target = (): TuningTarget => ({
  glowGain: GLOW_DEFAULT.gain,
  glowSaturation: GLOW_DEFAULT.saturation,
  glowGamma: GLOW_DEFAULT.gamma,
  glowBlur: GLOW_DEFAULT.blurDeg,
  skyDim: { ...SKY_DIM_DEFAULT },
  starBrightness: 1,
  starSize: 1,
  wideLimitOffset: 0,
})
const memory = (initial: Record<string, string> = {}) => {
  const m = new Map(Object.entries(initial))
  return {
    store: m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  }
}
const blocked = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('QuotaExceededError')
  },
  removeItem: () => {
    throw new Error('SecurityError')
  },
}

test('the sliders: the requested ranges, steps that divide them, and defaults inside them', () => {
  const r: Record<string, [number, number]> = {
    glowGain: [0, 2],
    glowSaturation: [0, 1.5],
    glowGamma: [0.8, 2.2],
    glowBlur: [0, 2],
    skyGlowSunlit: [0, 1],
    skyStarsSunlit: [0, 1],
    skyGlowNight: [0, 1],
    skyStarsNight: [0, 1],
    starBrightness: [0.25, 3],
    starSize: [0.5, 2.5],
    wideLimitOffset: [-1, 4],
  }
  assert.equal(SKY_TUNING_SLIDERS.length, 11)
  for (const s of SKY_TUNING_SLIDERS) {
    assert.deepEqual([s.min, s.max], r[s.key], s.key)
    assert.ok(s.default >= s.min && s.default <= s.max, `${s.key} default in range`)
    assert.ok(s.step > 0 && (s.max - s.min) / s.step > 20, `${s.key} step`)
    assert.ok(s.label.length > 0 && s.digits >= 0)
  }
  assert.equal(new Set(SKY_TUNING_KEYS).size, 11)
})

test('the defaults are exactly what ships: the glow, the Earth dimming, and no change to the stars', () => {
  assert.deepEqual(SKY_TUNING_DEFAULTS, {
    glowGain: 0.5,
    glowSaturation: 0.45,
    glowGamma: 1.3,
    glowBlur: 1,
    skyGlowSunlit: 0.2,
    skyStarsSunlit: 0.45,
    skyGlowNight: 0.5,
    skyStarsNight: 0.75,
    starBrightness: 1,
    starSize: 1,
    wideLimitOffset: 0,
  })
  // A fresh engine reads back as the defaults, and the panel changes nothing until a slider moves.
  const t = target()
  assert.deepEqual(readValues(t), SKY_TUNING_DEFAULTS)
  const c = new TuningController(t, { storage: null })
  assert.equal(c.isDefault(), true)
  assert.deepEqual(readValues(t), SKY_TUNING_DEFAULTS)
  // The engine source holds the same defaults (one place each).
  const engine = readFileSync(new URL('../src/globe/engine.ts', import.meta.url), 'utf8')
  assert.match(engine, /starBrightness = 1\n/)
  assert.match(engine, /starSize = 1\n/)
  assert.match(engine, /wideLimitOffset = 0\n/)
})

test('slider to setting: each slider writes the engine setting it names (and only that one), held to its range and step', () => {
  for (const s of SKY_TUNING_SLIDERS) {
    const t = target()
    const before = readValues(t)
    const mid = (s.min + s.max) / 2
    writeValue(t, s.key, mid === s.default ? s.max : mid)
    const after = readValues(t)
    for (const k of SKY_TUNING_KEYS) {
      if (k === s.key) assert.notEqual(after[k], before[k], `${k} should change`)
      else assert.equal(after[k], before[k], `${k} should not change when ${s.key} does`)
    }
  }
  const t = target()
  writeValue(t, 'glowGain', 5)
  assert.equal(t.glowGain, 2) // held to the maximum
  writeValue(t, 'glowGamma', 0)
  assert.equal(t.glowGamma, 0.8)
  writeValue(t, 'wideLimitOffset', -3)
  assert.equal(t.wideLimitOffset, -1)
  writeValue(t, 'skyGlowSunlit', 0.333)
  assert.equal(t.skyDim.glowSunlit, 0.33) // to its step
  writeValue(t, 'glowGain', Number.NaN)
  assert.equal(t.glowGain, 0.5) // not a number: the default
  assert.equal(clampValue('starSize', 1.004), 1)
})

test('the console hooks and the panel share the engine settings: a console edit shows in the panel, a slider edit in the console', () => {
  const t = target()
  const c = new TuningController(t, { storage: null })
  t.glowGain = 0.8 // the console: __globe.glowGain = 0.8
  t.skyDim.starsNight = 0.6 // __globe.skyDim.starsNight = 0.6
  assert.equal(c.values().glowGain, 0.8)
  assert.equal(c.values().skyStarsNight, 0.6)
  c.set('glowSaturation', 0.9)
  assert.equal(t.glowSaturation, 0.9)
  c.set('skyGlowNight', 0.25)
  assert.equal(t.skyDim.glowNight, 0.25)
  // The engine's skyDim object is the same object the panel writes into (the engine passes it to stepSkyDim every frame).
  const dim: SkyDimTargets = t.skyDim
  c.set('skyStarsSunlit', 0.1)
  assert.equal(dim.starsSunlit, 0.1)
  const engine = readFileSync(new URL('../src/globe/engine.ts', import.meta.url), 'utf8')
  assert.match(engine, /skyDim: SkyDimTargets = \{ \.\.\.SKY_DIM_DEFAULT \}/)
  assert.match(engine, /glowGain = GLOW_DEFAULT\.gain/)
})

test('the blur waits for the slider to rest (debounced), then applies once; the other sliders apply at once', () => {
  const t = target()
  let now = 0
  const timers: { at: number; fn: () => void; id: number }[] = []
  let n = 0
  const c = new TuningController(t, {
    storage: null,
    setTimeout: (fn, ms) => {
      timers.push({ at: now + ms, fn, id: ++n })
      return n
    },
    clearTimeout: (h) => {
      const i = timers.findIndex((x) => x.id === h)
      if (i >= 0) timers.splice(i, 1)
    },
  })
  const run = (ms: number) => {
    now += ms
    for (const x of timers.filter((tm) => tm.at <= now)) {
      timers.splice(timers.indexOf(x), 1)
      x.fn()
    }
  }
  c.set('glowGain', 1.2)
  assert.equal(t.glowGain, 1.2) // at once
  c.set('glowBlur', 0.5)
  c.set('glowBlur', 1.5)
  c.set('glowBlur', 1.8)
  assert.equal(t.glowBlur, GLOW_DEFAULT.blurDeg) // nothing rebuilt yet
  assert.equal(c.values().glowBlur, 1.8) // but the slider shows where it is
  run(100)
  assert.equal(t.glowBlur, GLOW_DEFAULT.blurDeg)
  c.set('glowBlur', 1.9) // moved again: the wait starts over
  run(200)
  assert.equal(t.glowBlur, GLOW_DEFAULT.blurDeg)
  run(100)
  assert.equal(t.glowBlur, 1.9) // applied once, when it rested
  assert.equal(timers.length, 0)
  c.set('glowBlur', 0.2)
  c.flush()
  assert.equal(t.glowBlur, 0.2) // flush applies at once
})

test('Reset to defaults: every value back, a waiting blur dropped, the remembered values cleared', () => {
  const t = target()
  const s = memory()
  const c = new TuningController(t, { storage: s })
  c.set('glowGain', 1.7)
  c.set('starSize', 2)
  c.set('wideLimitOffset', 3)
  c.set('skyGlowSunlit', 0.9)
  c.set('glowBlur', 0.1)
  assert.ok(s.store.has(STORAGE_KEY))
  c.reset()
  assert.deepEqual(readValues(t), SKY_TUNING_DEFAULTS)
  assert.equal(c.isDefault(), true)
  assert.equal(s.store.has(STORAGE_KEY), false)
  assert.equal(c.values().glowBlur, GLOW_DEFAULT.blurDeg) // the dropped pending blur does not come back
})

test('Original look: glow 1.0 / 0.7 / 1.5, no blur, sky dimming off, the stars at their defaults', () => {
  assert.equal(SKY_TUNING_ORIGINAL.glowGain, 1.0)
  assert.equal(SKY_TUNING_ORIGINAL.glowSaturation, 0.7)
  assert.equal(SKY_TUNING_ORIGINAL.glowGamma, 1.5)
  assert.equal(SKY_TUNING_ORIGINAL.glowBlur, 0)
  for (const k of ['skyGlowSunlit', 'skyStarsSunlit', 'skyGlowNight', 'skyStarsNight'] as const) assert.equal(SKY_TUNING_ORIGINAL[k], 1)
  const t = target()
  const s = memory()
  const c = new TuningController(t, { storage: s })
  c.set('starBrightness', 2)
  c.original()
  assert.deepEqual(readValues(t), SKY_TUNING_ORIGINAL)
  assert.equal(t.starBrightness, 1)
  assert.equal(c.isDefault(), false)
  assert.ok(s.store.has(STORAGE_KEY)) // remembered like any change
  // Every value of the original look is reachable on the sliders (inside their ranges).
  for (const sl of SKY_TUNING_SLIDERS) assert.equal(clampValue(sl.key, SKY_TUNING_ORIGINAL[sl.key]), SKY_TUNING_ORIGINAL[sl.key])
})

test('Copy settings: a short JSON of every value, at the slider\'s precision, that reads back', () => {
  const t = target()
  const c = new TuningController(t, { storage: null })
  c.set('glowGain', 0.73)
  c.set('wideLimitOffset', 2)
  const json = c.json()
  assert.ok(json.length < 400, `${json.length} characters`)
  const o = JSON.parse(json)
  assert.deepEqual(Object.keys(o).sort(), [...SKY_TUNING_KEYS].sort())
  assert.equal(o.glowGain, 0.73)
  assert.equal(o.wideLimitOffset, 2)
  assert.equal(o.glowSaturation, 0.45)
  assert.equal(o.skyGlowSunlit, 0.2)
  assert.deepEqual(parseJson(json), { ...SKY_TUNING_DEFAULTS, glowGain: 0.73, wideLimitOffset: 2 })
  assert.equal(toJson(SKY_TUNING_DEFAULTS), JSON.stringify({ glowGain: 0.5, glowSaturation: 0.45, glowGamma: 1.3, glowBlur: 1, skyGlowSunlit: 0.2, skyStarsSunlit: 0.45, skyGlowNight: 0.5, skyStarsNight: 0.75, starBrightness: 1, starSize: 1, wideLimitOffset: 0 }))
  // Nonsense is refused or ignored, not applied.
  assert.equal(parseJson('not json'), null)
  assert.equal(parseJson('[1,2]'), null)
  assert.deepEqual(parseJson('{"glowGain":"loud","bogus":3,"starSize":99}'), { starSize: 2.5 })
})

test('remembered values: saved on change, restored by applyStored in debug mode, and storage that throws changes nothing', () => {
  const s = memory()
  const a = target()
  const ca = new TuningController(a, { storage: s })
  ca.set('glowGain', 1.4)
  ca.set('starBrightness', 1.8)
  ca.set('skyStarsSunlit', 0.3)
  // A reload: a fresh engine, then the debug-mode restore.
  const b = target()
  assert.equal(applyStored(b, s), true)
  assert.equal(b.glowGain, 1.4)
  assert.equal(b.starBrightness, 1.8)
  assert.equal(b.skyDim.starsSunlit, 0.3)
  assert.equal(b.glowSaturation, 0.45) // what wasn't touched is still the default
  // Nothing remembered: the defaults stay.
  const fresh = target()
  assert.equal(applyStored(fresh, memory()), false)
  assert.deepEqual(readValues(fresh), SKY_TUNING_DEFAULTS)
  // Corrupt data is ignored.
  assert.equal(loadStored(memory({ [STORAGE_KEY]: '{oops' })), null)
  // Blocked storage (private windows, cleared site data): no throw anywhere, and the sliders still work.
  assert.equal(loadStored(blocked), null)
  assert.equal(saveStored(SKY_TUNING_DEFAULTS, blocked), false)
  clearStored(blocked)
  assert.equal(applyStored(target(), blocked), false)
  assert.equal(loadStored(null), null)
  assert.equal(saveStored(SKY_TUNING_DEFAULTS, null), false)
  const t = target()
  const c = new TuningController(t, { storage: blocked })
  c.set('glowGain', 1.1)
  c.reset()
  c.original()
  assert.equal(t.glowGain, 1)
})

test('the star settings: neutral at their defaults, brightness and size scale the look, the limit offset fades in between 5 and 15 degrees', () => {
  // At the defaults nothing changes from the untuned mirror of the shader.
  for (const fov of [120, 60, 15, 5, 1]) {
    for (const mag of [-1, 2, 5, 6.4]) {
      assert.deepEqual(starAppearance(mag, fov, 12, STAR_TUNING_NONE), starAppearance(mag, fov, 12))
    }
  }
  const base = starAppearance(3, 60)
  const bright = starAppearance(3, 60, 12, { brightness: 2, size: 1, limitOffset: 0 })
  assert.ok(Math.abs(bright.alpha - Math.min(base.alpha * 2, 2)) < 1e-9 && bright.alpha > base.alpha)
  assert.equal(bright.sizePx, base.sizePx)
  const big = starAppearance(3, 60, 12, { brightness: 1, size: 2, limitOffset: 0 })
  assert.ok(Math.abs(big.sizePx - base.sizePx * 2) < 1e-9)
  assert.equal(big.alpha, base.alpha)
  // The offset shows stars the limit hid at a wide field, and not at a narrow one.
  assert.equal(starAppearance(8, 60).alpha, 0) // magnitude 8 at 60 degrees: hidden
  assert.ok(starAppearance(8, 60, 12, { brightness: 1, size: 1, limitOffset: 2 }).alpha > 0)
  assert.equal(starAppearance(9, 3).alpha > 0, true) // already shown at a narrow field (limit 9.7)...
  assert.deepEqual(starAppearance(8, 3, 12, { brightness: 1, size: 1, limitOffset: 4 }), starAppearance(8, 3)) // ...and the offset does nothing under 5 degrees
  assert.equal(wideLimitWeight(120), 1)
  assert.equal(wideLimitWeight(15), 1)
  assert.equal(wideLimitWeight(5), 0)
  assert.equal(wideLimitWeight(1), 0)
  let last = 0
  for (let f = 0; f <= 30; f += 0.5) {
    const w = wideLimitWeight(f)
    assert.ok(w >= last - 1e-12 && w - last < 0.12, `at ${f}`)
    last = w
  }
})

test('the panel is debug only: never created without ?debug=1, lazy-loaded, nothing read from storage, Gaia loading untouched', () => {
  const comp = readFileSync(new URL('../src/components/SatelliteGlobe.tsx', import.meta.url), 'utf8')
  // Only a lazy import of the panel (its own chunk); the tuning logic is imported only inside the debug branch.
  assert.match(comp, /const SkyTuningPanel = lazy\(\(\) => import\('\.\/SkyTuningPanel'\)\)/)
  assert.doesNotMatch(comp, /^import [^\n]*from '\.\/SkyTuningPanel'/m)
  assert.doesNotMatch(comp, /^import (?!type)[^\n]*from '\.\.\/globe\/skytuning'/m)
  assert.match(comp, /if \(debugMode\) \{[\s\S]*?import\('\.\.\/globe\/skytuning'\)[\s\S]*?applyStored\(engine\)/)
  assert.match(comp, /\{debug && viewMode === 'pov' && tuneTarget && \(\s*<Suspense fallback=\{null\}>\s*<SkyTuningPanel/)
  // The panel module itself is the only other importer; the engine does not know about storage or the panel.
  const engine = readFileSync(new URL('../src/globe/engine.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(engine, /localStorage|skytuning|SkyTuningPanel/)
  // The wide-limit offset acts on the shader's limit only; tile loading, caps and budgets don't read it.
  assert.doesNotMatch(engine.slice(engine.indexOf('private updateGaia'), engine.indexOf('private gaiaBudgetNominal')), /wideLimitOffset|starBrightness|starSize/)
  const gaia = readFileSync(new URL('../src/globe/tilestream.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(gaia, /wideLimit|starBrightness/)
})
