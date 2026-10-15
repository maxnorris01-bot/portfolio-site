// Builds the constellation data files in public/data/stars/:
//
//   constellations.json        the 88 figures (stick figures as Hipparcos
//                              numbers), names, area, brightest star
//   constellation-bounds.json  the IAU boundaries as polylines on the sky
//
// Usage (the figures file is d3-celestial's data/constellations.lines.json,
// BSD-3-Clause, commit 7e720a3 of github.com/ofrohn/d3-celestial):
//
//   curl -O https://raw.githubusercontent.com/ofrohn/d3-celestial/7e720a3de062059d4c5400a379146a601d9010e0/data/constellations.lines.json
//   node scripts/build-constellations.mjs constellations.lines.json
//
// Figures. d3-celestial stores each line vertex as a J2000 position, not a
// Hipparcos number, so each vertex is matched to the nearest star of the
// star file (within 0.25 degrees; the figures' stars are all brighter than
// about magnitude 6.7). The match is reported, and tests check that every
// number exists in the star file.
//
// Boundaries. The IAU boundaries are not read from a third-party file: they
// are rebuilt from the same Delporte table that astronomy-engine's
// Constellation() searches (MIT licensed, node_modules/astronomy-engine),
// so the drawn boundary and the star card's constellation always agree. The
// table is a set of rectangles in B1875 right ascension and declination
// (units of 1/24 degree, a constellation being the first rectangle in the
// table, by declination, to hold a point), so the edges between
// constellations lie along B1875 meridians and parallels. They are traced on
// that grid, densified along the parallels (which curve in J2000), and
// rotated to J2000 with astronomy-engine's own B1875 rotation.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import * as Astronomy from 'astronomy-engine'
import { readStarCatalog } from '../src/globe/stars.ts'
import { readStarDetails } from '../src/globe/stardetails.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = join(root, 'public/data/stars')
const input = process.argv[2]
if (!input) {
  console.error('usage: node scripts/build-constellations.mjs constellations.lines.json')
  process.exit(1)
}

const toArrayBuffer = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
const catalog = readStarCatalog(toArrayBuffer(readFileSync(join(dataDir, 'hipparcos.bin'))))
const details = readStarDetails(toArrayBuffer(readFileSync(join(dataDir, 'hipparcos-details.bin'))))
if (details.count !== catalog.count) throw new Error('star file and details file differ in length')

// ---- the astronomy-engine table (names and rectangles) ----
const engineSource = readFileSync(join(root, 'node_modules/astronomy-engine/astronomy.js'), 'utf8')
const namesBlock = engineSource.match(/const ConstelNames = \[([\s\S]*?)\n\];/)[1]
const NAMES = [...namesBlock.matchAll(/\['(\w{3})', '([^']+)'\]/g)].map((m) => ({ abbr: m[1], name: m[2] }))
const boundsBlock = engineSource.match(/const ConstelBounds = \[([\s\S]*?)\n\];/)[1]
const RECTS = [...boundsBlock.matchAll(/\[(\d+), ([\d.]+), ([\d.]+), (-?[\d.]+)\]/g)].map((m) => ({
  con: +m[1],
  lo: +m[2],
  hi: +m[3],
  dec: +m[4],
}))
if (NAMES.length !== 88) throw new Error(`expected 88 constellations, got ${NAMES.length}`)
const abbrIndex = new Map(NAMES.map((n, i) => [n.abbr, i]))

// ---- figures ----
// Stars up to this index of the (brightness sorted) star file are candidates.
const CANDIDATES = catalog.dirJ2000.length / 3
const MATCH_DEG = 0.25
const deg = Math.PI / 180

function nearestStar(raDeg, decDeg) {
  const x = Math.cos(decDeg * deg) * Math.cos(raDeg * deg)
  const y = Math.cos(decDeg * deg) * Math.sin(raDeg * deg)
  const z = Math.sin(decDeg * deg)
  let best = -1
  let bestD = Infinity
  for (let i = 0; i < CANDIDATES; i++) {
    if (catalog.mag[i] > 7.2) break // sorted brightest first
    const dx = catalog.dirJ2000[i * 3] - x
    const dy = catalog.dirJ2000[i * 3 + 1] - y
    const dz = catalog.dirJ2000[i * 3 + 2] - z
    const d = dx * dx + dy * dy + dz * dz
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return { index: best, deg: (2 * Math.asin(Math.sqrt(bestD) / 2)) / deg }
}

const lines = JSON.parse(readFileSync(input, 'utf8'))
const figures = new Array(88).fill(null)
const matchDist = []
let unmatched = 0
for (const f of lines.features) {
  const ci = abbrIndex.get(f.id)
  if (ci === undefined) throw new Error(`unknown constellation id ${f.id}`)
  const polylines = []
  for (const line of f.geometry.coordinates) {
    const hips = []
    for (const [lon, lat] of line) {
      const ra = lon < 0 ? lon + 360 : lon
      const m = nearestStar(ra, lat)
      if (m.index < 0 || m.deg > MATCH_DEG) {
        unmatched++
        console.warn(`no star within ${MATCH_DEG} deg of ${f.id} vertex (${ra}, ${lat}); nearest ${m.deg.toFixed(3)}`)
        continue
      }
      matchDist.push(m.deg)
      const hip = details.hip[m.index]
      if (hips[hips.length - 1] !== hip) hips.push(hip)
    }
    if (hips.length >= 2) polylines.push(hips)
  }
  figures[ci] = (figures[ci] ?? []).concat(polylines) // Serpens comes as two parts
}
const missing = NAMES.filter((_, i) => !figures[i]).map((n) => n.abbr)
if (missing.length) throw new Error(`no figure for: ${missing.join(' ')}`)

// ---- boundaries on the B1875 grid ----
const U = 1 / 24 // degrees per table unit
// Distinct breakpoints. RA units run 0..8640 (360 deg), dec units -2160..2160.
const raCuts = [...new Set(RECTS.flatMap((r) => [r.lo, r.hi]).concat([0, 8640]))].sort((a, b) => a - b)
const decCuts = [...new Set(RECTS.map((r) => r.dec).concat([-2160, 2160]))].sort((a, b) => a - b)
// Cell (i, j): RA raCuts[i]..raCuts[i+1], dec decCuts[j]..decCuts[j+1].
// Its constellation is the first rectangle (the table is sorted by
// declination, highest first) whose RA span holds it and whose lower
// declination is at or below the cell's.
const cellCon = (i, j) => {
  const ra = raCuts[i]
  const dec = decCuts[j]
  for (const r of RECTS) if (r.lo <= ra && ra < r.hi && r.dec <= dec) return r.con
  throw new Error(`no constellation for cell ${i},${j}`)
}
const nRa = raCuts.length - 1
const nDec = decCuts.length - 1
const grid = Array.from({ length: nRa }, (_, i) => Array.from({ length: nDec }, (_, j) => cellCon(i, j)))

// Area (square degrees) of each constellation, exact on the B1875 grid.
const area = new Array(88).fill(0)
for (let i = 0; i < nRa; i++) {
  const dRa = (raCuts[i + 1] - raCuts[i]) * U * deg
  for (let j = 0; j < nDec; j++) {
    const s = Math.sin(decCuts[j + 1] * U * deg) - Math.sin(decCuts[j] * U * deg)
    area[grid[i][j]] += dRa * s * (180 / Math.PI) ** 2
  }
}

// Boundary edges: a meridian edge between RA-neighbouring cells with
// different constellations, a parallel edge between dec-neighbours.
// Merge collinear runs, then chain them into polylines.
const rot = Astronomy.InverseRotation(Astronomy.Rotation_EQJ_EQD(new Astronomy.AstroTime(-45655.74141261017))) // B1875 equator to J2000
const toJ2000 = (raU, decU) => {
  const ra = raU * U * deg
  const dec = decU * U * deg
  const v = new Astronomy.Vector(Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec), new Astronomy.AstroTime(0))
  const w = Astronomy.RotateVector(rot, v)
  let lon = Math.atan2(w.y, w.x) / deg
  if (lon < 0) lon += 360
  return [lon, Math.asin(Math.max(-1, Math.min(1, w.z))) / deg]
}
const segs = [] // { a:[raU,decU], b:[raU,decU], c1, c2 }
// Meridian edges at RA cut i (between column i-1 and i, wrapping).
for (let i = 0; i < nRa; i++) {
  const left = (i + nRa - 1) % nRa
  let runStart = null
  let runPair = null
  for (let j = 0; j <= nDec; j++) {
    const a = j < nDec ? grid[left][j] : -1
    const b = j < nDec ? grid[i][j] : -1
    const differs = j < nDec && a !== b
    const pair = differs ? `${Math.min(a, b)},${Math.max(a, b)}` : null
    if (runPair !== null && pair !== runPair) {
      const [c1, c2] = runPair.split(',').map(Number)
      segs.push({ a: [raCuts[i], decCuts[runStart]], b: [raCuts[i], decCuts[j]], c1, c2 })
      runPair = null
    }
    if (pair !== null && runPair === null) {
      runPair = pair
      runStart = j
    }
  }
}
// Parallel edges at dec cut j (between row j-1 and j).
for (let j = 1; j < nDec; j++) {
  let runStart = null
  let runPair = null
  for (let i = 0; i <= nRa; i++) {
    const a = i < nRa ? grid[i][j - 1] : -1
    const b = i < nRa ? grid[i][j] : -1
    const differs = i < nRa && a !== b
    const pair = differs ? `${Math.min(a, b)},${Math.max(a, b)}` : null
    if (runPair !== null && pair !== runPair) {
      const [c1, c2] = runPair.split(',').map(Number)
      segs.push({ a: [raCuts[runStart], decCuts[j]], b: [raCuts[i], decCuts[j]], c1, c2 })
      runPair = null
    }
    if (pair !== null && runPair === null) {
      runPair = pair
      runStart = i
    }
  }
}

// Chain segments sharing an end and the same pair into polylines.
const key = (p) => `${p[0]},${p[1]}`
const byEnd = new Map()
segs.forEach((s, n) => {
  for (const p of [s.a, s.b]) {
    const k = `${key(p)}|${s.c1},${s.c2}`
    if (!byEnd.has(k)) byEnd.set(k, [])
    byEnd.get(k).push(n)
  }
})
const used = new Array(segs.length).fill(false)
const chains = []
for (let n = 0; n < segs.length; n++) {
  if (used[n]) continue
  used[n] = true
  const s = segs[n]
  const pts = [s.a, s.b]
  const grow = (atEnd) => {
    for (;;) {
      const tip = atEnd ? pts[pts.length - 1] : pts[0]
      const cand = (byEnd.get(`${key(tip)}|${s.c1},${s.c2}`) ?? []).filter((m) => !used[m])
      if (cand.length !== 1) return // a junction (or the end): stop; the rest start their own chains
      const m = cand[0]
      used[m] = true
      const t = segs[m]
      const next = key(t.a) === key(tip) ? t.b : t.a
      if (atEnd) pts.push(next)
      else pts.unshift(next)
    }
  }
  grow(true)
  grow(false)
  chains.push({ c1: s.c1, c2: s.c2, pts })
}

// Densify (parallels curve in J2000; keep every piece under MAX_STEP degrees),
// rotate to J2000 and quantise to 0.01 degrees.
const MAX_STEP = 1.5
const q = (v) => Math.round(v * 100)
const outChains = []
let vertices = 0
for (const c of chains) {
  const flat = []
  for (let k = 0; k < c.pts.length - 1; k++) {
    const [r0, d0] = c.pts[k]
    const [r1, d1] = c.pts[k + 1]
    const lenDeg = Math.hypot((r1 - r0) * Math.cos(((d0 + d1) / 2) * U * deg), d1 - d0) * U
    const steps = Math.max(1, Math.ceil(lenDeg / MAX_STEP))
    for (let s = k === 0 ? 0 : 1; s <= steps; s++) {
      const t = s / steps
      const [lon, lat] = toJ2000(r0 + (r1 - r0) * t, d0 + (d1 - d0) * t)
      flat.push(q(lon), q(lat))
    }
  }
  vertices += flat.length / 2
  outChains.push([c.c1, c.c2, flat])
}

// ---- brightest star of each figure ----
const hipToIndex = new Map()
for (let i = 0; i < details.count; i++) hipToIndex.set(details.hip[i], i)
let maxIndex = 0
const outFigures = NAMES.map((n, ci) => {
  const polylines = figures[ci]
  let bright = null
  for (const pl of polylines)
    for (const h of pl) {
      const i = hipToIndex.get(h)
      maxIndex = Math.max(maxIndex, i)
      if (bright === null || i < bright.i) bright = { i, hip: h } // sorted brightest first
    }
  return { a: n.abbr, n: n.name, b: bright.hip, s: Math.round(area[ci] * 10) / 10, l: polylines }
})

const figuresFile = {
  // The star file's index needed to resolve every number (it is sorted by
  // brightness): readers fetch only that many leading HIP entries.
  stars: maxIndex + 1,
  constellations: outFigures,
}
writeFileSync(join(dataDir, 'constellations.json'), JSON.stringify(figuresFile))
writeFileSync(
  join(dataDir, 'constellation-bounds.json'),
  JSON.stringify({ unit: 0.01, abbr: NAMES.map((n) => n.abbr), chains: outChains }),
)

matchDist.sort((a, b) => a - b)
const pct = (p) => matchDist[Math.min(matchDist.length - 1, Math.floor(p * matchDist.length))].toFixed(3)
console.log(`figures: ${lines.features.length} constellations, ${matchDist.length} vertices matched (${unmatched} unmatched)`)
console.log(`match distance deg: median ${pct(0.5)}, 95% ${pct(0.95)}, max ${matchDist[matchDist.length - 1].toFixed(3)}`)
console.log(`faintest figure star is catalogue index ${maxIndex} (V ${catalog.mag[maxIndex].toFixed(2)})`)
console.log(`boundaries: ${segs.length} edges -> ${chains.length} chains, ${vertices} vertices`)
console.log(`total area ${area.reduce((a, b) => a + b, 0).toFixed(1)} sq deg (whole sky 41252.96)`)
