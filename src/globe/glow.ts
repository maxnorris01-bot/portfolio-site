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
