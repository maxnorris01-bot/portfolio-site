import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as THREE from 'three'
import { liveClock, simTimeAt, withSpeed } from '../src/globe/clock.ts'
import { colorize, describeType, withVisibility } from '../src/globe/colors.ts'
import { pickNearest, type PickView } from '../src/globe/picking.ts'
import type { CatalogObject } from '../src/globe/types.ts'

test('live at 1x is real time; speed scales elapsed time without a jump', () => {
  const t0 = 1_000_000
  const c1 = liveClock(t0)
  assert.equal(simTimeAt(c1, t0 + 5000), t0 + 5000)

  const c10 = withSpeed(c1, 10, t0 + 5000)
  assert.equal(simTimeAt(c10, t0 + 5000), t0 + 5000) // no jump at the switch
  assert.equal(simTimeAt(c10, t0 + 6000), t0 + 5000 + 10_000)

  const back = withSpeed(c10, 1, t0 + 6000)
  assert.equal(simTimeAt(back, t0 + 7000), t0 + 16_000)
})

test('speed only applies to live; slider and replay clocks ignore it', () => {
  const offset = { kind: 'offset' as const, offsetMs: -3_600_000 }
  assert.equal(withSpeed(offset, 10, 0), offset)
  assert.equal(simTimeAt(offset, 10_000), 10_000 - 3_600_000)
  const frozen = { kind: 'frozen' as const, atMs: 42 }
  assert.equal(simTimeAt(frozen, 99_999), 42)
})

function view(distance: number): PickView {
  const camera = new THREE.PerspectiveCamera(40, 800 / 600, 0.001, 200)
  camera.position.set(0, 0, distance)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  const vp = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  return { viewProj: vp.elements, camera: [0, 0, distance], width: 800, height: 600 }
}

function screenOf(p: [number, number, number], v: PickView): [number, number] {
  const m = v.viewProj
  const [x, y, z] = p
  const w = m[3] * x + m[7] * y + m[11] * z + m[15]
  return [
    ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w + 1) * 0.5 * v.width,
    (1 - (m[1] * x + m[5] * y + m[9] * z + m[13]) / w) * 0.5 * v.height,
  ]
}

const all = () => true

test('picks the nearest point within the pixel threshold, nothing beyond it', () => {
  const positions = new Float32Array([0.3, 0.2, 1.1, 0.32, 0.2, 1.1, -0.5, -0.4, 1.05])
  const v = view(5)
  const [sx, sy] = screenOf([0.32, 0.2, 1.1], v)
  assert.equal(pickNearest(positions, all, v, sx + 1, sy, 10), 1)
  assert.equal(pickNearest(positions, all, v, sx + 200, sy + 200, 10), null)
})

test('the threshold is in screen pixels, so it behaves the same at any zoom', () => {
  const positions = new Float32Array([0.2, 0.1, 1.08])
  for (const distance of [2, 6, 25]) {
    const v = view(distance)
    const [sx, sy] = screenOf([0.2, 0.1, 1.08], v)
    assert.equal(pickNearest(positions, all, v, sx + 8, sy, 10), 0, `hit at ${distance}`)
    assert.equal(pickNearest(positions, all, v, sx + 12, sy, 10), null, `miss at ${distance}`)
  }
})

test('skips hidden points, points behind the Earth, and points behind the camera', () => {
  const v = view(5)
  // Far side of the Earth, lined up behind a visible near-side point.
  const positions = new Float32Array([0, 0, -1.1, 0, 0, 1.1, 0, 0, 6])
  const [sx, sy] = screenOf([0, 0, 1.1], v)
  assert.equal(pickNearest(positions, all, v, sx, sy, 10), 1)
  assert.equal(pickNearest(positions, (i) => i !== 1, v, sx, sy, 10), null)
  // The far-side point alone is occluded, and the one behind the camera is skipped.
  assert.equal(pickNearest(positions, (i) => i === 0 || i === 2, v, sx, sy, 10), null)
})

function obj(over: Partial<CatalogObject>): CatalogObject {
  return {
    norad_id: 1,
    name: 'X',
    tle_line1: '',
    tle_line2: '',
    element_epoch_utc: '',
    satcat_owner: null,
    object_type: 'PAY',
    active_payload: true,
    ...over,
  }
}

test('hidden categories get alpha 0, everything else alpha 1', () => {
  const objects = [obj({}), obj({ object_type: 'DEB', active_payload: false }), obj({})]
  const rgba = withVisibility(colorize(objects, 'type'), new Set(['debris']))
  assert.deepEqual([rgba[3], rgba[7], rgba[11]], [1, 0, 1])
  assert.equal(rgba[0], colorize(objects, 'type').rgb[0])
})

test('describeType reads object_type and active_payload', () => {
  assert.equal(describeType(obj({})), 'Active payload')
  assert.equal(describeType(obj({ active_payload: false })), 'Payload (inactive)')
  assert.equal(describeType(obj({ object_type: 'R/B' })), 'Rocket body')
  assert.equal(describeType(obj({ object_type: null })), 'Unknown type')
})

test('dimExcept dims all but the kept points, never hides, and restores exactly', async () => {
  const { dimExcept } = await import('../src/globe/colors.ts')
  // Four points: shown, hidden by a filter, shown, shown.
  const base = new Float32Array([1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1])
  const out = new Float32Array(base.length)
  dimExcept(base, out, [2], 0.2)
  assert.deepEqual(
    [out[3], out[7], out[11], out[15]].map((a) => Math.round(a * 100) / 100),
    [0.2, 0, 1, 0.2],
  )
  assert.deepEqual(Array.from(out.slice(0, 3)), [1, 0, 0]) // colours untouched
  dimExcept(base, out, [], 1)
  assert.deepEqual(Array.from(out), Array.from(base))
})
