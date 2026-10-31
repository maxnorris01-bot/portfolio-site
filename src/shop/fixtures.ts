// Invented products for tests and the dev-only /shop?fixture=... states. No real stores or image hosts.
import type { RatingsState } from './ratings.ts'
import type { ShopMeta } from './controller.ts'
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
    warnings: [],
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

/** A batch short of a typed finish, with the internal notices the server also sends (none of which may be shown). */
export const fixtureShortWarnings = [
  'Only 14 of 24 results match your finish warm wood: the pool had 14 that do and 3 results show no finish yet.',
  'Not mixing frame color: only 2 of the 24 new candidates have another frame color; the limit is off for this batch.',
  'Could not keep color under 80%: the pool is mostly black (31 of 40).',
  'Not mixing shape: the guard is off for this batch.',
]
export const fixtureShort: SessionView = {
  ...fixtureView,
  search: { ...(fixtureView.search as NonNullable<SessionView['search']>), warnings: fixtureShortWarnings },
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

const rated = (rating: 'love' | 'like' | 'dislike' | null, comment = '', save: 'idle' | 'saving' | 'saved' | 'failed' = 'saved', error: string | null = null, touched = 0) => ({
  rating,
  comment,
  savedComment: save === 'failed' ? '' : comment,
  save,
  error,
  touched,
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

// Items saved in an earlier search, to show in the Saved panel next to this batch's.
const earlier: SessionView['saved'] = [
  { ...fixtureItems[0], id: 'old-1', title: 'Example Boho curtain panel set', price: 64, seller: 'Example Home Co.', thumbnail_url: art('#d9c3a5'), link_kind: 'retailer', link: 'https://example.com/product/curtains', topic_label: 'boho curtains' },
  { ...fixtureItems[1], id: 'old-2', title: 'Sample Linen curtains, 96 in', price: 42.5, seller: 'Sample Furniture', thumbnail_url: art('#9fb0a0'), topic_label: 'boho curtains' },
]
const savedView: SessionView = { ...fixtureView, saved: earlier }
const savedRatings: RatingsState = {
  ...ratedCards,
  'fx-1': rated('love', 'Great colour, but check the depth.', 'saved', null, 3),
  'fx-2': rated('like', '', 'saved', null, 2),
  'fx-3': rated('dislike'),
  'old-1': rated('love'),
  'old-2': rated('like'),
}

const limitUsage = { maxSearches: 8, maxShopAgains: 25, resetsAt: '2026-11-01T00:00:00+00:00' }
const limitView: SessionView = { ...fixtureView, search_count: 9, shop_agains_used: 1, shop_agains_cap: 25 }

export const fixtureStates: Record<string, ShopState> = {
  empty: { status: 'idle', restoring: false },
  running: { status: 'running', request: 'modern couch under $1000', kind: 'search', batch: 1, prev: null, phase: 'tagging', startedAt: Date.now() - 12_000, slow: false, steps: steps(['done', 'active', 'pending', 'skipped']) },
  slow: { status: 'running', request: 'modern couch under $1000', kind: 'search', batch: 1, prev: null, phase: 'ranking', startedAt: Date.now() - 65_000, slow: true, steps: steps(['done', 'done', 'active', 'skipped']) },
  results: done(fixtureView, 1),
  none: { status: 'done', request: 'purple unicorn couch under $5', view: fixtureNoResults, batch: 1, ratings: {}, banner: null, fresh: false },
  error: { status: 'error', request: 'modern couch under $1000', message: 'Something went wrong on the server. Please try again.', retryAfterS: null, resetsAt: null, code: 'server_error', limit: null },
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
    message: 'Shop Again limit reached (25 per session)',
    retryAfterS: null,
    resetsAt: null,
    code: 'cap_reached',
    limit: 'shop_agains',
  }),
  // Part 3
  saved: done(savedView, 1, savedRatings),
  savedempty: done({ ...fixtureView, saved: [] }, 1, {}),
  short: done(fixtureShort, 1),
  limit: done(limitView, 1, {}, { message: 'Daily limit reached.', retryAfterS: null, resetsAt: '2026-11-01T00:00:00+00:00', code: 'cap_reached', limit: 'ip_day' }),
}

const clear: ShopMeta = { usage: null, blocked: { search: false, again: false }, maintenance: false }

/** What the dev page needs besides the state: the usage line, blocked buttons, the Saved panel's tab. */
export type FixtureBundle = { state: ShopState; meta: ShopMeta; savedTab?: 'love' | 'like' }

export const fixtureBundles: Record<string, FixtureBundle> = {
  ...Object.fromEntries(Object.entries(fixtureStates).map(([k, state]) => [k, { state, meta: { ...clear, usage: limitUsage } } satisfies FixtureBundle])),
  savedliked: { state: fixtureStates.saved, meta: clear, savedTab: 'like' },
  savedempty: { state: fixtureStates.savedempty, meta: clear },
  limit: { state: fixtureStates.limit, meta: { usage: limitUsage, blocked: { search: true, again: true }, maintenance: false } },
  maintenance: { state: fixtureStates.empty, meta: { usage: null, blocked: { search: true, again: true }, maintenance: true } },
}
