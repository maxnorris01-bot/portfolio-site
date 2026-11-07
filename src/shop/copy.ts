/** The About card on the page: a heading and label | text rows. The rows are the notice below split in four, in the same words. */
export const ABOUT_TITLE = 'About this tool'

/** The caveats under the pipeline tiles (what it is, the data, the rankings) and the note under the guardrails (access): the old About note, in its own words. */
export const ABOUT_ROWS = [
  { label: 'What it is', text: 'ShopAI is a personal portfolio project, not a store and not for profit.' },
  {
    label: 'Data',
    text: 'Product results come from Google Shopping through a search API; names, prices and images belong to the stores and can be out of date or wrong, so check the store before you buy.',
  },
  { label: 'Rankings', text: 'Rankings are produced by an AI model and can be mistaken.' },
  {
    label: 'Access',
    text: 'Access is limited per person and per day, and may be paused or withdrawn at any time. No account details or payment information are collected.',
  },
] as const

/** The whole notice as one sentence run; one constant, so it is easy to reword. */
export const LIMITATIONS_NOTICE = `${ABOUT_TITLE}. ${ABOUT_ROWS.map((r) => r.text).join(' ')}`

export const EXAMPLE_REQUESTS = ['modern couch under $1000', 'boho curtains', 'walnut desk lamp', 'small round rug for a hallway']

export const SHOP_TITLE = 'ShopAI Tool'

/** The tech chips under the title: only what the shop really uses (room-redesign-agent: pyproject.toml, fly.toml, config.py, docs/deploy.md). */
export const SHOP_CHIPS = ['Python', 'Claude', 'Google Shopping', 'Postgres (Neon)', 'Fly.io', 'React'] as const

export const SHOP_EYEBROW = 'Project · Personal shopping assistant'

// DRAFT: the description under the title (checked against the service's code: it searches Google Shopping through a search API, a model
// ranks the candidates, results show price, store and a link, ratings feed Shop Again, there are spending caps per visit and per day).
export const SHOP_DESCRIPTION =
  'Describe what you want to buy in plain words. The tool searches Google Shopping, has an AI model rank the matches against your request, and shows the best ones here with their price, store and a link. Rate results, then press Shop Again for a new batch that follows your ratings. It runs live, with spending caps per visit and per day.'

/** The search pipeline, as the service runs it (Ask is the optional clarifying questions). DRAFT names and captions. */
export const PIPELINE_TITLE = 'Search pipeline'
export const PIPELINE_LABEL = 'How a search works'
export const PIPELINE_STAGES = [
  { name: 'Understand', caption: 'A small AI model reads your words into a search.' },
  { name: 'Search', caption: 'Google Shopping is queried for candidates.' },
  { name: 'Ask', caption: 'Up to five quick questions come from the first results, with a photo for each choice.' },
  { name: 'Check photos', caption: 'Each candidate is tagged for colour, material and shape.' },
  { name: 'Rank', caption: 'An AI model ranks the candidates against your request.' },
  { name: 'Results', caption: 'Top matches with price, store and a link.' },
] as const
export const GUARDRAILS_LABEL = 'Guardrails'
export const SHOP_PAGE_TITLE = 'ShopAI Tool · Max Norris'
export const SHOP_PAGE_DESCRIPTION =
  'Describe a product in plain words and get a ranked grid of matches from Google Shopping. A personal portfolio project.'

export const NO_RESULTS_MESSAGE = 'No products matched that request. Try different words, a wider price range or fewer details.'

export const PIPELINE_NOTE = ABOUT_ROWS.slice(0, 3)
  .map((r) => r.text)
  .join(' ')
export const GUARDRAILS_NOTE = ABOUT_ROWS[3].text

/** The clarifying questions (stage Q2). DRAFT. */
export const CLARIFY_TITLE = 'A few quick questions'
export const CLARIFY_SUB = 'Optional. Your results keep loading while you answer.'
export const CLARIFY_SUBMIT = 'Show results'
export const CLARIFY_NO_PREFERENCE = 'No preference'
/** The one row of chips under the results (what the search used: your words, your answers, your refinements). DRAFT. */
export const CHIPS_LABEL = "What I'm searching for"
export const chipsMore = (n: number) => `+${n} more`
export const CHIPS_FEWER = 'Show fewer'
/** Quiet notes under the panel. DRAFT. */
export const CLARIFY_SUBMITTED = 'Thanks. Your results are on the way.'
export const CLARIFY_CLOSED = 'Results are already on the way.'
export const CLARIFY_FAILED = 'Could not save that answer. Try again, or skip it.'
export const CLARIFY_LIMIT = 'That is as many answers as one search takes. Your choices stay here but are not sent.'
export const CLARIFY_RETRY = 'Try again'
export const CLARIFY_BACK = 'Back'
/** Announced when the question changes: "Question 3 of 5: <text>". */
export const clarifyQuestionOf = (index: number, total: number) => `Question ${index} of ${total}`
export const clarifyAnnounce = (index: number, total: number, text: string) => `${clarifyQuestionOf(index, total)}: ${text}`
export const clarifyReady = (n: number) => `${n} quick question${n === 1 ? '' : 's'} ${n === 1 ? 'is' : 'are'} ready below. ${n === 1 ? 'It is' : 'They are'} optional.`

/**
 * The progress row shows these words for the service's own step labels (the step ids and the labels the service sends stay as they are).
 * A step the map does not know shows the service's label. DRAFT.
 */
export const STEP_LABELS: Readonly<Record<string, string>> = {
  Searching: 'Finding products',
  Tagging: 'Checking photos',
  Ranking: 'Picking the best',
  'Checking style': 'Checking style',
}
export const stepLabel = (serviceLabel: string): string => STEP_LABELS[serviceLabel] ?? serviceLabel

/** The panel's right column (from 1280px): the progress steps move in beside the questions, with the picks so far. DRAFT. */
export const CLARIFY_SIDE_PROGRESS = 'Searching'
export const CLARIFY_PICKS_LABEL = 'Your picks so far'
export const CLARIFY_PICKS_EMPTY = 'Your choices will show here.'
export const CLARIFY_SIDE_NOTE = 'Your picks narrow the search: the colours, materials and sizes you choose are used when the results are ranked. Skip any question you like.'
/** "Any colour" for a pick of No preference; the dimension's word as the questions use it. */
export const clarifyAny = (dimension: string) => `Any ${({ color: 'colour' } as Record<string, string>)[dimension] ?? dimension}`

/** Progressive questions and the waiting note (F2). DRAFT. */
export const CLARIFY_LOADING_MORE = 'Loading one more question…'
export const CLARIFY_WAITING = 'Everything is ready. Pick your options and press Show results.'
