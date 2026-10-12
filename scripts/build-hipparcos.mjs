// Builds public/data/stars/hipparcos.bin, the satellite view's star catalogue,
// from the Hipparcos main catalogue (ESA 1997, CDS/VizieR I/239 hip_main.dat).
//
//   curl -O https://cdsarc.cds.unistra.fr/ftp/I/239/hip_main.dat
//   node scripts/build-hipparcos.mjs hip_main.dat
//
// The input isn't kept in the repo (53 MB); see public/data/stars/ATTRIBUTION.md
// for the source, licence and the decision to use it.
//
// Output format (little endian), read by src/globe/stars.ts:
//   32-byte header: "HIPS", version u16 = 1, reserved u16, count u32,
//     epoch f32 (Julian year the positions are propagated to), reserved.
//   Then four columns of `count` entries, stars sorted brightest first:
//     ra   uint24: right ascension / 360 deg * 2^24        (ICRS, J2000 axes)
//     dec  uint24: (declination + 90) / 180 deg * (2^24 - 1)
//     mag  uint8:  round((V + 2) * 16), V from -2 to 13.9  (0.0625 mag steps)
//     bv   uint8:  round((B-V + 0.5) * 80), B-V -0.5 to 2.69 (0.0125 steps);
//                  stars without a B-V get 0.6 (sun-like)
//   Columns compress better than records (the sorted magnitudes almost vanish).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const EPOCH = 2026.0 // positions propagated from J1991.25 with Hipparcos proper motions
const input = process.argv[2]
if (!input) {
  console.error('usage: node scripts/build-hipparcos.mjs hip_main.dat')
  process.exit(1)
}

const num = (line, a, b) => {
  const t = line.slice(a - 1, b).trim()
  return t === '' ? null : Number(t)
}
const hms = (t) => {
  const [h, m, s] = t.trim().split(/\s+/).map(Number)
  return (h + m / 60 + s / 3600) * 15
}
const dms = (t) => {
  const s = t.trim()
  const sign = s.startsWith('-') ? -1 : 1
  const [d, m, sec] = s.replace(/^[+-]/, '').split(/\s+/).map(Number)
  return sign * (d + m / 60 + sec / 3600)
}

const stars = []
let noMag = 0
let fallbackPos = 0
for (const line of readFileSync(input, 'latin1').split('\n')) {
  if (!line.startsWith('H')) continue
  const v = num(line, 42, 46)
  if (v === null) {
    noMag++
    continue
  }
  let ra = num(line, 52, 63)
  let dec = num(line, 65, 76)
  if (ra === null || dec === null) {
    // A few stars have no astrometric solution: use the h m s / d m s position.
    ra = hms(line.slice(17, 28))
    dec = dms(line.slice(29, 40))
    fallbackPos++
  }
  const pmRA = num(line, 88, 95) ?? 0 // mas/yr, includes cos(dec)
  const pmDE = num(line, 97, 104) ?? 0
  const years = EPOCH - 1991.25
  dec += (pmDE * years) / 3.6e6
  ra += (pmRA * years) / 3.6e6 / Math.max(1e-6, Math.cos((dec * Math.PI) / 180))
  ra = ((ra % 360) + 360) % 360
  dec = Math.max(-90, Math.min(90, dec))
  const bv = num(line, 246, 251)
  stars.push({ ra, dec, v, bv: bv ?? 0.6 })
}
stars.sort((a, b) => a.v - b.v)

const n = stars.length
const buf = Buffer.alloc(32 + n * 8)
buf.write('HIPS', 0, 'ascii')
buf.writeUInt16LE(1, 4)
buf.writeUInt32LE(n, 8)
buf.writeFloatLE(EPOCH, 12)
const raAt = 32
const decAt = raAt + n * 3
const magAt = decAt + n * 3
const bvAt = magAt + n
const u24 = (off, x) => {
  buf[off] = x & 0xff
  buf[off + 1] = (x >> 8) & 0xff
  buf[off + 2] = (x >> 16) & 0xff
}
const clampByte = (x) => Math.max(0, Math.min(255, Math.round(x)))
stars.forEach((s, i) => {
  u24(raAt + i * 3, Math.round((s.ra / 360) * 2 ** 24) % 2 ** 24)
  u24(decAt + i * 3, Math.round(((s.dec + 90) / 180) * (2 ** 24 - 1)))
  buf[magAt + i] = clampByte((s.v + 2) * 16)
  buf[bvAt + i] = clampByte((s.bv + 0.5) * 80)
})

mkdirSync('public/data/stars', { recursive: true })
writeFileSync('public/data/stars/hipparcos.bin', buf)
const faint = (m) => stars.filter((s) => s.v <= m).length
console.log(
  `${n} stars (skipped ${noMag} without V; ${fallbackPos} positions from h m s), ` +
    `V ${stars[0].v} to ${stars[n - 1].v}; brighter than 6.5: ${faint(6.5)}, 8: ${faint(8)}, 9: ${faint(9)}; ` +
    `${buf.length} bytes`,
)
