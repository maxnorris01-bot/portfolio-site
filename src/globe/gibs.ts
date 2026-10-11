// NASA GIBS tiled imagery for the satellite view: the tile grid, which tiles
// to draw, which date to ask for, the request URL, and a small LRU cache.
// Pure (no three.js), so it is cheap to test; the drawing lives in
// earthTiles.ts.
//
// The grid is GIBS's geographic (EPSG:4326) "250m" tile matrix set, as its
// GetCapabilities describes it: 512x512 px tiles, origin at (-180, 90),
// rows going south, columns going east, 2x1 tiles at level 0 and the tile
// span halving at each level, so a level-z tile spans 288 / 2^z degrees
// (level 8: 1.125 degrees, about 244 m per pixel). Edge tiles reach past
// 180 E or 90 S; GIBS fills that part, and it's simply not drawn.

export const GIBS_BASE = 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best'
/** VIIRS on NOAA-20, daily true colour: 3,000 km swaths, so no daily gaps between orbits. */
export const DAY_LAYER = 'VIIRS_NOAA20_CorrectedReflectance_TrueColor'
export const TILE_MATRIX_SET = '250m'
export const TILE_PX = 512
export const MAX_LEVEL = 8
/** Imagery resolution at the top level, km per pixel. */
export const LEVEL_KM: (z: number) => number = (z) => (tileSpanDeg(z) / TILE_PX) * 111.32

export const GIBS_ACKNOWLEDGMENT =
  "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse " +
  "Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS)."

export interface TileKey {
  z: number
  row: number
  col: number
}

/**
 * A geographic (EPSG:4326) quadtree tile grid: origin at (-180, 90), rows
 * going south, columns east, the tile span halving at each level. GIBS's
 * `250m` set is one (512 px tiles, 288 degrees at level 0); EOX's WGS84 set
 * (eox.ts) is another (256 px, 180 degrees). The functions below take a
 * grid and default to GIBS's.
 */
export interface TileGrid {
  /** Image size of one tile, px. */
  tilePx: number
  /** Finest level the source serves at its native resolution. */
  maxLevel: number
  /** Degrees spanned by one tile at level z. */
  spanDeg: (z: number) => number
}
export const GIBS_GRID: TileGrid = { tilePx: TILE_PX, maxLevel: MAX_LEVEL, spanDeg: (z) => 288 / 2 ** z }

export const tileSpanDeg = (z: number, g: TileGrid = GIBS_GRID) => g.spanDeg(z)
export const matrixWidth = (z: number, g: TileGrid = GIBS_GRID) => Math.ceil(360 / tileSpanDeg(z, g) - 1e-9)
export const matrixHeight = (z: number, g: TileGrid = GIBS_GRID) => Math.ceil(180 / tileSpanDeg(z, g) - 1e-9)
export const tileId = (t: TileKey) => `${t.z}/${t.row}/${t.col}`

/**
 * A tile's extent in degrees: `full` is the whole 512 px image, `drawn` the
 * part inside the globe (clipped at 180 E and 90 S).
 */
export function tileBounds(t: TileKey, g: TileGrid = GIBS_GRID) {
  const span = tileSpanDeg(t.z, g)
  const west = -180 + t.col * span
  const north = 90 - t.row * span
  const full = { west, east: west + span, north, south: north - span }
  const drawn = { west, east: Math.min(180, full.east), north, south: Math.max(-90, full.south) }
  return { full, drawn }
}

/** The level-z tile containing (lat, lon); 180 E belongs to the last column, 90 S to the last row. */
export function tileAt(latDeg: number, lonDeg: number, z: number, g: TileGrid = GIBS_GRID): TileKey {
  const span = tileSpanDeg(z, g)
  const lon = ((((lonDeg + 180) % 360) + 360) % 360) - 180
  const col = Math.min(matrixWidth(z, g) - 1, Math.floor((lonDeg === 180 ? 360 : lon + 180) / span))
  const row = Math.min(matrixHeight(z, g) - 1, Math.max(0, Math.floor((90 - latDeg) / span)))
  return { z, row, col }
}

/** The (up to four) children of a tile that lie at least partly on the globe. */
export function children(t: TileKey, g: TileGrid = GIBS_GRID): TileKey[] {
  const out: TileKey[] = []
  for (const dr of [0, 1]) {
    for (const dc of [0, 1]) {
      const c = { z: t.z + 1, row: t.row * 2 + dr, col: t.col * 2 + dc }
      if (c.col < matrixWidth(c.z, g) && c.row < matrixHeight(c.z, g)) out.push(c)
    }
  }
  return out
}

export const parent = (t: TileKey): TileKey | null =>
  t.z === 0 ? null : { z: t.z - 1, row: Math.floor(t.row / 2), col: Math.floor(t.col / 2) }

/** The root tiles (level 0): 2x1 in both GIBS's grid and EOX's. */
export const roots = (g: TileGrid = GIBS_GRID): TileKey[] => {
  const out: TileKey[] = []
  for (let row = 0; row < matrixHeight(0, g); row++) {
    for (let col = 0; col < matrixWidth(0, g); col++) out.push({ z: 0, row, col })
  }
  return out
}

// Earth-fixed unit vectors, in the globe mesh's own axes: longitude 0 on +x,
// 90 E on -z, north on +y (the same mapping as the 2K texture's sphere).
export type Vec3 = [number, number, number]
const DEG = Math.PI / 180
export function latLonToVec(latDeg: number, lonDeg: number): Vec3 {
  const la = latDeg * DEG
  const lo = lonDeg * DEG
  return [Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)]
}
export function vecToLatLon(v: Vec3): { latDeg: number; lonDeg: number } {
  const r = Math.hypot(...v)
  return { latDeg: Math.asin(v[1] / r) / DEG, lonDeg: Math.atan2(-v[2], v[0]) / DEG }
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const len = (a: Vec3) => Math.hypot(...a)

/** A tile's centre direction and angular radius (half its diagonal), for culling. */
export function tileCap(t: TileKey, g: TileGrid = GIBS_GRID): { center: Vec3; radiusDeg: number } {
  const { west, east, north, south } = tileBounds(t, g).drawn
  const latC = (north + south) / 2
  const cosMax = south <= 0 && north >= 0 ? 1 : Math.cos(Math.min(Math.abs(north), Math.abs(south)) * DEG)
  const radiusDeg = 0.5 * Math.hypot((east - west) * cosMax, north - south)
  return { center: latLonToVec(latC, (west + east) / 2), radiusDeg }
}

export interface View {
  /** Camera position in Earth radii, Earth-fixed axes. */
  cam: Vec3
  /** Unit view direction, Earth-fixed axes. */
  dir: Vec3
  /** Vertical field of view, degrees. */
  fovDeg: number
  /** Half of the diagonal field of view, degrees (covers the screen's corners). */
  halfDiagDeg: number
  /** Viewport height, CSS px. */
  screenPx: number
}

/** Whether any of a tile is on the camera's side of the horizon and inside its view cone. */
export function tileVisible(t: TileKey, v: View, g: TileGrid = GIBS_GRID): boolean {
  const { center, radiusDeg } = tileCap(t, g)
  if (radiusDeg >= 90) return true
  const r = len(v.cam)
  const horizonDeg = Math.acos(Math.min(1, 1 / r)) / DEG
  const camHat: Vec3 = [v.cam[0] / r, v.cam[1] / r, v.cam[2] / r]
  const fromCentreDeg = Math.acos(Math.max(-1, Math.min(1, dot(center, camHat)))) / DEG
  if (fromCentreDeg > horizonDeg + radiusDeg) return false
  const toTile = sub(center, v.cam)
  const d = len(toTile)
  const chord = 2 * Math.sin((radiusDeg * DEG) / 2)
  const offAxisDeg = Math.acos(Math.max(-1, Math.min(1, dot(toTile, v.dir) / d))) / DEG
  return offAxisDeg <= v.halfDiagDeg + Math.asin(Math.min(1, chord / d)) / DEG
}

/** How many screen pixels one of a tile's image pixels covers, at its nearest point. */
export function texelScreenPx(t: TileKey, v: View, g: TileGrid = GIBS_GRID): number {
  const { center, radiusDeg } = tileCap(t, g)
  const altitude = len(v.cam) - 1
  const chord = 2 * Math.sin((Math.min(radiusDeg, 90) * DEG) / 2)
  const d = Math.max(altitude * 0.9, len(sub(center, v.cam)) - chord)
  const texelRad = (tileSpanDeg(t.z, g) / g.tilePx) * DEG
  return (texelRad / d) * (v.screenPx / (2 * Math.tan((v.fovDeg * DEG) / 2)))
}

/**
 * The tiles to draw: visible tiles, refined while one image pixel would cover
 * more than `maxTexelPx` screen pixels, down to `maxLevel`, and at most
 * `maxTiles` of them (refining nearest-first; the rest stay coarser).
 */
export function selectTiles(
  v: View,
  {
    maxLevel,
    maxTexelPx = 1.25,
    maxTiles = 80,
    grid = GIBS_GRID,
  }: { maxLevel?: number; maxTexelPx?: number; maxTiles?: number; grid?: TileGrid } = {},
): TileKey[] {
  const g = grid
  const top = maxLevel ?? g.maxLevel
  const out: TileKey[] = []
  let open = roots(g).filter((t) => tileVisible(t, v, g))
  while (open.length) {
    const next: TileKey[] = []
    // Refine the tiles that need it most first, within the budget.
    const ranked = open
      .map((t) => ({ t, px: texelScreenPx(t, v, g) }))
      .sort((a, b) => b.px - a.px)
    for (const { t, px } of ranked) {
      if (t.z >= top || px <= maxTexelPx) {
        out.push(t)
        continue
      }
      // A big tile's cap is conservative: if none of its children is
      // visible, nothing of it is on screen.
      const kids = children(t, g).filter((c) => tileVisible(c, v, g))
      if (!kids.length) continue
      if (out.length + next.length + kids.length + (open.length - 1) <= maxTiles) next.push(...kids)
      else out.push(t)
    }
    open = next
  }
  return out
}

/**
 * The level whose pixels best match the screen straight down from `altKm`
 * with a vertical field of view of `fovDeg` over `screenPx` CSS pixels: the
 * coarsest level whose image pixel covers at most `maxTexelPx` screen pixels.
 */
export function levelFor(altKm: number, fovDeg: number, screenPx: number, maxTexelPx = 1.25): number {
  const groundKmPerPx = (2 * altKm * Math.tan((fovDeg * DEG) / 2)) / screenPx
  for (let z = 0; z <= MAX_LEVEL; z++) if (LEVEL_KM(z) / groundKmPerPx <= maxTexelPx) return z
  return MAX_LEVEL
}

/**
 * The finest level worth fetching while the view moves over the ground at
 * `groundKmPerSec` (orbital ground speed times playback speed): a tile must
 * stay on screen for at least `holdSec`, or it would be outdated before it
 * arrived. Paused or slow, the full `maxLevel`.
 */
export function maxLevelForMotion(
  groundKmPerSec: number,
  maxLevel = MAX_LEVEL,
  holdSec = 2,
  g: TileGrid = GIBS_GRID,
): number {
  const travelKm = groundKmPerSec * holdSec
  for (let z = maxLevel; z > 0; z--) if (tileSpanDeg(z, g) * 111.32 >= travelKm) return z
  return 0
}

/**
 * The narrowest field of view worth allowing: one image pixel straight below
 * may cover at most `overMag` screen pixels (modest over-magnification).
 * Never wider than 120 or narrower than `floorDeg`.
 */
export function minFovForImagery(altKm: number, kmPerPx: number, screenPx: number, overMag = 2, floorDeg = 1): number {
  const pixelDeg = (Math.atan(kmPerPx / altKm) * 180) / Math.PI
  return Math.min(120, Math.max(floorDeg, (pixelDeg * screenPx) / overMag))
}

// Dates. GIBS lists a layer's available days as ISO-8601 periods such as
// "2026-09-25/2026-10-09/P1D" (DescribeDomains); a date outside them returns
// 404. The imagery for a displayed moment is the newest available UTC date on
// or before it.

export type DateRange = { start: string; end: string }

/** Parses a DescribeDomains <Domain> value (comma-separated periods or single dates). */
export function parseDomain(text: string): DateRange[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => {
      const [start, end] = p.split('/')
      return { start: start.slice(0, 10), end: (end ?? start).slice(0, 10) }
    })
}

export const utcDate = (ms: number) => new Date(ms).toISOString().slice(0, 10)

const dayBefore = (d: string) => utcDate(Date.parse(`${d}T00:00:00Z`) - 86_400_000)

/**
 * The newest available date on or before `date` (YYYY-MM-DD), or null if
 * none. The layer's very newest date is skipped while an older one exists:
 * GIBS lists it as soon as the first orbits are in, so most of the globe is
 * still black (no data) on it.
 */
export function pickImageryDate(date: string, ranges: readonly DateRange[]): string | null {
  const newest = ranges.reduce<string | null>((m, r) => (m === null || r.end > m ? r.end : m), null)
  const pick = (d: string) => {
    let best: string | null = null
    for (const r of ranges) {
      if (r.start > d) continue
      const candidate = r.end < d ? r.end : d
      if (best === null || candidate > best) best = candidate
    }
    return best
  }
  const best = pick(date)
  if (best !== null && best === newest) return pick(dayBefore(best)) ?? best
  return best
}

export const tileUrl = (t: TileKey, date: string, layer = DAY_LAYER) =>
  `${GIBS_BASE}/${layer}/default/${date}/${TILE_MATRIX_SET}/${t.z}/${t.row}/${t.col}.jpeg`

/** DescribeDomains for `layer` between two dates (inclusive). */
export const domainsUrl = (from: string, to: string, layer = DAY_LAYER) =>
  `${GIBS_BASE}/1.0.0/${layer}/default/${TILE_MATRIX_SET}/all/${from}--${to}.xml`

/** A least-recently-used map with a size cap; evicted values go to `onEvict`. */
export class LruCache<V> {
  private readonly map = new Map<string, V>()
  private readonly cap: number
  private readonly onEvict?: (key: string, value: V) => void
  constructor(cap: number, onEvict?: (key: string, value: V) => void) {
    this.cap = cap
    this.onEvict = onEvict
  }
  get size() {
    return this.map.size
  }
  has(key: string) {
    return this.map.has(key)
  }
  /** Reads a value and marks it most recently used. */
  get(key: string): V | undefined {
    const v = this.map.get(key)
    if (v !== undefined) {
      this.map.delete(key)
      this.map.set(key, v)
    }
    return v
  }
  /** Peeks without changing recency. */
  peek(key: string): V | undefined {
    return this.map.get(key)
  }
  set(key: string, value: V, keep: ReadonlySet<string> = new Set()) {
    this.map.delete(key)
    this.map.set(key, value)
    // Evict the oldest entries that aren't being drawn right now.
    for (const [k, v] of this.map) {
      if (this.map.size <= this.cap) break
      if (keep.has(k) || k === key) continue
      this.map.delete(k)
      this.onEvict?.(k, v)
    }
  }
  clear() {
    for (const [k, v] of this.map) this.onEvict?.(k, v)
    this.map.clear()
  }
}

/**
 * What covers a spot on the globe this frame: the wanted tile itself at the
 * current date (`own`), a stand-in for it (an older date's copy or a coarser
 * ancestor) or nothing yet (the 2K texture shows).
 */
export type TileSource = 'own' | 'standin' | 'none'

/**
 * Which edges of a drawn tile should fade into what's beneath it, as
 * [west, east, north, south]: those whose neighbour is a stand-in or missing,
 * where imagery from another day or a blurrier level would otherwise meet it
 * in a hard line. Neighbours are probed just outside each edge (wrapping
 * across the antimeridian; nothing lies beyond the poles), and `sourceAt`
 * returns undefined for spots outside the view, which never feather.
 */
export function featherEdges(
  t: TileKey,
  sourceAt: (latDeg: number, lonDeg: number) => TileSource | undefined,
  g: TileGrid = GIBS_GRID,
): [boolean, boolean, boolean, boolean] {
  const b = tileBounds(t, g).drawn
  const eps = tileSpanDeg(t.z, g) * 0.01
  const wrap = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180
  const differs = (lat: number, lon: number) => {
    if (lat > 90 || lat < -90) return false
    const s = sourceAt(lat, wrap(lon))
    return s === 'standin' || s === 'none'
  }
  const along = [0.2, 0.5, 0.8]
  const lats = along.map((f) => b.north - (b.north - b.south) * f)
  const lons = along.map((f) => b.west + (b.east - b.west) * f)
  return [
    lats.some((lat) => differs(lat, b.west - eps)),
    lats.some((lat) => differs(lat, b.east + eps)),
    lons.some((lon) => differs(b.north + eps, lon)),
    lons.some((lon) => differs(b.south - eps, lon)),
  ]
}

/**
 * GIBS fills areas without data (polar night, a day still being acquired)
 * with exact black in its JPEGs, and compression rings a pixel or two of
 * near-black around them. This makes those pixels transparent in place
 * (RGBA, alpha 0 and colour 0, i.e. premultiplied) so the layer beneath
 * shows through: pure black (every channel <= `black`), plus dark pixels
 * (<= `ring`) within `radius` px of it. Genuinely dark ocean, which is never
 * pure black, stays opaque. Returns whether any pixel was masked.
 */
export function maskNoData(px: Uint8ClampedArray, w: number, h: number, { black = 3, ring = 24, radius = 2 } = {}): boolean {
  const n = w * h
  const isBlack = new Uint8Array(n)
  let any = false
  for (let i = 0; i < n; i++) {
    const o = i * 4
    if (px[o] <= black && px[o + 1] <= black && px[o + 2] <= black) {
      isBlack[i] = 1
      any = true
    }
  }
  if (!any) return false
  const clear = (i: number) => {
    const o = i * 4
    px[o] = px[o + 1] = px[o + 2] = px[o + 3] = 0
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (isBlack[i]) {
        clear(i)
        continue
      }
      const o = i * 4
      if (px[o] > ring || px[o + 1] > ring || px[o + 2] > ring) continue
      search: for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= h) continue
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx
          if (xx >= 0 && xx < w && isBlack[yy * w + xx]) {
            clear(i)
            break search
          }
        }
      }
    }
  }
  return true
}

/**
 * The best loaded stand-in for tile `t` while it isn't loaded (or failed):
 * the same tile from the previous date, else the nearest loaded ancestor
 * (this date, then the previous one), as a cache id `date|z/row/col`; null
 * when nothing covering it has loaded (the layer beneath shows).
 */
export function pickStandIn(
  t: TileKey,
  date: string | null,
  prevDate: string | null,
  loaded: (id: string) => boolean,
): string | null {
  if (prevDate && loaded(`${prevDate}|${tileId(t)}`)) return `${prevDate}|${tileId(t)}`
  for (let p = parent(t); p; p = parent(p)) {
    for (const d of [date, prevDate]) {
      if (d && loaded(`${d}|${tileId(p)}`)) return `${d}|${tileId(p)}`
    }
  }
  return null
}

/**
 * Tiles whose request failed (a 404, or the network): not asked for again
 * until `retryMs` has passed, so a missing tile costs one request a minute,
 * not one per frame, while its stand-in shows.
 */
export class FailedTiles {
  private readonly until = new Map<string, number>()
  private readonly retryMs: number
  constructor(retryMs: number) {
    this.retryMs = retryMs
  }
  mark(id: string, now: number) {
    this.until.set(id, now + this.retryMs)
  }
  /** Whether `id` is still waiting out its retry delay (and forgets it once it isn't). */
  blocked(id: string, now: number): boolean {
    const at = this.until.get(id)
    if (at === undefined) return false
    if (now < at) return true
    this.until.delete(id)
    return false
  }
  clear() {
    this.until.clear()
  }
}
