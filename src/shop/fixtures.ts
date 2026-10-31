// Invented products for tests and the dev-only /shop?fixture=... states. No real stores or image hosts.
import type { ShopState } from './state.ts'
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
    results: fixtureItems,
  },
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

export const fixtureStates: Record<string, ShopState> = {
  empty: { status: 'idle', restoring: false },
  running: { status: 'running', request: 'modern couch under $1000', phase: 'tagging', startedAt: Date.now() - 12_000, slow: false, steps: steps(['done', 'active', 'pending', 'skipped']) },
  slow: { status: 'running', request: 'modern couch under $1000', phase: 'ranking', startedAt: Date.now() - 65_000, slow: true, steps: steps(['done', 'done', 'active', 'skipped']) },
  results: { status: 'done', request: 'modern couch under $1000', view: fixtureView },
  none: { status: 'done', request: 'purple unicorn couch under $5', view: fixtureNoResults },
  error: { status: 'error', request: 'modern couch under $1000', message: 'Too many searches from your address today. Please try again tomorrow.', retryAfterS: null },
}
