import assert from 'node:assert/strict'
import { test } from 'node:test'
import { alsoAtLine, formatPrice, initialState, noticesFor, ratingLine, safeHref, shopReducer, stepSummary, type ShopState } from '../src/shop/state.ts'
import { fixtureItems, fixtureView } from '../src/shop/fixtures.ts'
import { LIMITATIONS_NOTICE } from '../src/shop/copy.ts'

test('reducer: submit, progress, done; a new search replaces old results', () => {
  let s: ShopState = shopReducer(initialState, { type: 'submit', request: 'couch', now: 5 })
  assert.equal(s.status, 'running')
  s = shopReducer(s, { type: 'progress', job: { state: 'running', phase: 'tagging', steps: [{ id: 'a', label: 'Searching', state: 'done', done_count: null, total: null }] } })
  assert.equal(s.status === 'running' && s.steps.length, 1)
  s = shopReducer(s, { type: 'done', view: fixtureView })
  assert.equal(s.status, 'done')
  s = shopReducer(s, { type: 'submit', request: 'rug', now: 9 })
  assert.deepEqual([s.status, 'request' in s && s.request], ['running', 'rug'])
})

test('reducer: errors keep the request for a retry; late progress is ignored; restore loses to a new search', () => {
  const running = shopReducer(initialState, { type: 'submit', request: 'couch', now: 1 })
  const failed = shopReducer(running, { type: 'fail', message: 'Nope.', retryAfterS: 30 })
  assert.deepEqual(failed, { status: 'error', request: 'couch', message: 'Nope.', retryAfterS: 30 })
  assert.equal(shopReducer(failed, { type: 'progress', job: { state: 'running' } }), failed)
  assert.equal(shopReducer(running, { type: 'restored', view: fixtureView }), running)
  assert.equal(shopReducer({ status: 'idle', restoring: true }, { type: 'restored', view: null }).status, 'idle')
  assert.equal(shopReducer({ status: 'idle', restoring: true }, { type: 'restored', view: fixtureView }).status, 'done')
})

test('helpers: price, rating, also-at, notices, steps', () => {
  assert.equal(formatPrice(899, 'USD'), '$899')
  assert.equal(formatPrice(749.99, 'USD'), '$749.99')
  assert.equal(formatPrice(null), null)
  assert.equal(formatPrice(10, 'not-a-currency'), '$10')
  assert.equal(ratingLine(fixtureItems[0]), '★ 4.6 (1,284)')
  assert.equal(ratingLine(fixtureItems[1]), null)
  assert.equal(alsoAtLine(fixtureItems[0]), 'Also at: Sample Furniture $929, Demo Living $949.50')
  assert.equal(alsoAtLine(fixtureItems[1]), null)
  assert.equal(noticesFor(fixtureView.search).length, 2)
  assert.equal(stepSummary({ id: 't', label: 'Tagging', state: 'active', done_count: 12, total: 40 }), 'Tagging 12/40')
  assert.equal(stepSummary({ id: 't', label: 'Checking style', state: 'skipped', done_count: null, total: null }), 'Checking style (skipped)')
})

test('only http(s) links are opened', () => {
  assert.equal(safeHref('https://example.com/p'), 'https://example.com/p')
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', '', null, undefined, 'not a url']) assert.equal(safeHref(bad), null)
})

test('the limitations notice is the agreed text', () => {
  assert.ok(LIMITATIONS_NOTICE.startsWith('About this tool. Shop Mode is a personal portfolio project, not a store and not for profit.'))
  assert.ok(LIMITATIONS_NOTICE.endsWith('No account details or payment information are collected.'))
})
