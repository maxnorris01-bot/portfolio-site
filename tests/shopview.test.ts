import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { after, test } from 'node:test'
import type { ComponentType } from 'react'
import { fixtureNoResults, fixtureStates, fixtureItems } from '../src/shop/fixtures.ts'
import { ABOUT_ROWS, ABOUT_TITLE, GUARDRAILS_NOTE, LIMITATIONS_NOTICE, PIPELINE_NOTE, PIPELINE_STAGES, SHOP_CHIPS, SHOP_DESCRIPTION, SHOP_TITLE } from '../src/shop/copy.ts'
import type { ShopViewProps } from '../src/shop/viewprops.ts'
import type { ItemRating } from '../src/shop/ratings.ts'
import type { ShopItem } from '../src/shop/types.ts'
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
  onRetryRating: noop,
  onRemoveRefine: noop,
  onAnswer: noop,
  onSubmitAnswers: noop,
  onRetryAnswers: noop,
  onSearchFilters: noop,
  onSaveFilters: noop,
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
    ProductCard: ComponentType<{ item: ShopItem; entry?: ItemRating; handlers?: object; pop?: { openId: string | null; dispatch: (e: never) => void } }>
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

test('running: labelled steps (plain words) (done, active with counts, pending, skipped) and a polite live region', async () => {
  const { default: View } = await mod()
  const html = render(View, props(fixtureStates.running))
  assert.match(html, /role="status" aria-live="polite"/)
  assert.match(html, /Searching for “modern couch under \$1000”/)
  assert.match(html, /Finding products/)
  assert.match(html, /Checking photos 12\/40/)
  assert.match(html, /Picking the best/)
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

test('no comments: rating never opens anything, and no card has a comment field, link, popover or reserved line', async () => {
  const { default: View, ProductCard } = await mod()
  for (const key of ['rated', 'results'] as const) {
    const html = render(View, props(fixtureStates[key]))
    assert.doesNotMatch(html, /shop-comment|shop-pop|role="dialog"|<textarea|Add a comment|Comment saved|Comment on /i, key)
  }
  const fx = fixtureStates.rated
  assert.ok(fx.status === 'done')
  const handlers = { onRate: noop, onRetryRating: noop }
  const card = render(ProductCard, { item: fixtureItems[0], entry: fx.ratings['fx-1'], handlers })
  assert.doesNotMatch(card, /aria-expanded|aria-controls|<textarea/)
  const src = readFileSync(new URL('../src/shop/ShopView.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /comment|Comment/, 'the view holds no comment code')
  assert.ok(!existsSync(new URL('../src/shop/commentpop.ts', import.meta.url)), 'the popover rules are gone')
})

test('card layout (source): eight subgrid rows, a subgrid fallback, equal rating columns, no comment rows or popover styles', () => {
  const css = readFileSync(new URL('../src/pages/Shop.css', import.meta.url), 'utf8')
  const rule = (sel: string) => css.match(new RegExp(`\\n${sel.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`))?.[1] ?? ''
  const card = rule('.shop-card')
  assert.match(card, /grid-row: span 8/)
  assert.match(card, /grid-template-rows: subgrid/)
  assert.match(css, /@supports not \(grid-template-rows: subgrid\)[\s\S]*margin-top: auto/)
  assert.match(rule('.shop-grid'), /row-gap: 0/)
  assert.match(rule('.shop-rate'), /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/, 'the check on the chosen button changes no width')
  assert.doesNotMatch(css, /shop-comment|\.shop-pop|has-pop/)
  // Eight sections, in order, in the card's markup.
  const src = readFileSync(new URL('../src/shop/ShopView.tsx', import.meta.url), 'utf8')
  const card8 = src.slice(src.indexOf('<li className="shop-card">'), src.indexOf('</li>', src.indexOf('<li className="shop-card">')))
  const order = ['<ProductImage', 'shop-card-title', 'shop-card-price', 'shop-cell">\n        <p', 'shop-cell">{rating', 'shop-cell shop-extra', 'shop-open-cell', 'shop-rate-cell']
  let at = -1
  for (const key of order) {
    const i = card8.indexOf(key)
    assert.ok(i > at, `${key} comes in order`)
    at = i
  }
})

test('save indicator: only a failed save shows, with its reason and a Retry button; Saved and Saving… are not shown on the card', async () => {
  const { default: View } = await mod()
  const html = render(View, props(fixtureStates.rated))
  assert.match(html, /role="alert"[^>]*title="Could not save your rating\.[^"]*"><span>Could not save\.<\/span>/)
  assert.match(html, /<button type="button" class="shop-link">Retry<\/button>/)
  assert.equal(html.match(/class="shop-save /g)?.length, 1, 'one indicator, the failed one')
  assert.doesNotMatch(html, />Saved<|>Saving…</)
})

const againButton = (html: string) => html.match(/<button type="button" class="btn btn-primary shop-again-button"[^>]*>Shop Again/)?.[0] ?? 'NO BUTTON'

test('Shop Again: on with nothing rated (the hint is its title), off while a save is pending; the old bottom bar is gone', async () => {
  const { default: View } = await mod()
  const none = render(View, props(fixtureStates.results))
  assert.doesNotMatch(none, /class="shop-again"|placeholder="more wood, no glass"/, 'the refine text box lives in the Refine search dialog now')
  assert.doesNotMatch(againButton(none), /disabled/)
  assert.match(againButton(none), /title="Rate results to steer the next batch, or just search again\."/)
  assert.doesNotMatch(none, /Rate at least one result first\./)
  const rated = fixtureStates.rated
  assert.ok(rated.status === 'done')
  const saving = render(View, props(rated))
  assert.match(saving, /Saving your ratings…/)
  assert.match(againButton(saving), /disabled=""/)
  // The service's word: false is believed once something is rated; with nothing rated an older service's false is ignored.
  const ready = { ...rated, ratings: { 'fx-1': { ...rated.ratings['fx-1'], save: 'saved' as const } } }
  assert.doesNotMatch(againButton(render(View, props({ ...ready, view: { ...ready.view, can_shop_again: true } }))), /disabled/)
  assert.match(againButton(render(View, props({ ...ready, view: { ...ready.view, can_shop_again: false } }))), /disabled=""/)
  const unrated = fixtureStates.results
  assert.ok(unrated.status === 'done')
  assert.doesNotMatch(againButton(render(View, props({ ...unrated, view: { ...unrated.view, can_shop_again: false, shop_agains_used: 0, shop_agains_cap: 25 } }))), /disabled/)
})

test('chips: one row of what the search used: plain facts without a Remove button, removable terms and refinements with one', async () => {
  const { default: View } = await mod()
  const html = render(View, props(fixtureStates.results))
  assert.match(html, /What I(&#x27;|')m searching for/)
  for (const label of ['sofa', 'Up to \\$1,000', 'modern', 'Material: boucle', 'Colour: oatmeal', 'Must have: 3-seat']) assert.match(html, new RegExp(label))
  assert.match(html, /No Walmart/)
  assert.doesNotMatch(html, /Avoid: walmart/, 'the refinement replaces the same-term parsed chip')
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
  assert.match(html, /Picking the best/)
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

test('Saved row: a heading with the total, Loved and Liked tabs with counts, compact items with picture, title and price, above the grid', async () => {
  const html = await view('saved')
  assert.match(html, /<h2[^>]*>Saved <span class="shop-saved-total">\(4\)<\/span><\/h2>/)
  assert.match(html, /role="tablist" aria-label="Saved results"/)
  assert.match(html, /role="tab" aria-selected="true"[^>]*tabindex="0"[^>]*>Loved \(2\)<\/button>/)
  assert.match(html, /role="tab" aria-selected="false"[^>]*tabindex="-1"[^>]*>Liked \(2\)<\/button>/)
  assert.ok(html.indexOf('class="card shop-saved"') < html.indexOf('class="shop-grid"'), 'the Saved row is above the results')
  assert.ok(html.indexOf('</header>') < html.indexOf('class="card shop-saved"'), 'and under the header card')
  const panel = html.split('role="tabpanel"')[1].split('</section>')[0].split('class="shop-saved-all"')[0]
  assert.match(panel, /Example Boho curtain panel set/)
  assert.match(panel, /\$64/)
  assert.doesNotMatch(panel, /Sample Arc velvet sofa/, 'liked items are on the other tab')
  assert.match(panel, /<a class="shop-mini-link"[^>]*rel="noopener noreferrer"/)
  assert.match(panel, /<img /)
})

test('Saved row: the Liked tab, the empty state, and "Show all ›" / "Show fewer ‹" with aria-expanded', async () => {
  const liked = await view('savedliked')
  const panel = liked.split('role="tabpanel"')[1].split('class="shop-saved-all"')[0]
  assert.match(panel, /Sample Arc velvet sofa/)
  assert.match(panel, /Sample Linen curtains/)
  const empty = await view('savedempty')
  assert.match(empty, /Loved \(0\)/)
  assert.match(empty, /Love or like results to see them here\./)
  assert.doesNotMatch(empty, /shop-saved-toggle/, 'nothing to expand')
  assert.match(await view('savedempty', { savedTab: 'like' }), /Love or like results to see them here\./)
  const closed = await view('saved', { savedOpen: false })
  assert.match(closed, /aria-expanded="false"[^>]*>Show all ›<\/button>/)
  assert.match(closed, /<div id="[^"]+-all" class="shop-saved-all" hidden="">/)
  const open = await view('saved', { savedOpen: true })
  assert.match(open, /aria-expanded="true"[^>]*>Show fewer ‹<\/button>/)
  assert.doesNotMatch(open, /class="shop-saved-all" hidden/)
  assert.match(open, /class="shop-saved-card"/, 'the full cards are the existing ones')
  assert.doesNotMatch(closed, /<button[^>]*>(Hide|Show)<\/button>/)
})

test('guardrails: what the service reports for the visit (searches and Shop Agains allowed, the daily reset), else its defaults; never a dollar amount', async () => {
  const withUsage = await view('empty', { meta: { usage: { maxSearches: 8, maxShopAgains: 25, resetsAt: '2026-11-02T17:00:00Z' }, blocked: { search: false, again: false }, maintenance: false } })
  assert.match(withUsage, /<dt>Searches per visit<\/dt><dd>8<\/dd>/)
  assert.match(withUsage, /<dt>Shop Agains per visit<\/dt><dd>25<\/dd>/)
  assert.match(withUsage, /<dt>Daily limit resets<\/dt><dd>[^<]+<\/dd>/)
  assert.doesNotMatch(withUsage, /\$0\.|usd/i)
  // A fresh visit has no usage block: the card still has its rows, from the service's defaults (limits.ts).
  const fresh = await view('savedempty')
  assert.match(fresh, /<dt>Searches per visit<\/dt><dd>8<\/dd>/)
  assert.match(fresh, /<dt>Shop Agains per visit<\/dt><dd>25<\/dd>/)
  assert.match(fresh, /<dt>Daily limit resets<\/dt>/)
  assert.doesNotMatch(fresh, /\$0\.|usd/i)
})

test('idle page: the usage line under the form stays (searches, Shop Agains, the daily reset; never a dollar amount) and there is no usage chip', async () => {
  const html = await view('empty')
  const line = html.match(/<p class="shop-usage"[^>]*>(.*?)<\/p>/)?.[1] ?? ''
  assert.match(line, /^Searches used: 0 of 8 · Shop Agains: 0 of 25 · Daily limit resets at \d{1,2}:\d{2} [AP]M$/)
  assert.doesNotMatch(html, /\$0\.|used_usd|cap_usd|usd/i)
  assert.doesNotMatch(html, /class="usage"|usage-chip|shop-head/)
  assert.doesNotMatch(await view('empty', { meta: { usage: null, blocked: { search: false, again: false }, maintenance: false } }), /shop-usage/, 'no line without usage data (a visit not started yet)')
})

test('results page: the usage line under the form is hidden; the chip in the header says "X of Y" and never wraps, the popover lists the limits', async () => {
  const html = await view('results')
  assert.doesNotMatch(html, /<p class="shop-usage"/)
  assert.match(html, /<button type="button" class="usage-chip" aria-expanded="false" aria-controls="([^"]+)" aria-haspopup="dialog" aria-label="Usage this visit: 0 of 8 searches">.*<span class="usage-chip-text">0 of 8<\/span><\/button>/s)
  const pop = html.match(/<div id="[^"]+" class="usage-pop" role="dialog" aria-label="Today&#x27;s limits" hidden="">(.*?)<\/div>/)?.[1] ?? ''
  assert.match(pop, /^<p class="usage-pop-title">Today&#x27;s limits<\/p><p>Searches: 0 of 8<\/p><p>Shop Agains: 0 of 25<\/p><p>Daily limit resets at \d{1,2}:\d{2} [AP]M<\/p>$/)
  assert.doesNotMatch(html, /\$0\.|usd/i)
  assert.equal(html.match(/aria-controls="([^"]+)"/)?.[1] ?? 'x', html.match(/class="usage-pop"/) ? html.match(/<div id="([^"]+)" class="usage-pop"/)?.[1] : 'y', 'aria-controls points at the popover')
  const { readFileSync } = await import('node:fs')
  const css = readFileSync(new URL('../src/pages/Shop.css', import.meta.url), 'utf8')
  assert.match(css.match(/\.usage-chip \{[^}]*\}/)?.[0] ?? '', /white-space: nowrap/)
  assert.match(css.match(/\.usage-chip-text \{[^}]*\}/)?.[0] ?? '', /white-space: nowrap/)
  assert.match(css.match(/\.shop-head-right \{[^}]*\}/)?.[0] ?? '', /flex: none/)
  assert.match(css.match(/\.shop-head-cluster \{[^}]*\}/)?.[0] ?? '', /flex-wrap: nowrap/, 'the right cluster never wraps inside')
  assert.match(css, /@media \(max-width: 699px\) \{\s*\.shop-head-left \{\s*flex-basis: 100%;[^}]*\}\s*\.shop-head-right \{\s*flex-basis: 100%;/, 'under 700px the cluster drops under the headline')
})

test('usage chip: the limit styling and the limit messages when a cap is reached', async () => {
  const html = await view('limit')
  assert.match(html, /class="usage-chip is-limit"/)
  assert.match(html, /<span class="usage-chip-text">8 of 8<\/span>/)
  assert.match(html, /<p>Searches: 8 of 8<\/p>/)
  assert.match(html, /You have reached your limit for today\./, 'the existing message stays')
  assert.doesNotMatch(await view('results'), /usage-chip is-limit/)
})

test('limit reached: the friendly sentence with the reset time, and the Search, example and Shop Again buttons are off', async () => {
  const html = await view('limit')
  assert.match(html, /You have reached your limit for today\. It resets at \d{1,2}:\d{2} [AP]M\./)
  assert.match(html, /<button type="submit" class="btn btn-primary shop-submit" disabled="">Search/)
  assert.doesNotMatch(html, /Example requests/, 'results are showing: no example chips')
  assert.match(againButton(html), /disabled=""/)
  assert.match(html, /Searches: 8 of 8/)
})

test('maintenance: a paused notice and no way to start a search', async () => {
  const html = await view('maintenance')
  assert.match(html, /ShopAI is paused right now\. Please try again later\./)
  assert.match(html, /<button type="submit" class="btn btn-primary shop-submit" disabled="">Search/)
  assert.match(html, /<button type="button" class="chip shop-chip" disabled="">/, 'the example chips (empty page) are off')
})

test('Open links on Google pages say so only to the click handler: the link itself is the result link, new tab, noopener', async () => {
  const html = await view('results')
  assert.match(html, /href="https:\/\/example\.com\/product\/loft-sofa" target="_blank" rel="noopener noreferrer"/)
})

test('the page has the same "View on GitHub ↗" button as SatPOV, opening the room-redesign-agent repo in a new tab', async () => {
  const { SHOP_REPO_URL } = await loadModule<{ SHOP_REPO_URL: string }>('/src/shop/copy.ts')
  assert.equal(SHOP_REPO_URL, 'https://github.com/maxnorris01-bot/room-redesign-agent')
  const { default: View } = await mod()
  const html = render(View, props(fixtureStates.empty))
  const tag = html.match(/<a [^>]*class="btn btn-secondary shop-github"[^>]*>View on GitHub ↗<\/a>/)?.[0] ?? ''
  assert.ok(tag, 'the button is rendered')
  assert.ok(tag.includes(`href="${SHOP_REPO_URL}"`))
  assert.match(tag, /target="_blank"/)
  assert.match(tag, /rel="noreferrer"/)
})
