import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import type { ComponentType } from 'react'
import { fixtureNoResults, fixtureStates, fixtureItems } from '../src/shop/fixtures.ts'
import { ABOUT_ROWS, ABOUT_TITLE, GUARDRAILS_NOTE, LIMITATIONS_NOTICE, PIPELINE_NOTE, PIPELINE_STAGES, SHOP_CHIPS, SHOP_DESCRIPTION, SHOP_TITLE } from '../src/shop/copy.ts'
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
  meta: { usage: null, blocked: { search: false, again: false }, maintenance: false },
  savedOpen: true,
  onToggleSaved: noop,
  savedTab: 'love',
  onSavedTab: noop,
  onResolve: async () => null,
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
  // The header: the title, the tech chips, the project label and the description (the same block as SatPOV's); then the pipeline, with its notes.
  assert.equal(SHOP_TITLE, 'ShopAI Tool')
  assert.match(html, /<h1 class="page-title">ShopAI Tool<\/h1>/)
  for (const c of SHOP_CHIPS) assert.ok(html.includes(`<li class="chip">${c}</li>`), c)
  assert.ok(SHOP_CHIPS.length <= 6)
  assert.ok(html.includes(escaped(SHOP_DESCRIPTION)))
  assert.ok(SHOP_DESCRIPTION.length >= 280 && SHOP_DESCRIPTION.length <= 380)
  assert.ok(html.includes('>Search pipeline</h2>'))
  assert.equal(html.match(/class="card shop-stage"/g)?.length, PIPELINE_STAGES.length)
  for (const s of PIPELINE_STAGES) assert.ok(html.includes(`<h4>${s.name}</h4><p>${s.caption}</p>`), s.name)
  // The caveats are the old About note, in its own words, in two places (under the tiles and under the guardrails).
  assert.ok(html.includes(escaped(PIPELINE_NOTE)) && html.includes(escaped(GUARDRAILS_NOTE)))
  assert.equal(`${ABOUT_TITLE}. ${ABOUT_ROWS.map((r) => r.text).join(' ')}`, LIMITATIONS_NOTICE)
  assert.equal(`${PIPELINE_NOTE} ${GUARDRAILS_NOTE}`, LIMITATIONS_NOTICE.slice(ABOUT_TITLE.length + 2))
  assert.doesNotMatch(html, /shop-about/)
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

test('results: a card per item with price, seller, stars, also-at, count and the grid; no headline or notes box', async () => {
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
  assert.doesNotMatch(html, /Four modern couches, mostly under/, 'the headline is not shown')
  assert.doesNotMatch(html, /This looks like a new topic/, 'the topic notice is not shown')
  assert.doesNotMatch(html, /shop-headline|shop-notices|shop-short/)
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
  assert.match(html, /Something went wrong on the server\. Please try again\./)
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

test('a Shop Again limit: friendly text, the results stay, and no reset time is invented', async () => {
  const { default: View } = await mod()
  const html = render(View, props(fixtureStates.cap))
  assert.match(html, /role="alert"[^>]*>\s*<p>You have used all of your Shop Agains for this visit\./)
  assert.doesNotMatch(html, /Shop Again limit reached \(25 per session\)/, 'the server text is only a fallback')
  assert.match(html, /Example Home Co\./)
})

const view = async (key: string, over: Partial<ShopViewProps> = {}) => {
  const { default: View } = await mod()
  const { fixtureBundles } = await loadModule<{ fixtureBundles: Record<string, { state: ShopViewProps['state']; meta: ShopViewProps['meta']; savedTab?: 'love' | 'like' }> }>('/src/shop/fixtures.ts')
  const b = fixtureBundles[key]
  return render(View, { ...props(b.state), meta: b.meta, savedTab: b.savedTab ?? 'love', ...over })
}

test('no debug notice text appears anywhere in the rendered page, even when the server sends it', async () => {
  const html = await view('short')
  for (const debug of ['Not mixing', 'Could not keep', 'limit is off', 'guard is off', 'show no finish yet', 'the pool had', 'This looks like a new topic', 'Four modern couches', 'Only 4 new results']) {
    assert.ok(!html.includes(debug), debug)
  }
  assert.doesNotMatch(html, /How I decided|trace|diversity|seller_cap|filtered out/i)
})

test('the one shortfall line: shown for a missed typed finish, in plain words, once, above the grid', async () => {
  const html = await view('short')
  assert.equal(html.match(/class="shop-short"/g)?.length, 1)
  assert.match(html, /<p class="shop-short">Only 14 of 24 results match your finish warm wood\. That is all the stores had\.<\/p>/)
  assert.ok(html.indexOf('shop-short') < html.indexOf('shop-grid'))
  assert.doesNotMatch(await view('results'), /shop-short/)
})

test('Saved panel: a heading with the total, Loved and Liked tabs with counts, the loved items with image, title, price, seller and Open', async () => {
  const html = await view('saved')
  assert.match(html, /<h2[^>]*>Saved <span class="shop-saved-total">\(4\)<\/span><\/h2>/)
  assert.match(html, /role="tablist" aria-label="Saved results"/)
  assert.match(html, /role="tab" aria-selected="true"[^>]*tabindex="0"[^>]*>Loved \(2\)<\/button>/)
  assert.match(html, /role="tab" aria-selected="false"[^>]*tabindex="-1"[^>]*>Liked \(2\)<\/button>/)
  const panel = html.split('role="tabpanel"')[1].split('</section>')[0]
  assert.match(panel, /Example Home Co\./)
  assert.match(panel, /Example Boho curtain panel set/)
  assert.match(panel, /From “boho curtains”/)
  assert.match(panel, /\$64/)
  assert.doesNotMatch(panel, /Sample Arc velvet sofa/, 'liked items are on the other tab')
  assert.match(panel, /rel="noopener noreferrer"/)
  assert.match(panel, /<img /)
})

test('Saved panel: the Liked tab, the empty states, and the Show/Hide toggle with aria-expanded', async () => {
  const liked = await view('savedliked')
  const panel = liked.split('role="tabpanel"')[1]
  assert.match(panel, /Sample Arc velvet sofa/)
  assert.match(panel, /Sample Linen curtains/)
  const empty = await view('savedempty')
  assert.match(empty, /Loved \(0\)/)
  assert.match(empty, /Nothing loved yet\. Choose Love on a result to keep it here\./)
  assert.match(await view('savedempty', { savedTab: 'like' }), /Nothing liked yet\./)
  assert.match(await view('saved'), /aria-expanded="true"[^>]*>Hide<\/button>/)
  const hidden = await view('saved', { savedOpen: false })
  assert.match(hidden, /aria-expanded="false"[^>]*>Show<\/button>/)
  assert.match(hidden, /<div id="[^"]+-body" hidden="">/)
})

test('guardrails: what the service reports for the visit (searches and Shop Agains allowed, the daily reset); never a dollar amount; none without usage data', async () => {
  const withUsage = await view('empty', { meta: { usage: { maxSearches: 8, maxShopAgains: 25, resetsAt: '2026-11-02T17:00:00Z' }, blocked: { search: false, again: false }, maintenance: false } })
  assert.match(withUsage, /<dt>Searches per visit<\/dt><dd>8<\/dd>/)
  assert.match(withUsage, /<dt>Shop Agains per visit<\/dt><dd>25<\/dd>/)
  assert.match(withUsage, /<dt>Daily limit resets<\/dt><dd>[^<]+<\/dd>/)
  assert.doesNotMatch(withUsage, /\$0\.|usd/i)
  assert.doesNotMatch(await view('savedempty'), /shop-guard-card/)
})

test('usage line: searches, Shop Agains and the daily reset; never a dollar amount', async () => {
  const html = await view('results')
  const line = html.match(/<p class="shop-usage"[^>]*>(.*?)<\/p>/)?.[1] ?? ''
  assert.match(line, /^Searches used: 0 of 8 · Shop Agains: 0 of 25 · Daily limit resets at \d{1,2}:\d{2} [AP]M$/)
  assert.doesNotMatch(html, /\$0\.|used_usd|cap_usd|usd/i)
  assert.doesNotMatch(await view('savedempty'), /shop-usage/, 'no line without usage data (a visit not started yet)')
})

test('limit reached: the friendly sentence with the reset time, and the Search, example and Shop Again buttons are off', async () => {
  const html = await view('limit')
  assert.match(html, /You have reached your limit for today\. It resets at \d{1,2}:\d{2} [AP]M\./)
  assert.match(html, /<button type="submit" class="btn btn-primary shop-submit" disabled="">Search/)
  assert.match(html, /<button type="button" class="chip shop-chip" disabled="">/)
  assert.match(againButton(html), /disabled=""/)
  assert.match(html, /Searches used: 8 of 8/)
})

test('maintenance: a paused notice and no way to start a search', async () => {
  const html = await view('maintenance')
  assert.match(html, /Shop Mode is paused right now\. Please try again later\./)
  assert.match(html, /<button type="submit" class="btn btn-primary shop-submit" disabled="">Search/)
})

test('Open links on Google pages say so only to the click handler: the link itself is the result link, new tab, noopener', async () => {
  const html = await view('results')
  assert.match(html, /href="https:\/\/example\.com\/product\/loft-sofa" target="_blank" rel="noopener noreferrer"/)
})
