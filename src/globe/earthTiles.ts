// NASA GIBS imagery tiles on the satellite view's Earth. Loaded with a dynamic
// import the first time that view opens, and only ever asked for tiles while
// it's open. Tiles are meshes on the rotating Earth (so they share its GMST
// rotation), lit by the same day/night shader as the 2K texture, which stays
// underneath as the fallback wherever a tile is missing or still loading.

import * as THREE from 'three'
import { TILE_FRAGMENT_SHADER, TILE_VERTEX_SHADER } from './daynight'
import {
  LruCache,
  featherEdges,
  maxLevelForMotion,
  domainsUrl,
  latLonToVec,
  parent,
  parseDomain,
  pickImageryDate,
  selectTiles,
  tileAt,
  tileBounds,
  tileId,
  tileSpanDeg,
  tileUrl,
  utcDate,
  type DateRange,
  type TileKey,
  type TileSource,
  type View,
} from './gibs'

export interface TileCaps {
  /** Finest level to ask for. */
  maxLevel: number
  /** Tiles kept in memory (each about 1.4 MB on the GPU with mipmaps). */
  cacheTiles: number
  /** Requests in flight at once. */
  concurrent: number
  /** Most tiles drawn in one view. */
  maxTiles: number
  /** Sustained request rate (a token bucket with a small burst). */
  requestsPerSec: number
}

export const DESKTOP_CAPS: TileCaps = {
  maxLevel: 8,
  cacheTiles: 96,
  concurrent: 6,
  maxTiles: 80,
  requestsPerSec: 12,
}
export const PHONE_CAPS: TileCaps = {
  maxLevel: 7,
  cacheTiles: 32,
  concurrent: 4,
  maxTiles: 40,
  requestsPerSec: 6,
}

type Uniform<T> = { value: T }
export interface SharedUniforms {
  dayMap: Uniform<THREE.Texture | null>
  nightMap: Uniform<THREE.Texture>
  tint: Uniform<THREE.Color>
  sunDir: Uniform<THREE.Vector3>
  enabled: Uniform<number>
  hasLights: Uniform<number>
}

export type ImageryState = 'starting' | 'ok' | 'offline'

interface Entry {
  t: TileKey
  mesh: THREE.Mesh
  tex: THREE.Texture
  bytes: number
  /** When it last started fading in, and when it was last drawn on top. */
  shownAt: number
  lastDrawn: number
}

/** A fetched, decoded tile waiting for its turn to be uploaded to the GPU. */
interface Ready {
  id: string
  t: TileKey
  image: ImageBitmap
  bytes: number
}

// How a tile is drawn this frame. Underlays (stand-ins kept beneath a tile
// that is fading in or has feathered edges) go first, the tiles themselves
// next, and finer tiles fading out after a zoom-out on top.
const ROLE_ORDER = { under: 0, top: 1, leaving: 2 } as const
type Role = keyof typeof ROLE_ORDER
interface Draw {
  role: Role
  alpha: number
  feather: [boolean, boolean, boolean, boolean]
}
const NO_FEATHER: Draw['feather'] = [false, false, false, false]

const DAY_MS = 86_400_000
const OFFLINE_RETRY_MS = 60_000
/** A finer tile fades in over what was there before (and out again on a zoom-out). */
export const FADE_MS = 300
/** Tiles uploaded to the GPU per frame at most, so a burst of arrivals doesn't stall one frame. */
const UPLOADS_PER_FRAME = 2
/** A tile not drawn for this long fades in again when it comes back. */
const REAPPEAR_MS = 2000

// A tile's mesh: a lat/lon grid on the unit sphere (in the Earth mesh's own
// axes), about one vertex per degree so the curve follows the sphere, with the
// tile image on `uv` and the global equirectangular position on `uvGlobal`.
function tileGeometry(t: TileKey): THREE.BufferGeometry {
  const { full, drawn } = tileBounds(t)
  const span = tileSpanDeg(t.z)
  const nx = Math.max(4, Math.min(64, Math.ceil((drawn.east - drawn.west) / 1)))
  const ny = Math.max(4, Math.min(64, Math.ceil((drawn.north - drawn.south) / 1)))
  const pos: number[] = []
  const uv: number[] = []
  const uvg: number[] = []
  const edge: number[] = []
  for (let j = 0; j <= ny; j++) {
    const lat = drawn.north - ((drawn.north - drawn.south) * j) / ny
    for (let i = 0; i <= nx; i++) {
      const lon = drawn.west + ((drawn.east - drawn.west) * i) / nx
      pos.push(...latLonToVec(lat, lon))
      uv.push((lon - full.west) / span, 1 - (full.north - lat) / span)
      uvg.push((lon + 180) / 360, (lat + 90) / 180)
      edge.push(i / nx, j / ny)
    }
  }
  const index: number[] = []
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i
      const b = a + nx + 1
      index.push(a, b, a + 1, a + 1, b, b + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setAttribute('uvGlobal', new THREE.Float32BufferAttribute(uvg, 2))
  g.setAttribute('edge', new THREE.Float32BufferAttribute(edge, 2))
  g.setIndex(index)
  return g
}

export class EarthTiles {
  readonly group = new THREE.Group()
  private readonly uniforms: SharedUniforms
  private readonly anisotropy: number
  private caps: TileCaps
  private cache: LruCache<Entry>
  private readonly pending = new Map<string, AbortController>()
  private domain: { from: string; to: string; ranges: DateRange[] } | null = null
  private domainLoading = false
  private domainAt = 0
  private state: ImageryState = 'starting'
  private offlineSince = 0
  private failures = 0
  private successes = 0
  private tokens = 0
  private tokensAt = 0
  private date: string | null = null
  private prevDate: string | null = null
  /** Requests started and bytes received, for the report. */
  readonly stats = { requests: 0, bytes: 0, errors: 0, cancelled: 0, drawn: 0, wanted: 0 }
  private ready: Ready[] = []
  private keep: ReadonlySet<string> = new Set()
  private lastTop = new Set<string>()
  private readonly leaving = new Map<string, number>()
  private covered = false
  private readonly renderer: THREE.WebGLRenderer | undefined
  private readonly reducedMotion =
    typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : undefined

  constructor(
    earth: THREE.Object3D,
    uniforms: SharedUniforms,
    anisotropy: number,
    caps: TileCaps,
    renderer?: THREE.WebGLRenderer,
  ) {
    this.uniforms = uniforms
    this.renderer = renderer
    this.anisotropy = anisotropy
    this.caps = caps
    this.cache = this.makeCache(caps.cacheTiles)
    earth.add(this.group)
  }

  private makeCache(cap: number) {
    return new LruCache<Entry>(cap, (_k, e) => {
      this.group.remove(e.mesh)
      e.mesh.geometry.dispose()
      ;(e.mesh.material as THREE.Material).dispose()
      e.tex.dispose()
    })
  }

  setCaps(caps: TileCaps) {
    if (caps.cacheTiles !== this.caps.cacheTiles) {
      const old = this.cache
      this.cache = this.makeCache(caps.cacheTiles)
      old.clear()
    }
    this.caps = caps
  }

  /** The date being shown and whether the service answered, for the panel. */
  status(): { date: string | null; state: ImageryState } {
    return { date: this.state === 'offline' ? null : this.date, state: this.state }
  }

  /** Stop: cancel every request and hide the tiles (the satellite view closed). */
  pause() {
    for (const c of this.pending.values()) c.abort()
    this.pending.clear()
    for (const r of this.ready) r.image.close()
    this.ready = []
    this.lastTop.clear()
    this.leaving.clear()
    this.group.visible = false
  }

  dispose() {
    this.pause()
    this.cache.clear()
    this.group.removeFromParent()
  }

  // Which dates exist: DescribeDomains for the 30 days up to the displayed
  // date, fetched again only when the displayed date leaves that window.
  private ensureDomain(displayDate: string) {
    const d = this.domain
    if (this.domainLoading || (d && displayDate >= d.from && displayDate <= d.to)) return
    if (d && performance.now() - this.domainAt < 60_000) return
    // Up to today, so the layer's true newest (still filling) date is known.
    const today = utcDate(Date.now() + DAY_MS)
    const to = displayDate > today ? displayDate : today
    const from = utcDate(Date.parse(`${displayDate}T00:00:00Z`) - 30 * DAY_MS)
    this.domainLoading = true
    fetch(domainsUrl(from, to))
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((xml) => {
        const m = /<Domain>([^<]*)<\/Domain>/.exec(xml)
        this.domain = { from, to, ranges: m ? parseDomain(m[1]) : [] }
        if (this.state === 'offline') this.state = 'starting'
      })
      .catch(() => this.goOffline())
      .finally(() => {
        this.domainLoading = false
        this.domainAt = performance.now()
      })
  }

  private goOffline() {
    this.state = 'offline'
    this.offlineSince = performance.now()
    for (const c of this.pending.values()) c.abort()
    this.pending.clear()
  }

  /**
   * Called each satellite-view frame with the camera in Earth-fixed axes and
   * the displayed time: picks the tiles, draws what's loaded (falling back to
   * an older date's copy, then to a loaded ancestor, so there are no holes),
   * and requests what's missing.
   */
  update(view: View, simMs: number, groundKmPerSec = 0) {
    this.group.visible = true
    this.upload()
    if (this.state === 'offline') {
      if (performance.now() - this.offlineSince < OFFLINE_RETRY_MS) return this.draw(new Map())
      this.state = 'starting'
      this.domain = null
      this.failures = 0
    }
    const displayDate = utcDate(simMs)
    this.ensureDomain(displayDate)
    const picked = this.domain ? pickImageryDate(displayDate, this.domain.ranges) : null
    if (picked && picked !== this.date) {
      this.prevDate = this.date
      this.date = picked
    }
    if (!this.date) return this.draw(new Map())

    // Moving fast (playback at 10x/50x), finer tiles would be stale before
    // they arrived: cap the level to what stays on screen a couple of seconds.
    const maxLevel = Math.min(this.caps.maxLevel, maxLevelForMotion(groundKmPerSec, this.caps.maxLevel))
    const wanted = selectTiles(view, { maxLevel, maxTiles: this.caps.maxTiles })
    this.stats.wanted = wanted.length
    const now = performance.now()
    const fadeMs = this.reducedMotion?.matches ? 0 : FADE_MS
    const draws = new Map<string, Draw>()
    const missing: TileKey[] = []
    const source = new Map<string, TileSource>()
    const levels = new Set<number>()
    for (const t of wanted) {
      levels.add(t.z)
      if (this.cache.get(`${this.date}|${tileId(t)}`)) {
        source.set(tileId(t), 'own')
        continue
      }
      missing.push(t)
      const fallback = this.loadedFallback(t)
      source.set(tileId(t), fallback ? 'standin' : 'none')
      if (fallback) draws.set(fallback, { role: 'under', alpha: 1, feather: NO_FEATHER })
    }
    // Tiles that were drawn finer last frame: a tile replacing them (a
    // zoom-out) appears at once beneath them while they fade out on top.
    const coarserThanLast = new Set<string>()
    for (const id of this.lastTop) {
      const e = this.cache.peek(id)
      for (let p = e ? parent(e.t) : null; p; p = parent(p)) coarserThanLast.add(tileId(p))
    }
    const sourceAt = (lat: number, lon: number) => {
      for (const z of levels) {
        const s = source.get(tileId(tileAt(lat, lon, z)))
        if (s) return s
      }
      return undefined
    }
    let covered = true
    for (const t of wanted) {
      const s = source.get(tileId(t))
      if (s === 'none') covered = false
      if (s !== 'own') continue
      const id = `${this.date}|${tileId(t)}`
      const e = this.cache.peek(id)!
      if (now - e.lastDrawn > REAPPEAR_MS) e.shownAt = coarserThanLast.has(tileId(t)) ? -Infinity : now
      const alpha = fadeMs > 0 ? Math.min(1, (now - e.shownAt) / fadeMs) : 1
      const feather = featherEdges(t, sourceAt)
      if (alpha < 1 || feather.some(Boolean)) {
        const under = this.loadedFallback(t)
        if (under && !draws.has(under)) draws.set(under, { role: 'under', alpha: 1, feather: NO_FEATHER })
        // Fading in over nothing: the 2K Earth shows through, so it's needed.
        if (!under && alpha < 1) covered = false
        if (!under && feather.some(Boolean)) covered = false
      }
      draws.set(id, { role: 'top', alpha, feather })
    }
    // Finer tiles leaving after a zoom-out stay until the coarser tile that
    // replaces them has loaded, then fade out over it.
    const missingIds = new Set(missing.map(tileId))
    for (const id of this.lastTop) {
      if (draws.has(id)) continue
      const e = this.cache.peek(id)
      let replaced = false
      let awaited = false
      for (let p = e ? parent(e.t) : null; p && !replaced && !awaited; p = parent(p)) {
        replaced = [this.date, this.prevDate].some((d) => draws.get(`${d}|${tileId(p!)}`)?.role === 'top')
        awaited = missingIds.has(tileId(p))
      }
      if (e && awaited) {
        this.leaving.delete(id)
        draws.set(id, { role: 'leaving', alpha: 1, feather: NO_FEATHER })
        continue
      }
      if (!e || !replaced || fadeMs === 0) {
        this.leaving.delete(id)
        continue
      }
      const since = this.leaving.get(id) ?? now
      this.leaving.set(id, since)
      const alpha = 1 - (now - since) / fadeMs
      if (alpha > 0) draws.set(id, { role: 'leaving', alpha, feather: NO_FEATHER })
      else this.leaving.delete(id)
    }
    this.lastTop = new Set([...draws].filter(([, d]) => d.role !== 'under').map(([id]) => id))
    this.covered = covered && wanted.length > 0
    this.draw(draws)
    this.request(missing, view, new Set(draws.keys()))
  }

  /**
   * Whether the tiles cover everything of the Earth in view this frame, so
   * the 2K Earth beneath needn't be shaded (it still has to hide what's
   * behind the Earth, like the Sun).
   */
  coversView(): boolean {
    return this.group.visible && this.covered
  }

  // The best loaded stand-in for a tile not loaded yet: the same tile from the
  // previous date, else the nearest loaded ancestor (this date, then previous).
  private loadedFallback(t: TileKey): string | null {
    if (this.prevDate && this.cache.peek(`${this.prevDate}|${tileId(t)}`)) return `${this.prevDate}|${tileId(t)}`
    for (let p = parent(t); p; p = parent(p)) {
      for (const date of [this.date, this.prevDate]) {
        if (date && this.cache.peek(`${date}|${tileId(p)}`)) return `${date}|${tileId(p)}`
      }
    }
    return null
  }

  private draw(draws: ReadonlyMap<string, Draw>) {
    const now = performance.now()
    for (const mesh of this.group.children) mesh.visible = false
    let n = 0
    for (const [id, d] of draws) {
      const e = this.cache.peek(id)
      if (!e) continue
      n++
      e.mesh.visible = true
      // Coarse first; within a level, stand-ins beneath, then the tile, then leavers.
      e.mesh.renderOrder = 10 + e.t.z * 3 + ROLE_ORDER[d.role]
      const u = (e.mesh.material as THREE.ShaderMaterial).uniforms
      u.opacity.value = d.alpha
      ;(u.feather.value as THREE.Vector4).set(+d.feather[0], +d.feather[1], +d.feather[2], +d.feather[3])
      if (d.role === 'top') e.lastDrawn = now
    }
    if (!draws.size) this.covered = false
    this.stats.drawn = n
  }

  private request(missing: TileKey[], view: View, keep: ReadonlySet<string>) {
    const date = this.date!
    const wantedIds = new Set(missing.map((t) => `${date}|${tileId(t)}`))
    // Cancel what's no longer wanted (zoomed or turned away, or a new date).
    for (const [id, ctl] of this.pending) {
      if (!wantedIds.has(id)) {
        ctl.abort()
        this.pending.delete(id)
        this.stats.cancelled++
      }
    }
    // Coarse levels first, so every area gets something quickly; then nearest
    // the view's centre.
    const centreDist = (t: TileKey) => {
      const b = tileBounds(t).drawn
      const c = latLonToVec((b.north + b.south) / 2, (b.west + b.east) / 2)
      const to = [c[0] - view.cam[0], c[1] - view.cam[1], c[2] - view.cam[2]]
      return -(to[0] * view.dir[0] + to[1] * view.dir[1] + to[2] * view.dir[2]) / Math.hypot(...to)
    }
    const queued = new Set(this.ready.map((r) => r.id))
    const queue = missing
      .filter((t) => !this.pending.has(`${date}|${tileId(t)}`) && !queued.has(`${date}|${tileId(t)}`))
      .sort((a, b) => a.z - b.z || centreDist(a) - centreDist(b))
    // Token bucket: a sustained `requestsPerSec`, bursting to `concurrent`.
    const now = performance.now()
    this.tokens = Math.min(this.caps.concurrent, this.tokens + ((now - this.tokensAt) / 1000) * this.caps.requestsPerSec)
    this.tokensAt = now
    this.keep = keep
    for (const t of queue) {
      if (this.pending.size >= this.caps.concurrent || this.tokens < 1) break
      this.tokens -= 1
      this.load(t, date)
    }
  }

  private load(t: TileKey, date: string) {
    const id = `${date}|${tileId(t)}`
    const ctl = new AbortController()
    this.pending.set(id, ctl)
    this.stats.requests++
    let bytes = 0
    fetch(tileUrl(t, date), { signal: ctl.signal })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((blob) => {
        bytes = blob.size
        return createImageBitmap(blob, { imageOrientation: 'flipY' })
      })
      .then((bitmap) => {
        if (this.pending.get(id) !== ctl) return bitmap.close()
        this.pending.delete(id)
        this.stats.bytes += bytes
        this.successes++
        this.failures = 0
        this.state = 'ok'
        this.ready.push({ id, t, image: bitmap, bytes })
      })
      .catch((err: unknown) => {
        if ((err as { name?: string }).name === 'AbortError') return
        if (this.pending.get(id) === ctl) this.pending.delete(id)
        this.stats.errors++
        this.failures++
        // Repeated failures with nothing ever loaded: treat GIBS as unreachable.
        if (this.failures >= 6 && this.successes === 0) this.goOffline()
      })
  }

  // Turn up to a couple of fetched tiles a frame into textured meshes.
  private upload() {
    for (let k = 0; k < UPLOADS_PER_FRAME && this.ready.length; k++) this.addTile(this.ready.shift()!)
  }

  private addTile({ id, t, image, bytes }: Ready) {
    const tex = new THREE.Texture(image)
    tex.flipY = false
    tex.colorSpace = THREE.SRGBColorSpace
    // A little anisotropy keeps oblique views sharp; more costs fill rate.
    tex.anisotropy = Math.min(4, this.anisotropy)
    tex.needsUpdate = true
    const u = this.uniforms
    const mesh = new THREE.Mesh(
      tileGeometry(t),
      new THREE.ShaderMaterial({
        uniforms: {
          tileMap: { value: tex },
          opacity: { value: 1 },
          feather: { value: new THREE.Vector4() },
          dayMap: u.dayMap,
          nightMap: u.nightMap,
          tint: u.tint,
          sunDir: u.sunDir,
          enabled: u.enabled,
          hasLights: u.hasLights,
        },
        vertexShader: TILE_VERTEX_SHADER,
        fragmentShader: TILE_FRAGMENT_SHADER,
        // Drawn over the 2K Earth in level order (finer last), without
        // depth testing; back faces are culled, so the far side never shows.
        // All tiles are blended, so they sort together by renderOrder.
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    )
    mesh.visible = false
    mesh.frustumCulled = false
    this.group.add(mesh)
    this.renderer?.initTexture(tex)
    this.cache.set(id, { t, mesh, tex, bytes, shownAt: 0, lastDrawn: -Infinity }, this.keep)
  }

  /** For tests and the report: what's in memory. */
  debug() {
    return { cached: this.cache.size, pending: this.pending.size, date: this.date, prevDate: this.prevDate, state: this.state, ...this.stats }
  }
}

