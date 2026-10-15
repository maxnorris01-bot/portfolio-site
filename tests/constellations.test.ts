import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { Constellation } from 'astronomy-engine'
import { readStarCatalog } from '../src/globe/stars.ts'
import { hipIndex, readStarDetails } from '../src/globe/stardetails.ts'
import {
  CONSTELLATIONS_OFF,
  LABEL_YIELD_MAG,
  constellationCardRows,
  easeOpacity,
  figureCentre,
  fitFov,
  labelAllowedAtFov,
  labelPriority,
  layerTargets,
  pickLabel,
  placeLabels,
  readBoundsFile,
  readFigureFile,
  readHipPrefix,
  resolveFigures,
  resolveTap,
} from '../src/globe/constellations.ts'

const read = (path: string) => readFileSync(new URL(path, import.meta.url))
const buf = (path: string) => {
  const f = read(path)
  return f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength)
}
const details = readStarDetails(buf('../public/data/stars/hipparcos-details.bin'))
const catalog = readStarCatalog(buf('../public/data/stars/hipparcos.bin'))
const toIndex = hipIndex(details)
const figures = readFigureFile(JSON.parse(read('../public/data/stars/constellations.json').toString('utf8')))
const bounds = readBoundsFile(JSON.parse(read('../public/data/stars/constellation-bounds.json').toString('utf8')))
const PHONE_TIER = readStarCatalog(buf('../public/data/stars/hipparcos.bin'), 8).count

const raDec = (i: number) => {
  const x = catalog.dirJ2000[i * 3]
  const y = catalog.dirJ2000[i * 3 + 1]
  const z = catalog.dirJ2000[i * 3 + 2]
  let ra = (Math.atan2(y, x) * 180) / Math.PI
  if (ra < 0) ra += 360
  return { ra, dec: (Math.asin(z) * 180) / Math.PI }
}

// ---- the data files ----

test('there are 88 figures, each with lines', () => {
  assert.equal(figures.constellations.length, 88)
  assert.equal(new Set(figures.constellations.map((c) => c.a)).size, 88)
  for (const c of figures.constellations) assert.ok(c.l.length > 0 && c.l.every((l) => l.length >= 2), c.a)
})

test('every Hipparcos number a figure uses is in the star file, and in the phone tier', () => {
  const bad: string[] = []
  for (const c of figures.constellations) {
    for (const hip of c.l.flat().concat(c.b)) {
      const i = toIndex.get(hip)
      if (i === undefined) bad.push(`${c.a}: HIP ${hip} not in the star file`)
      else if (i >= PHONE_TIER) bad.push(`${c.a}: HIP ${hip} is beyond the phone tier (index ${i})`)
      else if (i >= figures.stars) bad.push(`${c.a}: HIP ${hip} is past the declared prefix (${figures.stars})`)
    }
  }
  assert.deepEqual(bad, [])
})

test('the prefix of HIP numbers read from the details file matches the full read', () => {
  const prefix = readHipPrefix(buf('../public/data/stars/hipparcos-details.bin'), figures.stars)
  assert.equal(prefix.length, figures.stars)
  for (let i = 0; i < prefix.length; i += 997) assert.equal(prefix[i], details.hip[i])
  assert.equal(prefix[prefix.length - 1], details.hip[figures.stars - 1])
})

test('most of a figure lies inside its own IAU boundary, per astronomy-engine', () => {
  const low: string[] = []
  for (const f of resolveFigures(figures, toIndex)) {
    let inside = 0
    for (const i of f.stars) {
      const { ra, dec } = raDec(i)
      if (Constellation(ra / 15, dec).symbol === f.abbr) inside++
    }
    if (inside / f.stars.length < 0.7) low.push(`${f.abbr} ${inside}/${f.stars.length}`)
  }
  assert.deepEqual(low, [])
})

test('areas match the IAU values and total the whole sky', () => {
  const known: Record<string, number> = { UMa: 1279.7, Ori: 594.1, Sco: 496.8, Cru: 68.4, Ser: 636.9, Hya: 1302.8 }
  for (const [abbr, area] of Object.entries(known)) {
    assert.equal(figures.constellations.find((c) => c.a === abbr)!.s, area, abbr)
  }
  const total = figures.constellations.reduce((n, c) => n + c.s, 0)
  assert.ok(Math.abs(total - 41252.96) < 1, `total ${total}`)
})

test('the brightest star named for a figure is its brightest star', () => {
  const orion = resolveFigures(figures, toIndex).find((f) => f.abbr === 'Ori')!
  assert.equal(orion.brightestHip, 24436) // Rigel
  const uma = resolveFigures(figures, toIndex).find((f) => f.abbr === 'UMa')!
  assert.equal(uma.brightestHip, 62956) // Alioth
  const sco = resolveFigures(figures, toIndex).find((f) => f.abbr === 'Sco')!
  assert.equal(sco.brightestHip, 80763) // Antares
})

// ---- boundary lookup ----

test('boundary polylines separate the two constellations they name', () => {
  assert.equal(bounds.abbr.length, 88)
  assert.ok(bounds.chains.length > 200)
  let checked = 0
  for (let n = 0; n < bounds.chains.length; n += 7) {
    const [a, b, flat] = bounds.chains[n]
    // The middle of a run (a corner would have both sides on one axis).
    const pts = flat.length / 2
    if (pts < 2) continue
    const k = Math.floor((pts - 1) / 2)
    const l0 = flat[k * 2]
    let l1 = flat[k * 2 + 2]
    if (Math.abs(l1 - l0) > 18000) l1 += l1 < l0 ? 36000 : -36000 // across RA 0
    const lon = ((((l0 + l1) / 2) * bounds.unit) % 360 + 360) % 360
    const lat = ((flat[k * 2 + 1] + flat[k * 2 + 3]) / 2) * bounds.unit
    const seen = new Set<string>()
    // Points a little off the line on all sides find both constellations.
    for (const [dx, dy] of [[0.1, 0], [-0.1, 0], [0, 0.1], [0, -0.1]]) {
      const dec = Math.max(-90, Math.min(90, lat + dy))
      const ra = (lon + dx / Math.max(0.2, Math.cos((lat * Math.PI) / 180)) + 360) % 360
      seen.add(Constellation(ra / 15, dec).symbol)
    }
    assert.ok(
      seen.has(bounds.abbr[a]) && seen.has(bounds.abbr[b]),
      `chain ${n} ${bounds.abbr[a]}/${bounds.abbr[b]} at (${lon.toFixed(2)}, ${lat.toFixed(2)}) found ${[...seen]}`,
    )
    checked++
  }
  assert.ok(checked > 20)
})

test('the card lookup (Constellation) names Betelgeuse in Orion and Polaris in Ursa Minor', () => {
  const o = resolveFigures(figures, toIndex).find((f) => f.abbr === 'Ori')!
  const bet = toIndex.get(27989)!
  assert.ok(o.stars.includes(bet))
  const { ra, dec } = raDec(bet)
  assert.equal(Constellation(ra / 15, dec).symbol, 'Ori')
  const pol = raDec(toIndex.get(11767)!)
  assert.equal(Constellation(pol.ra / 15, pol.dec).symbol, 'UMi')
})

// ---- resolving, centre, fit ----

test('resolveFigures drops repeated segments and reports numbers it cannot find', () => {
  const file = { stars: 3, constellations: [{ a: 'Tst', n: 'Test', b: 1, s: 1, l: [[1, 2, 3], [3, 2], [2, 9]] }] }
  const r = resolveFigures(file, new Map([[1, 0], [2, 1], [3, 2]]))[0]
  assert.deepEqual(r.segments, [0, 1, 1, 2]) // 3-2 repeats 2-3
  assert.deepEqual(r.missing, [9])
  assert.equal(r.brightestIndex, 0)
})

test('a figure centre is the middle of its stars and the extent reaches the farthest', () => {
  const unit = (raDeg: number, decDeg: number): [number, number, number] => {
    const r = (raDeg * Math.PI) / 180
    const d = (decDeg * Math.PI) / 180
    return [Math.cos(d) * Math.cos(r), Math.cos(d) * Math.sin(r), Math.sin(d)]
  }
  const { centre, extentDeg } = figureCentre([unit(10, 0), unit(20, 0)])
  assert.ok(Math.abs(centre[0] - unit(15, 0)[0]) < 1e-9)
  assert.ok(Math.abs(extentDeg - 5) < 1e-6)
})

test('fitFov holds the figure in the short side of the screen, and stays within the lens', () => {
  const land = fitFov(12, 16 / 9)
  const port = fitFov(12, 9 / 19.5)
  assert.ok(port > land * 1.5, `${port} vs ${land}`)
  assert.equal(fitFov(0.1, 1), 4)
  assert.equal(fitFov(90, 0.3), 120)
})

// ---- toggle ----

test('toggle: the figures, names and boundaries follow the switch; a selected star shows its own figure regardless', () => {
  assert.deepEqual(layerTargets(CONSTELLATIONS_OFF, false), { lines: 0, names: 0, boundaries: 0, highlight: 0 })
  assert.deepEqual(layerTargets(CONSTELLATIONS_OFF, true), { lines: 0, names: 0, boundaries: 0, highlight: 1 })
  assert.deepEqual(layerTargets({ on: true, names: false, boundaries: false }, false), {
    lines: 1,
    names: 0,
    boundaries: 0,
    highlight: 0,
  })
  // Sub-options mean nothing with the switch off.
  assert.deepEqual(layerTargets({ on: false, names: true, boundaries: true }, false), CONSTELLATIONS_OFF_TARGETS)
  assert.deepEqual(layerTargets({ on: true, names: true, boundaries: true }, false), {
    lines: 1,
    names: 1,
    boundaries: 1,
    highlight: 0,
  })
})
const CONSTELLATIONS_OFF_TARGETS = { lines: 0, names: 0, boundaries: 0, highlight: 0 }

test('fading eases toward the target, and jumps under reduced motion', () => {
  let v = 0
  const seq: number[] = []
  for (let i = 0; i < 40; i++) {
    v = easeOpacity(v, 1, 1 / 60, false)
    seq.push(v)
  }
  assert.ok(seq[0] > 0 && seq[0] < 0.3)
  assert.ok(seq.every((x, i) => i === 0 || x >= seq[i - 1]))
  assert.ok(seq[seq.length - 1] > 0.9)
  assert.equal(easeOpacity(0, 1, 1 / 60, true), 1)
  assert.equal(easeOpacity(1, 0, 1 / 60, true), 0)
})

// ---- labels ----

test('labels hide when the view is narrower than the figure can fill', () => {
  assert.equal(labelAllowedAtFov(12, 60), true)
  assert.equal(labelAllowedAtFov(12, 8), true)
  assert.equal(labelAllowedAtFov(12, 5), false)
  assert.equal(labelAllowedAtFov(12, 0.5), false)
})

test('label placement: larger first, none off the screen, none over a star or body label, none over each other', () => {
  const box = (key: string, x: number, y: number, priority: number) => ({ key, x, y, w: 80, h: 18, priority })
  const kept = placeLabels(
    [
      box('big', 100, 100, labelPriority(1000, false)),
      box('overlapsBig', 130, 105, labelPriority(300, false)),
      box('clear', 300, 300, labelPriority(100, false)),
      box('offEdge', 380, 300, labelPriority(900, false)), // 380 + 80 > 400 - 6
      box('overStar', 200, 200, labelPriority(800, false)),
    ],
    [{ x: 195, y: 195, w: 60, h: 16 }],
    400,
    600,
  )
  assert.deepEqual([...kept].sort(), ['big', 'clear'])
  // The selected figure wins an overlap whatever its size.
  const sel = placeLabels(
    [box('small', 100, 100, labelPriority(60, true)), box('large', 110, 100, labelPriority(1300, false))],
    [],
    400,
    600,
  )
  assert.deepEqual([...sel], ['small'])
})

// ---- taps ----

test('a tap picks a body, then a star, then a constellation label; lines are never targets', () => {
  assert.deepEqual(resolveTap('moon', 5, 3), { kind: 'body', key: 'moon' })
  assert.deepEqual(resolveTap(null, 5, -1), { kind: 'star', index: 5 })
  assert.deepEqual(resolveTap(null, -1, 3), { kind: 'constellation', index: 3 })
  assert.deepEqual(resolveTap(null, -1, -1), { kind: 'none' })
  // A star near a figure line is just a star: no line is ever a target.
  assert.deepEqual(resolveTap(null, 7, -1, 6.5), { kind: 'star', index: 7 })
})

test('a faint star under a name does not take the name\'s tap; a bright one does', () => {
  assert.deepEqual(resolveTap(null, 5, 3, 8.2), { kind: 'constellation', index: 3 })
  assert.deepEqual(resolveTap(null, 5, 3, LABEL_YIELD_MAG + 0.1), { kind: 'constellation', index: 3 })
  assert.deepEqual(resolveTap(null, 5, 3, 0.4), { kind: 'star', index: 5 })
  assert.deepEqual(resolveTap(null, 5, 3, LABEL_YIELD_MAG), { kind: 'star', index: 5 })
  // A body still beats a name.
  assert.deepEqual(resolveTap('venus', 5, 3, 9), { kind: 'body', key: 'venus' })
})

test('the label under a tap is the smallest box holding it', () => {
  const labels = [
    { index: 1, x: 100, y: 100, w: 200, h: 40 },
    { index: 2, x: 120, y: 105, w: 60, h: 16 },
  ]
  assert.equal(pickLabel(130, 112, labels), 2)
  assert.equal(pickLabel(250, 120, labels), 1)
  assert.equal(pickLabel(10, 10, labels), -1)
})

// ---- the card ----

test('the constellation card: abbreviation, brightest star, area', () => {
  const rows = constellationCardRows({ name: 'Orion', abbr: 'Ori', areaSqDeg: 594.1, brightestName: 'Rigel', stars: 26 })
  assert.deepEqual(rows, [
    { label: 'IAU abbreviation', value: 'Ori' },
    { label: 'Brightest star', value: 'Rigel' },
    { label: 'Area', value: '594 square degrees' },
    { label: 'Figure', value: '26 stars joined' },
  ])
})
