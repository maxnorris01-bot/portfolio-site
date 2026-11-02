/** The About card on the page: a heading and label | text rows. The rows are the notice below split in four, in the same words. */
export const ABOUT_TITLE = 'About this tool'

/** The caveats under the pipeline tiles (what it is, the data, the rankings) and the note under the guardrails (access): the old About note, in its own words. */
export const ABOUT_ROWS = [
  { label: 'What it is', text: 'Shop Mode is a personal portfolio project, not a store and not for profit.' },
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

/** The search pipeline, as the service runs it (its own progress steps are Searching, Tagging, Ranking). DRAFT captions. */
export const PIPELINE_TITLE = 'Search pipeline'
export const PIPELINE_LABEL = 'How a search works'
export const PIPELINE_STAGES = [
  { name: 'Request', caption: 'A small AI model reads your words into a search.' },
  { name: 'Search', caption: 'Google Shopping is queried for candidates.' },
  { name: 'Tag', caption: 'Each candidate is tagged for colour, material and shape.' },
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
