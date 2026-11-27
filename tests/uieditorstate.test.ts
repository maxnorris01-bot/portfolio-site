import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canRedo, canUndo, customCount, effectiveEdits, emptyList, listReduce, mergeOffsets, type EditList } from '../src/ui-editor/state.ts'
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

// ---- views stage 2: a view reset is an entry of its own in the history ----
const inEnv = (n: number, environment: 'phone' | 'tablet' | 'desktop'): Edit => ({ op: 'set', target: n, properties: { 'font-size': `${n}px` }, environment })
const text = (n: number): Edit => ({ op: 'text', target: n, text: 'new words' })
const reset = (s: EditList, environment: 'phone' | 'tablet') => listReduce(s, { type: 'resetView', environment })

test('a view reset takes that view\'s custom edits out of what the engine replays and nothing else', () => {
  let s = emptyList()
  for (const e of [inEnv(1, 'phone'), inEnv(2, 'desktop'), inEnv(3, 'tablet'), text(4), inEnv(5, 'phone')]) s = apply(s, e)
  assert.equal(customCount(s.edits, 'phone'), 2)
  assert.equal(customCount(s.edits, 'tablet'), 1)
  assert.equal(customCount(s.edits, 'desktop'), 0, 'Desktop has no custom edits')
  const r = reset(s, 'phone')
  assert.deepEqual(effectiveEdits(r.edits), [inEnv(2, 'desktop'), inEnv(3, 'tablet'), text(4)], 'Desktop, the other small view and the content edit stay, in order')
  assert.equal(customCount(r.edits, 'phone'), 0)
  assert.equal(customCount(r.edits, 'tablet'), 1)
  assert.equal(r.edits.length, s.edits.length + 1, 'the dropped edits stay in the history before the reset')
  assert.deepEqual(r.edits.slice(0, s.edits.length), s.edits)
})

test('content edits never count as a view\'s own changes, and a view with none is not offered a reset', () => {
  let s = emptyList()
  for (const e of [text(1), { op: 'note', target: 2, text: 'n' } as Edit, { op: 'remove', target: 3 } as Edit, inEnv(4, 'desktop')]) s = apply(s, e)
  assert.equal(customCount(s.edits, 'phone'), 0)
  assert.equal(customCount(s.edits, 'tablet'), 0)
  assert.equal(reset(s, 'phone'), s, 'nothing to reset: the very same list, no empty entry')
  assert.equal(reset(emptyList(), 'tablet').edits.length, 0)
})

test('one Undo after a view reset puts back exactly the list that was there, and one Redo takes it out again', () => {
  let s = emptyList()
  for (const e of [inEnv(1, 'phone'), inEnv(2, 'desktop'), inEnv(3, 'phone')]) s = apply(s, e)
  const before = s
  const r = reset(s, 'phone')
  const u = listReduce(r, { type: 'undo' })
  assert.deepEqual(u.edits, before.edits)
  assert.deepEqual(effectiveEdits(u.edits), effectiveEdits(before.edits))
  assert.equal(canRedo(u), true)
  const again = listReduce(u, { type: 'redo' })
  assert.deepEqual(again.edits, r.edits)
  assert.deepEqual(effectiveEdits(again.edits), [inEnv(2, 'desktop')])
  assert.equal(canRedo(again), false)
})

test('the mixed sequence: edit A in Phone, edit B in Desktop, reset Phone, edit C, then Undo three times and Redo three times give every state in between', () => {
  const A = inEnv(1, 'phone'), B = inEnv(2, 'desktop'), C = inEnv(3, 'tablet')
  const s1 = apply(emptyList(), A)
  const s2 = apply(s1, B)
  const s3 = reset(s2, 'phone')
  const s4 = apply(s3, C)
  const states = [s1, s2, s3, s4].map((s) => effectiveEdits(s.edits))
  assert.deepEqual(states, [[A], [A, B], [B], [B, C]])
  let s = s4
  const seen: Edit[][] = []
  for (let i = 0; i < 3; i++) { s = listReduce(s, { type: 'undo' }); seen.push(effectiveEdits(s.edits)) }
  assert.deepEqual(seen, [[B], [A, B], [A]], 'Undo three times: before C, before the reset, before B')
  const back: Edit[][] = []
  for (let i = 0; i < 3; i++) { s = listReduce(s, { type: 'redo' }); back.push(effectiveEdits(s.edits)) }
  assert.deepEqual(back, [[A, B], [B], [B, C]], 'Redo three times: B, the reset, C')
  assert.equal(canRedo(s), false)
  assert.equal(canUndo(s), true)
})

test('a new edit after an Undo of a reset drops the redo list, and Reset all clears resets too', () => {
  let s = emptyList()
  for (const e of [inEnv(1, 'phone'), inEnv(2, 'tablet')]) s = apply(s, e)
  s = reset(s, 'phone')
  s = listReduce(s, { type: 'undo' })
  assert.equal(s.redo.length, 1)
  s = apply(s, inEnv(9, 'desktop'))
  assert.equal(s.redo.length, 0)
  s = reset(s, 'tablet')
  const all = listReduce(s, { type: 'reset' })
  assert.deepEqual(all, emptyList())
  assert.equal(canUndo(all), false)
})

test('moves merge across nothing but another move: a view reset between two moves keeps them two edits', () => {
  const move = (dx: number): Edit => ({ op: 'offset', target: 1, dx, dy: 0, environment: 'phone' })
  let s = apply(emptyList(), move(5))
  s = reset(s, 'phone')
  s = apply(s, move(5))
  assert.equal(s.edits.length, 3, 'the move, the reset, the move')
  assert.deepEqual(effectiveEdits(s.edits), [move(5)])
})
