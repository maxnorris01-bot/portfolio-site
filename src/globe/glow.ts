// The glow atlas: the Milky Way's unresolved light, from Gaia, as a sky map.
// The data is a HEALPix order-7 map (196,608 pixels of about 0.46 degrees) in
// a 512 x 384 JPEG, pixel i at column i % 512, row i // 512 (docs/star-data-
// format.md in satellite-conjunction-screening). This turns it into a
// longitude-latitude texture the sky shader samples, interpolating between
// pixel centres (HEALPix bilinear weights) so the diamond-shaped pixels
// never show, however far you zoom. Pure, so it is tested.

import { interpolateNest } from './healpix.ts'

export const GLOW_ORDER = 7
export const GLOW_ATLAS_WIDTH = 512
export const GLOW_ATLAS_HEIGHT = 384

/**
 * Fill rows `from` to `to` (exclusive) of an RGBA texture `out` (`outW` by
 * `outH`, row 0 at declination -90) from the atlas's RGBA pixels. Column x
 * is at right ascension `(0.5 - u) * 360` degrees, u = (x + 0.5) / outW: RA
 * increases to the left, with 0 h in the middle, as the shader reads it.
 * Rows can be filled in slices so the work doesn't hold up a frame.
 */
export function fillGlowRows(atlas: ArrayLike<number>, out: Uint8Array, outW: number, outH: number, from: number, to: number): void {
  const pix = new Int32Array(4)
  const w = new Float64Array(4)
  for (let y = from; y < to; y++) {
    const dec = ((y + 0.5) / outH) * 180 - 90
    for (let x = 0; x < outW; x++) {
      const ra = (((0.5 - (x + 0.5) / outW) * 360) % 360 + 360) % 360
      interpolateNest(GLOW_ORDER, ra, dec, pix, w)
      let r = 0
      let g = 0
      let b = 0
      for (let k = 0; k < 4; k++) {
        const o = pix[k] * 4
        r += atlas[o] * w[k]
        g += atlas[o + 1] * w[k]
        b += atlas[o + 2] * w[k]
      }
      const at = (y * outW + x) * 4
      out[at] = Math.round(r)
      out[at + 1] = Math.round(g)
      out[at + 2] = Math.round(b)
      out[at + 3] = 255
    }
  }
}

/**
 * How bright the glow is at a field of view. The glow is the light of stars
 * fainter than G = 13, which the tiles don't draw, so it is full at wide
 * fields (where almost no individual star is drawn) and eases down as the
 * field narrows and the drawn stars resolve the sky: to `min` of full at a
 * degree and below, over a log scale from 30 degrees down to one.
 */
export function glowGain(fovDeg: number, full = 1, min = 0.3): number {
  const t = Math.min(1, Math.max(0, Math.log(Math.max(fovDeg, 1e-3) / 1) / Math.log(30)))
  const s = t * t * (3 - 2 * t)
  return min + (full - min) * s
}

/**
 * A Gaussian blur of a longitude-latitude glow map (RGBA, row 0 at declination
 * -90), done in two passes so it stays cheap, and in slices of rows so it can
 * run a little each frame. `sigmaDeg` is the blur on the sky: horizontally it
 * widens toward the poles (a degree of right ascension is shorter there; it
 * is capped at 30 texels, so the last degree or two around a pole is blurred
 * less, where the map is dark anyway), wrapping around right ascension;
 * vertically it clamps at the poles. Weights sum to 1, so the light is kept.
 */
export class GlowBlur {
  readonly out: Uint8Array
  private readonly tmp: Float32Array
  private readonly src: Uint8Array
  private readonly w: number
  private readonly h: number
  private readonly sigmaDeg: number
  private row = 0
  private phase = 0
  private readonly kernels = new Map<number, Float32Array>()

  constructor(src: Uint8Array, w: number, h: number, sigmaDeg: number) {
    this.src = src
    this.w = w
    this.h = h
    this.sigmaDeg = sigmaDeg
    this.tmp = new Float32Array(w * h * 3)
    this.out = new Uint8Array(w * h * 4)
  }

  private kernel(sigmaPx: number): Float32Array {
    const key = Math.round(sigmaPx * 20)
    let k = this.kernels.get(key)
    if (!k) {
      const s = Math.max(0.05, key / 20)
      const r = Math.max(1, Math.ceil(3 * s))
      k = new Float32Array(2 * r + 1)
      let sum = 0
      for (let i = -r; i <= r; i++) sum += k[i + r] = Math.exp(-(i * i) / (2 * s * s))
      for (let i = 0; i < k.length; i++) k[i] /= sum
      this.kernels.set(key, k)
    }
    return k
  }

  /** Blur up to `rows` more rows; true when the whole map is done. */
  step(rows: number): boolean {
    const { w, h, src, tmp, out } = this
    const texelDeg = 360 / w
    const end = Math.min(h, this.row + rows)
    for (let y = this.row; y < end; y++) {
      if (this.phase === 0) {
        const dec = ((y + 0.5) / h) * 180 - 90
        const sigmaPx = Math.min(30, this.sigmaDeg / texelDeg / Math.max(Math.cos((dec * Math.PI) / 180), 0.02))
        const k = this.kernel(sigmaPx)
        const r = (k.length - 1) / 2
        for (let x = 0; x < w; x++) {
          let a = 0
          let b = 0
          let c = 0
          for (let i = -r; i <= r; i++) {
            const o = (y * w + ((x + i + w) % w)) * 4
            const wt = k[i + r]
            a += src[o] * wt
            b += src[o + 1] * wt
            c += src[o + 2] * wt
          }
          const t = (y * w + x) * 3
          tmp[t] = a
          tmp[t + 1] = b
          tmp[t + 2] = c
        }
      } else {
        const k = this.kernel(this.sigmaDeg / (180 / h))
        const r = (k.length - 1) / 2
        for (let x = 0; x < w; x++) {
          let a = 0
          let b = 0
          let c = 0
          for (let i = -r; i <= r; i++) {
            const t = (Math.min(h - 1, Math.max(0, y + i)) * w + x) * 3
            const wt = k[i + r]
            a += tmp[t] * wt
            b += tmp[t + 1] * wt
            c += tmp[t + 2] * wt
          }
          const o = (y * w + x) * 4
          out[o] = Math.round(a)
          out[o + 1] = Math.round(b)
          out[o + 2] = Math.round(c)
          out[o + 3] = 255
        }
      }
    }
    this.row = end
    if (this.row >= h) {
      if (this.phase === 1) return true
      this.phase = 1
      this.row = 0
    }
    return false
  }
}

/** The whole map blurred at once (for tests and for building offline). */
export function blurGlowMap(src: Uint8Array, w: number, h: number, sigmaDeg: number): Uint8Array {
  const job = new GlowBlur(src, w, h, sigmaDeg)
  while (!job.step(h)) {
    /* run to completion */
  }
  return job.out
}
