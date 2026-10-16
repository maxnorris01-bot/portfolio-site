// Streaming the Gaia tiles: which tiles a view needs, in what order to fetch
// them, how many to keep, and the star budget that keeps a view drawable.
// Pure and generic over what a loaded tile is (the renderer keeps decoded
// buffers; the tests keep numbers), so it is tested without a network.
//
// What the data allows (and doesn't): tiles are stored gzipped, as columns,
// so a tile can't be fetched as a prefix of its stars, either by byte range
// (a range of a gzip stream is not a prefix of the columns) or by the
// manifest (it has counts and sizes, no offsets). What the manifest does give
// is the brightest star of every tile (gMin) and counts per magnitude, so a
// view that only shows bright stars fetches no tile that has none that
// bright, and the budget below is enforced on what is drawn.

import { angleBetween, type TileGeometry } from './healpix.ts'
import { countBelow, tileHasStarsAbove, type Manifest, type TileEntry } from './gaiatiles.ts'
import type { Vec3 } from './pov.ts'

const DEG = Math.PI / 180

/** What the camera sees: where it points (J2000), how far it sees, and the faintest star shown. */
export interface StreamView {
  centre: Vec3
  /** Angular radius of the view, degrees (the half-diagonal of the frustum). */
  radiusDeg: number
  /** The faintest V magnitude drawn (the limiting magnitude rule). */
  limitMag: number
}

/** The angular radius that holds a view of this vertical field of view and aspect (width / height). */
export function viewRadiusDeg(fovDeg: number, aspect: number): number {
  const v = Math.tan((fovDeg * DEG) / 2)
  const h = v * Math.max(0.1, aspect)
  return Math.min(180, Math.atan(Math.hypot(v, h)) / DEG)
}

/**
 * The faintest magnitude at which the tiles in view hold no more than
 * `budget` stars: `limit` itself when that fits, else lowered (down to
 * `minLimit`) until it does.
 */
export function limitForBudget(
  entries: readonly TileEntry[],
  bins: readonly number[],
  limit: number,
  budget: number,
  minLimit = 5,
): number {
  const total = (l: number) => entries.reduce((n, t) => n + countBelow(t, bins, l), 0)
  if (total(limit) <= budget) return limit
  let lo = minLimit
  let hi = limit
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (total(mid) <= budget) lo = mid
    else hi = mid
  }
  return lo
}

export interface StreamerOptions<T> {
  manifest: Manifest
  geometry: readonly TileGeometry[]
  /** Fetch and decode one tile. It should reject with an AbortError when `signal` aborts. */
  load: (entry: TileEntry, signal: AbortSignal) => Promise<T>
  starsOf: (tile: T) => number
  /** Most stars drawn in one view (the budget). */
  budgetStars: number
  /** Most decoded stars kept in the cache. */
  cacheStars: number
  /** Most tile requests in flight. */
  concurrency: number
  /** Extra degrees around the view that are fetched after what's in it (default a fifth of the view radius plus two). */
  marginDeg?: (radiusDeg: number) => number
  /** How long a failed tile is left alone, ms. */
  retryAfterMs?: number
  /** Consecutive failures with no success that mark the data unavailable. */
  giveUpAfter?: number
  now?: () => number
  onLoaded?: (ipix: number, tile: T) => void
  onEvicted?: (ipix: number) => void
  onUnavailable?: () => void
}

export interface StreamStats {
  requests: number
  aborted: number
  failed: number
  evicted: number
  loadedTiles: number
  inFlight: number
  /** Decoded stars in the cache. */
  cachedStars: number
}

export class TileStreamer<T> {
  readonly loaded = new Map<number, T>()
  /** Tiles in view, nearest the centre first, after the budget. */
  inView: number[] = []
  /** The limiting magnitude after the budget (equal to the view's unless the budget bound). */
  effectiveLimit = 99
  /** The remote data could not be loaded at all. */
  unavailable = false
  readonly stats: StreamStats = { requests: 0, aborted: 0, failed: 0, evicted: 0, loadedTiles: 0, inFlight: 0, cachedStars: 0 }

  private readonly o: StreamerOptions<T>
  private readonly lastWanted = new Map<number, number>()
  private readonly inflight = new Map<number, AbortController>()
  private readonly failedAt = new Map<number, number>()
  private wantedOrder: number[] = []
  private tick = 0
  private consecutiveFailures = 0
  private everLoaded = false
  private disposed = false

  constructor(options: StreamerOptions<T>) {
    this.o = options
  }

  private now() {
    return this.o.now ? this.o.now() : Date.now()
  }

  /** Re-plan for a view: abort tiles that left it, fetch the ones it needs (nearest first), evict over budget. */
  update(view: StreamView): void {
    if (this.disposed || this.unavailable) return
    const { manifest, geometry } = this.o
    const margin = (this.o.marginDeg ?? ((r: number) => r * 0.2 + 2))(view.radiusDeg)
    const near = (ipix: number) => {
      const g = geometry[ipix]
      return { ipix, dist: angleBetween(view.centre, g.centre), reach: g.radiusDeg }
    }
    // Tiles whose area reaches the view, and have stars bright enough to matter.
    const candidates: { ipix: number; dist: number; reach: number }[] = []
    for (const ipix of manifest.tiles.keys()) {
      const n = near(ipix)
      if (n.dist - n.reach <= view.radiusDeg + 2 * margin) candidates.push(n)
    }
    // The budget counts the tiles in view only.
    const inViewEntries = candidates.filter((c) => c.dist - c.reach <= view.radiusDeg).map((c) => manifest.tiles.get(c.ipix)!)
    this.effectiveLimit = limitForBudget(inViewEntries, manifest.magBins, view.limitMag, this.o.budgetStars)
    const limit = this.effectiveLimit
    const has = (ipix: number) => tileHasStarsAbove(manifest.tiles.get(ipix)!, limit)
    candidates.sort((a, b) => a.dist - b.dist)
    this.inView = candidates.filter((c) => c.dist - c.reach <= view.radiusDeg && has(c.ipix)).map((c) => c.ipix)
    // Wanted: in view first, then the margin ring.
    const wanted = candidates.filter((c) => c.dist - c.reach <= view.radiusDeg + margin && has(c.ipix))
    this.wantedOrder = wanted.map((c) => c.ipix)
    const keep = new Set(candidates.filter((c) => c.dist - c.reach <= view.radiusDeg + 2 * margin && has(c.ipix)).map((c) => c.ipix))
    this.tick++
    for (const ipix of this.wantedOrder) if (this.loaded.has(ipix)) this.lastWanted.set(ipix, this.tick)
    // Tiles that have left the view (with some hysteresis) stop downloading.
    for (const [ipix, ctl] of this.inflight) {
      if (!keep.has(ipix)) {
        this.inflight.delete(ipix)
        this.stats.aborted++
        ctl.abort()
      }
    }
    this.stats.inFlight = this.inflight.size
    this.evict(new Set(this.wantedOrder))
    this.pump()
  }

  // Start fetches for the nearest wanted tiles while there's room.
  private pump() {
    if (this.disposed || this.unavailable) return
    const t = this.now()
    for (const ipix of this.wantedOrder) {
      if (this.inflight.size >= this.o.concurrency) break
      if (this.loaded.has(ipix) || this.inflight.has(ipix)) continue
      const failed = this.failedAt.get(ipix)
      if (failed !== undefined && t - failed < (this.o.retryAfterMs ?? 15000)) continue
      this.start(ipix)
    }
    this.stats.inFlight = this.inflight.size
  }

  private start(ipix: number) {
    const entry = this.o.manifest.tiles.get(ipix)!
    const ctl = new AbortController()
    this.inflight.set(ipix, ctl)
    this.stats.requests++
    this.o
      .load(entry, ctl.signal)
      .then((tile) => {
        if (this.disposed || this.inflight.get(ipix) !== ctl) return // cancelled meanwhile
        this.inflight.delete(ipix)
        this.consecutiveFailures = 0
        this.everLoaded = true
        this.loaded.set(ipix, tile)
        this.lastWanted.set(ipix, this.tick)
        this.stats.loadedTiles++
        this.stats.cachedStars += this.o.starsOf(tile)
        this.o.onLoaded?.(ipix, tile)
        this.evict(new Set(this.wantedOrder))
        this.pump()
      })
      .catch((err: unknown) => {
        if (this.disposed || this.inflight.get(ipix) !== ctl) return
        this.inflight.delete(ipix)
        if ((err as { name?: string })?.name === 'AbortError') return
        this.stats.failed++
        this.failedAt.set(ipix, this.now())
        this.consecutiveFailures++
        if (!this.everLoaded && this.consecutiveFailures >= (this.o.giveUpAfter ?? 6)) {
          this.unavailable = true
          for (const c of this.inflight.values()) c.abort()
          this.inflight.clear()
          this.o.onUnavailable?.()
        }
        this.stats.inFlight = this.inflight.size
        this.pump()
      })
  }

  // Drop the least recently wanted tiles that aren't wanted now until the cache fits.
  private evict(wanted: ReadonlySet<number>) {
    while (this.stats.cachedStars > this.o.cacheStars) {
      let victim = -1
      let oldest = Infinity
      for (const ipix of this.loaded.keys()) {
        if (wanted.has(ipix)) continue
        const w = this.lastWanted.get(ipix) ?? 0
        if (w < oldest) {
          oldest = w
          victim = ipix
        }
      }
      if (victim < 0) return
      const tile = this.loaded.get(victim)!
      this.loaded.delete(victim)
      this.lastWanted.delete(victim)
      this.stats.cachedStars -= this.o.starsOf(tile)
      this.stats.evicted++
      this.o.onEvicted?.(victim)
    }
  }

  dispose() {
    this.disposed = true
    for (const c of this.inflight.values()) c.abort()
    this.inflight.clear()
  }
}

/**
 * Keeps the frame rate up by scaling the star budget: a sustained slow
 * average frame (default over 28 ms, under about 36 fps) cuts the budget to
 * 65% (never under 10% of nominal); a long run of fast frames brings it back
 * 25% at a time. Frames over 250 ms (a hidden tab, a hitch) are ignored.
 */
export class FrameGuard {
  scale = 1
  private avg = 16
  private slowSince = -1
  private fastSince = -1

  private readonly slowMs: number
  private readonly fastMs: number
  private readonly slowHoldMs: number
  private readonly fastHoldMs: number

  constructor(slowMs = 28, fastMs = 18, slowHoldMs = 1500, fastHoldMs = 8000) {
    this.slowMs = slowMs
    this.fastMs = fastMs
    this.slowHoldMs = slowHoldMs
    this.fastHoldMs = fastHoldMs
  }

  /** Report a frame's duration (ms) at time `nowMs`; returns the budget scale (0.1..1). */
  observe(frameMs: number, nowMs: number): number {
    if (frameMs > 250 || frameMs <= 0) return this.scale
    this.avg += (frameMs - this.avg) * 0.1
    if (this.avg > this.slowMs) {
      this.fastSince = -1
      if (this.slowSince < 0) this.slowSince = nowMs
      if (nowMs - this.slowSince >= this.slowHoldMs) {
        this.scale = Math.max(0.1, this.scale * 0.65)
        this.slowSince = nowMs
      }
    } else if (this.avg < this.fastMs && this.scale < 1) {
      this.slowSince = -1
      if (this.fastSince < 0) this.fastSince = nowMs
      if (nowMs - this.fastSince >= this.fastHoldMs) {
        this.scale = Math.min(1, this.scale * 1.25)
        this.fastSince = nowMs
      }
    } else {
      this.slowSince = -1
      this.fastSince = -1
    }
    return this.scale
  }
}
