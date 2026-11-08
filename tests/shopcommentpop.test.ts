import assert from 'node:assert/strict'
import { test } from 'node:test'
import { COMMENT_POP_CLOSED, commentLinkLabel, commentPopStep, popoverPlacement } from '../src/shop/commentpop.ts'

const closed = COMMENT_POP_CLOSED

test('rating a card opens its popover; rating another card moves it (only one is open)', () => {
  const a = commentPopStep(closed, { type: 'rate', id: 'a', rating: 'love' })
  assert.deepEqual(a, { openId: 'a' })
  assert.deepEqual(commentPopStep(a, { type: 'rate', id: 'b', rating: 'like' }), { openId: 'b' })
  assert.deepEqual(commentPopStep(a, { type: 'open', id: 'c' }), { openId: 'c' })
})

test('clearing the rating closes its popover, and only its own', () => {
  const a = { openId: 'a' }
  assert.deepEqual(commentPopStep(a, { type: 'rate', id: 'a', rating: null }), closed)
  assert.equal(commentPopStep(a, { type: 'rate', id: 'b', rating: null }), a)
})

test('arrow keys change the rating without opening a popover or closing the open one', () => {
  assert.equal(commentPopStep(closed, { type: 'rate', id: 'a', rating: 'like', viaKey: true }), closed)
  const open = { openId: 'a' }
  assert.equal(commentPopStep(open, { type: 'rate', id: 'a', rating: 'like', viaKey: true }), open)
})

test('Esc, a click outside and blur close it; closing a closed popover changes nothing', () => {
  for (const type of ['escape', 'outside', 'blur', 'close'] as const) {
    assert.deepEqual(commentPopStep({ openId: 'a' }, { type }), closed, type)
    assert.equal(commentPopStep(closed, { type }), closed, `${type} when closed`)
  }
})

test('the reserved line: nothing before a rating, "Add a comment" without a comment, "Comment saved" with one', () => {
  assert.equal(commentLinkLabel(false, ''), null)
  assert.equal(commentLinkLabel(false, 'typed but unrated'), null)
  assert.equal(commentLinkLabel(true, ''), 'Add a comment')
  assert.equal(commentLinkLabel(true, '   '), 'Add a comment')
  assert.equal(commentLinkLabel(true, 'Too small'), 'Comment saved')
})

test('placement: below the buttons unless it runs off the window and there is more room above', () => {
  const base = { height: 130, viewportHeight: 900 }
  assert.equal(popoverPlacement({ ...base, buttonsTop: 300, buttonsBottom: 340 }), 'below')
  assert.equal(popoverPlacement({ ...base, buttonsTop: 780, buttonsBottom: 820 }), 'above')
  // Too tall for both: whichever side has more room.
  assert.equal(popoverPlacement({ height: 500, viewportHeight: 600, buttonsTop: 100, buttonsBottom: 140 }), 'below')
  assert.equal(popoverPlacement({ height: 500, viewportHeight: 600, buttonsTop: 460, buttonsBottom: 500 }), 'above')
})
