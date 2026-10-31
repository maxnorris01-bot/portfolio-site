import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import type { ComponentType } from 'react'
import { fixtureNoResults, fixtureStates, fixtureItems } from '../src/shop/fixtures.ts'
import { LIMITATIONS_NOTICE } from '../src/shop/copy.ts'
import type { ShopViewProps } from '../src/shop/viewprops.ts'
import { closeServer, loadModule, render } from './helpers/ssr.ts'

after(closeServer)

const noop = () => {}
const props = (state: ShopViewProps['state'], value = ''): ShopViewProps => ({
  state,
  value,
  onChange: noop,
  onSubmit: noop,
  onExample: noop,
  onRetry: noop,
  refineText: '',
  onRefineChange: noop,
  onShopAgain: noop,
  onRate: noop,
  onComment: noop,
  onCommentBlur: noop,
  onRetryRating: noop,
  onRemoveRefine: noop,
  onRemoveContext: noop,
})
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

test('rating group: a labelled radio group per card, one tab stop, selected state in aria-checked and a check mark', async () => {
  const { default: View } = await mod()
  const html = render(View, props(fixtureStates.rated))
  assert.equal(html.match(/role="radiogroup"/g)?.length, 4)
  assert.match(html, /aria-label="Rate Sample Arc velvet sofa"/)
  // fx-1 is rated Love: Love is checked and focusable, the others are not.
  const group = html.split('role="radiogroup"')[1]
  assert.match(group, /aria-checked="true"[^>]*tabindex="0"[^>]*class="shop-rate-btn is-love is-on"|tabindex="0"[^>]*aria-checked="true"/)
  assert.equal((group.match(/tabindex="0"/g) ?? []).length, 1)
  assert.equal((group.match(/aria-checked="true"/g) ?? []).length, 1)
  // An unrated card still has exactly one tab stop (the first radio).
  const unrated = html.split('role="radiogroup"')[4]
  assert.equal((unrated.split('</div>')[0].match(/tabindex="0"/g) ?? []).length, 1)
  assert.equal((unrated.split('</div>')[0].match(/aria-checked="true"/g) ?? []).length, 0)
  for (const name of ['Love', 'Like', 'Dislike']) assert.match(html, new RegExp(`>${name}</button>`))
})

test('comment field: only after a rating is chosen, labelled, limited to 200 characters, with the saved text', async () => {
  const { default: View } = await mod()
  const html = render(View, props(fixtureStates.rated))
  assert.equal(html.match(/shop-comment-input/g)?.length, 3, 'three rated cards, one unrated')
  assert.match(html, /Comment on Example Loft 3-seat sofa/)
  assert.match(html, /maxLength="200"|maxlength="200"/)
  assert.match(html, /value="Great colour, but check the depth\."/)
  assert.doesNotMatch(render(View, props(fixtureStates.results)).replace(/shop-comment-input/g, ''), /Add a short comment/)
})

test('save indicators: Saved, Saving…, and a failed save with its reason and a Retry button', async () => {
  const { default: View } = await mod()
  const html = render(View, props(fixtureStates.rated))
  assert.match(html, /Saved/)
  assert.match(html, /Saving…/)
  assert.match(html, /role="alert"[^>]*>\s*<span>Could not save your rating\./)
  assert.match(html, /<button type="button" class="shop-link">Retry<\/button>/)
})

const againButton = (html: string) => html.match(/<button type="submit"[^>]*>Shop Again/)?.[0] ?? 'NO BUTTON'

test('Shop Again: refine box labelled with its placeholder; button off with nothing rated, on once something is rated, off while a save is pending', async () => {
  const { default: View } = await mod()
  const none = render(View, props(fixtureStates.results))
  assert.match(none, /<label[^>]*>Refine your search<\/label>/)
  assert.match(none, /placeholder="more wood, no glass"/)
  assert.match(againButton(none), /disabled=""/)
  assert.match(none, /Rate at least one result first\./)
  const rated = fixtureStates.rated
  assert.ok(rated.status === 'done')
  const ready = render(View, props({ ...rated, ratings: { 'fx-1': { ...rated.ratings['fx-1'] } } }))
  assert.doesNotMatch(againButton(ready), /disabled/)
  assert.match(ready, /Items you have seen are not repeated/)
  const saving = render(View, props(rated))
  assert.match(saving, /Saving your ratings…/)
  assert.match(againButton(saving), /disabled=""/)
})

test('chips: what the server understood and the refinements, as plain text with Remove buttons only where a route exists', async () => {
  const { default: View } = await mod()
  const html = render(View, props(fixtureStates.results))
  assert.match(html, /What I understood/)
  for (const label of ['sofa', 'Up to \\$1,000', 'modern', 'Material: boucle', 'Colour: oatmeal', 'Must have: 3-seat', 'Avoid: walmart']) assert.match(html, new RegExp(label))
  assert.match(html, /Your refinements/)
  assert.match(html, /No Walmart/)
  assert.match(html, /Focus on cream \(approximate\)/)
  assert.match(html, /aria-label="Remove Material: boucle"/)
  assert.match(html, /aria-label="Remove No Walmart"/)
  assert.doesNotMatch(html, /aria-label="Remove modern"/, 'style terms have no remove route')
  assert.doesNotMatch(html, /aria-label="Remove Must have/)
})

test('batch counter, and the batch 2 grid', async () => {
  const { default: View } = await mod()
  assert.match(render(View, props(fixtureStates.results)), /Batch 1/)
  const html = render(View, props(fixtureStates.batch2))
  assert.match(html, /Batch 2/)
  assert.match(html, /Sample Cream Boucle sofa/)
  assert.match(html, /More wood/)
})

test('Shop Again running: the same steps and timer as a search, named for the batch', async () => {
  const { default: View } = await mod()
  const html = render(View, props(fixtureStates.again))
  assert.match(html, /Finding batch 2 for “modern couch under \$1000”/)
  assert.match(html, /Ranking/)
  assert.match(html, /shop-timer/)
  assert.match(html, /<button type="submit"[^>]*disabled/)
})

test('limit banners: the server message, the reset time for cap_reached, Retry-After for rate_limited; results stay', async () => {
  const { default: View } = await mod()
  const html = render(View, props(fixtureStates.cap))
  assert.match(html, /role="alert"[^>]*>\s*<p>You have used all of your Shop Again searches for today\./)
  assert.match(html, /Your allowance comes back at Nov 1, 12:00 AM UTC/)
  assert.match(html, /Example Home Co\./)
  const cap = fixtureStates.cap
  assert.ok(cap.status === 'done')
  const rate = render(View, props({ ...cap, banner: { message: 'Slow down a little.', retryAfterS: 20, resetsAt: null } }))
  assert.match(rate, /Slow down a little\./)
  assert.match(rate, /try again in about 20 s/)
})
