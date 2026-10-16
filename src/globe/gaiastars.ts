// The streamed Gaia stars on the sky: one point-sprite mesh per loaded tile,
// sharing the Hipparcos stars' material so size, brightness and the limiting
// magnitude behave identically (no seam at the handover). Loaded lazily with
// the first tile, so it never touches the globe's or the space view's chunk.
//
// Per tile: J2000 unit vectors (kept, to turn the tile again when the day
// changes), the rotated positions the GPU draws, the V-equivalent magnitude,
// the colour. A tile is brightest first, so drawing its first N stars is
// drawing the stars brighter than a limit (drawRange), and a tile out of view
// is hidden, not removed (it stays cached).

import * as THREE from 'three'
import { prefixCount, type DecodedTile } from './gaiatiles.ts'
import type { Vec3 } from './pov.ts'
import { SKY_RADIUS, pickStarScored, type Mat3 } from './stars.ts'

interface TileMesh {
  tile: DecodedTile
  points: THREE.Points
  geometry: THREE.BufferGeometry
  /** Stars drawn now (the prefix brighter than the limit). */
  drawn: number
}

export class GaiaStars {
  readonly group = new THREE.Group()
  private readonly tiles = new Map<number, TileMesh>()
  private rotation: Mat3 | null = null
  private limit = 0
  private readonly material: THREE.ShaderMaterial

  constructor(material: THREE.ShaderMaterial) {
    this.material = material
  }

  /** A tile arrived: build its mesh (hidden until the view needs it). */
  add(ipix: number, tile: DecodedTile) {
    this.remove(ipix)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tile.count * 3), 3))
    geometry.setAttribute('mag', new THREE.BufferAttribute(tile.mag, 1))
    geometry.setAttribute('color', new THREE.BufferAttribute(tile.rgb, 3, true))
    const points = new THREE.Points(geometry, this.material)
    points.frustumCulled = false
    points.renderOrder = -1
    points.visible = false
    const entry: TileMesh = { tile, points, geometry, drawn: 0 }
    this.tiles.set(ipix, entry)
    this.group.add(points)
    if (this.rotation) this.turn(entry, this.rotation)
    geometry.setDrawRange(0, 0)
  }

  remove(ipix: number) {
    const t = this.tiles.get(ipix)
    if (!t) return
    this.group.remove(t.points)
    t.geometry.dispose()
    this.tiles.delete(ipix)
  }

  private turn(t: TileMesh, m: Mat3) {
    const d = t.tile.dir
    const pos = t.geometry.getAttribute('position') as THREE.BufferAttribute
    const out = pos.array as Float32Array
    for (let i = 0; i < d.length; i += 3) {
      const x = m[0] * d[i] + m[1] * d[i + 1] + m[2] * d[i + 2]
      const y = m[3] * d[i] + m[4] * d[i + 1] + m[5] * d[i + 2]
      const z = m[6] * d[i] + m[7] * d[i + 1] + m[8] * d[i + 2]
      out[i] = x * SKY_RADIUS
      out[i + 1] = z * SKY_RADIUS
      out[i + 2] = -y * SKY_RADIUS
    }
    pos.needsUpdate = true
  }

  /** The J2000-to-date rotation (row-major), as the Hipparcos stars get it. */
  setRotation(m: Mat3) {
    this.rotation = m
    for (const t of this.tiles.values()) this.turn(t, m)
  }

  /**
   * Draw the stars brighter than `limitMag` (V-equivalent) in the tiles in
   * `inView` and nothing else; returns the number of stars drawn.
   */
  setLimit(limitMag: number, inView: ReadonlySet<number>): number {
    this.limit = limitMag
    let drawn = 0
    for (const [ipix, t] of this.tiles) {
      const show = inView.has(ipix)
      t.points.visible = show
      if (!show) continue
      // V is never brighter than G (to a few hundredths), so G < limit holds every star V < limit does.
      const n = prefixCount(t.tile.gq, t.tile.count, limitMag + 0.05)
      if (n !== t.drawn) {
        t.drawn = n
        t.geometry.setDrawRange(0, n)
      }
      drawn += n
    }
    return drawn
  }

  get tileCount() {
    return this.tiles.size
  }

  /** Decoded stars held (drawn or not). */
  get heldStars() {
    let n = 0
    for (const t of this.tiles.values()) n += t.tile.count
    return n
  }

  tile(ipix: number): DecodedTile | null {
    return this.tiles.get(ipix)?.tile ?? null
  }

  /** The scene-axes unit direction of star `i` of a loaded tile. */
  direction(ipix: number, i: number): Vec3 | null {
    const t = this.tiles.get(ipix)
    if (!t || i < 0 || i >= t.tile.count) return null
    const a = (t.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array
    return [a[i * 3] / SKY_RADIUS, a[i * 3 + 1] / SKY_RADIUS, a[i * 3 + 2] / SKY_RADIUS]
  }

  /**
   * The star a tap selects among the drawn Gaia stars (the same pick rule as
   * the Hipparcos stars: pixel distance plus 1.5 px per magnitude within the
   * radius). Returns its tile, index and score for comparing with a
   * Hipparcos candidate, or null.
   */
  pick(ray: Vec3, fovDeg: number, screenPx: number, radiusPx: number): { ipix: number; i: number; score: number } | null {
    let best: { ipix: number; i: number; score: number } | null = null
    for (const [ipix, t] of this.tiles) {
      if (!t.points.visible || t.drawn === 0) continue
      const a = (t.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array
      const r = pickStarScored(a, t.tile.mag, t.drawn, ray, fovDeg, screenPx, radiusPx, SKY_RADIUS, this.limit)
      if (r.index >= 0 && (!best || r.score < best.score)) best = { ipix, i: r.index, score: r.score }
    }
    return best
  }

  dispose() {
    for (const ipix of [...this.tiles.keys()]) this.remove(ipix)
    this.group.removeFromParent()
  }
}
