import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { readStarCatalog } from '../src/globe/stars.ts'
import {
  absoluteMagnitude,
  bolometricCorrection,
  distanceFromParallax,
  formatRaDec,
  hipIndex,
  luminosityEstimate,
  nameTable,
  readStarDetails,
  recordAt,
  searchStars,
  spectralGloss,
  starName,
  temperatureFromBV,
  type IauName,
} from '../src/globe/stardetails.ts'

const buf = (path: string) => {
  const f = readFileSync(new URL(path, import.meta.url))
  return f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength)
}
const details = readStarDetails(buf('../public/data/stars/hipparcos-details.bin'))
const catalog = readStarCatalog(buf('../public/data/stars/hipparcos.bin'))
const index = hipIndex(details)
const names = nameTable(JSON.parse(readFileSync(new URL('../public/data/stars/iau-names.json', import.meta.url), 'utf8')) as IauName[])
const star = (hip: number) => {
  const i = index.get(hip)!
  return { i, rec: recordAt(details, i), vmag: catalog.mag[i], bv: catalog.bv[i] }
}
const SIRIUS = 32349
const BETELGEUSE = 27989
const VEGA = 91262
const POLARIS = 11767
const BARNARD = 87937

test('the details file lines up with the star file, star for star', () => {
  assert.equal(details.count, catalog.count)
  assert.equal(details.count, 118217)
  // Sirius is first (brightest); its HIP number, parallax and V agree with the published values.
  const s = star(SIRIUS)
  assert.equal(s.i, 0)
  assert.ok(Math.abs(s.rec.plxMas! - 379.21) < 0.05)
  assert.ok(Math.abs(s.rec.eplxMas! - 1.58) < 0.1)
  assert.ok(Math.abs(s.vmag + 1.44) < 0.04)
  assert.match(s.rec.spectral, /^A0/)
  // Every HIP number is unique and the position matches Betelgeuse's RA/Dec (88.79, +7.41).
  assert.equal(index.size, details.count)
  const b = star(BETELGEUSE).i
  const ra = (Math.atan2(catalog.dirJ2000[b * 3 + 1], catalog.dirJ2000[b * 3]) * 180) / Math.PI
  assert.ok(Math.abs(((ra + 360) % 360) - 88.8) < 0.1)
  // A variable star keeps its flag (Betelgeuse is a coarse variable).
  assert.ok(star(BETELGEUSE).rec.varFlag > 0 || star(BETELGEUSE).rec.varType !== '')
})

test('phones read just the leading stars of the details', () => {
  const phone = readStarDetails(buf('../public/data/stars/hipparcos-details.bin'), 42605)
  assert.equal(phone.count, 42605)
  assert.equal(phone.hip[0], SIRIUS)
  assert.throws(() => readStarDetails(new ArrayBuffer(64)))
})

test('IAU names: every one maps to a catalogue star, and ordinary stars show their HIP number', () => {
  assert.ok(names.names.length > 400)
  for (const [name, hip] of names.names) assert.ok(index.has(hip), `${name} HIP ${hip} not in the catalogue`)
  assert.equal(starName(SIRIUS, names), 'Sirius')
  assert.equal(starName(BARNARD, names), "Barnard's Star")
  assert.equal(starName(11767, names), 'Polaris')
  assert.equal(starName(100, names), 'HIP 100')
  assert.equal(starName(100, null), 'HIP 100')
  const sirius = names.byHip.get(SIRIUS)!
  assert.deepEqual([sirius[2], sirius[3]], ['α', 'CMa'])
})

test('search: by name prefix, by containing text, folding case and accents, and by HIP number', () => {
  const has = (h: number) => index.has(h)
  assert.equal(searchStars('sir', names, has)[0].name, 'Sirius')
  assert.equal(searchStars('  BETEL', names, has)[0].hip, BETELGEUSE)
  assert.equal(searchStars('barnard', names, has)[0].hip, BARNARD)
  assert.equal(searchStars('HIP 91262', names, has)[0].name, 'Vega')
  assert.equal(searchStars('hip11767', names, has)[0].name, 'Polaris')
  assert.equal(searchStars('32349', names, has)[0].name, 'Sirius')
  // An unnamed star found by number, and a number that isn't in the catalogue.
  const faint = searchStars('HIP 60000', names, has)
  assert.deepEqual(faint.map((m) => m.hip), [60000])
  assert.deepEqual(searchStars('HIP 1', names, has).length <= 1, true)
  assert.deepEqual(searchStars('zzzz', names, has), [])
  assert.deepEqual(searchStars('', names, has), [])
  // Prefix matches come before "contains" matches, and the list is short.
  const r = searchStars('al', names, has)
  assert.ok(r.length <= 6)
  assert.ok(r[0].name.toLowerCase().startsWith('al'))
})

test('distance from parallax: measured, a range, a lower limit, or nothing to say', () => {
  const sirius = distanceFromParallax(379.21, 1.58)
  assert.equal(sirius.kind, 'measured')
  assert.ok(Math.abs(sirius.ly! - 8.6) < 0.05)
  assert.ok(sirius.plusMinusLy! < 0.05)
  const polaris = star(POLARIS).rec
  const pd = distanceFromParallax(polaris.plxMas, polaris.eplxMas)
  assert.equal(pd.kind, 'measured') // 7.56 +- 0.48 mas: 6% error
  assert.ok(Math.abs(pd.ly! - 431) < 5)
  // Betelgeuse's Hipparcos parallax is poor (7.63 +- 1.64 mas, 21%): a range, not a number.
  const bet = star(BETELGEUSE).rec
  const bd = distanceFromParallax(bet.plxMas, bet.eplxMas)
  assert.equal(bd.kind, 'range')
  assert.ok(bd.minLy! < 400 && bd.maxLy! > 500 && bd.minLy! < bd.ly! && bd.ly! < bd.maxLy!)
  // A tiny parallax with a big error: only a lower limit; a negative one likewise; none at all: nothing.
  assert.equal(distanceFromParallax(2, 4).kind, 'lower')
  assert.ok(distanceFromParallax(2, 4).minLy! > 400)
  assert.equal(distanceFromParallax(-1, 2).kind, 'lower') // plus one error is still positive
  assert.equal(distanceFromParallax(-3, 2).kind, 'none') // even plus one error is negative
  assert.equal(distanceFromParallax(-9, 2).kind, 'none')
  assert.equal(distanceFromParallax(null, null).kind, 'none')
  assert.equal(distanceFromParallax(5, null).kind, 'none')
})

test('spectral type gloss: colour and class in plain language', () => {
  const g = (t: string) => spectralGloss(t)?.gloss
  assert.equal(g('K0III'), 'orange giant')
  assert.equal(g('G2V'), 'yellow main-sequence star (dwarf)')
  assert.equal(g('M2Ib'), 'red supergiant')
  assert.equal(g('B8Ia'), 'blue-white supergiant')
  assert.equal(g('F7:Ib-IIv SB'), 'yellow-white supergiant') // Polaris, as catalogued
  assert.equal(g('A0Vvar'), 'white main-sequence star (dwarf)') // Vega
  assert.equal(g('A1V:'), 'white main-sequence star (dwarf)')
  assert.equal(g('K5IV-V'), 'orange subgiant')
  assert.equal(g('sdM4'), 'red subdwarf') // Barnard's Star
  assert.equal(g('DA2'), 'white dwarf (a collapsed, dying star)')
  assert.equal(g('A0m...'), 'white') // no luminosity class given: the colour alone
  assert.equal(g('M3III+K'), 'red giant')
  assert.equal(g(''), undefined)
  assert.equal(spectralGloss('???'), null)
  assert.equal(spectralGloss('K0III')!.type, 'K0III')
})

test('temperature from B-V: Sirius, the Sun, Betelgeuse, Barnard\'s Star', () => {
  assert.ok(Math.abs(temperatureFromBV(0.009)! - 10000) < 400) // Sirius A: ~9,900 K
  assert.ok(Math.abs(temperatureFromBV(0.65)! - 5800) < 150) // the Sun, B-V 0.65
  assert.ok(Math.abs(temperatureFromBV(1.5)! - 3800) < 300) // Betelgeuse: ~3,600 K
  assert.ok(Math.abs(temperatureFromBV(1.57)! - 3700) < 400) // Barnard's: really ~3,200 K (an estimate, 15% off)
  assert.equal(temperatureFromBV(2.4), null)
  assert.equal(temperatureFromBV(NaN), null)
})

test('luminosity estimates against known stars (factor of 2 or so, as stated)', () => {
  const lum = (hip: number) => {
    const s = star(hip)
    return luminosityEstimate(s.vmag, s.bv, s.rec.plxMas, s.rec.eplxMas)
  }
  // Bolometric correction: about -0.08 for a Sun-like 5,772 K.
  assert.ok(Math.abs(bolometricCorrection(5772) + 0.08) < 0.05)
  const sirius = lum(SIRIUS)! // published: 25.4 L_sun
  assert.ok(sirius.lsun > 20 && sirius.lsun < 32, `${sirius.lsun}`)
  assert.ok(Math.abs(sirius.absMag - 1.43) < 0.1)
  const vega = lum(VEGA)! // published: ~40-47 L_sun
  assert.ok(vega.lsun > 35 && vega.lsun < 70, `${vega.lsun}`)
  const polaris = lum(POLARIS)! // published: ~1,300-2,500 L_sun
  assert.ok(polaris.lsun > 1000 && polaris.lsun < 3500, `${polaris.lsun}`)
  const betelgeuse = lum(BETELGEUSE)! // published: 7,500-100,000+ L_sun; its parallax is 21% uncertain
  assert.ok(betelgeuse.lsun > 7000 && betelgeuse.lsun < 100000, `${betelgeuse.lsun}`)
  assert.ok(betelgeuse.fractionalError > 0.3) // so the estimate's error is large, and says so
  assert.ok(sirius.fractionalError < 0.1)
  const barnard = lum(BARNARD)! // published: 0.0035 L_sun; the B-V temperature is 15% high
  assert.ok(barnard.lsun > 0.0012 && barnard.lsun < 0.01, `${barnard.lsun}`)
  // No usable parallax, no luminosity.
  assert.equal(luminosityEstimate(8, 0.6, null, null), null)
  assert.equal(luminosityEstimate(8, 0.6, 2, 1.5), null) // 75% error
  assert.equal(absoluteMagnitude(0, 100) , 0 + 5 + 5 * Math.log10(0.1))
})

test('coordinates in hours/minutes/seconds and degrees', () => {
  assert.deepEqual(formatRaDec(101.287155, -16.716116), { ra: '06h 45m 08.9s', dec: '-16° 42′ 58″' })
  assert.deepEqual(formatRaDec(0, 0), { ra: '00h 00m 00.0s', dec: '+00° 00′ 00″' })
  // Rounding carries into the next unit instead of printing 60.
  assert.deepEqual(formatRaDec(359.9999, 89.9999), { ra: '00h 00m 00.0s', dec: '+90° 00′ 00″' })
  assert.deepEqual(formatRaDec(10.0, -0.0001), { ra: '00h 40m 00.0s', dec: '+00° 00′ 00″' })
})

import { colourName, starCardRows, type StarCardInput } from '../src/globe/stardetails.ts'

const card = (hip: number, over: Partial<StarCardInput> = {}): StarCardInput => {
  const s = star(hip)
  const d = (i: number) => ({ x: catalog.dirJ2000[i * 3], y: catalog.dirJ2000[i * 3 + 1], z: catalog.dirJ2000[i * 3 + 2] })
  const v = d(s.i)
  return {
    vmag: s.vmag,
    bv: s.bv,
    raDeg: ((Math.atan2(v.y, v.x) * 180) / Math.PI + 360) % 360,
    decDeg: (Math.asin(v.z) * 180) / Math.PI,
    constellation: null,
    record: s.rec,
    loading: false,
    failed: false,
    ...over,
  }
}
const row = (rows: ReturnType<typeof starCardRows>, label: string) => rows.find((r) => r.label === label)

test('the card for Sirius: catalogue values plain, estimates labelled', () => {
  const rows = starCardRows(card(SIRIUS, { constellation: { name: 'Canis Major', symbol: 'CMa' } }))
  assert.equal(row(rows, 'Constellation')!.value, 'Canis Major')
  assert.match(row(rows, 'Position')!.value, /^06h 45m 0\d\.\ds, -16° 4\d′ \d\d″$/)
  assert.match(row(rows, 'Position')!.note!, /J2000 coordinates, moved to 2026/)
  assert.match(row(rows, 'Magnitude')!.value, /^-1\.4\d \(visual\)/)
  assert.match(row(rows, 'Distance')!.value, /^8\.6 light-years/)
  assert.equal(row(rows, 'Distance')!.estimate, undefined) // measured, not inferred
  assert.match(row(rows, 'Spectral type')!.value, /^A0/)
  assert.match(row(rows, 'Colour')!.value, /^B-V \+0\.01, blue-white$/)
  const t = row(rows, 'Temperature')!
  assert.equal(t.estimate, true)
  assert.match(t.note!, /Ballesteros 2012/)
  const l = row(rows, 'Luminosity')!
  assert.equal(l.estimate, true)
  assert.match(l.value, /^about 2\d × the Sun/)
})

test('the card for Betelgeuse: an uncertain distance is a range, and the luminosity says how rough it is', () => {
  const rows = starCardRows(card(BETELGEUSE))
  const d = row(rows, 'Distance')!
  assert.equal(d.estimate, true)
  assert.match(d.value, /^about \d+ light-years \(between \d+ and \d+\)$/)
  assert.match(row(rows, 'Spectral type')!.value, /M2Ib: red supergiant/)
  assert.match(row(rows, 'Magnitude')!.value, /flagged in the catalogue as varying/) // a coarse variable, per the catalogue
  assert.match(row(rows, 'Luminosity')!.value, /±\d+% at least/)
})

test('the card for Barnard\'s Star and a star with no parallax; and while details load', () => {
  const b = starCardRows(card(BARNARD))
  assert.match(row(b, 'Spectral type')!.value, /sdM4: red subdwarf/)
  assert.match(row(b, 'Distance')!.value, /^5\.9 light-years/)
  // No parallax: say so, and don't invent a luminosity.
  const none = starCardRows(card(SIRIUS, { record: { hip: 1, plxMas: null, eplxMas: null, spectral: '', varFlag: 0, varType: '' } }))
  assert.equal(row(none, 'Distance')!.value, 'no usable parallax measurement')
  assert.equal(row(none, 'Luminosity'), undefined)
  assert.equal(row(none, 'Spectral type'), undefined)
  // A parallax that's too poor: no luminosity either, with the reason.
  const poor = starCardRows(card(SIRIUS, { record: { hip: 1, plxMas: 3, eplxMas: 2.5, spectral: 'K0III', varFlag: 0, varType: '' } }))
  assert.match(row(poor, 'Distance')!.value, /^uncertain: at least/)
  assert.match(row(poor, 'Luminosity')!.value, /not estimated/)
  // Details still loading: only catalogue values, and a loading distance.
  const loading = starCardRows(card(SIRIUS, { record: null, loading: true }))
  assert.equal(row(loading, 'Distance')!.value, 'loading…')
  assert.ok(row(loading, 'Temperature'))
  // Loading failed: no distance row at all, and the rest stands.
  const failed = starCardRows(card(SIRIUS, { record: null, failed: true }))
  assert.equal(row(failed, 'Distance'), undefined)
  assert.equal(colourName(1.5), 'orange-red')
  assert.equal(colourName(-0.3), 'blue')
})
