// Invented products for tests and the dev-only /shop?fixture=... states. No real stores or image hosts.
import type { RatingsState } from './ratings.ts'
import type { Banner, ShopState } from './state.ts'
import type { SessionView, ShopItem } from './types.ts'

const art = (fill: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="${fill}"/><rect x="20" y="50" width="80" height="35" rx="6" fill="#ffffff" fill-opacity=".7"/></svg>`)}`

export const fixtureItems: ShopItem[] = [
  {
    id: 'fx-1',
    title: 'Example Loft 3-seat sofa in oatmeal boucle with a very long product name to check wrapping',
    price: 899,
    currency: 'USD',
    seller: 'Example Home Co.',
    thumbnail_url: art('#c9b79c'),
    link: 'https://example.com/product/loft-sofa',
    link_kind: 'google_panel',
    rating: 4.6,
    rating_count: 1284,
    also_at: [
      { seller: 'Sample Furniture', price: 929 },
      { seller: 'Demo Living', price: 949.5 },
    ],
  },
  {
    id: 'fx-2',
    title: 'Sample Arc velvet sofa',
    price: 749.99,
    currency: 'USD',
    seller: 'Sample Furniture',
    thumbnail_url: art('#3c5a87'),
    link: 'https://example.com/product/arc-sofa',
    link_kind: 'retailer',
    size_hint: '84 in wide',
    rating: null,
    rating_count: null,
  },
  {
    id: 'fx-3',
    title: 'Demo Studio apartment loveseat',
    price: null,
    seller: 'Demo Living',
    thumbnail_url: '',
    link: 'https://example.com/product/loveseat',
    link_kind: 'google_panel',
    rating: 4.1,
    rating_count: 36,
  },
  {
    id: 'fx-4',
    title: 'Placeholder Sectional with a broken image',
    price: 1199,
    currency: 'USD',
    seller: 'Placeholder Interiors',
    thumbnail_url: 'https://images.example.com/missing/sectional.jpg',
    link: 'javascript:alert(1)',
    link_kind: 'none',
    rating: 3.9,
    rating_count: 8,
  },
]

export const fixtureView: SessionView = {
  session_id: 'fixture-session',
  search: {
    request: 'modern couch under $1000',
    headline: 'Four modern couches, mostly under $1,000.',
    topic_notice: 'This looks like a new topic, so earlier ratings were not used.',
    warnings: ['Only 4 of the 12 results you asked for matched the price limit.'],
    query: {
      search_text: 'modern couch',
      category: 'sofa',
      price_max: 1000,
      style_terms: ['modern'],
      material_terms: ['boucle'],
      color_terms: ['oatmeal'],
      avoid: ['walmart'],
      must_have: ['3-seat'],
    },
    results: fixtureItems,
  },
  refine: [
    { id: 'rf-1', kind: 'avoid', label: 'No Walmart', text: 'no Walmart' },
    { id: 'rf-2', kind: 'focus', label: 'Focus on cream', text: 'focus on cream', approximate: true },
  ],
  can_shop_again: true,
  shop_agains_used: 0,
  shop_agains_cap: 5,
}

export const fixtureBatch2: SessionView = {
  session_id: 'fixture-session',
  search: {
    request: 'modern couch under $1000',
    kind: 'shop_again',
    headline: 'Three more couches, leaning cream and wood.',
    results: [
      { ...fixtureItems[1], id: 'fx-5', title: 'Sample Cream Boucle sofa', price: 679, thumbnail_url: art('#e8dfd0') },
      { ...fixtureItems[0], id: 'fx-6', title: 'Example Walnut-leg loveseat', price: 589, thumbnail_url: art('#8a6a4f'), also_at: [] },
      { ...fixtureItems[2], id: 'fx-7', title: 'Demo Oak frame couch', price: 810, thumbnail_url: art('#b08a5a') },
    ],
  },
  refine: [{ id: 'rf-3', kind: 'focus', label: 'More wood', text: 'more wood' }],
  can_shop_again: true,
  shop_agains_used: 1,
  shop_agains_cap: 5,
}

export const fixtureNoResults: SessionView = {
  session_id: 'fixture-session',
  search: { request: 'purple unicorn couch under $5', headline: 'No products matched that request.', results: [] },
}

const steps = (states: ('done' | 'active' | 'pending' | 'skipped')[]) =>
  ['Searching', 'Tagging', 'Ranking', 'Checking style'].map((label, i) => ({
    id: label.toLowerCase(),
    label,
    state: states[i],
    done_count: states[i] === 'active' && i === 1 ? 12 : null,
    total: states[i] === 'active' && i === 1 ? 40 : null,
  }))

const rated = (rating: 'love' | 'like' | 'dislike' | null, comment = '', save: 'idle' | 'saving' | 'saved' | 'failed' = 'saved', error: string | null = null) => ({
  rating,
  comment,
  savedComment: save === 'failed' ? '' : comment,
  save,
  error,
})

const ratedCards: RatingsState = {
  'fx-1': rated('love', 'Great colour, but check the depth.'),
  'fx-2': rated('like', '', 'saving'),
  'fx-3': rated('dislike', 'Too small', 'failed', 'Could not save your rating. Check your connection and try again.'),
}

const done = (view: SessionView, batch: number, ratings: RatingsState = {}, banner: Banner | null = null): ShopState => ({
  status: 'done',
  request: 'modern couch under $1000',
  view,
  batch,
  ratings,
  banner,
  fresh: false,
})

export const fixtureStates: Record<string, ShopState> = {
  empty: { status: 'idle', restoring: false },
  running: { status: 'running', request: 'modern couch under $1000', kind: 'search', batch: 1, prev: null, phase: 'tagging', startedAt: Date.now() - 12_000, slow: false, steps: steps(['done', 'active', 'pending', 'skipped']) },
  slow: { status: 'running', request: 'modern couch under $1000', kind: 'search', batch: 1, prev: null, phase: 'ranking', startedAt: Date.now() - 65_000, slow: true, steps: steps(['done', 'done', 'active', 'skipped']) },
  results: done(fixtureView, 1),
  none: { status: 'done', request: 'purple unicorn couch under $5', view: fixtureNoResults, batch: 1, ratings: {}, banner: null, fresh: false },
  error: { status: 'error', request: 'modern couch under $1000', message: 'Too many searches from your address today. Please try again tomorrow.', retryAfterS: null, resetsAt: null },
  // Part 2
  rated: done(fixtureView, 1, ratedCards),
  again: {
    status: 'running',
    request: 'modern couch under $1000',
    kind: 'shop_again',
    batch: 2,
    prev: { view: fixtureView, batch: 1, ratings: ratedCards },
    phase: 'ranking',
    startedAt: Date.now() - 9_000,
    slow: false,
    steps: steps(['done', 'done', 'active', 'skipped']),
  },
  batch2: done(fixtureBatch2, 2, { 'fx-5': rated('like') }),
  cap: done(fixtureView, 1, ratedCards, {
    message: 'You have used all of your Shop Again searches for today.',
    retryAfterS: null,
    resetsAt: '2026-11-01T00:00:00+00:00',
  }),
}
