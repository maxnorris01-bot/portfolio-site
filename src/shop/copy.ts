/** The About card on the page: a heading and label | text rows. The rows are the notice below split in four, in the same words. */
export const ABOUT_TITLE = 'About this tool'
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

export const SHOP_TITLE = 'Shop Mode'
export const SHOP_PAGE_TITLE = 'Shop Mode · Max Norris'
export const SHOP_PAGE_DESCRIPTION =
  'Describe a product in plain words and get a ranked grid of matches from Google Shopping. A personal portfolio project.'

export const NO_RESULTS_MESSAGE = 'No products matched that request. Try different words, a wider price range or fewer details.'
