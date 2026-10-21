import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { panelState, type PanelInputs } from '../src/globe/panelstate.ts'

const none: PanelInputs = { viewMode: 'globe', inspected: false, focus: false, station: false, skyBody: false, spaceSelection: false }
const at = (o: Partial<PanelInputs>) => panelState({ ...none, ...o })

test('state 1: nothing selected shows only the filters (in every non-satellite view)', () => {
  assert.deepEqual(at({}), { state: 'browse', object: null })
  assert.equal(at({ viewMode: 'sky' }).state, 'browse')
})

test('state 2: a selected object, station, pair or Sky body replaces the filters, and only one card shows', () => {
  assert.deepEqual(at({ inspected: true }), { state: 'object', object: 'inspected' })
  assert.deepEqual(at({ station: true }), { state: 'object', object: 'station' })
  assert.deepEqual(at({ focus: true }), { state: 'object', object: 'focus' })
  assert.deepEqual(at({ viewMode: 'sky', skyBody: true }), { state: 'object', object: 'body' })
  // Several at once still give one card: the selection first, then a Sky body, a pair, a station.
  assert.equal(at({ inspected: true, focus: true, station: true }).object, 'inspected')
  assert.equal(at({ viewMode: 'sky', skyBody: true, focus: true, station: true }).object, 'body')
  assert.equal(at({ focus: true, station: true }).object, 'focus')
})

test('state 3: the satellite view shows only its own panel, whatever else is selected', () => {
  assert.deepEqual(at({ viewMode: 'pov' }), { state: 'pov', object: null })
  assert.equal(at({ viewMode: 'pov', inspected: true, focus: true, station: true }).state, 'pov')
})

test('state 4: a star (or other sky object) selected in the satellite view hides the rest', () => {
  assert.deepEqual(at({ viewMode: 'pov', spaceSelection: true }), { state: 'star', object: null })
  assert.equal(at({ viewMode: 'pov', spaceSelection: true, inspected: true }).state, 'star')
})

test('selecting replaces the filters and deselecting restores them; entering and leaving the satellite view too', () => {
  const path: [Partial<PanelInputs>, string][] = [
    [{}, 'browse'],
    [{ inspected: true }, 'object'],
    [{}, 'browse'], // deselect
    [{ inspected: true }, 'object'],
    [{ viewMode: 'pov', inspected: true }, 'pov'], // View from here
    [{ viewMode: 'pov', inspected: true, spaceSelection: true }, 'star'],
    [{ viewMode: 'pov', inspected: true }, 'pov'], // deselect the star
    [{ inspected: true }, 'object'], // back to the globe
    [{}, 'browse'],
  ]
  for (const [i, want] of path) assert.equal(at(i).state, want, JSON.stringify(i))
})

test('the filters are only hidden, never unmounted, so their settings (and the name filter being open) survive a selection', () => {
  const tsx = readFileSync(new URL('../src/components/SatelliteGlobe.tsx', import.meta.url), 'utf8')
  assert.match(tsx, /hidden=\{panel\.state !== 'browse'\}\n\s+className=\{`globe-panel globe-legend/)
  // The legend's settings are component state above the panel, not state inside it.
  assert.match(tsx, /const \[colorMode, setColorMode\] = useState/)
  assert.match(tsx, /const hiddenNow = hidden\[colorMode\]/)
  // Each card is gated by the one state.
  assert.match(tsx, /panel\.object === 'inspected'/)
  assert.match(tsx, /panel\.object === 'station'/)
  assert.match(tsx, /panel\.object === 'focus'/)
  assert.match(tsx, /panel\.object === 'body'/)
  assert.match(tsx, /panel\.state === 'pov' && povObject/)
  assert.match(tsx, /viewMode === 'sky' && panel\.state === 'browse'/)
  assert.match(tsx, /panel\.state === 'browse' && aside/) // the "showing N of M" strip belongs to the filters
})

test('the satellite view has no manual base-map selector: a Hide today\'s imagery checkbox, imagery on by default', () => {
  const tsx = readFileSync(new URL('../src/components/SatelliteGlobe.tsx', import.meta.url), 'utf8')
  assert.match(tsx, /<span>Hide today&apos;s imagery<\/span>/)
  assert.doesNotMatch(tsx, />\s*Base map\s*</)
  assert.doesNotMatch(tsx, /Today&apos;s imagery\s*<\/button>/)
})

test('every card in the satellite view that selects a sky object has a Deselect', () => {
  const tsx = readFileSync(new URL('../src/components/SatelliteGlobe.tsx', import.meta.url), 'utf8')
  const from = tsx.indexOf("viewMode === 'pov' && spaceStar && !spaceBody")
  const to = tsx.indexOf("panel.object === 'inspected'")
  assert.ok((tsx.slice(from, to).match(/Deselect/g) ?? []).length >= 4)
})
