import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ang2pixNest, pix2angNest, pixelCount } from '../src/globe/healpix.ts'
import { GLOW_ATLAS_HEIGHT, GLOW_ATLAS_WIDTH, GLOW_ORDER, fillGlowRows, glowGain } from '../src/globe/glow.ts'

const N = pixelCount(GLOW_ORDER)
const unit = (ra: number, dec: number): [number, number, number] => {
  const r = (ra * Math.PI) / 180
  const d = (dec * Math.PI) / 180
  return [Math.cos(d) * Math.cos(r), Math.cos(d) * Math.sin(r), Math.sin(d)]
}

/** An atlas whose pixel i is a smooth function of the pixel's centre direction (RGBA, as a canvas would give it). */
function smoothAtlas(f: (d: [number, number, number]) => [number, number, number]) {
  assert.equal(GLOW_ATLAS_WIDTH * GLOW_ATLAS_HEIGHT, N)
  const a = new Uint8ClampedArray(N * 4)
  for (let i = 0; i < N; i++) {
    const c = pix2angNest(GLOW_ORDER, i)
    const [r, g, b] = f(unit(c.ra, c.dec))
    a[i * 4] = r
    a[i * 4 + 1] = g
    a[i * 4 + 2] = b
    a[i * 4 + 3] = 255
  }
  return a
}

const W = 256
const H = 128
const texel = (out: Uint8Array, ra: number, dec: number) => {
  const x = Math.min(W - 1, Math.floor((0.5 - ra / 360 + 1) % 1 * W))
  const y = Math.min(H - 1, Math.floor(((dec + 90) / 180) * H))
  return [out[(y * W + x) * 4], out[(y * W + x) * 4 + 1], out[(y * W + x) * 4 + 2]]
}

test('a smooth sky comes through the map smoothly: the texture follows the function, not the pixels', () => {
  // Red follows height above the equator, green follows x, blue y: linear in the direction.
  const atlas = smoothAtlas((d) => [127.5 + 120 * d[2], 127.5 + 120 * d[0], 127.5 + 120 * d[1]])
  const out = new Uint8Array(W * H * 4)
  fillGlowRows(atlas, out, W, H, 0, H)
  let worst = 0
  for (let ra = 3; ra < 360; ra += 17.3) {
    for (let dec = -85; dec <= 85; dec += 9.1) {
      const d = unit(ra, dec)
      const [r, g, b] = texel(out, ra, dec)
      worst = Math.max(worst, Math.abs(r - (127.5 + 120 * d[2])), Math.abs(g - (127.5 + 120 * d[0])), Math.abs(b - (127.5 + 120 * d[1])))
    }
  }
  // The texels are 1.4 degrees wide here and the colours span 240 levels over 180 degrees: a few levels of error.
  assert.ok(worst < 6, `worst error ${worst}`)
})

test('a single bright pixel lands at its own right ascension and declination, RA increasing to the left', () => {
  const w = 1024
  const h = 512 // texels of 0.35 degrees: finer than the atlas's 0.46 degree pixels
  const atlas = new Uint8ClampedArray(N * 4).fill(0)
  const ra0 = 83.6
  const dec0 = 22
  const p = ang2pixNest(GLOW_ORDER, ra0, dec0)
  atlas[p * 4] = atlas[p * 4 + 1] = atlas[p * 4 + 2] = 255
  const out = new Uint8Array(w * h * 4)
  fillGlowRows(atlas, out, w, h, 0, h)
  let best = 0
  let bx = 0
  let by = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (out[(y * w + x) * 4] > best) {
    best = out[(y * w + x) * 4]
    bx = x
    by = y
  }
  const raAt = ((0.5 - (bx + 0.5) / w) * 360 + 360) % 360
  const decAt = ((by + 0.5) / h) * 180 - 90
  assert.ok(best > 100, `peak ${best}`)
  assert.ok(Math.abs(raAt - ra0) < 0.6, `RA ${raAt}`)
  assert.ok(Math.abs(decAt - dec0) < 0.6, `Dec ${decAt}`)
  // Increasing RA moves to the left: a point at larger RA is at smaller x.
  const xOf = (ra: number) => ((0.5 - ra / 360 + 1) % 1) * w
  assert.ok(xOf(100) < xOf(80))
  // Beyond a pixel's reach (about one pixel, 0.5 degrees) the map is dark: no blocks, no bleed.
  const farX = Math.round(((0.5 - (ra0 + 2) / 360 + 1) % 1) * w)
  assert.equal(out[(by * w + farX) * 4], 0)
})

test('rows can be filled in slices with the same result as all at once, and the poles are finite and opaque', () => {
  const atlas = smoothAtlas((d) => [200 * Math.abs(d[2]), 100 + 50 * d[0], 30])
  const whole = new Uint8Array(W * H * 4)
  fillGlowRows(atlas, whole, W, H, 0, H)
  const sliced = new Uint8Array(W * H * 4)
  for (let y = 0; y < H; y += 21) fillGlowRows(atlas, sliced, W, H, y, Math.min(H, y + 21))
  assert.deepEqual(sliced, whole)
  for (let x = 0; x < W; x++) {
    for (const y of [0, H - 1]) {
      assert.equal(whole[(y * W + x) * 4 + 3], 255)
      assert.ok(whole[(y * W + x) * 4] > 150, 'pole is bright where the function is')
    }
  }
})

test('the glow dims as the field narrows and the stars resolve, smoothly, never to nothing', () => {
  assert.equal(glowGain(120), 1)
  assert.equal(glowGain(30), 1)
  assert.ok(glowGain(10) < 1 && glowGain(10) > glowGain(3))
  assert.ok(Math.abs(glowGain(1) - 0.3) < 1e-9)
  assert.ok(Math.abs(glowGain(0.01) - 0.3) < 1e-9)
  let last = Infinity
  for (let f = 100; f >= 0.5; f *= 0.9) {
    const g = glowGain(f)
    assert.ok(g <= last + 1e-12, `rising at ${f}`)
    assert.ok(last === Infinity || last - g < 0.08, `a jump at ${f}`)
    last = g
  }
})
