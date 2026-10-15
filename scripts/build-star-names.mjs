// Builds public/data/stars/iau-names.json from the IAU Working Group on Star
// Names catalogue, "IAU-CSN.txt":
//
//   curl -O https://www.pas.rochester.edu/~emamajek/WGSN/IAU-CSN.txt
//   node scripts/build-star-names.mjs IAU-CSN.txt
//
// Keeps only names of stars with a Hipparcos number (the file also lists
// exoplanet host stars without one). Output: a JSON array of
// [name, hip, designation, constellation], sorted by name, where the
// designation is the Bayer/Flamsteed/variable ID with diacritics ("α CMa").

import { readFileSync, writeFileSync } from 'node:fs'

const input = process.argv[2]
if (!input) {
  console.error('usage: node scripts/build-star-names.mjs IAU-CSN.txt')
  process.exit(1)
}
const lines = readFileSync(input, 'utf8').split('\n')
const header = lines.find((l) => l.startsWith('#Name/ASCII'))
if (!header) throw new Error('no column header found')
// The two name columns are fixed-width (names can hold spaces); the rest of a
// row is parsed from its end: ... Con Component WDS mag band HIP HD RA Dec Date.
const diacStart = header.indexOf('Name/Diacritics') - 1
const desigStart = header.indexOf('Designation') - 1
const TAIL =
  /\s([A-Z][A-Za-z]{2})\s+(\S+)\s+(\d{5}[+-]\d{4}|_)\s+(-?\d+\.\d+|_)\s+(\w+)\s+(\d+|_)\s+(\d+|_)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)\s+\d{4}-\d\d-\d\d/
const out = []
let skipped = 0
let noHip = 0
for (const l of lines) {
  if (!l || l.startsWith('#') || l.startsWith('$')) continue
  const m = TAIL.exec(l)
  const name = l.slice(0, diacStart).trim()
  const nameDiac = l.slice(diacStart, desigStart).trim()
  if (!m || !name) {
    skipped++
    continue
  }
  if (m[6] === '_') {
    noHip++
    continue
  }
  // The Bayer/Flamsteed ID (with Greek letter) sits just before the constellation.
  const before = l.slice(desigStart, m.index).trim().split(/\s+/)
  const bayer = before.length >= 2 ? before[before.length - 1] : ''
  out.push([nameDiac || name, Number(m[6]), bayer && bayer !== '_' ? bayer : '', m[1]])
}
out.sort((a, b) => a[0].localeCompare(b[0]))
writeFileSync('public/data/stars/iau-names.json', JSON.stringify(out))
console.log(`${out.length} names with a Hipparcos number (${noHip} without one, ${skipped} unparsed)`)
console.log(out.filter((r) => ['Sirius', 'Betelgeuse', 'Polaris', 'Vega', 'Rigel', 'Antares'].includes(r[0])).map((r) => r.join(' | ')).join('\n'))
