import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_STAR_DATA_URL, starDataUrl } from '../src/globe/stardataurl.ts'
import { BUCKET_URL } from '../src/globe/data.ts'

test('the star data defaults to the bucket that holds the objects files, under a versioned prefix', () => {
  assert.equal(DEFAULT_STAR_DATA_URL, `${BUCKET_URL}/stars/v1`)
  assert.equal(starDataUrl({}), DEFAULT_STAR_DATA_URL)
})

test('a build can point elsewhere; the ?stars= override works in development only', () => {
  assert.equal(starDataUrl({ env: 'https://example.org/stars-v1/' }), 'https://example.org/stars-v1')
  assert.equal(starDataUrl({ dev: true, search: '?stars=http://localhost:8788/stars-v1' }), 'http://localhost:8788/stars-v1')
  assert.equal(starDataUrl({ dev: false, search: '?stars=http://localhost:8788/stars-v1' }), DEFAULT_STAR_DATA_URL)
  assert.equal(starDataUrl({ dev: true, search: '?stars=http://localhost:8788', env: 'https://b.example/x' }), 'http://localhost:8788')
})

test('anything that is not an http(s) URL is ignored', () => {
  assert.equal(starDataUrl({ dev: true, search: '?stars=javascript:alert(1)' }), DEFAULT_STAR_DATA_URL)
  assert.equal(starDataUrl({ dev: true, search: '?stars=not a url' }), DEFAULT_STAR_DATA_URL)
  assert.equal(starDataUrl({ env: 'file:///etc/passwd' }), DEFAULT_STAR_DATA_URL)
})
