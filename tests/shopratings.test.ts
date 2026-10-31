import assert from 'node:assert/strict'
import { test } from 'node:test'
import { requestChips } from '../src/shop/chips.ts'
import { RATING_ORDER, ratedCount, ratingBody, ratingsFromView, ratingsReducer, nextRatingForKey, shopAgainBlock, COMMENT_MAX } from '../src/shop/ratings.ts'
import { fixtureView } from '../src/shop/fixtures.ts'
import { resetText } from '../src/shop/state.ts'

test('rate bodies: a rating alone, or a comment alone, exactly the contract fields', () => {
  assert.deepEqual(ratingBody('s1', 'r1', { rating: 'love' }), { session_id: 's1', result_id: 'r1', rating: 'love' })
  assert.deepEqual(ratingBody('s1', 'r1', { rating: null }), { session_id: 's1', result_id: 'r1', rating: null })
  assert.deepEqual(ratingBody('s1', 'r1', { comment: 'nice' }), { session_id: 's1', result_id: 'r1', comment: 'nice' })
})

test('ratings reducer: choose, comment (capped at 200), saving, saved, failed keeps the local choice', () => {
  let s = ratingsReducer({}, { type: 'choose', id: 'a', rating: 'like' })
  assert.deepEqual([s.a.rating, s.a.save], ['like', 'saving'])
  s = ratingsReducer(s, { type: 'saved', id: 'a', rating: 'like', comment: '' })
  assert.equal(s.a.save, 'saved')
  s = ratingsReducer(s, { type: 'comment', id: 'a', text: 'x'.repeat(250) })
  assert.equal(s.a.comment.length, COMMENT_MAX)
  assert.equal(s.a.save, 'idle', 'an edit after saving clears the Saved mark')
  s = ratingsReducer(s, { type: 'failed', id: 'a', message: 'Could not save.' })
  assert.deepEqual([s.a.rating, s.a.save, s.a.error, s.a.comment.length], ['like', 'failed', 'Could not save.', COMMENT_MAX])
  s = ratingsReducer(s, { type: 'saving', id: 'a' })
  assert.deepEqual([s.a.save, s.a.error], ['saving', null])
})

test('restore: ratings and comments come back from a session payload; empty entries are dropped', () => {
  const restored = ratingsFromView({ a: { rating: 'love', comment: 'Great' }, b: { rating: null, comment: '' }, c: { rating: null, comment: 'only a note' } })
  assert.deepEqual(Object.keys(restored).sort(), ['a', 'c'])
  assert.deepEqual([restored.a.rating, restored.a.comment, restored.a.savedComment, restored.a.save], ['love', 'Great', 'Great', 'idle'])
  assert.deepEqual(ratingsFromView(undefined), {})
  assert.equal(ratedCount(['a', 'b', 'c'], restored), 1)
})

test('keyboard: arrows move through Love, Like, Dislike and wrap; other keys are left alone', () => {
  assert.deepEqual(RATING_ORDER, ['love', 'like', 'dislike'])
  assert.equal(nextRatingForKey(null, 'ArrowRight'), 'love')
  assert.equal(nextRatingForKey('love', 'ArrowRight'), 'like')
  assert.equal(nextRatingForKey('like', 'ArrowDown'), 'dislike')
  assert.equal(nextRatingForKey('dislike', 'ArrowRight'), 'love')
  assert.equal(nextRatingForKey('love', 'ArrowLeft'), 'dislike')
  assert.equal(nextRatingForKey('like', 'ArrowUp'), 'love')
  for (const k of ['Tab', 'Enter', ' ', 'a', 'Escape']) assert.equal(nextRatingForKey('like', k), null)
})

test('Shop Again is off while running, while saving, with nothing rated, or past the per-visit limit', () => {
  const ok = { running: false, saving: false, rated: 1 }
  assert.equal(shopAgainBlock(ok), null)
  assert.ok(shopAgainBlock({ ...ok, running: true }))
  assert.ok(shopAgainBlock({ ...ok, saving: true }))
  assert.ok(shopAgainBlock({ ...ok, rated: 0 }))
  assert.ok(shopAgainBlock({ ...ok, used: 5, cap: 5 }))
  assert.equal(shopAgainBlock({ ...ok, used: 4, cap: 5 }), null)
})

test('request chips: plain labels from the parsed request; only the kinds with a remove route are removable', () => {
  const chips = requestChips(fixtureView.search?.query)
  const labels = chips.map((c) => c.label)
  assert.deepEqual(labels, ['sofa', 'Up to $1,000', 'modern', 'Material: boucle', 'Colour: oatmeal', 'Must have: 3-seat', 'Avoid: walmart'])
  const removable = chips.filter((c) => c.remove).map((c) => c.remove)
  assert.deepEqual(removable, [
    { kind: 'material', value: 'boucle' },
    { kind: 'color_term', value: 'oatmeal' },
    { kind: 'avoid', value: 'walmart' },
  ])
  assert.deepEqual(requestChips(null), [])
  assert.deepEqual(requestChips({ price_min: 200, price_max: 500 }).map((c) => c.label), ['$200 to $500'])
})

test('reset time is shown in UTC from the ISO time, or not at all', () => {
  assert.match(resetText('2026-11-01T00:00:00+00:00') ?? '', /Nov 1, 12:00 AM UTC/)
  assert.equal(resetText(null), null)
  assert.equal(resetText('garbage'), null)
})
