import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  ang2pixNest,
  angleBetween,
  interpolateNest,
  pix2angNest,
  pixelCount,
  ring2nest,
  tileGeometry,
} from '../src/globe/healpix.ts'

// Reference values from astropy-healpix (tests/fixtures/healpix-ref.json).
const ref = JSON.parse(readFileSync(new URL('./fixtures/healpix-ref.json', import.meta.url), 'utf8'))

test('the nested pixel of a direction matches astropy-healpix, orders 3 and 7', () => {
  for (const r of ref.ang2pix) {
    for (let i = 0; i < r.ra.length; i++) {
      // (45, 0) sits exactly on a pixel corner, where either neighbour is right.
      if (r.ra[i] === 45 && r.dec[i] === 0) continue
      assert.equal(ang2pixNest(r.order, r.ra[i], r.dec[i]), r.ipix[i], `order ${r.order} (${r.ra[i]}, ${r.dec[i]})`)
    }
  }
})

test('a nested pixel centre matches astropy-healpix and maps back to its own pixel', () => {
  const r = ref.pix2ang[0]
  for (let p = 0; p < 768; p++) {
    const c = pix2angNest(3, p)
    const dRa = Math.abs(((c.ra - r.ra[p] + 540) % 360) - 180)
    assert.ok(Math.min(dRa, Math.abs(c.ra - r.ra[p])) * Math.cos((c.dec * Math.PI) / 180) < 1e-6 || Math.abs(c.dec) > 89.9, `ra of ${p}`)
    assert.ok(Math.abs(c.dec - r.dec[p]) < 1e-7, `dec of ${p}`)
    assert.equal(ang2pixNest(3, c.ra, c.dec), p)
  }
})

test('ring to nested numbering matches astropy-healpix', () => {
  const r = ref.ring2nest
  for (let i = 0; i < r.ring.length; i++) assert.equal(ring2nest(r.order, r.ring[i]), r.nested[i])
})

test('bilinear weights match astropy-healpix, including at the poles', () => {
  const r = ref.interp[0]
  const pix = new Int32Array(4)
  const w = new Float64Array(4)
  for (let i = 0; i < r.ra.length; i++) {
    if (r.ra[i] === 45 && r.dec[i] === 0) continue // on a pixel corner: ties differ
    interpolateNest(r.order, r.ra[i], r.dec[i], pix, w)
    // astropy returns [4][points]: sort both by pixel to compare as sets of (pixel, weight)
    const want = [0, 1, 2, 3].map((k) => [r.nested[k][i], r.w[k][i]]).sort((a, b) => a[0] - b[0])
    const got = [0, 1, 2, 3].map((k) => [pix[k], w[k]]).sort((a, b) => a[0] - b[0])
    // Pixels repeated near a pole merge: compare summed weights per pixel.
    const sum = (list: number[][]) => {
      const m = new Map<number, number>()
      for (const [p, x] of list) m.set(p, (m.get(p) ?? 0) + x)
      return m
    }
    const a = sum(want)
    const b = sum(got)
    assert.deepEqual([...b.keys()].sort(), [...a.keys()].sort(), `pixels at (${r.ra[i]}, ${r.dec[i]})`)
    for (const [p, x] of a) assert.ok(Math.abs((b.get(p) ?? 0) - x) < 1e-9, `weight of ${p} at (${r.ra[i]}, ${r.dec[i]}): ${b.get(p)} vs ${x}`)
    assert.ok(Math.abs(w[0] + w[1] + w[2] + w[3] - 1) < 1e-9)
  }
})

test('tile geometry: every point of a tile is within its radius of its centre', () => {
  const geo = tileGeometry(3)
  assert.equal(geo.length, pixelCount(3))
  let sampled = 0
  for (let ra = 0; ra < 360; ra += 7.3) {
    for (let dec = -89; dec <= 89; dec += 6.1) {
      const p = ang2pixNest(3, ra, dec)
      const d = ((a: number, b: number) => [Math.cos(b * Math.PI / 180) * Math.cos(a * Math.PI / 180), Math.cos(b * Math.PI / 180) * Math.sin(a * Math.PI / 180), Math.sin(b * Math.PI / 180)] as [number, number, number])(ra, dec)
      assert.ok(angleBetween(geo[p].centre, d) <= geo[p].radiusDeg, `tile ${p} at (${ra}, ${dec})`)
      sampled++
    }
  }
  assert.ok(sampled > 1000)
  // Tiles are about 7.3 degrees across (53.7 square degrees): the radius is a few degrees, not tens.
  assert.ok(Math.max(...geo.map((g) => g.radiusDeg)) < 9)
})
