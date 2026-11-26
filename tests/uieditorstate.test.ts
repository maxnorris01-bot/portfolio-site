import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canRedo, canUndo, emptyList, listReduce, mergeOffsets, type EditList } from '../src/ui-editor/state.ts'
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

test('a run of arrow-key moves of one element is one offset, and steps that cancel leave none', () => {
  let s = emptyList()
  for (const dx of [5, 5, -3, 10, -17]) s = apply(s, move(1, dx, 0))
  assert.equal(s.edits.length, 0, 'the steps cancelled to nothing: no edit is left')
  s = apply(apply(s, move(1, 8, 0)), move(1, 22, 0))
  assert.deepEqual(s.edits, [move(1, 30, 0)])
})
