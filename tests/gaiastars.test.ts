import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { test } from 'node:test'
import * as THREE from 'three'
import { GaiaStars } from '../src/globe/gaiastars.ts'
import { decodeTile, prefixCount } from '../src/globe/gaiatiles.ts'
import { limitingMagnitude, NO_ROTATION, SKY_RADIUS, type Mat3 } from '../src/globe/stars.ts'

const raw = readFileSync(new URL('./fixtures/gaia-tile-0437.bin.gz', import.meta.url))
const unzipped = gunzipSync(raw)
const tile = decodeTile(unzipped.buffer.slice(unzipped.byteOffset, unzipped.byteOffset + unzipped.byteLength) as ArrayBuffer)
const material = new THREE.ShaderMaterial()

test('a tile draws the stars brighter than the limit, as a prefix, and only while it is in view', () => {
  const g = new GaiaStars(material)
  g.setRotation(NO_ROTATION)
  g.add(437, tile)
  assert.equal(g.tileCount, 1)
  assert.equal(g.heldStars, tile.count)
  // Not in view: nothing drawn, however faint the limit.
  assert.equal(g.setLimit(14, new Set()), 0)
  // In view: the first N stars, N from the tile's own magnitudes.
  const drawn = g.setLimit(9, new Set([437]))
  assert.equal(drawn, prefixCount(tile.gq, tile.count, 9.05))
  assert.ok(drawn > 0 && drawn < tile.count)
  assert.ok(g.setLimit(13, new Set([437])) > drawn)
  const pts = g.group.children[0] as THREE.Points
  assert.equal(pts.visible, true)
  assert.equal(pts.geometry.drawRange.count, g.setLimit(13, new Set([437])))
  g.setLimit(13, new Set([999]))
  assert.equal(pts.visible, false)
  g.dispose()
})

test('stars are turned with the rotation exactly as the Hipparcos stars are', () => {
  const g = new GaiaStars(material)
  g.add(437, tile)
  // A quarter turn about z: x -> y, y -> -x (row-major).
  const m: Mat3 = [0, -1, 0, 1, 0, 0, 0, 0, 1]
  g.setRotation(m)
  const d = g.direction(437, 0)!
  const x = tile.dir[0]
  const y = tile.dir[1]
  const z = tile.dir[2]
  // Rotated vector (-y, x, z), then the scene axes (x, z, -y).
  assert.ok(Math.abs(d[0] - -y) < 1e-5 && Math.abs(d[1] - z) < 1e-5 && Math.abs(d[2] - -x) < 1e-5)
  assert.ok(Math.abs(Math.hypot(...d) - 1) < 1e-5)
  // A tile added after the rotation is already turned.
  g.add(437, tile)
  const again = g.direction(437, 0)!
  assert.ok(Math.abs(again[0] - d[0]) < 1e-6)
  assert.equal(g.direction(437, tile.count), null)
  assert.equal(g.direction(5, 0), null)
  g.dispose()
})

test('a pick finds the Gaia star nearest the pointer, within the pick radius and the limit', () => {
  const g = new GaiaStars(material)
  g.setRotation(NO_ROTATION)
  g.add(437, tile)
  g.setLimit(11, new Set([437]))
  // Point at the star's own direction (scene axes).
  const k = 40
  const d = g.direction(437, k)!
  const hit = g.pick(d, 1, 800, 12)
  assert.ok(hit && hit.ipix === 437)
  const got = g.direction(437, hit!.i)!
  const chord = Math.hypot(got[0] - d[0], got[1] - d[1], got[2] - d[2]) // small angles in radians (float32 vectors: acos would lose them)
  assert.ok((chord * 180) / Math.PI < (1 / 800) * 12, `${chord}`)
  // Pointing the opposite way finds nothing; so does a limit that hides the star.
  assert.equal(g.pick([-d[0], -d[1], -d[2]], 1, 800, 12), null)
  assert.ok(limitingMagnitude(1, 14) > 10)
  g.setLimit(2, new Set([437]))
  assert.equal(g.pick(d, 1, 800, 12), null)
  assert.ok(SKY_RADIUS > 0)
  g.dispose()
})

test('removing a tile frees its mesh', () => {
  const g = new GaiaStars(material)
  g.add(437, tile)
  g.remove(437)
  assert.equal(g.tileCount, 0)
  assert.equal(g.group.children.length, 0)
  assert.equal(g.setLimit(13, new Set([437])), 0)
  g.remove(437) // twice is fine
})
