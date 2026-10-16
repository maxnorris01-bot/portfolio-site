import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gunzipSync, gzipSync } from 'node:zlib'
import { test } from 'node:test'
import {
  countBelow,
  decodeTile,
  gOf,
  maybeGunzip,
  prefixCount,
  readGaiaDetails,
  readManifest,
  tileHasStarsAbove,
} from '../src/globe/gaiatiles.ts'
import { ang2pixNest } from '../src/globe/healpix.ts'

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url))
const ab = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
const manifest = readManifest(JSON.parse(fixture('gaia-manifest-sample.json').toString('utf8')))
const tileBytes = ab(gunzipSync(fixture('gaia-tile-0437.bin.gz')))
const entry = manifest.tiles.get(437)!

test('the manifest reads: tiles, counts per magnitude, credit', () => {
  assert.equal(manifest.order, 3)
  assert.deepEqual(manifest.magBins, [8, 9, 10, 11, 12, 13])
  assert.equal(manifest.tiles.size, 31)
  assert.equal(entry.count, 2125)
  assert.equal(entry.nLt.length, 6)
  assert.equal(manifest.attribution.credit, 'Credit: ESA, Gaia DPAC')
  assert.equal(manifest.attribution.licence, 'CC BY-NC 3.0 IGO')
})

test('a manifest of another format, or with another encoding, is refused', () => {
  const raw = JSON.parse(fixture('gaia-manifest-sample.json').toString('utf8'))
  assert.throws(() => readManifest({ ...raw, format_version: 2 }), /version 1/)
  assert.throws(() => readManifest({ ...raw, encoding: { ...raw.encoding, mag: { offset: 0, scale: 10 } } }), /magnitude encoding/)
  assert.throws(() => readManifest({}), /version 1/)
})

test('a real tile decodes: stars inside their tile, brightest first, the counts the manifest promises', () => {
  const t = decodeTile(tileBytes)
  assert.equal(t.ipix, 437)
  assert.equal(t.count, entry.count)
  let wrongTile = 0
  for (let i = 0; i < t.count; i++) {
    const x = t.dir[i * 3]
    const y = t.dir[i * 3 + 1]
    const z = t.dir[i * 3 + 2]
    assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < 1e-5)
    const ra = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
    const dec = (Math.asin(z) * 180) / Math.PI
    if (ang2pixNest(3, ra, dec) !== 437) wrongTile++
    if (i > 0) assert.ok(t.gq[i] >= t.gq[i - 1], 'G not ascending')
  }
  // Float32 unit vectors put a star within 0.1 mas of its edge on the wrong side now and then; none expected here.
  assert.ok(wrongTile <= 2, `${wrongTile} stars outside the tile`)
  assert.ok(Math.abs(gOf(t.gq[0]) - entry.gMin) < 0.1)
  assert.ok(Math.abs(gOf(t.gq[t.count - 1]) - entry.gMax) < 0.1)
  manifest.magBins.forEach((bin, i) => assert.equal(prefixCount(t.gq, t.count, bin), entry.nLt[i], `G < ${bin}`))
  assert.equal(prefixCount(t.gq, t.count, 99), t.count)
  assert.equal(prefixCount(t.gq, t.count, entry.gMin - 0.5), 0)
})

test('the V-equivalent magnitude is G corrected by colour, and every star has a colour', () => {
  const t = decodeTile(tileBytes)
  let coloured = 0
  for (let i = 0; i < t.count; i++) {
    const g = gOf(t.gq[i])
    // V is within a magnitude or so of G for ordinary stars, never wildly off.
    assert.ok(Math.abs(t.mag[i] - g) < 2.6, `star ${i}: G ${g} V ${t.mag[i]}`)
    if (t.cq[i] > 0) coloured++
    const m = Math.max(t.rgb[i * 3], t.rgb[i * 3 + 1], t.rgb[i * 3 + 2])
    assert.equal(m, 255) // the ramp normalises its brightest channel
  }
  assert.ok(coloured > t.count * 0.98)
})

test('the details file: same count, source IDs, parallax with its honesty', () => {
  const d = readGaiaDetails(ab(gunzipSync(fixture('gaia-details-0437.bin.gz'))))
  assert.equal(d.count, entry.count)
  const ids = new Set<string>()
  let withPlx = 0
  for (let i = 0; i < d.count; i++) {
    const s = d.at(i)
    assert.match(s.sourceId, /^\d{15,19}$/)
    ids.add(s.sourceId)
    if (s.plxMas !== null) {
      withPlx++
      assert.ok(Math.abs(s.plxMas) < 800)
    }
    if (s.eplxMas !== null) assert.ok(s.eplxMas >= 0 && s.eplxMas < 1.28)
  }
  assert.equal(ids.size, d.count) // source IDs are unique
  assert.ok(withPlx > d.count * 0.95)
  assert.throws(() => d.at(d.count), RangeError)
  assert.throws(() => readGaiaDetails(tileBytes), /details file/)
})

test('counts from the manifest alone: monotone, exact at the bins, never past the tile', () => {
  const bins = manifest.magBins
  bins.forEach((b, i) => assert.equal(countBelow(entry, bins, b), entry.nLt[i]))
  let last = 0
  for (let g = 3; g <= 14; g += 0.25) {
    const n = countBelow(entry, bins, g)
    assert.ok(n >= last && n <= entry.count, `G ${g}: ${n}`)
    last = n
  }
  assert.equal(countBelow(entry, bins, entry.gMin), 0)
  assert.ok(tileHasStarsAbove(entry, entry.gMin + 0.01))
  assert.ok(!tileHasStarsAbove(entry, entry.gMin))
})

test('a response that is still gzip (no Content-Encoding) is unzipped; plain bytes pass through', async () => {
  const plain = ab(Buffer.from('GAIT plain bytes'))
  assert.equal(await maybeGunzip(plain), plain)
  const out = await maybeGunzip(ab(gzipSync(Buffer.from('hello stars'))))
  assert.equal(new TextDecoder().decode(out), 'hello stars')
  assert.equal(decodeTile(await maybeGunzip(ab(fixture('gaia-tile-0437.bin.gz')))).count, 2125)
})

test('a file that is not a tile is refused', () => {
  assert.throws(() => decodeTile(ab(Buffer.from('nonsense nonsense nonsense nonsense nonsense'))), /Gaia tile/)
})
