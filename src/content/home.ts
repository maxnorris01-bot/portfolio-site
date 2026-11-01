// The Home page's words, in one place.
// DRAFT: the Background and About this site texts (supplied by the owner's layout spec; the 1,700+ tests figure is theirs), and the SatPOV, ShopAI and Résumé texts (from the README and the pages), are first drafts for the owner to edit.
// Background and About this site are always on the page (left column); the planets (SatPOV, ShopAI, Résumé) each fill the card under the solar system (right column).

export const HOME_TITLE = 'Aerospace Engineer · AI Projects Portfolio'

export type InfoPanelId = 'background' | 'site'
export type PlanetId = 'satpov' | 'shopai' | 'resume'

/**
 * A row of the About card: a bold lead-in and its text. `lines` is how many lines the text takes, which sets the row's share
 * of the card's height (so the text fills its row).
 */
export type Bullet = { lead: string; text: string; lines: number }

/** Always on the page: the Background card (a paragraph) and the About card (rows). */
export type InfoPanel = { id: InfoPanelId; label: string; paragraphs?: string[]; bullets?: Bullet[] }

/** One card per planet: its text and a button-styled link to its page. */
export type PlanetPanel = { id: PlanetId; label: string; paragraphs: string[]; link: { to: string; text: string } }

/** The planet chosen when the page opens, so the card is never empty. */
export const HOME_DEFAULT_PLANET: PlanetId = 'satpov'
export const HOME_SLOT_LABEL = 'Explore the site'

export const HOME_INFO: InfoPanel[] = [
  {
    id: 'background',
    label: 'Background',
    paragraphs: [
      'Aerospace mass-properties engineer with 10+ years at Northrop Grumman and Joby Aviation, now building applied AI and data pipelines that are fast, transparent and grounded in real physics.',
    ],
  },
  {
    id: 'site',
    label: 'About this site',
    bullets: [
      { lead: 'Purpose', text: 'a working portfolio of applied AI and data projects; every tool here runs live.', lines: 2 },
      {
        lead: 'Backend',
        text: 'ShopAI runs on a Python service (Fly.io) with Postgres, reachable only through this site; spending is capped per visitor and day, with 1,700+ automated tests and a locked evaluation set.',
        lines: 4,
      },
      {
        lead: 'What it shows',
        text: 'end-to-end ownership: data pipelines, LLM ranking with cost controls, evaluation, deployment, and the physics to sanity-check results.',
        lines: 3,
      },
    ],
  },
]

export const HOME_PLANETS: PlanetPanel[] = [
  {
    id: 'satpov',
    label: 'SatPOV',
    paragraphs: [
      'SatPOV shows every tracked satellite on a 3D globe and lets you ride along with any one of them to see what it sees.',
      "You see Earth below, the Sun, Moon and planets, and millions of real stars from ESA's Hipparcos and Gaia catalogues; a daily screening of public tracking data flags close approaches between satellites.",
    ],
    link: { to: '/satellite-conjunction-screening', text: 'Open SatPOV' },
  },
  {
    id: 'shopai',
    label: 'ShopAI',
    paragraphs: [
      'ShopAI is a shopping search: describe a product in plain words and it searches Google Shopping for matches.',
      'An AI model ranks the matches. Rate results with Love, Like or Dislike, then press Shop Again for a new batch based on your ratings; loved and liked items are kept in a Saved list.',
    ],
    link: { to: '/shop', text: 'Open ShopAI' },
  },
  {
    id: 'resume',
    label: 'Résumé',
    paragraphs: [
      'My Résumé: Senior Mass Properties Engineer at Joby Aviation and Mass Properties Engineer at Northrop Grumman.',
      "It also lists my DoD Secret clearance, my physics degree from Cal State Northridge, my skills (Python, SciPy, SGP4, orbital mechanics, data pipelines and mass properties) and this site's applied AI project.",
    ],
    link: { to: '/resume', text: 'Open Résumé' },
  },
]
