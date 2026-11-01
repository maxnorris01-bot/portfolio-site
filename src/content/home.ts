// The Home page's words, in one place.
// DRAFT: the Background and About this site texts (supplied by the owner's layout spec; the 1,700+ tests figure is theirs), and the SatPOV, ShopAI and Résumé texts (from the README and the pages), are first drafts for the owner to edit.
// Background and About this site are always on the page; the planets (SatPOV, ShopAI, Résumé) each fill the strip under them.

export const HOME_TITLE = 'Aerospace engineering, now pointed at data'

export type InfoPanelId = 'background' | 'site'
export type PlanetId = 'satpov' | 'shopai' | 'resume'

type PanelText = {
  /** The heading (for a planet, also its label and accessible name). */
  label: string
  paragraphs: string[]
}

/**
 * A line of text in three sizes of window (see Home.css): `text` for a large one (about 1700px wide and 950 tall), `mid` for the
 * windows between, `short` for a short or narrow one. Each is cut to fill its box at the type size that window gets.
 */
export type Copy = { text: string; mid?: string; short?: string }

/**
 * A row of the About card: a bold lead-in and its text. `lines`, `midLines` and `shortLines` are how many lines the text takes
 * in each size of window, which sets the row's share of the card's height (so the text fills its row).
 */
export type Bullet = { lead: string; lines: number; midLines: number; shortLines: number } & Copy

/** Always on the page, in this order: a paragraph, or bullets. */
export type InfoPanel = { id: InfoPanelId; label: string; paragraphs?: Copy[]; bullets?: Bullet[] }

/** One card per planet: its text and a button-styled link to its page. */
export type PlanetPanel = PanelText & { id: PlanetId; link: { to: string; text: string } }

/** The planet chosen when the page opens, so the strip is never empty. */
export const HOME_DEFAULT_PLANET: PlanetId = 'satpov'
export const HOME_SLOT_LABEL = 'Explore the site'

export const HOME_INFO: InfoPanel[] = [
  {
    id: 'background',
    label: 'Background',
    paragraphs: [
      {
        text: 'Aerospace mass-properties engineer with 10+ years at Northrop Grumman and Joby Aviation, now building applied AI and data pipelines that are fast, transparent and grounded in real physics.',
      },
    ],
  },
  {
    // The spec's closing stack line ("Vite, React 19 and TypeScript on Vercel; three.js for the satellite view.") did not fit the card and is left out.
    // The text is cut to fill its rows exactly: three rows of two, three and three lines (two, three and two in a short window).
    id: 'site',
    label: 'About this site',
    bullets: [
      {
        lead: 'Purpose:',
        text: 'a working portfolio of applied AI and data projects. Every tool here runs live; none of it is a mock-up.',
        lines: 2,
        midLines: 2,
        shortLines: 1.9,
      },
      {
        lead: 'Backend:',
        text: 'ShopAI runs on a Python service (Fly.io) with Postgres, reachable only through this site. Spending is capped per session, per visitor and per day, with 1,700+ automated tests and a locked evaluation set.',
        short: 'ShopAI runs on Python (Fly.io) with Postgres, reachable only through this site, with spending capped per session, visitor and day and 1,700+ automated tests.',
        lines: 4,
        midLines: 4,
        shortLines: 3,
      },
      {
        lead: 'What it shows:',
        text: 'end-to-end ownership: data pipelines, LLM ranking with cost controls, evaluation, deployment, and the physics background to sanity-check results.',
        lines: 3,
        midLines: 3,
        shortLines: 3,
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
