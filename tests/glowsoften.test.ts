import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import * as THREE from 'three'
import { GlowBlur, blurGlowMap, glowGain } from '../src/globe/glow.ts'
import { GlowLayer } from '../src/globe/glowlayer.ts'
import { GLOW_DEFAULT } from '../src/globe/glowtuning.ts'
import type { SkyContext } from '../src/globe/space.ts'

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')

test('the defaults (tuned by hand): gain 0.20, saturation 0.60, gamma 1.35, no blur', () => {
  assert.equal(GLOW_DEFAULT.gain, 0.2)
  assert.equal(GLOW_DEFAULT.saturation, 0.6)
  assert.equal(GLOW_DEFAULT.gamma, 1.35)
  assert.equal(GLOW_DEFAULT.blurDeg, 0)
})

/** A black map with one bright texel on the equator. */
function dot(w: number, h: number, x: number, y: number) {
  const m = new Uint8Array(w * h * 4)
  for (let i = 3; i < m.length; i += 4) m[i] = 255
  const o = (y * w + x) * 4
  m[o] = m[o + 1] = m[o + 2] = 255
  return m
}
const sum = (m: Uint8Array) => {
  let s = 0
  for (let i = 0; i < m.length; i += 4) s += m[i] + m[i + 1] + m[i + 2]
  return s
}

test('the blur spreads a single bright texel and keeps the light (to rounding)', () => {
  const w = 256 // 1.4 degree texels
  const h = 128
  const m = dot(w, h, 100, 64)
  const b = blurGlowMap(m, w, h, 2) // sigma 2 degrees: 1.4 texels
  const at = (x: number, y: number) => b[(y * w + x) * 4]
  assert.ok(at(100, 64) < 40 && at(100, 64) > 10, `centre ${at(100, 64)}`) // lower, but still the peak
  assert.ok(at(101, 64) > 8 && at(100, 65) > 8 && at(98, 64) > 1) // spread to the neighbours
  assert.ok(at(100, 64) >= at(101, 64) && at(101, 64) >= at(102, 64)) // monotone falloff
  assert.equal(at(110, 64), 0) // and not far
  const before = sum(m)
  const after = sum(b)
  assert.ok(Math.abs(after - before) / before < 0.04, `energy ${before} -> ${after}`)
  // Opaque everywhere.
  for (let i = 3; i < b.length; i += 4) assert.equal(b[i], 255)
})

test('the blur is in degrees on the sky: wider in texels toward the poles, wrapping around right ascension', () => {
  const w = 256
  const h = 128
  // On the equator vs at 60 degrees north: the blur is a longer smear in texels at 60 degrees (half a degree of RA is shorter there).
  const eq = blurGlowMap(dot(w, h, 100, 64), w, h, 3)
  const hi = blurGlowMap(dot(w, h, 100, Math.round(((60 + 90) / 180) * h)), w, h, 3)
  const spread = (m: Uint8Array, y: number) => {
    let n = 0
    for (let x = 0; x < w; x++) if (m[(y * w + x) * 4] > 1) n++
    return n
  }
  assert.ok(spread(hi, Math.round(((60 + 90) / 180) * h)) > spread(eq, 64) * 1.4)
  // Wraps: a bright texel at the edge spreads onto the other edge.
  const edge = blurGlowMap(dot(w, h, 0, 64), w, h, 3)
  assert.ok(edge[(255 + 64 * w) * 4] > 3)
  // A uniform map stays uniform (the weights sum to 1).
  const flat = new Uint8Array(w * h * 4).fill(120)
  for (let i = 3; i < flat.length; i += 4) flat[i] = 255
  const f = blurGlowMap(flat, w, h, 1.5)
  for (let y = 4; y < h - 4; y += 9) assert.ok(Math.abs(f[(y * w + 7) * 4] - 120) <= 1)
})

test('the blur runs in slices and gives the same map as in one go', () => {
  const w = 128
  const h = 64
  const m = dot(w, h, 30, 20)
  const whole = blurGlowMap(m, w, h, 2)
  const job = new GlowBlur(m, w, h, 2)
  let steps = 0
  while (!job.step(7)) steps++
  assert.ok(steps > 8)
  assert.deepEqual(job.out, whole)
})

const ctxOf = (fovDeg: number, dim: number, glow = GLOW_DEFAULT): SkyContext =>
  ({ camera: new THREE.PerspectiveCamera(), fovDeg, dim, glow, sceneToJ2000: new THREE.Matrix3(), date: new Date(0) }) as SkyContext

test('the baseline gain multiplies the narrow-field dimming and the Earth-in-view dimming; it replaces neither', () => {
  const layer = new GlowLayer(dot(16, 8, 3, 3), 16, 8)
  const gainNow = () => (layer.object as THREE.Mesh).material as THREE.ShaderMaterial
  layer.update(ctxOf(120, 1))
  const g = GLOW_DEFAULT.gain
  assert.ok(Math.abs(gainNow().uniforms.gain.value - g) < 1e-12) // wide field, no Earth: just the baseline
  layer.update(ctxOf(0.5, 1))
  assert.ok(Math.abs(gainNow().uniforms.gain.value - g * glowGain(0.5)) < 1e-12) // narrow field
  assert.ok(Math.abs(gainNow().uniforms.gain.value - g * 0.3) < 1e-9)
  layer.update(ctxOf(120, 0.2))
  assert.ok(Math.abs(gainNow().uniforms.gain.value - g * 0.2) < 1e-12) // Earth in view
  layer.update(ctxOf(0.5, 0.2))
  assert.ok(Math.abs(gainNow().uniforms.gain.value - g * glowGain(0.5) * 0.2) < 1e-12) // all three together
  // Tuned live: the values given each frame are used.
  layer.update(ctxOf(120, 1, { gain: 0.3, saturation: 0.2, gamma: 1.1, blurDeg: 1 }))
  assert.equal(gainNow().uniforms.gain.value, 0.3)
  assert.equal(gainNow().uniforms.saturation.value, 0.2)
  assert.equal(gainNow().uniforms.gamma.value, 1.1)
  layer.update(ctxOf(120, 1))
  assert.equal(gainNow().uniforms.saturation.value, GLOW_DEFAULT.saturation)
  layer.dispose()
})

test('with the default blur of 0 the raw map shows at once and no blur work is done; a blur rebuilds from the raw map in a few frames', () => {
  const w = 64
  const h = 32
  const raw = dot(w, h, 20, 16)
  const layer = new GlowLayer(raw, w, h)
  assert.equal(layer.object.visible, false)
  assert.equal(layer.appliedBlur, null)
  layer.update(ctxOf(60, 1)) // the shipped defaults: blur 0
  assert.equal(layer.appliedBlur, 0)
  assert.equal(layer.object.visible, true) // one update, no slices of blur work
  const material = (layer.object as THREE.Mesh).material as THREE.ShaderMaterial
  const tex = material.uniforms.map.value as THREE.DataTexture
  assert.deepEqual(new Uint8Array(tex.image.data as Uint8Array), raw)
  // Turn a blur on (as the panel's slider does): a few frames of slices, then the blurred map.
  const blurred = { ...GLOW_DEFAULT, blurDeg: 8 } // texels here are 5.6 degrees, so a 1 degree blur would change nothing
  let n = 0
  while (layer.appliedBlur !== 8 && n < 100) {
    layer.update(ctxOf(60, 1, blurred))
    n++
  }
  assert.ok(n > 1 && n < 20, `${n} updates`) // a few frames, not one long stall
  assert.notDeepEqual(new Uint8Array(tex.image.data as Uint8Array), raw)
  // And back to none: the raw map again.
  layer.update(ctxOf(60, 1))
  assert.equal(layer.appliedBlur, 0)
  assert.deepEqual(new Uint8Array(tex.image.data as Uint8Array), raw)
  layer.dispose()
})

test('the debug hook: the engine carries the tuning values at their defaults and reads them every frame; the overlay shows them', () => {
  const engine = src('globe/engine.ts')
  assert.match(engine, /glowGain = GLOW_DEFAULT\.gain/)
  assert.match(engine, /glowSaturation = GLOW_DEFAULT\.saturation/)
  assert.match(engine, /glowGamma = GLOW_DEFAULT\.gamma/)
  assert.match(engine, /glowBlur = GLOW_DEFAULT\.blurDeg/)
  assert.match(engine, /setGlowTuning\(\{ gain: this\.glowGain, saturation: this\.glowSaturation, gamma: this\.glowGamma, blurDeg: this\.glowBlur \}\)/)
  assert.match(engine, /debugGlow\(\)/)
  assert.match(src('components/SatelliteGlobe.tsx'), /debugEngine\?\.glow/)
})

test('nothing else changes: stars, bodies, constellations and the Earth do not take the glow tuning', () => {
  for (const f of ['globe/gaiastars.ts', 'globe/spacebodies.ts', 'globe/constellationlayer.ts', 'globe/skybodies.ts', 'globe/stars.ts']) {
    assert.doesNotMatch(src(f), /glowtuning|GlowTuning|glowGain/i, f)
  }
  assert.match(src('globe/glowlayer.ts'), /t\.gain \* glowGain\(ctx\.fovDeg\) \* ctx\.dim/)
})
