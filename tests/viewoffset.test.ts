import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as THREE from 'three'
import { rayThrough, zoomLockedToward } from '../src/globe/descend.ts'
import { capVerticalFov, horizontalFovDeg, MAX_FOV_DEFAULT, maxVerticalFovDeg, widestAngleDeg } from '../src/globe/fovcap.ts'
import { applyLook } from '../src/globe/pov.ts'
import { insetToShiftPx, MAX_INSET_SHARE, toCanvasNdcX, toCentredNdcX, VIEW_SHIFT_MS, ViewShift } from '../src/globe/viewoffset.ts'
import { pickNearest } from '../src/globe/picking.ts'

const W = 1200
const H = 600

/** A camera looking down -z with the engine's way of applying the shift (setViewOffset, full size = the canvas). */
function shiftedCamera(shiftPx: number, fov = 60) {
  const cam = new THREE.PerspectiveCamera(fov, W / H, 0.1, 100)
  if (shiftPx) cam.setViewOffset(W, H, -shiftPx, 0, W, H)
  cam.updateMatrixWorld()
  return cam
}
const toNdc = (px: number, py: number): [number, number] => [(px / W) * 2 - 1, 1 - (py / H) * 2]

test('the shift is half the panel inset, and never more than the share of the canvas the panel may count', () => {
  assert.equal(insetToShiftPx(0, 1200), 0)
  assert.equal(insetToShiftPx(-5, 1200), 0)
  assert.equal(insetToShiftPx(332, 1200), 166)
  assert.equal(insetToShiftPx(2000, 1000), (1000 * MAX_INSET_SHARE) / 2)
  assert.equal(insetToShiftPx(300, 0), 0)
})

test('pointer maths: a pixel in the offset view gives the same ray from the centred NDC as the camera does', () => {
  const shift = 166
  const cam = shiftedCamera(shift)
  const free = [W / 2 + shift, H / 2] // the middle of the free area is where the projection centre now is
  // The centre of the free area is straight ahead.
  const [cx, cy] = toNdc(free[0], free[1])
  const centred = toCentredNdcX(cx, shift, W)
  assert.ok(Math.abs(centred) < 1e-12)
  const ahead = rayThrough({ pos: [0, 0, 0], look: [0, 0, -1], up: [0, 1, 0] }, 60, W / H, centred, cy)
  assert.ok(Math.abs(ahead[0]) < 1e-9 && Math.abs(ahead[1]) < 1e-9 && ahead[2] < -0.999)
  // Any pixel: the pure maths with the centred NDC matches three.js unprojecting the canvas NDC.
  for (const [px, py] of [[100, 50], [700, 300], [1100, 580], [400, 450], [900, 120]]) {
    const [nx, ny] = toNdc(px, py)
    const viaCamera = new THREE.Vector3(nx, ny, 0.5).unproject(cam).normalize()
    const pure = rayThrough({ pos: [0, 0, 0], look: [0, 0, -1], up: [0, 1, 0] }, 60, W / H, toCentredNdcX(nx, shift, W), ny)
    assert.ok(Math.abs(viaCamera.x - pure[0]) < 1e-9 && Math.abs(viaCamera.y - pure[1]) < 1e-9 && Math.abs(viaCamera.z - pure[2]) < 1e-9, `${px},${py}`)
  }
  // Without the correction the ray would be off by the shift (what the old maths would have done).
  const [nx, ny] = toNdc(700, 300)
  const wrong = rayThrough({ pos: [0, 0, 0], look: [0, 0, -1], up: [0, 1, 0] }, 60, W / H, nx, ny)
  const right = new THREE.Vector3(nx, ny, 0.5).unproject(cam).normalize()
  assert.ok(Math.abs(wrong[0] - right.x) > 0.05)
})

test('canvas NDC and centred NDC are inverses, and a zero shift changes nothing', () => {
  for (const s of [0, 80, 210]) {
    for (const n of [-1, -0.3, 0, 0.7, 1]) assert.ok(Math.abs(toCanvasNdcX(toCentredNdcX(n, s, W), s, W) - n) < 1e-12)
  }
  assert.equal(toCentredNdcX(0.4, 0, W), 0.4)
  assert.equal(toCentredNdcX(0.4, 50, 0), 0.4)
})

test('picking maths: a point straight ahead lands in the middle of the free area, and the pick finds it there and not at the canvas centre', () => {
  const shift = 200
  const cam = shiftedCamera(shift)
  const target = new THREE.Vector3(0, 0, -10)
  const ndc = target.clone().project(cam)
  const px = ((ndc.x + 1) / 2) * W
  const py = ((1 - ndc.y) / 2) * H
  assert.ok(Math.abs(px - (W / 2 + shift)) < 1e-6 && Math.abs(py - H / 2) < 1e-6)
  const viewProj = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
  const positions = new Float32Array([0, 0, -10, 3, 1, -10])
  const pick = (x: number, y: number) =>
    pickNearest(positions, () => true, { viewProj: viewProj.elements, camera: [0, 0, 0], width: W, height: H }, x, y, 12)
  assert.equal(pick(px + 3, py - 2), 0)
  assert.equal(pick(W / 2, H / 2), null, 'the canvas centre is no longer where the point is')
})

test('zoom toward the pointer keeps the point under the pointer with a non-zero offset', () => {
  const shift = 150
  const base = { look: [0, 0, -1] as [number, number, number], up: [0, 1, 0] as [number, number, number] }
  const aspect = W / H
  const [nx0, ny] = toNdc(900, 200)
  const nx = toCentredNdcX(nx0, shift, W)
  const look = { yaw: 10, pitch: 5, fov: 60 }
  const before = applyLook(base, look.yaw, look.pitch)
  const target = rayThrough({ pos: [0, 0, 0], ...before }, look.fov, aspect, nx, ny)
  const r = zoomLockedToward(base, look, 0.5, nx, ny, aspect, 1, 120)
  assert.ok(Math.abs(r.fov - 30) < 1e-9)
  const after = applyLook(base, r.yaw, r.pitch)
  const now = rayThrough({ pos: [0, 0, 0], ...after }, r.fov, aspect, nx, ny)
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(now[i] - target[i]) < 1e-6)
})

test('the view offset animation: eases over 300 ms, starts from where it is, jumps when instant, and returns to zero when the panel closes', () => {
  const v = new ViewShift()
  assert.equal(v.value(0), 0)
  v.set(160, 1000)
  assert.equal(v.value(1000), 0)
  const mid = v.value(1000 + VIEW_SHIFT_MS / 2)
  assert.ok(mid > 0 && mid < 160)
  assert.ok(Math.abs(mid - 80) < 1e-9, 'symmetric ease passes the middle at half time')
  assert.equal(v.settled(1000 + VIEW_SHIFT_MS / 2), false)
  assert.equal(v.value(1000 + VIEW_SHIFT_MS), 160)
  assert.equal(v.settled(1000 + VIEW_SHIFT_MS + 50), true)
  // Closing the panel part-way through opening it: it turns round from where it is.
  const w = new ViewShift()
  w.set(200, 0)
  const at = w.value(150)
  w.set(0, 150)
  assert.ok(Math.abs(w.value(150) - at) < 1e-9)
  assert.ok(w.value(300) < at)
  assert.equal(w.value(150 + VIEW_SHIFT_MS), 0, 'reset: back to the centred view')
  assert.equal(w.settled(150 + VIEW_SHIFT_MS), true)
  // Reduced motion: at once.
  const r = new ViewShift()
  r.set(120, 5000, true)
  assert.equal(r.value(5000), 120)
  r.set(0, 5001, true)
  assert.equal(r.value(5001), 0)
  // The same target again changes nothing.
  r.set(0, 6000)
  assert.equal(r.value(6000), 0)
})

test('the engine applies the shift with setViewOffset, clears it at zero, and reads pointers through the centred maths', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../src/globe/engine.ts', import.meta.url), 'utf8')
  assert.match(src, /cam\.setViewOffset\(w, h, -s, 0, w, h\)/)
  assert.match(src, /cam\.clearViewOffset\(\)/)
  assert.match(src, /private povNdc[\s\S]{0,400}toCentredNdcX/)
  // The star pick unprojects through the camera, so it takes canvas NDC.
  assert.match(src, /canvasNdc\(clientX, clientY\)\n\s+const p = new THREE\.Vector3\(nx, ny, 0\.5\)\.unproject\(cam\)/)
  assert.match(src, /setViewInset\(px: number\)/)
})

// ---- the field-of-view cap ----

test('the cap: the larger of the horizontal and vertical angles stays within it', () => {
  assert.equal(MAX_FOV_DEFAULT, 90)
  for (const aspect of [0.46, 0.75, 1, 1.5, 16 / 9, 2, 2.4, 4]) {
    for (const cap of [45, 60, 90, 100, 140]) {
      const v = maxVerticalFovDeg(cap, aspect)
      assert.ok(widestAngleDeg(v, aspect) <= cap + 1e-9, `${cap} at ${aspect}`)
      assert.ok(Math.abs(widestAngleDeg(v, aspect) - cap) < 1e-9, 'and it reaches the cap')
    }
  }
})

test('the cap on the cases from the brief: 100 vertical on 16:9 is about 130 across; the cap brings 16:9 to 90 across', () => {
  assert.ok(Math.abs(horizontalFovDeg(100, 16 / 9) - 130) < 2)
  const v = maxVerticalFovDeg(90, 16 / 9)
  assert.ok(Math.abs(v - 58.7) < 0.2, String(v))
  assert.ok(Math.abs(horizontalFovDeg(v, 16 / 9) - 90) < 1e-9)
})

test('portrait phones: the long side is vertical, so the cap is the vertical angle itself', () => {
  assert.equal(maxVerticalFovDeg(90, 390 / 844), 90)
  assert.equal(maxVerticalFovDeg(90, 1), 90)
  assert.equal(capVerticalFov(120, 90, 390 / 844), 90)
  assert.equal(capVerticalFov(70, 90, 390 / 844), 70, 'a narrow view is never widened')
  // Landscape phone: 844 x 390.
  assert.ok(widestAngleDeg(capVerticalFov(120, 90, 844 / 390), 844 / 390) <= 90 + 1e-9)
})

test('zooming out stops at the cap; zooming in is not limited by it', () => {
  const base = { look: [0, 0, -1] as [number, number, number], up: [0, 1, 0] as [number, number, number] }
  const aspect = 2
  const cap = maxVerticalFovDeg(90, aspect)
  const out = zoomLockedToward(base, { yaw: 0, pitch: 0, fov: 40 }, 10, 0, 0, aspect, 15, cap)
  assert.ok(Math.abs(out.fov - cap) < 1e-9)
  assert.ok(widestAngleDeg(out.fov, aspect) <= 90 + 1e-9)
  const inn = zoomLockedToward(base, { yaw: 0, pitch: 0, fov: 40 }, 0.01, 0, 0, aspect, 15, cap)
  assert.equal(inn.fov, 15)
  // If the finest imagery limit were ever wider than the cap, the zoom-in limit wins.
  const crossed = zoomLockedToward(base, { yaw: 0, pitch: 0, fov: 40 }, 10, 0, 0, 6, 25, maxVerticalFovDeg(45, 6))
  assert.equal(crossed.fov, 25)
  // Without a cap argument the old limit (120) applies.
  assert.equal(zoomLockedToward(base, { yaw: 0, pitch: 0, fov: 40 }, 10, 0, 0, aspect, 15).fov, 120)
})

test('the engine applies the cap to the Satellite, Sky and Globe cameras', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../src/globe/engine.ts', import.meta.url), 'utf8')
  assert.match(src, /this\.skyCamera\.fov = Math\.max\(SKY_FOV_MIN, Math\.min\(SKY_FOV_MAX, this\.skyMaxFov\(\), fov\)\)/)
  assert.match(src, /zoomLockedToward\(base, look, factor, ux, uy, aspect, minFov, this\.povMaxFov\(\)\)/)
  assert.match(src, /this\.camera\.fov = Math\.min\(GLOBE_FOV, maxVerticalFovDeg\(this\.maxFov, w \/ h\)\)/)
  assert.match(src, /private applyFovCap\(\)/)
})

// ---- the Forward preset under the cap ----

test('Forward is tipped down so the limb stays in a capped view: ISS at a 2.4:1 map, wide fields almost level, high orbits level', async () => {
  const { forwardPitchDeg } = await import('../src/globe/pov.ts')
  const v = maxVerticalFovDeg(90, 2.4) // about 45 degrees
  const pitch = forwardPitchDeg(420, v)
  assert.ok(pitch < -5 && pitch > -12, String(pitch))
  // The limb (about 20 degrees below the horizontal from the ISS) then lies inside the view, well clear of the bottom edge.
  const dip = (Math.acos(6371 / (6371 + 420)) * 180) / Math.PI
  const fromCentre = dip + pitch // degrees below the view's centre
  assert.ok(fromCentre > 0 && fromCentre < v / 2 - 4, `${fromCentre} of ${v / 2}`)
  // The old wide default: nearly level.
  assert.ok(forwardPitchDeg(420, 70) > -2)
  // Geostationary: the limb is out of reach, so level.
  assert.equal(forwardPitchDeg(35786, 45), 0)
  // Never upward, never from nothing.
  assert.equal(forwardPitchDeg(0, 45), 0)
  assert.equal(forwardPitchDeg(420, 0), 0)
})
