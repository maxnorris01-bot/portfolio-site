import assert from 'node:assert/strict'
import { test } from 'node:test'
import { phoneSideDock } from '../src/globe/layout.ts'

// A phone stage: 540 px tall, legend ending at 190 px, a 100 px side column
// (so docked at the bottom it covers 428-528 px; under the legend, 198-298 px).
const base = { stageHeight: 540, sideHeight: 100, legendBottom: 190, current: null }

test('stays at the bottom when the ring is clear of it, or not on screen', () => {
  assert.equal(phoneSideDock({ ...base, ringY: 300 }), null)
  assert.equal(phoneSideDock({ ...base, ringY: null }), null)
  assert.equal(phoneSideDock({ ...base, ringY: null, current: 198 }), null)
})

test('moves under the legend when the ring would be covered at the bottom', () => {
  assert.equal(phoneSideDock({ ...base, ringY: 410 }), 198)
  assert.equal(phoneSideDock({ ...base, ringY: 500 }), 198)
})

test('returns to the bottom only once the ring is clearly above it', () => {
  // At 395 a bottom-docked column stays put, and so does a top-docked one...
  assert.equal(phoneSideDock({ ...base, ringY: 395 }), null)
  assert.equal(phoneSideDock({ ...base, ringY: 395, current: 198 }), 198)
  // ...which returns once the ring is well clear of the bottom.
  assert.equal(phoneSideDock({ ...base, ringY: 380, current: 198 }), null)
})

test('stays at the bottom when moving up would not uncover the ring', () => {
  // A tall (expanded) column covers the ring in either place.
  assert.equal(phoneSideDock({ ...base, sideHeight: 330, ringY: 400 }), null)
})
