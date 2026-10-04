import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SPEEDS } from '../src/globe/clock.ts'
import { nearestCandidates, nearestTo } from '../src/globe/neighbors.ts'

// Deterministic pseudo-random numbers so failures reproduce.
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

test('the true nearest is always among the candidates when positions are within the error bound', () => {
  const rand = rng(42)
  for (let trial = 0; trial < 200; trial++) {
    const n = 400
    const truth = new Float64Array(n * 3)
    for (let i = 0; i < truth.length; i++) truth[i] = (rand() - 0.5) * 2000 // km
    // Errors comparable to the ~270 km mean spacing, so the margin matters.
    const errorBound = 50 + rand() * 250
    // Approximate positions: each displaced by the full errorBound in a random direction.
    const approx = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const dx = rand() - 0.5
      const dy = rand() - 0.5
      const dz = rand() - 0.5
      const k = errorBound / Math.hypot(dx, dy, dz)
      approx[i * 3] = truth[i * 3] + dx * k
      approx[i * 3 + 1] = truth[i * 3 + 1] + dy * k
      approx[i * 3 + 2] = truth[i * 3 + 2] + dz * k
    }
    const sel = trial % n
    const hidden = new Set([3, 17, 99])
    const visible = (i: number) => !hidden.has(i)
    const candidates = nearestCandidates(approx, sel, visible, errorBound, n)
    assert.ok(candidates)
    const exact = nearestTo(truth, sel, visible)!
    assert.ok(candidates.includes(exact.index), `trial ${trial}`)
    assert.ok(!candidates.includes(sel) && !candidates.some((i) => hidden.has(i)))
  }
})

test('with exact positions the candidate set is just the nearest (plus ties)', () => {
  const pos = new Float64Array([0, 0, 0, 5, 0, 0, 3, 0, 0, 9, 0, 0])
  assert.deepEqual(nearestCandidates(pos, 0, () => true, 0, 10), [2])
})

test('returns null when the bound is too loose for the cap, and [] when nothing is visible', () => {
  const pos = new Float64Array([0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0])
  assert.equal(nearestCandidates(pos, 0, () => true, 100, 2), null)
  assert.deepEqual(nearestCandidates(pos, 0, () => false, 0, 2), [])
})

test('playback speeds are 1x, 10x and 50x', () => {
  assert.deepEqual([...SPEEDS], [1, 10, 50])
})
