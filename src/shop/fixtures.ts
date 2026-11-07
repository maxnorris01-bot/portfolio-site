// Invented products for tests and the dev-only /shop?fixture=... states. No real stores or image hosts.
import type { RatingsState } from './ratings.ts'
import type { ShopMeta } from './controller.ts'
import type { ClarifyUi } from './clarify.ts'
import type { Banner, ShopState } from './state.ts'
import type { Selection } from './filters.ts'
import type { Clarify, ClarifyQuestion, Facet, SessionView, ShopItem } from './types.ts'

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

// Stage Q2: the clarifying questions, in the exact shape of the backend contract (room-redesign-agent PR #39), with invented pictures.
const deadline = { idle_grace_s: 6, max_wait_s: 40, waiting: false, seconds_left: null, shown_s_ago: 3.2 }
const opt = (label: string, value: string, fill: string | null) => ({ label, value, picture_url: fill ? art(fill) : null })
export const fixtureQuestions: ClarifyQuestion[] = [
  { id: 'q_color', text: 'Which colour do you like?', kind: 'choice', dimension: 'color', options: [opt('Cream', 'cream', '#e8dfd0'), opt('Walnut or brown', 'walnut', '#8a6a4f'), opt('Navy', 'navy', '#3c5a87'), opt('Sage green with a longer label', 'green', '#9fb0a0')] },
  { id: 'q_material', text: 'What should it be made of?', kind: 'choice', dimension: 'material', options: [opt('Boucle', 'boucle', '#d9c3a5'), opt('Velvet', 'velvet', '#6a3c5a'), opt('Leather', 'leather', null)] },
  { id: 'q_shape', text: 'Which shape do you want?', kind: 'choice', dimension: 'shape', options: [opt('Curved', 'curved', '#c9b79c'), opt('Straight', 'straight', '#b08a5a')] },
  { id: 'q_style', text: 'Which look do you prefer?', kind: 'choice', dimension: 'style', options: [opt('Modern', 'modern', '#9aa5b5'), opt('Mid-century', 'mid-century', '#a67c52'), opt('Traditional', 'traditional', '#7a5c4a')] },
  { id: 'q_size', text: 'How big should it be?', kind: 'size_range', dimension: 'size', options: [opt('Under 70 in', 'under 70 in', null), opt('70 to 85 in', '70 to 85 in', null), opt('Over 85 in', 'over 85 in', null)] },
]
/** Picture options with one text-only option among them, then a question with only two options. */
const mixedQuestions: ClarifyQuestion[] = [
  { id: 'q_material', text: 'What should it be made of?', kind: 'choice', dimension: 'material', options: [opt('Boucle', 'boucle', '#d9c3a5'), opt('Velvet', 'velvet', '#6a3c5a'), opt('Leather', 'leather', null), opt('Linen', 'linen', '#b9ad96')] },
  { id: 'q_shape', text: 'Which shape do you want?', kind: 'choice', dimension: 'shape', options: [opt('Curved', 'curved', '#c9b79c'), opt('Straight', 'straight', '#b08a5a')] },
]
type ClarifyOpts = { mixed?: boolean; questions?: ClarifyQuestion[]; more?: boolean; waiting?: boolean; state?: Clarify['state']; pictures?: 'pending' | 'done'; text?: boolean; answers?: Clarify['answers']; submitted?: boolean; applied?: boolean }
/** A clarify object as the server sends it; `text` strips every picture (the first poll), `pictures: 'pending'` keeps the areas reserved. */
export const makeClarify = (o: ClarifyOpts = {}): Clarify => {
  const state = o.state ?? 'ready'
  const base = o.questions ?? (o.mixed ? mixedQuestions : fixtureQuestions)
  const questions = state === 'ready' ? base.map((q) => ({ ...q, options: q.options.map((x) => (o.text ? { ...x, picture_url: null } : x)) })) : []
  return {
    state,
    questions,
    pictures_state: o.pictures ?? 'done',
    no_preference_value: 'no_preference',
    answers: o.answers ?? [],
    submitted: o.submitted ?? false,
    applied: o.applied ?? false,
    ...(o.more !== undefined ? { more_coming: o.more } : {}),
    deadline: { ...deadline, waiting: o.waiting ?? false },
  }
}
const plain = (label: string, value: string) => ({ label, value, picture_url: null })
const iconOpt = (label: string, value: string) => ({ ...plain(label, value), icon: 'placeholder' })
const swatchOpt = (label: string, value: string, swatches: string[]) => ({ ...plain(label, value), swatches })
/** A rug's questions: material as icons, colour as swatches, then text-only questions (a row of buttons). */
const iconQuestions: ClarifyQuestion[] = [
  { id: 'q_material', text: 'What should it be made of?', kind: 'choice', dimension: 'material', picture_eligible: false, options: [iconOpt('Wool', 'wool'), iconOpt('Cotton', 'cotton'), iconOpt('Jute', 'jute'), iconOpt('Polyester', 'polyester')] },
  { id: 'q_color', text: 'Which colour do you like?', kind: 'choice', dimension: 'color', picture_eligible: true, options: [swatchOpt('Cream or beige', 'cream', ['#e8dfd0']), swatchOpt('Black or gray', 'blackgray', ['#1f1f1f', '#8a8f98']), swatchOpt('Blue', 'blue', ['#3c5a87']), swatchOpt('Multicolour', 'multi', ['#c0504d', '#e8b84a', '#3c5a87'])] },
  { id: 'q_care', text: 'How should it be cared for?', kind: 'choice', dimension: 'feature', picture_eligible: false, options: [plain('Washable', 'washable'), plain('Stain resistant', 'stain'), plain('Pet friendly', 'pet')] },
]
const textOnlyQuestions: ClarifyQuestion[] = [{ id: 'q_material', text: 'What should it be made of?', kind: 'choice', dimension: 'material', picture_eligible: false, options: [plain('Washable', 'washable'), plain('Wool', 'wool'), plain('Cotton', 'cotton'), plain('Jute', 'jute')] }]
const mixedPicsQuestions: ClarifyQuestion[] = [{ ...textOnlyQuestions[0], picture_eligible: true, options: [opt('Washable', 'washable', '#d9c3a5'), plain('Wool', 'wool'), plain('Cotton', 'cotton'), plain('Jute', 'jute')] }]
/** The frames of a progressive search: one question, then two, then three (more coming), then all three. */
export const progressFrames = (): Clarify[] => [
  makeClarify({ questions: fixtureQuestions.slice(0, 1), more: true }),
  makeClarify({ questions: fixtureQuestions.slice(0, 2), more: true }),
  makeClarify({ questions: fixtureQuestions.slice(0, 3), more: true }),
  makeClarify({ questions: fixtureQuestions.slice(0, 3), more: false }),
]
const askUi = (o: ClarifyOpts = {}, selected: ClarifyUi['selected'] = {}): ClarifyUi => ({ server: makeClarify(o), selected, submitted: o.submitted ?? false, note: null })
const asking = (clarify: ClarifyUi): ShopState => ({ status: 'running', request: 'modern couch under $1000', kind: 'search', batch: 1, prev: null, phase: 'ranking', startedAt: Date.now() - 6_000, slow: false, steps: steps(['done', 'done', 'active', 'skipped']), clarify })
// Results with answers (no `must_have`, so the row is 8 chips): "Walnut or brown" replaces "Colour: oatmeal", "Boucle" replaces "Material:
// boucle", "Curved" is added (no parsed shape), and "No Walmart" replaces "Avoid: walmart".
const fixtureQuery = fixtureView.search?.query
const answeredSearch = { ...(fixtureView.search as NonNullable<SessionView['search']>), query: { ...fixtureQuery, must_have: [] } }
const answeredView: SessionView = {
  ...fixtureView,
  search: answeredSearch,
  clarify_answers: [
    { id: 'answer:q_color', question: 'Which colour do you like?', label: 'Walnut or brown', dimension: 'color' },
    { id: 'answer:q_material', question: 'What should it be made of?', label: 'Boucle', dimension: 'material' },
    { id: 'answer:q_shape', question: 'Which shape do you want?', label: 'Curved', dimension: 'shape' },
  ],
}
// More than eight chips: "+2 more" behind the first eight. "Mid-century" replaces the parsed "modern"; "Under 70 in" is added.
const manyView: SessionView = {
  ...fixtureView,
  clarify_answers: [
    ...(answeredView.clarify_answers ?? []),
    { id: 'answer:q_style', question: 'Which look do you prefer?', label: 'Mid-century', dimension: 'style' },
    { id: 'answer:q_size', question: 'How big should it be?', label: 'Under 70 in', dimension: 'size' },
  ],
}

// Filters F1: 12 results with `attrs`, and the `facets` / `facets_unknown` exactly as the backend contract sends them (room-redesign-agent
// docs/api-contract.md): options by count then vocabulary order, only options with count >= 1, `icon` or `swatches` per option.
type Attrs = NonNullable<ShopItem['attrs']>
const attr = (color: string[], material: string[], style: string[], shape: string[] = [], feature: string[] = [], size: string[] = []): Attrs => ({ color, material, shape, style, size, feature })
const filterRows: [string, string, Attrs][] = [
  ['Example Persian Vintage runner, gray and blue', '#8c8c8c', attr(['gray', 'blue'], ['wool'], ['vintage'], ['runner'], ['washable'])],
  ['Sample Gray wool shag rug', '#8c8c8c', attr(['gray'], ['wool'], ['modern'], ['rectangular'])],
  ['Demo Blue cotton flatweave', '#3c5a87', attr(['blue'], ['cotton'], ['modern'], ['rectangular'], ['washable', 'reversible'])],
  ['Placeholder Cream jute round rug', '#e8dfd0', attr(['cream'], ['jute'], ['boho'], ['round'])],
  ['Example Gray vintage oval rug', '#8c8c8c', attr(['gray'], ['wool'], ['vintage'], ['oval'])],
  ['Sample Black and white striped rug', '#1f1f1f', attr(['black', 'white'], ['cotton'], ['modern'], ['rectangular'], ['reversible'])],
  ['Demo Blue vintage medallion rug', '#3c5a87', attr(['blue'], ['wool'], ['vintage'], ['rectangular'])],
  ['Placeholder Cream wool rug', '#e8dfd0', attr(['cream'], ['wool'], ['scandinavian'], ['rectangular'])],
  ['Example Gray polyester runner', '#8c8c8c', attr(['gray'], ['polyester'], ['modern'], ['runner'], ['washable'])],
  ['Sample Multicolour boho rug', '#c0504d', attr(['multicolor'], ['cotton'], ['boho'], ['rectangular'])],
  ['Demo Rug with no listed details', '#b9b9b9', attr([], [], [], [])],
  ['Placeholder Cream jute runner', '#e8dfd0', attr(['cream'], ['jute'], [], ['runner'])],
]
export const filterItemsFixture: ShopItem[] = filterRows.map(([title, fill, attrs], i) => ({
  id: `ft-${i + 1}`,
  title,
  price: 120 + i * 17,
  currency: 'USD',
  seller: ['Example Home Co.', 'Sample Furniture', 'Demo Living'][i % 3],
  thumbnail_url: art(fill),
  link: `https://example.com/product/rug-${i + 1}`,
  link_kind: 'retailer',
  rating: 4.2,
  rating_count: 40 + i,
  attrs,
}))
const LABELS: Record<string, string> = { color: 'Colour', material: 'Material', style: 'Style', shape: 'Shape', size: 'Size', feature: 'Feature' }
const HEX: Record<string, string[]> = { gray: ['#8C8C8C'], blue: ['#3C5A87'], cream: ['#E8DFD0'], black: ['#1F1F1F'], white: ['#FFFFFF'], multicolor: ['#C0504D', '#E8B84A', '#3C5A87'] }
const niceLabel = (v: string) => v.charAt(0).toUpperCase() + v.slice(1)
/** Facets as the service computes them: >= 2 options, not one value on every result, at most 10 options, no option with a zero count. */
const facetsOf = (items: ShopItem[]): { facets: Facet[]; unknown: Record<string, number> } => {
  const facets: Facet[] = []
  const unknown: Record<string, number> = {}
  for (const dimension of ['color', 'material', 'style', 'shape', 'size', 'feature']) {
    const counts = new Map<string, number>()
    for (const i of items) for (const v of i.attrs?.[dimension] ?? []) counts.set(v, (counts.get(v) ?? 0) + 1)
    const n = items.filter((i) => (i.attrs?.[dimension] ?? []).length === 0).length
    if (n > 0) unknown[dimension] = n
    const options = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 10)
    if (options.length < 2) continue
    facets.push({
      dimension,
      title: LABELS[dimension],
      options: options.map(([value, count]) => ({ value, label: niceLabel(value), count, icon: dimension === 'color' ? null : value, swatches: dimension === 'color' ? HEX[value] ?? null : null })),
    })
  }
  return { facets, unknown }
}
const filtersBatch = facetsOf(filterItemsFixture)
export const fixtureFilters: SessionView = {
  ...fixtureView,
  search: { request: 'rug', headline: 'Twelve rugs.', warnings: [], query: { search_text: 'rug', category: 'rug' }, results: filterItemsFixture },
  refine: [],
  facets: filtersBatch.facets,
  facets_unknown: filtersBatch.unknown,
}
/** Five results, two chosen options leaving two matches (gray + vintage): the few-matches line. */
const fewItems = filterItemsFixture.slice(0, 5)
const fewBatch = facetsOf(fewItems)
export const fixtureFiltersFew: SessionView = {
  ...fixtureFilters,
  search: { ...(fixtureFilters.search as NonNullable<SessionView['search']>), results: fewItems },
  facets: fewBatch.facets,
  facets_unknown: fewBatch.unknown,
}
export const fixtureFiltersFewSelection: Selection = { color: ['gray'], style: ['vintage'] }

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
  // Stage Q2: the clarifying questions
  askpending: asking(askUi({ state: 'pending', pictures: 'pending' })),
  asktext: asking(askUi({ pictures: 'pending', text: true })),
  askpics: asking(askUi()),
  askpartial: asking(askUi({ answers: [{ question_id: 'q_color', option_value: 'walnut' }, { question_id: 'q_material', option_value: 'no_preference' }] })),
  askmixed: asking(askUi({ mixed: true })),
  askwaiting: asking(askUi({ waiting: true })),
  askprogress: asking({ server: progressFrames()[1], selected: {}, submitted: false, note: null }),
  askicons: asking(askUi({ questions: iconQuestions })),
  asktextonly: asking(askUi({ questions: textOnlyQuestions })),
  askmixedpics: asking(askUi({ questions: mixedPicsQuestions })),
  // Every question answered (five picks in the right column; the panel opens on question 1).
  askfive: asking(askUi({ answers: fixtureQuestions.map((q, i) => ({ question_id: q.id, option_value: i === 2 ? 'no_preference' : q.options[0].value })) })),
  asksubmitted: asking(askUi({ answers: [{ question_id: 'q_color', option_value: 'walnut' }, { question_id: 'q_material', option_value: 'boucle' }], submitted: true })),
  askclosed: asking(askUi({ applied: true, answers: [{ question_id: 'q_color', option_value: 'walnut' }] })),
  askskipped: asking(askUi({ state: 'skipped' })),
  askfailed: asking(askUi({ state: 'failed' })),
  askchips: done(answeredView, 1),
  askchipsmany: done(manyView, 1),
  // Part 3
  saved: done(savedView, 1, savedRatings),
  savedempty: done({ ...fixtureView, saved: [] }, 1, {}),
  short: done(fixtureShort, 1),
  askfilters: done(fixtureFilters, 1),
  askfiltersfew: done(fixtureFiltersFew, 1, { 'ft-1': rated('like') }),
  limit: done(limitView, 1, {}, { message: 'Daily limit reached.', retryAfterS: null, resetsAt: '2026-11-01T00:00:00+00:00', code: 'cap_reached', limit: 'ip_day' }),
}

const clear: ShopMeta = { usage: null, blocked: { search: false, again: false }, maintenance: false }

/** What the dev page needs besides the state: the usage line, blocked buttons, the Saved panel's tab. */
export type FixtureBundle = { state: ShopState; meta: ShopMeta; /** Filters chosen when the page opens. */ filters?: Selection; savedTab?: 'love' | 'like'; /** Later server clarify objects, played one by one by the dev page (progressive questions). */ frames?: Clarify[] }

export const fixtureBundles: Record<string, FixtureBundle> = {
  ...Object.fromEntries(Object.entries(fixtureStates).map(([k, state]) => [k, { state, meta: { ...clear, usage: limitUsage } } satisfies FixtureBundle])),
  askprogress: { state: fixtureStates.askprogress, meta: { ...clear, usage: limitUsage }, frames: progressFrames() },
  askfiltersfew: { state: fixtureStates.askfiltersfew, meta: { ...clear, usage: limitUsage }, filters: fixtureFiltersFewSelection },
  savedliked: { state: fixtureStates.saved, meta: clear, savedTab: 'like' },
  savedempty: { state: fixtureStates.savedempty, meta: clear },
  limit: { state: fixtureStates.limit, meta: { usage: limitUsage, blocked: { search: true, again: true }, maintenance: false } },
  maintenance: { state: fixtureStates.empty, meta: { usage: null, blocked: { search: true, again: true }, maintenance: true } },
}
