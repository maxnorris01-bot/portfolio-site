import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canRedo, canUndo, emptyList, listReduce, mergeOffsets, offsetOf, type EditList } from '../src/ui-editor/state.ts'
import type { Edit } from '../src/ui-editor/vendor/engine.js'

const set = (n: number): Edit => ({ op: 'set', target: n, properties: { color: `#00000${n}` } })
const move = (target: number, dx: number, dy: number, link = false): Edit => ({ op: 'offset', target, dx, dy, environment: 'desktop', link })
const apply = (s: EditList, e: Edit) => listReduce(s, { type: 'apply', edit: e })

test('apply adds to the list and clears Redo; Undo pops, Redo puts back, Reset clears', () => {
  let s = emptyList()
  assert.equal(canUndo(s) || canRedo(s), false)
  s = apply(apply(s, set(1)), set(2))
  assert.deepEqual(s.edits, [set(1), set(2)])
  s = listReduce(s, { type: 'undo' })
  assert.deepEqual([s.edits, s.redo], [[set(1)], [set(2)]])
  assert.ok(canUndo(s) && canRedo(s))
  s = apply(s, set(3))
  assert.deepEqual([s.edits, s.redo], [[set(1), set(3)], []], 'a new edit drops the redo list')
  s = listReduce(listReduce(s, { type: 'undo' }), { type: 'redo' })
  assert.deepEqual(s.edits, [set(1), set(3)], 'undo then redo gives the same list')
  assert.deepEqual(listReduce(s, { type: 'reset' }), emptyList())
})

test('undo and redo on an empty list or an empty redo list change nothing (same object)', () => {
  const s = emptyList()
  assert.equal(listReduce(s, { type: 'undo' }), s)
  assert.equal(listReduce(s, { type: 'redo' }), s)
})

test('undoing everything gives the empty list, so a replay on the original is the original', () => {
  let s = emptyList()
  for (const e of [set(1), set(2), move(3, 5, 5)]) s = apply(s, e)
  while (canUndo(s)) s = listReduce(s, { type: 'undo' })
  assert.deepEqual(s.edits, [])
  assert.equal(s.redo.length, 3)
})

test('two moves of the same element in a row are one edit; different elements, scopes or other edits in between are not merged; a pair that cancels leaves nothing', () => {
  let s = apply(emptyList(), move(4, 10, 0))
  s = apply(s, move(4, 5, 7))
  assert.deepEqual(s.edits, [move(4, 15, 7)])
  assert.deepEqual(apply(s, move(5, 1, 1)).edits.length, 2)
  assert.equal(apply(s, move(4, 1, 1, true)).edits.length, 2, 'linked and unlinked are different scopes')
  assert.equal(apply(apply(s, set(1)), move(4, 1, 1)).edits.length, 3)
  assert.deepEqual(apply(s, move(4, -15, -7)).edits, [])
  assert.equal(mergeOffsets(undefined, move(1, 1, 1)), undefined)
  assert.equal(mergeOffsets(set(1), move(1, 1, 1)), undefined)
})

test('offsetOf: the sum of the offsets of one element in the scope of the next nudge', () => {
  const phone = (target: number, dx: number, dy: number): Edit => ({ op: 'offset', target, dx, dy, environment: 'phone' })
  const tablet = (target: number, dx: number, dy: number): Edit => ({ op: 'offset', target, dx, dy, environment: 'tablet' })
  const plain = (target: number, dx: number, dy: number): Edit => ({ op: 'offset', target, dx, dy, environment: 'desktop' })
  const list = [move(1, 5, 2), set(1), move(1, 4, -1), phone(1, 7, 0), tablet(1, 3, 3), move(2, 9, 9), plain(1, 100, 100)]
  assert.deepEqual(offsetOf(list, 1, 'desktop', false), { dx: 9, dy: 1 }, 'Desktop (link false): the Desktop edits of that element, not Phone, Tablet or a linked one')
  assert.deepEqual(offsetOf(list, 1, 'phone', true), { dx: 7, dy: 0 })
  assert.deepEqual(offsetOf(list, 1, 'tablet', true), { dx: 3, dy: 3 })
  assert.deepEqual(offsetOf(list, 1, 'desktop', true), { dx: 100, dy: 100 }, 'a linked Desktop edit is another scope')
  assert.deepEqual(offsetOf(list, 3, 'desktop', false), { dx: 0, dy: 0 }, 'an element with no offset is 0')
  assert.deepEqual(offsetOf([], 1, 'desktop', false), { dx: 0, dy: 0 })
  assert.deepEqual(offsetOf([{ op: 'offset', target: 4, dx: 6, dy: -2, link: true }], 4, undefined, true), { dx: 6, dy: -2 }, 'an SVG edit has no environment')
})

test('offsetOf agrees with the merged list: the shift after any run of moves is the sum of the steps', () => {
  let s = emptyList()
  let want = 0
  for (const dx of [5, 5, -3, 10, -17]) {
    s = apply(s, move(1, dx, 0))
    want += dx
    assert.equal(offsetOf(s.edits, 1, 'desktop', false).dx, want)
  }
  assert.equal(s.edits.length, 0, 'the steps cancelled to nothing: no edit is left')
  s = apply(apply(s, move(1, 8, 0)), move(1, -8 + 30, 0))
  assert.deepEqual(s.edits, [move(1, 30, 0)], 'a typed 30 after 8 is the difference 22: one offset of 30')
})
