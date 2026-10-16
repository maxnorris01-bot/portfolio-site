import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { countBelow, readManifest, type TileEntry } from '../src/globe/gaiatiles.ts'
import { angleBetween, tileGeometry } from '../src/globe/healpix.ts'
import { FrameGuard, TileStreamer, limitForBudget, viewRadiusDeg, type StreamView } from '../src/globe/tilestream.ts'

const manifest = readManifest(JSON.parse(readFileSync(new URL('./fixtures/gaia-manifest-sample.json', import.meta.url), 'utf8')))
const geometry = tileGeometry(3)
const unit = (ra: number, dec: number): [number, number, number] => {
  const r = (ra * Math.PI) / 180
  const d = (dec * Math.PI) / 180
  return [Math.cos(d) * Math.cos(r), Math.cos(d) * Math.sin(r), Math.sin(d)]
}
const ORION: StreamView = { centre: unit(84, 0), radiusDeg: 9, limitMag: 13 }
const GC: StreamView = { centre: unit(266.4, -29), radiusDeg: 9, limitMag: 13 }

/** A streamer whose loads are held until the test resolves them. */
function harness(over: Partial<ConstructorParameters<typeof TileStreamer<number>>[0]> = {}) {
  const calls: { entry: TileEntry; signal: AbortSignal; resolve: (n: number) => void; reject: (e: unknown) => void }[] = []
  let clock = 0
  const events = { loaded: [] as number[], evicted: [] as number[], unavailable: 0 }
  const s = new TileStreamer<number>({
    manifest,
    geometry,
    load: (entry, signal) =>
      new Promise<number>((resolve, reject) => {
        calls.push({ entry, signal, resolve, reject })
        signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
      }),
    starsOf: (n) => n,
    budgetStars: 10_000_000,
    cacheStars: 10_000_000,
    concurrency: 4,
    now: () => clock,
    onLoaded: (i) => events.loaded.push(i),
    onEvicted: (i) => events.evicted.push(i),
    onUnavailable: () => events.unavailable++,
    ...over,
  })
  return { s, calls, events, advance: (ms: number) => (clock += ms) }
}
const settle = () => new Promise((r) => setTimeout(r, 0))

test('the tiles for a view are the ones whose area reaches it, nearest the centre first', () => {
  const { s } = harness()
  s.update(ORION)
  assert.ok(s.inView.length >= 1)
  const dist = (i: number) => angleBetween(ORION.centre, geometry[i].centre)
  for (const i of s.inView) assert.ok(dist(i) - geometry[i].radiusDeg <= ORION.radiusDeg, `tile ${i} is out of view`)
  for (let k = 1; k < s.inView.length; k++) assert.ok(dist(s.inView[k]) >= dist(s.inView[k - 1]), 'not nearest first')
  // Every tile of the sample whose centre is within the radius is among them.
  for (const i of manifest.tiles.keys()) if (dist(i) <= ORION.radiusDeg) assert.ok(s.inView.includes(i), `tile ${i} missing`)
  // The Galactic centre's tiles differ from Orion's.
  const other = harness()
  other.s.update(GC)
  assert.ok(other.s.inView.some((i) => !s.inView.includes(i)))
})

test('a view that shows only bright stars asks for no tile that has too few that bright to matter', () => {
  const { s, calls } = harness()
  s.update({ ...ORION, limitMag: 4 })
  assert.equal(s.inView.length, 0) // no tile has ten stars brighter than 4
  assert.equal(calls.length, 0)
  // The naked-eye limit (a field of 60 degrees): the stray bright Gaia star here and there is not worth a tile.
  const wide = harness()
  wide.s.update({ centre: ORION.centre, radiusDeg: 50, limitMag: 6.5 })
  assert.equal(wide.calls.length, 0)
  // Tiles qualify as the limit deepens, each with at least the minimum stars brighter than it.
  const mid = harness()
  mid.s.update({ ...ORION, limitMag: 9 })
  for (const i of mid.s.inView) assert.ok(countBelow(manifest.tiles.get(i)!, manifest.magBins, 9) >= 10, `tile ${i}`)
  const faint = harness()
  faint.s.update({ ...ORION, limitMag: 13 })
  assert.ok(faint.s.inView.length >= mid.s.inView.length && mid.s.inView.length > 0)
  // A lower threshold lets more tiles in.
  const keen = harness({ minTileStars: 1 })
  keen.s.update({ ...ORION, limitMag: 7 })
  assert.ok(keen.s.inView.length > 0)
})

test('requests are capped, and the nearest tile goes first', () => {
  const { s, calls } = harness({ concurrency: 3 })
  s.update({ ...ORION, radiusDeg: 25 })
  assert.equal(calls.length, 3)
  assert.equal(s.stats.inFlight, 3)
  const first = calls.map((c) => c.entry.ipix)
  assert.deepEqual(first, s.inView.slice(0, 3))
  // As one finishes the next nearest starts.
  calls[0].resolve(100)
  return settle().then(() => {
    assert.equal(calls.length, 4)
    assert.equal(calls[3].entry.ipix, s.inView[3])
    assert.equal(s.stats.inFlight, 3)
  })
})

test('a tile that leaves the view stops downloading; one that stays does not', async () => {
  const { s, calls } = harness({ concurrency: 4 })
  s.update(ORION)
  const started = calls.map((c) => c.entry.ipix)
  assert.ok(started.length >= 2)
  // A small move: still wanted, nothing cancelled.
  s.update({ ...ORION, centre: unit(85, 1) })
  assert.ok(calls.every((c) => !c.signal.aborted))
  // Look the other way: every request not near the new view is aborted.
  s.update({ centre: unit(264, -29), radiusDeg: 3, limitMag: 13 })
  await settle()
  const aborted = calls.filter((c) => c.signal.aborted)
  assert.ok(aborted.length >= 1)
  assert.equal(s.stats.aborted, aborted.length)
  // An aborted tile is not a failure and is not counted loaded.
  assert.equal(s.stats.failed, 0)
  aborted[0].resolve(5) // a late answer for a cancelled tile is ignored
  await settle()
  assert.ok(!s.loaded.has(aborted[0].entry.ipix))
})

test('the cache keeps within its star budget by dropping the least recently wanted tile, never one in view', async () => {
  const { s, calls, events } = harness({ cacheStars: 250, concurrency: 8 })
  s.update(ORION)
  const wantedNow = new Set(s.inView)
  // The first requests answer with 100 stars each.
  const answered = calls.map((c) => c.entry.ipix)
  for (const c of [...calls]) c.resolve(100)
  await settle()
  // Only tiles in the margin ring can be dropped; the ones in view stay while the cache is over budget.
  for (const i of wantedNow) if (answered.includes(i)) assert.ok(s.loaded.has(i), `view tile ${i} evicted`)
  // Move far away and load more: the old view's tiles go first.
  const old = [...s.loaded.keys()]
  s.update({ ...GC, radiusDeg: 3 })
  for (const c of calls.slice(-4)) c.resolve(100)
  await settle()
  assert.ok(s.stats.cachedStars <= 250 + 100 * 4, `cache ${s.stats.cachedStars}`)
  assert.ok(events.evicted.length >= 1)
  assert.ok(events.evicted.every((i) => old.includes(i) || s.loaded.has(i) === false))
  assert.equal(
    s.stats.cachedStars,
    [...s.loaded.values()].reduce((a, b) => a + b, 0),
    'the cache count matches what is held',
  )
})

test('the star budget lowers the limiting magnitude until the tiles in view fit', () => {
  const entries = [...manifest.tiles.values()].filter((t) => t.ipix >= 449 && t.ipix <= 452)
  const bins = manifest.magBins
  const all = entries.reduce((n, t) => n + t.count, 0)
  assert.equal(limitForBudget(entries, bins, 13, all + 1), 13) // fits: untouched
  const half = limitForBudget(entries, bins, 13, all / 4)
  assert.ok(half < 13 && half > 5, `limit ${half}`)
  const counted = entries.reduce((n, t) => n + (t.gMin < half ? 1 : 0), 0)
  assert.ok(counted >= 1)
  assert.ok(limitForBudget(entries, bins, 13, all / 10) <= half) // a tighter budget never raises it
  // With no budget at all the limit falls to just under the brightest star of any tile (and never under 5).
  const none = limitForBudget(entries, bins, 13, 0)
  assert.ok(none >= 5 && none <= Math.min(...entries.map((t) => t.gMin)) + 0.5, `limit ${none}`)
})

test('the budget acts in the streamer: a tight budget shrinks the limit and the tiles fetched', () => {
  const loose = harness()
  loose.s.update({ ...ORION, radiusDeg: 30 })
  const tight = harness({ budgetStars: 4000 })
  tight.s.update({ ...ORION, radiusDeg: 30 })
  assert.equal(loose.s.effectiveLimit, 13)
  assert.ok(tight.s.effectiveLimit < 13)
  assert.ok(tight.s.inView.length <= loose.s.inView.length)
})

test('when nothing can be loaded the data is marked unavailable, once, and the requests stop', async () => {
  const { s, calls, events } = harness({ giveUpAfter: 3, concurrency: 3 })
  s.update({ ...ORION, radiusDeg: 25 })
  for (const c of [...calls]) c.reject(new Error('network'))
  await settle()
  for (const c of calls.slice(3)) c.reject(new Error('network'))
  await settle()
  assert.equal(s.unavailable, true)
  assert.equal(events.unavailable, 1)
  const n = calls.length
  s.update({ ...ORION, radiusDeg: 25 })
  s.update({ ...GC, radiusDeg: 25 })
  assert.equal(calls.length, n)
})

test('a failed tile is left alone for a while, then tried again; a success first keeps the data available', async () => {
  const { s, calls, advance } = harness({ retryAfterMs: 1000, concurrency: 1, giveUpAfter: 2 })
  const view = { ...ORION, radiusDeg: 4 }
  s.update(view)
  const first = calls[0].entry.ipix
  calls[0].resolve(10) // one tile loads: the data work
  await settle()
  const failed = calls[1].entry.ipix
  calls[1].reject(new Error('503'))
  await settle()
  // Answer everything else that's wanted, so only the failed tile remains.
  for (let k = 2; k < calls.length; k++) {
    calls[k].resolve(10)
    await settle()
  }
  const n = calls.length
  s.update(view)
  assert.ok(!calls.slice(n).some((c) => c.entry.ipix === failed), 'retried at once')
  advance(1500)
  s.update(view)
  await settle()
  assert.ok(calls.slice(n).some((c) => c.entry.ipix === failed), 'never retried')
  assert.equal(s.unavailable, false)
  assert.ok(s.loaded.has(first))
})

test('the view radius of a field of view and aspect', () => {
  assert.ok(Math.abs(viewRadiusDeg(60, 16 / 9) - 49.6) < 0.3)
  assert.ok(viewRadiusDeg(10, 1) > 5 && viewRadiusDeg(10, 1) < 7.2)
  assert.ok(viewRadiusDeg(0.01, 2) < 0.02)
  assert.ok(viewRadiusDeg(170, 3) <= 180)
})

test('the frame guard cuts the budget after a sustained slow stretch and restores it after a long fast one', () => {
  const g = new FrameGuard()
  let t = 0
  for (let i = 0; i < 40; i++) g.observe(16, (t += 16)) // 60 fps: no change
  assert.equal(g.scale, 1)
  for (let i = 0; i < 60; i++) g.observe(45, (t += 45)) // 22 fps for 2.7 s
  assert.ok(g.scale < 1, `scale ${g.scale}`)
  const cut = g.scale
  for (let i = 0; i < 200; i++) g.observe(45, (t += 45))
  assert.ok(g.scale < cut, 'keeps cutting while slow')
  assert.ok(g.scale >= 0.1)
  // A hitch (a hidden tab) is not a slow frame.
  const before = g.scale
  g.observe(4000, (t += 4000))
  assert.equal(g.scale, before)
  for (let i = 0; i < 700; i++) g.observe(14, (t += 14)) // ~10 s of fast frames
  assert.ok(g.scale > before, `restored to ${g.scale}`)
  for (let i = 0; i < 9000; i++) g.observe(14, (t += 14)) // two minutes of them
  assert.equal(g.scale, 1)
})
