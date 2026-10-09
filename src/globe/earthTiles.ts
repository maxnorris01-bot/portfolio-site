// NASA GIBS imagery tiles on the satellite view's Earth. Loaded with a dynamic
// import the first time that view opens, and only ever asked for tiles while
// it's open. Tiles are meshes on the rotating Earth (so they share its GMST
// rotation), lit by the same day/night shader as the 2K texture, which stays
// underneath as the fallback wherever a tile is missing or still loading.

import * as THREE from 'three'
import { TILE_FRAGMENT_SHADER, TILE_VERTEX_SHADER } from './daynight'
import {
  LruCache,
  maxLevelForMotion,
  domainsUrl,
  latLonToVec,
  parent,
  parseDomain,
  pickImageryDate,
  selectTiles,
  tileBounds,
  tileId,
  tileSpanDeg,
  tileUrl,
  utcDate,
  type DateRange,
  type TileKey,
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
  mesh: THREE.Mesh
  tex: THREE.Texture
  bytes: number
}

const DAY_MS = 86_400_000
const OFFLINE_RETRY_MS = 60_000

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
  for (let j = 0; j <= ny; j++) {
    const lat = drawn.north - ((drawn.north - drawn.south) * j) / ny
    for (let i = 0; i <= nx; i++) {
      const lon = drawn.west + ((drawn.east - drawn.west) * i) / nx
      pos.push(...latLonToVec(lat, lon))
      uv.push((lon - full.west) / span, 1 - (full.north - lat) / span)
      uvg.push((lon + 180) / 360, (lat + 90) / 180)
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

  constructor(earth: THREE.Object3D, uniforms: SharedUniforms, anisotropy: number, caps: TileCaps) {
    this.uniforms = uniforms
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
    if (this.state === 'offline') {
      if (performance.now() - this.offlineSince < OFFLINE_RETRY_MS) return this.draw(new Set())
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
    if (!this.date) return this.draw(new Set())

    // Moving fast (playback at 10x/50x), finer tiles would be stale before
    // they arrived: cap the level to what stays on screen a couple of seconds.
    const maxLevel = Math.min(this.caps.maxLevel, maxLevelForMotion(groundKmPerSec, this.caps.maxLevel))
    const wanted = selectTiles(view, { maxLevel, maxTiles: this.caps.maxTiles })
    this.stats.wanted = wanted.length
    const show = new Set<string>()
    const missing: TileKey[] = []
    for (const t of wanted) {
      const id = `${this.date}|${tileId(t)}`
      if (this.cache.get(id)) {
        show.add(id)
        continue
      }
      missing.push(t)
      const fallback = this.loadedFallback(t)
      if (fallback) show.add(fallback)
    }
    this.draw(show)
    this.request(missing, view, show)
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

  private draw(show: ReadonlySet<string>) {
    for (const mesh of this.group.children) mesh.visible = false
    for (const id of show) {
      const e = this.cache.peek(id)
      if (e) e.mesh.visible = true
    }
    this.stats.drawn = show.size
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
    const queue = missing
      .filter((t) => !this.pending.has(`${date}|${tileId(t)}`))
      .sort((a, b) => a.z - b.z || centreDist(a) - centreDist(b))
    // Token bucket: a sustained `requestsPerSec`, bursting to `concurrent`.
    const now = performance.now()
    this.tokens = Math.min(this.caps.concurrent, this.tokens + ((now - this.tokensAt) / 1000) * this.caps.requestsPerSec)
    this.tokensAt = now
    for (const t of queue) {
      if (this.pending.size >= this.caps.concurrent || this.tokens < 1) break
      this.tokens -= 1
      this.load(t, date, keep)
    }
  }

  private load(t: TileKey, date: string, keep: ReadonlySet<string>) {
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
        const tex = new THREE.Texture(bitmap)
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
            depthTest: false,
            depthWrite: false,
          }),
        )
        mesh.renderOrder = 10 + t.z
        mesh.visible = false
        mesh.frustumCulled = false
        this.group.add(mesh)
        this.cache.set(id, { mesh, tex, bytes }, keep)
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

  /** For tests and the report: what's in memory. */
  debug() {
    return { cached: this.cache.size, pending: this.pending.size, date: this.date, prevDate: this.prevDate, state: this.state, ...this.stats }
  }
}

