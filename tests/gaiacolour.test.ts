import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bvFromBpRp, gMinusV, vFromG } from '../src/globe/gaiacolour.ts'
import { starColor } from '../src/globe/stars.ts'

test('G - V is the Gaia EDR3 relation (Riello et al. 2021, Table 5.7) over its range', () => {
  const f = (c: number) => -0.02704 + 0.01424 * c - 0.2156 * c * c + 0.01426 * c * c * c
  for (const c of [-0.4, 0, 0.5, 0.82, 1.5, 2.0, 2.4]) assert.ok(Math.abs(gMinusV(c) - f(c)) < 1e-12, `c = ${c}`)
  assert.ok(Math.abs(gMinusV(0.82) - -0.1525) < 0.002) // a Sun-like star: V is 0.15 fainter than G
})

test('beyond its range the cubic is replaced by the measured medians: continuous, falling, bounded', () => {
  assert.ok(Math.abs(gMinusV(2.4) - gMinusV(2.4001)) < 1e-3)
  let last = gMinusV(2.4)
  for (let c = 2.45; c <= 6; c += 0.05) {
    const v = gMinusV(c)
    assert.ok(v <= last + 1e-9, `rising at ${c}`)
    last = v
  }
  assert.equal(gMinusV(6), -2.4)
  // The cubic alone would reach -4.3 by BP-RP 6; the real stars don't.
  assert.ok(gMinusV(5.5) > -2.5)
})

test('V from G on stars with both (Hipparcos V, Gaia G and BP-RP from the cross-match)', () => {
  // [name, Hipparcos V, Gaia G, BP-RP, tolerance]
  const stars: [string, number, number, number, number][] = [
    ['Mintaka', 2.25, 2.25, 0.17, 0.05], // blue
    ['Lalande 21185', 7.5, 6.55, 2.22, 0.1], // red dwarf
    ['Barnard\'s Star', 9.56, 8.19, 2.83, 0.2], // very red
    ['Proxima Centauri', 11.0, 8.98, 3.8, 0.25], // extremely red: the tail's accuracy
  ]
  for (const [name, v, g, c, tol] of stars) {
    assert.ok(Math.abs(vFromG(g, c) - v) <= tol, `${name}: V from G ${vFromG(g, c).toFixed(2)} vs ${v}`)
  }
})

test('B-V from BP-RP: Sun-like where it should be, never turning back, within the ramp', () => {
  assert.ok(Math.abs(bvFromBpRp(0.82) - 0.65) < 0.03) // BP-RP of the Sun is about 0.82, B-V 0.65
  let last = -Infinity
  for (let c = -0.6; c <= 7; c += 0.05) {
    const b = bvFromBpRp(c)
    assert.ok(b >= last - 1e-9, `falling at ${c}`)
    last = b
  }
  assert.ok(bvFromBpRp(7) <= 2.0)
  // The same star gets the same colour from either catalogue's colour index, to within the ramp's resolution.
  const sun = starColor(0.65)
  const fromGaia = starColor(bvFromBpRp(0.82))
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(sun[i] - fromGaia[i]) < 0.06)
  // Red stars come out orange-red, blue stars blue-white.
  const red = starColor(bvFromBpRp(3.5))
  assert.ok(red[0] === 1 && red[2] < 0.6 && red[2] < red[1])
  assert.ok(starColor(bvFromBpRp(-0.3))[2] > starColor(bvFromBpRp(-0.3))[0] - 1e-9)
})
