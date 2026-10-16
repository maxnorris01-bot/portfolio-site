// The Gaia star tiles (scripts/star_data in satellite-conjunction-screening,
// docs/star-data-format.md there): the manifest, the tile and details file
// readers, and the counts the streamer plans with. Pure, so it is tested.
//
// A tile is a HEALPix order-3 cell of Gaia DR3 stars brighter than G = 13
// (without the ones the Hipparcos file already draws), brightest first, as
// columns: ra u24, dec u24, G u8, BP-RP u8. A details file holds the same
// stars in the same order: source ID, parallax and its error.

import { bvFromBpRp, gMinusV, NO_COLOUR_BPRP } from './gaiacolour.ts'
import { starColor } from './stars.ts'

export const G_OFFSET = -1
export const G_SCALE = 11
export const COLOUR_OFFSET = -1
export const COLOUR_SCALE = 25

export interface TileEntry {
  ipix: number
  count: number
  file: string
  bytes: number
  gzBytes: number
  detailsFile: string
  /** The brightest and faintest G in the tile. */
  gMin: number
  gMax: number
  /** Stars in the tile brighter than each of the manifest's magnitude bins. */
  nLt: number[]
}

export interface Manifest {
  version: string
  epoch: number
  order: number
  magBins: number[]
  tiles: Map<number, TileEntry>
  totalStars: number
  attribution: { credit: string; text: string; licence: string }
}

/** Read manifest.json, checking what the viewer relies on. */
export function readManifest(json: unknown): Manifest {
  const m = json as {
    version?: string
    format_version?: number
    epoch?: number
    tiling?: { order?: number }
    encoding?: { mag_bins?: number[]; mag?: { offset?: number; scale?: number }; colour?: { offset?: number; scale?: number } }
    totals?: { stars?: number }
    attribution?: { credit?: string; text?: string; licence?: string }
    tiles?: Record<string, unknown>[]
  }
  if (!m || m.format_version !== 1 || !Array.isArray(m.tiles) || !m.encoding?.mag_bins) throw new Error('not a version 1 star manifest')
  if (m.encoding.mag?.offset !== G_OFFSET || m.encoding.mag?.scale !== G_SCALE) throw new Error('unexpected magnitude encoding')
  if (m.encoding.colour?.offset !== COLOUR_OFFSET || m.encoding.colour?.scale !== COLOUR_SCALE) throw new Error('unexpected colour encoding')
  const tiles = new Map<number, TileEntry>()
  for (const t of m.tiles) {
    const e: TileEntry = {
      ipix: t.ipix as number,
      count: t.count as number,
      file: t.file as string,
      bytes: t.bytes as number,
      gzBytes: t.gz_bytes as number,
      detailsFile: t.details_file as string,
      gMin: t.g_min as number,
      gMax: t.g_max as number,
      nLt: t.n_lt as number[],
    }
    if (!Number.isInteger(e.ipix) || !Number.isInteger(e.count) || typeof e.file !== 'string' || !Array.isArray(e.nLt)) {
      throw new Error('bad tile entry in the manifest')
    }
    tiles.set(e.ipix, e)
  }
  return {
    version: m.version ?? 'v1',
    epoch: m.epoch ?? 2026,
    order: m.tiling?.order ?? 3,
    magBins: m.encoding.mag_bins,
    tiles,
    totalStars: m.totals?.stars ?? 0,
    attribution: {
      credit: m.attribution?.credit ?? 'Credit: ESA, Gaia DPAC',
      text: m.attribution?.text ?? '',
      licence: m.attribution?.licence ?? 'CC BY-NC 3.0 IGO',
    },
  }
}

/**
 * About how many of a tile's stars are brighter than G = `g`, from the
 * manifest alone: the counts per whole magnitude, interpolated (as a power
 * law between them, star counts rising about 2.5 times a magnitude). For
 * planning only; a decoded tile counts exactly (prefixCount).
 */
export function countBelow(t: TileEntry, bins: readonly number[], g: number): number {
  if (g <= t.gMin) return 0
  if (g > bins[bins.length - 1] || g > t.gMax) return t.count
  let lo = t.gMin
  let nLo = 0
  for (let i = 0; i < bins.length; i++) {
    const hi = bins[i]
    const nHi = t.nLt[i]
    if (g <= hi) {
      // log-linear between (lo, nLo) and (hi, nHi)
      const a = Math.log(nLo + 1)
      const b = Math.log(nHi + 1)
      const f = (g - lo) / Math.max(1e-6, hi - lo)
      return Math.max(0, Math.round(Math.exp(a + (b - a) * f) - 1))
    }
    lo = hi
    nLo = nHi
  }
  return t.count
}

/** Does the tile hold any star brighter than G = `g`? Decided from the manifest, before any download. */
export const tileHasStarsAbove = (t: TileEntry, g: number) => t.gMin < g

// ---- decoding ----

/** Colour byte to the V-equivalent offset, and to the colour ramp's RGB, one entry per byte value. */
export interface ColourTables {
  /** G - V per colour byte. */
  gMinusV: Float32Array
  /** RGB (0..255) per colour byte, three entries each. */
  rgb: Uint8Array
  /** BP-RP per colour byte (NaN for none). */
  bprp: Float32Array
}

export function colourTables(): ColourTables {
  const gv = new Float32Array(256)
  const rgb = new Uint8Array(256 * 3)
  const bprp = new Float32Array(256)
  for (let b = 0; b < 256; b++) {
    const c = b === 0 ? NO_COLOUR_BPRP : b / COLOUR_SCALE + COLOUR_OFFSET
    bprp[b] = b === 0 ? NaN : c
    gv[b] = gMinusV(c)
    const col = starColor(bvFromBpRp(c))
    rgb[b * 3] = Math.round(col[0] * 255)
    rgb[b * 3 + 1] = Math.round(col[1] * 255)
    rgb[b * 3 + 2] = Math.round(col[2] * 255)
  }
  return { gMinusV: gv, rgb, bprp }
}

let tables: ColourTables | null = null
const getTables = () => (tables ??= colourTables())

/** A decoded tile, in the form the renderer keeps. */
export interface DecodedTile {
  ipix: number
  count: number
  /** J2000 unit vectors, three per star. */
  dir: Float32Array
  /** Gaia G quantised as in the file (ascending); the prefix search runs on it. */
  gq: Uint8Array
  /** Colour byte as in the file (0 = none). */
  cq: Uint8Array
  /** The V-equivalent magnitude of each star (what the shader limits and sizes by). */
  mag: Float32Array
  /** The star's colour from the ramp, RGB bytes, three per star. */
  rgb: Uint8Array
}

/** Decode a "GAIT" tile file (already gunzipped). */
export function decodeTile(buffer: ArrayBuffer): DecodedTile {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])
  if (magic !== 'GAIT' || view.getUint16(4, true) !== 1) throw new Error('not a version 1 Gaia tile')
  const ipix = view.getUint32(8, true)
  const count = view.getUint32(12, true)
  const raAt = 32
  const decAt = raAt + 3 * count
  const gAt = decAt + 3 * count
  const cAt = gAt + count
  if (bytes.length < cAt + count) throw new Error('Gaia tile is truncated')
  const t = getTables()
  const dir = new Float32Array(count * 3)
  const gq = bytes.slice(gAt, gAt + count)
  const cq = bytes.slice(cAt, cAt + count)
  const mag = new Float32Array(count)
  const rgb = new Uint8Array(count * 3)
  const u24 = (o: number) => bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16)
  for (let i = 0; i < count; i++) {
    const ra = (u24(raAt + i * 3) / 2 ** 24) * 2 * Math.PI
    const dec = (u24(decAt + i * 3) / (2 ** 24 - 1)) * Math.PI - Math.PI / 2
    const c = Math.cos(dec)
    dir[i * 3] = c * Math.cos(ra)
    dir[i * 3 + 1] = c * Math.sin(ra)
    dir[i * 3 + 2] = Math.sin(dec)
    const cb = cq[i]
    mag[i] = gq[i] / G_SCALE + G_OFFSET - t.gMinusV[cb]
    rgb[i * 3] = t.rgb[cb * 3]
    rgb[i * 3 + 1] = t.rgb[cb * 3 + 1]
    rgb[i * 3 + 2] = t.rgb[cb * 3 + 2]
  }
  return { ipix, count, dir, gq, cq, mag, rgb }
}

/** Gaia G of a quantised value. */
export const gOf = (q: number) => q / G_SCALE + G_OFFSET

/** How many of a decoded tile's stars (a prefix: they are brightest first) are brighter than G = `g`. */
export function prefixCount(gq: Uint8Array, count: number, g: number): number {
  const q = (g - G_OFFSET) * G_SCALE // stars with value < q
  let lo = 0
  let hi = count
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (gq[mid] < q) lo = mid + 1
    else hi = mid
  }
  return lo
}

// ---- details ----

export interface GaiaDetail {
  /** Gaia DR3 source ID as a decimal string (it needs 64 bits). */
  sourceId: string
  /** Parallax, mas, or null. */
  plxMas: number | null
  /** Its standard error, mas, or null (the file stores 255 for none or 1.27 and over). */
  eplxMas: number | null
  noColour: boolean
}

export interface GaiaDetails {
  count: number
  at(i: number): GaiaDetail
}

/** Read a "GAID" details file (already gunzipped): source IDs, parallaxes, errors, flags. */
export function readGaiaDetails(buffer: ArrayBuffer): GaiaDetails {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])
  if (magic !== 'GAID' || view.getUint16(4, true) !== 1) throw new Error('not a version 1 Gaia details file')
  const count = view.getUint32(8, true)
  const idAt = 32
  const plxAt = idAt + 8 * count
  const eAt = plxAt + 2 * count
  const fAt = eAt + count
  if (bytes.length < fAt + count) throw new Error('Gaia details file is truncated')
  return {
    count,
    at(i: number): GaiaDetail {
      if (i < 0 || i >= count) throw new RangeError(`no star ${i} in a tile of ${count}`)
      const id = view.getBigUint64(idAt + 8 * i, true).toString()
      const p = view.getInt16(plxAt + 2 * i, true)
      const e = bytes[eAt + i]
      return {
        sourceId: id,
        plxMas: p === -32768 ? null : p / 40,
        eplxMas: e === 255 ? null : e / 200,
        noColour: (bytes[fAt + i] & 1) !== 0,
      }
    },
  }
}

/** Gunzip a response body when the server sent the stored gzip bytes without Content-Encoding. */
export async function maybeGunzip(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const b = new Uint8Array(buffer)
  if (b.length < 2 || b[0] !== 0x1f || b[1] !== 0x8b) return buffer
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).arrayBuffer()
}
