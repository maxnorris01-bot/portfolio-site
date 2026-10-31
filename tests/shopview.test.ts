import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import type { ComponentType } from 'react'
import { fixtureNoResults, fixtureStates, fixtureItems } from '../src/shop/fixtures.ts'
import { LIMITATIONS_NOTICE } from '../src/shop/copy.ts'
import type { ShopViewProps } from '../src/shop/viewprops.ts'
import { closeServer, loadModule, render } from './helpers/ssr.ts'

after(closeServer)

const noop = () => {}
const props = (state: ShopViewProps['state'], value = ''): ShopViewProps => ({ state, value, onChange: noop, onSubmit: noop, onExample: noop, onRetry: noop })
const mod = () =>
  loadModule<{
    default: ComponentType<ShopViewProps>
    ProductImageView: ComponentType<{ src: string; alt: string; failed: boolean }>
  }>('/src/shop/ShopView.tsx')
const escaped = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

test('empty state: a labelled form, example chips, the limitations notice, no results', async () => {
  const { default: View } = await mod()
  const html = render(View, props(fixtureStates.empty))
  assert.match(html, /<label[^>]*for="[^"]+"[^>]*>What are you looking for\?<\/label>/)
  assert.match(html, /<input id="([^"]+)"/)
  assert.match(html, /modern couch under \$1000/)
  assert.match(html, /boho curtains/)
  assert.match(html, /Type a request or pick an example/)
  assert.ok(html.includes(escaped(LIMITATIONS_NOTICE)))
  assert.doesNotMatch(html, /shop-grid/)
})

test('the submit button is disabled with no text, and while a search runs', async () => {
  const { default: View } = await mod()
  assert.match(render(View, props(fixtureStates.empty, '')), /<button type="submit"[^>]*disabled/)
  assert.doesNotMatch(render(View, props(fixtureStates.empty, 'a couch')), /<button type="submit"[^>]*disabled/)
  assert.match(render(View, props(fixtureStates.running, 'a couch')), /<button type="submit"[^>]*disabled/)
})

test('running: named steps (done, active with counts, pending, skipped) and a polite live region', async () => {
  const { default: View } = await mod()
  const html = render(View, props(fixtureStates.running))
  assert.match(html, /role="status" aria-live="polite"/)
  assert.match(html, /Searching for “modern couch under \$1000”/)
  assert.match(html, /Searching/)
  assert.match(html, /Tagging 12\/40/)
  assert.match(html, /Ranking/)
  assert.match(html, /Checking style \(skipped\)/)
  assert.match(html, /is-active/)
  assert.match(html, /aria-current="step"/)
  assert.match(render(View, props(fixtureStates.slow)), /taking longer than usual/)
})

test('results: a card per item with price, seller, stars, also-at, count, notices and the grid', async () => {
  const { default: View } = await mod()
  const html = render(View, props(fixtureStates.results))
  assert.equal(html.match(/class="shop-card"/g)?.length, fixtureItems.length)
  assert.match(html, /4 results for “modern couch under \$1000”/)
  assert.match(html, /\$899/)
  assert.match(html, /\$749\.99/)
  assert.match(html, /Price not listed/)
  assert.match(html, /Example Home Co\./)
  assert.match(html, /★ 4\.6 \(1,284\)/)
  assert.match(html, /Also at: Sample Furniture \$929, Demo Living \$949\.50/)
  assert.match(html, /This looks like a new topic/)
  assert.match(html, /Only 4 of the 12 results/)
  assert.match(html, /Four modern couches, mostly under/)
})

test('Open links: new tab, noopener noreferrer, only for safe http(s) links', async () => {
  const { default: View } = await mod()
  const html = render(View, props(fixtureStates.results))
  const links = [...html.matchAll(/<a [^>]*class="btn btn-secondary shop-open"[^>]*>/g)].map((m) => m[0])
  assert.equal(links.length, 3, 'the item with a javascript: link has no Open link')
  for (const a of links) {
    assert.match(a, /target="_blank"/)
    assert.match(a, /rel="noopener noreferrer"/)
    assert.match(a, /href="https:\/\/example\.com\//)
  }
  assert.doesNotMatch(html, /javascript:/)
})

test('images: lazy, no-referrer, alt from the title; none or a failed image shows the placeholder', async () => {
  const { default: View, ProductImageView } = await mod()
  const html = render(View, props(fixtureStates.results))
  const imgs = [...html.matchAll(/<img [^>]*>/g)].map((m) => m[0])
  assert.equal(imgs.length, 3, 'the item with no thumbnail has no <img>')
  for (const img of imgs) {
    assert.match(img, /loading="lazy"/)
    assert.match(img, /referrerPolicy="no-referrer"|referrerpolicy="no-referrer"/)
    assert.match(img, /alt="[^"]+"/)
  }
  assert.match(html, /alt="Sample Arc velvet sofa"/)
  assert.match(html, /No image for Demo Studio apartment loveseat/)
  const failed = render(ProductImageView, { src: 'https://images.example.com/x.jpg', alt: 'A sofa', failed: true })
  assert.doesNotMatch(failed, /<img/)
  assert.match(failed, /shop-thumb-empty/)
  assert.match(render(ProductImageView, { src: 'https://images.example.com/x.jpg', alt: 'A sofa', failed: false }), /<img/)
})

test('no results: the honest message from the server, and no grid', async () => {
  const { default: View } = await mod()
  const html = render(View, props(fixtureStates.none))
  assert.match(html, /0 results/)
  assert.match(html, new RegExp(fixtureNoResults.search?.headline ?? 'x'))
  assert.doesNotMatch(html, /shop-grid/)
})

test('error: an alert with the server message and a retry button; never raw JSON', async () => {
  const { default: View } = await mod()
  const html = render(View, props(fixtureStates.error))
  assert.match(html, /role="alert"/)
  assert.match(html, /Too many searches from your address today/)
  assert.match(html, /Try again/)
  assert.doesNotMatch(html, /\{"error"/)
})
