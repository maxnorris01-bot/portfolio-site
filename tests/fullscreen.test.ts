import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  FULLSCREEN_OFF,
  fullscreenStep,
  isPhoneSize,
  showsPanels,
  type FullscreenEvent,
  type FullscreenState,
} from '../src/globe/fullscreen.ts'

const run = (events: FullscreenEvent[], from: FullscreenState = FULLSCREEN_OFF) => {
  let s = from
  const log = []
  for (const e of events) {
    const r = fullscreenStep(s, e)
    s = r.state
    log.push(r.effects)
  }
  return { state: s, log }
}

test('entering pushes a history entry, locks the page and asks for native full screen where it exists', () => {
  const desktop = fullscreenStep(FULLSCREEN_OFF, { type: 'enter', nativeAvailable: true })
  assert.deepEqual(desktop.state, { on: true, native: false, historyEntry: true })
  assert.deepEqual(desktop.effects, { pushHistory: true, lockScroll: true, requestNative: true })
  // iPhone Safari: the CSS full-viewport mode alone.
  const iphone = fullscreenStep(FULLSCREEN_OFF, { type: 'enter', nativeAvailable: false })
  assert.equal(iphone.state.on, true)
  assert.equal(iphone.effects.requestNative, false)
  // Entering twice does nothing more.
  assert.deepEqual(fullscreenStep(desktop.state, { type: 'enter', nativeAvailable: true }).effects, {})
})

test('the Exit button leaves native full screen, drops the history entry and restores the page', () => {
  const { state, log } = run([{ type: 'enter', nativeAvailable: true }, { type: 'nativeEntered' }, { type: 'exit' }])
  assert.deepEqual(state, FULLSCREEN_OFF)
  assert.deepEqual(log[2], { unlockScroll: true, exitNative: true, popHistory: true })
  // The browser then reports leaving native full screen, and our history.back()
  // fires a popstate: both arrive after we're already out, and change nothing.
  assert.deepEqual(fullscreenStep(state, { type: 'nativeLeft' }), { state, effects: {} })
  assert.deepEqual(fullscreenStep(state, { type: 'back' }), { state, effects: {} })
})

test('the browser leaving full screen by itself (Esc, a gesture) keeps our state in sync', () => {
  const { state, log } = run([{ type: 'enter', nativeAvailable: true }, { type: 'nativeEntered' }, { type: 'nativeLeft' }])
  assert.deepEqual(state, FULLSCREEN_OFF)
  // Nothing native left to exit; the history entry is dropped.
  assert.deepEqual(log[2], { unlockScroll: true, exitNative: false, popHistory: true })
})

test('the back button in full screen exits full screen instead of leaving the page', () => {
  const { state, log } = run([{ type: 'enter', nativeAvailable: true }, { type: 'nativeEntered' }, { type: 'back' }])
  assert.deepEqual(state, FULLSCREEN_OFF)
  // The entry is already popped: no history.back(), but native full screen ends.
  assert.deepEqual(log[2], { unlockScroll: true, exitNative: true })
  // On iPhone (no native full screen) Back just leaves the CSS mode.
  const iphone = run([{ type: 'enter', nativeAvailable: false }, { type: 'back' }])
  assert.deepEqual(iphone.log[1], { unlockScroll: true, exitNative: false })
  // Back when not in full screen is left to the page.
  assert.deepEqual(fullscreenStep(FULLSCREEN_OFF, { type: 'back' }).effects, {})
})

test('Esc in the CSS-only mode exits like the Exit button', () => {
  const { state, log } = run([{ type: 'enter', nativeAvailable: false }, { type: 'exit' }])
  assert.deepEqual(state, FULLSCREEN_OFF)
  assert.deepEqual(log[1], { unlockScroll: true, exitNative: false, popHistory: true })
})

test('a native-full-screen confirmation after leaving is ignored', () => {
  const { state } = run([{ type: 'enter', nativeAvailable: true }, { type: 'exit' }, { type: 'nativeEntered' }])
  assert.deepEqual(state, FULLSCREEN_OFF)
})

test('phones show a clean map outside full screen; desktop always keeps its panels', () => {
  assert.equal(isPhoneSize(390, 844), true)
  assert.equal(isPhoneSize(360, 740), true)
  assert.equal(isPhoneSize(844, 390), true) // a phone in landscape: short, so still the phone design
  assert.equal(isPhoneSize(1024, 768), false) // a tablet or small laptop keeps the panels
  assert.equal(isPhoneSize(1440, 900), false)
  assert.equal(showsPanels(390, 844, false), false)
  assert.equal(showsPanels(390, 844, true), true)
  assert.equal(showsPanels(844, 390, false), false)
  assert.equal(showsPanels(1440, 900, false), true)
  assert.equal(showsPanels(1440, 900, true), true)
})
