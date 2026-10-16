import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { test } from 'node:test'
import { gaiaCardRows, gaiaStarName, type GaiaCardInput } from '../src/globe/gaiacard.ts'
import { decodeTile, gOf, readGaiaDetails, type GaiaDetail } from '../src/globe/gaiatiles.ts'
import { parseSimbad, type SimbadState } from '../src/globe/simbad.ts'

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url))
const ab = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
const tile = decodeTile(ab(gunzipSync(fx('gaia-tile-0437.bin.gz'))))
const details = readGaiaDetails(ab(gunzipSync(fx('gaia-details-0437.bin.gz'))))
const found = parseSimbad(JSON.parse(fx('simbad-found.json').toString('utf8')))!

const detail = (o: Partial<GaiaDetail> = {}): GaiaDetail => ({ sourceId: '3010113299530081664', plxMas: 10, eplxMas: 0.5, noColour: false, ...o })
const input = (o: Partial<GaiaCardInput> = {}): GaiaCardInput => ({
  g: 9.43,
  bprp: 1.23,
  raDeg: 83.8,
  decDeg: -5.4,
  constellation: { name: 'Orion' },
  detail: detail(),
  detailLoading: false,
  detailFailed: false,
  simbad: { kind: 'idle' },
  ...o,
})
const row = (rows: ReturnType<typeof gaiaCardRows>, label: string) => rows.find((r) => r.label === label)

test('a Gaia star card shows what the tile carries: constellation, position, G, colour', () => {
  const rows = gaiaCardRows(input({ detail: null, detailLoading: true }))
  assert.equal(row(rows, 'Constellation')!.value, 'Orion')
  assert.match(row(rows, 'Position')!.value, /^05h 35m 12\.0s, −?-?05° 24′ 00″$|05h 35m 12.0s, -05° 24′ 00″/)
  assert.match(row(rows, 'Magnitude')!.value, /^G 9\.43 \(Gaia/)
  assert.match(row(rows, 'Magnitude')!.note!, /about V 9\.\d on the visual scale/)
  assert.match(row(rows, 'Colour')!.value, /^BP-RP \+1\.23, orange/)
  assert.equal(row(rows, 'Distance')!.value, 'loading…') // details on their way
  assert.equal(row(rows, 'Gaia source'), undefined)
})

test('a star with no Gaia colour says so, and the V given for it says what was assumed', () => {
  const rows = gaiaCardRows(input({ bprp: null }))
  assert.match(row(rows, 'Colour')!.value, /not measured by Gaia/)
  assert.match(row(rows, 'Magnitude')!.note!, /no colour: a typical one assumed/)
})

test('the distance is as honest as the Hipparcos card: measured, a range, uncertain, nothing', () => {
  const dist = (d: Partial<GaiaDetail>) => row(gaiaCardRows(input({ detail: detail(d) })), 'Distance')!
  // 10 mas, 0.5 mas error: 5%, a distance with its error (326 light-years, +-16).
  const m = dist({ plxMas: 10, eplxMas: 0.5 })
  assert.match(m.value, /^326 ± 16\.3 light-years$/)
  assert.ok(!m.estimate)
  // 10-30%: only a range, labelled an estimate.
  const r = dist({ plxMas: 2, eplxMas: 0.4 })
  assert.match(r.value, /^about 1,600 light-years \(between/)
  assert.equal(r.estimate, true)
  // Worse: only a lower limit.
  const u = dist({ plxMas: 0.5, eplxMas: 0.4 })
  assert.match(u.value, /^uncertain: at least/)
  // The file's 255 (no error, or 1.27 mas and over) is never turned into a distance.
  const big = dist({ plxMas: 3, eplxMas: null })
  assert.match(big.value, /^uncertain: its parallax error is 1\.27 milliarcseconds or more/)
  assert.match(big.note!, /parallax 3\.00 mas/)
  // No parallax at all.
  assert.match(dist({ plxMas: null, eplxMas: null }).value, /no usable parallax/)
  // A negative parallax is not a distance.
  assert.match(dist({ plxMas: -1, eplxMas: 0.2 }).value, /no usable parallax|uncertain/)
  assert.match(gaiaCardRows(input({ detail: null, detailFailed: true })).find((x) => x.label === 'Distance')!.value, /could not be loaded/)
})

test('the source ID and, when SIMBAD answers, the name, type and spectral type; each other state in plain words', () => {
  const rows = gaiaCardRows(input({ simbad: { kind: 'found', result: found } }))
  assert.equal(row(rows, 'Gaia source')!.value, 'Gaia DR3 3010113299530081664')
  assert.match(row(rows, 'Spectral type')!.value, /^A1V: white/)
  assert.equal(row(rows, 'Spectral type')!.note, 'from SIMBAD')
  assert.equal(row(rows, 'Object type')!.value, 'star (*)')
  assert.equal(row(rows, 'SIMBAD'), undefined)
  const states: [SimbadState, RegExp][] = [
    [{ kind: 'loading' }, /looking up its name in SIMBAD/],
    [{ kind: 'notfound' }, /not in SIMBAD/],
    [{ kind: 'error' }, /could not be reached/],
    [{ kind: 'offline' }, /you are offline/],
  ]
  for (const [s, re] of states) {
    const r = gaiaCardRows(input({ simbad: s }))
    assert.match(row(r, 'SIMBAD')!.value, re)
    assert.equal(row(r, 'Spectral type'), undefined)
  }
  // Nothing is claimed about the SIMBAD lookup before the star's details (and so its ID) are known.
  assert.equal(row(gaiaCardRows(input({ detail: null, simbad: { kind: 'idle' } })), 'SIMBAD'), undefined)
})

test('the star is named by SIMBAD when it can, else by its Gaia source', () => {
  assert.equal(gaiaStarName(detail(), { kind: 'found', result: found }), 'HD 37306')
  assert.equal(gaiaStarName(detail(), { kind: 'notfound' }), 'Gaia DR3 3010113299530081664')
  assert.equal(gaiaStarName(null, { kind: 'idle' }), 'Gaia star')
})

test('a real tile star makes a card with every field filled', () => {
  const i = 100
  const d = details.at(i)
  const bprp = tile.cq[i] ? tile.cq[i] / 25 - 1 : null
  const rows = gaiaCardRows(input({ g: gOf(tile.gq[i]), bprp, detail: d }))
  for (const label of ['Position', 'Magnitude', 'Colour', 'Distance', 'Gaia source']) assert.ok(row(rows, label), label)
  assert.equal(row(rows, 'Gaia source')!.value, `Gaia DR3 ${d.sourceId}`)
})
