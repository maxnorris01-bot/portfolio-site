// Views round 1, pass line 6.2: the exported files of the earlier specs in the final run equal those of the baseline run, byte for byte, for every spec NOT on the RETIRED list.
//   node scripts/ui-editor-gate/compare-exports.mjs <baseline dir> <final dir>      (the folders written by run.mjs --dump-exports)
// A spec with a retired step or retired as a whole is compared for information only (its edits may legitimately differ: V07 made its edits unlinked with the Link checkbox).
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const [base, now] = process.argv.slice(2)
if (!base || !now) { console.error('usage: compare-exports.mjs <baseline dir> <final dir>'); process.exit(2) }
const retired = { ...JSON.parse(readFileSync(join(here, 'specs-views1.json'), 'utf8')).retiredChecks }
// amendment A5: specs whose Phone-view edit is custom now (their bytes differ by design) are read like the specs with retired steps
for (const [id, why] of Object.entries(JSON.parse(readFileSync(join(here, 'amendments-views1.json'), 'utf8')).byteComparisonInformationOnly?.specs ?? {})) retired[id] ??= { steps: [], reason: why, byteInformationOnly: true }
let bad = 0, same = 0, info = 0
for (const id of readdirSync(base).sort()) {
  if (/^X\d/.test(id)) continue
  const a = join(base, id), b = join(now, id)
  const files = readdirSync(a)
  const diff = !existsSync(b) ? ['(no folder in the final run)'] : files.filter((f) => !existsSync(join(b, f)) || readFileSync(join(a, f), 'utf8') !== readFileSync(join(b, f), 'utf8'))
  const mark = retired[id] ? (retired[id].wholeSpec ? 'RETIRED (whole)' : retired[id].byteInformationOnly ? 'Phone-view edit now custom (A5)' : 'has retired steps') : ''
  if (retired[id]) { info++; console.log(`${diff.length ? 'differs' : 'same   '}  ${id}  ${files.length} files  [${mark}, information only]${diff.length ? ' ' + diff.join(', ') : ''}`); continue }
  if (diff.length) { bad++; console.log(`DIFFERS  ${id}: ${diff.join(', ')}`) } else same++
}
console.log(`\n${same} specs byte for byte the same, ${bad} differ, ${info} with retired steps (information only)`)
process.exit(bad ? 1 : 0)
