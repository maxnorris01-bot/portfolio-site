import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ageBucket, colorize, launchYear, withVisibility } from '../src/globe/colors.ts'
import type { CatalogObject } from '../src/globe/types.ts'

function obj(over: Partial<CatalogObject>): CatalogObject {
  return {
    norad_id: 1,
    name: 'X',
    tle_line1: '',
    tle_line2: '',
    element_epoch_utc: '',
    satcat_owner: null,
    object_type: 'PAY',
    active_payload: true,
    ...over,
  }
}

const SNAPSHOT = '2026-10-07T04:18:07.688114Z'

test('launch year parses only the YYYY-NNNA designator form', () => {
  assert.equal(launchYear('1998-067A'), 1998) // the ISS
  assert.equal(launchYear('2026-123ABC'), 2026) // three piece letters
  assert.equal(launchYear('1957-001B'), 1957) // the first launch year
})

test('malformed designators are unknown', () => {
  for (const bad of [
    '98067A', // TLE form, two-digit year
    '1998-67A',
    '1998-0670A',
    '1998-067',
    '1998-067a',
    '1998-067ABCD',
    '1998_067A',
    '19980-067A',
    '1956-001A', // before the first launch
    '1998-000A', // launch numbers start at 001
    'unknown',
  ]) {
    assert.equal(launchYear(bad), null, bad)
  }
})

test('missing, null, non-string and whitespace designators are unknown', () => {
  assert.equal(launchYear(undefined), null)
  assert.equal(launchYear(null), null)
  assert.equal(launchYear(1998), null)
  for (const ws of ['', '   ', ' 1998-067A', '1998-067A ', '1998-067A\n', '\t1998-067A']) {
    assert.equal(launchYear(ws), null, JSON.stringify(ws))
  }
})

test('bucket boundaries fall at 2 and 10 whole years', () => {
  const at = (launch: number | null) => ageBucket(launch, 2026)
  assert.equal(at(2026), 'new')
  assert.equal(at(2025), 'new') // 1 year
  assert.equal(at(2024), 'mid') // 2 years: the lower edge of "2 to 10"
  assert.equal(at(2016), 'mid') // 10 years: still "2 to 10"
  assert.equal(at(2015), 'old') // 11 years
  assert.equal(at(1958), 'old')
  assert.equal(at(2027), 'unknown') // launched after the snapshot
  assert.equal(at(null), 'unknown')
})

test('age coloring counts the four buckets against the snapshot year', () => {
  const c = colorize(
    [
      obj({ international_designator: '2026-001A' }),
      obj({ international_designator: '2025-200B' }),
      obj({ international_designator: '2020-010C' }),
      obj({ international_designator: '1998-067A' }),
      obj({ international_designator: null }),
      obj({ international_designator: 'garbage' }),
    ],
    'age',
    SNAPSHOT,
  )
  assert.deepEqual(
    c.categories.map((x) => [x.key, x.count]),
    [
      ['new', 2],
      ['mid', 1],
      ['old', 1],
      ['unknown', 2],
    ],
  )
  assert.equal(c.note, 'Unknown: no valid launch designator.')
  // One object, two snapshot dates: age follows the snapshot, not the object.
  const launched2016 = [obj({ international_designator: '2016-001A' })]
  assert.equal(colorize(launched2016, 'age', SNAPSHOT).categoryOf(0), 'mid') // 10 years
  assert.equal(colorize(launched2016, 'age', '2027-01-02T00:00:00Z').categoryOf(0), 'old') // 11
})

test('a snapshot without the designator key is all unknown, with a note, not an error', () => {
  // Dated snapshots from before 2026-10-07 have no international_designator.
  const objects = [obj({ norad_id: 1 }), obj({ norad_id: 2 }), obj({ norad_id: 3 })]
  const c = colorize(objects, 'age', '2026-10-03T21:46:23Z')
  assert.deepEqual(
    c.categories.map((x) => [x.key, x.count]),
    [
      ['new', 0],
      ['mid', 0],
      ['old', 0],
      ['unknown', 3],
    ],
  )
  assert.equal(c.note, 'Older snapshots lack launch data.')
  // Hiding Unknown hides every point; showing it again restores them.
  const alphas = (rgba: Float32Array) => [...rgba].filter((_, i) => i % 4 === 3)
  assert.deepEqual(alphas(withVisibility(c, new Set(['unknown']))), [0, 0, 0])
  assert.deepEqual(alphas(withVisibility(c, new Set())), [1, 1, 1])
})

test('age lists all four buckets even when some are empty; no note when none are unknown', () => {
  const objects = [obj({ international_designator: '2010-001A' })]
  assert.equal(colorize(objects, 'age', SNAPSHOT).note, undefined)
  assert.equal(colorize(objects, 'type').note, undefined)
  // Without a snapshot date, age can't be computed: Unknown, not an error.
  assert.deepEqual(
    colorize(objects, 'age').categories.map((x) => [x.key, x.count]),
    [
      ['new', 0],
      ['mid', 0],
      ['old', 0],
      ['unknown', 1],
    ],
  )
})

test('the age buckets are an ordered ramp: newest darkest, oldest lightest, Unknown neutral', () => {
  const c = colorize([obj({ international_designator: '2026-001A' })], 'age', SNAPSHOT)
  const colours = c.categories.map((x) => x.color)
  assert.deepEqual(colours, ['#5f75c1', '#05c992', '#d4f73e', '#8f8978'])
  // Relative luminance rises step by step, so the order reads without the legend.
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const [a, b, d] = colours.slice(0, 3).map(luminance)
  assert.ok(a < b && b < d)
})
