// The Home page's words, in one place.
// DRAFT: the Background and About this site texts (supplied by the owner's layout spec; the 1,700+ tests figure is theirs), and the SatPOV, ShopAI and Résumé texts (from the README and the pages), are first drafts for the owner to edit.
// Background and About this site are always on the page (left column); the planets (SatPOV, ShopAI, Résumé) each fill the card under the solar system (right column).

export const HOME_TITLE = 'Aerospace Engineer · AI Projects Portfolio'

export type InfoPanelId = 'background' | 'site'
export type PlanetId = 'satpov' | 'shopai' | 'resume'

/**
 * Text in two cuts (see Home.css): `text` for a window tall enough for it, `compact` for a shorter one (under 880px), where the
 * type stays on the same scale and the page must still fit without scrolling. A row with `compactHide` is left out there.
 */
export type Copy = { text: string; compact?: string }

/** A row of a text card: a bold label and its text. */
export type Bullet = { lead: string; compactHide?: boolean } & Copy

/** Always on the page, as label | text rows: the Background card and the About card. */
export type InfoPanel = { id: InfoPanelId; label: string; bullets: Bullet[] }

/** One card per planet: its text and a button-styled link to its page. */
export type PlanetPanel = { id: PlanetId; label: string; paragraphs: Copy[]; link: { to: string; text: string } }

/** The planet chosen when the page opens, so the card is never empty. */
export const HOME_DEFAULT_PLANET: PlanetId = 'satpov'
export const HOME_SLOT_LABEL = 'Explore the site'

export const HOME_INFO: InfoPanel[] = [
  {
    // DRAFT (to be confirmed): the rows of the Background card.
    id: 'background',
    label: 'Background',
    bullets: [
      { lead: 'Experience', text: '10+ years at Northrop Grumman and Joby Aviation, as an aerospace mass-properties engineer.', compact: '10+ years, Northrop Grumman and Joby Aviation.' },
      { lead: 'Focus', text: 'applied AI and data pipelines that are fast, transparent and grounded in real physics.', compact: 'applied AI and data pipelines grounded in real physics.' },
      { lead: 'Education', text: 'Physics degrees, Cal State Northridge.' },
    ],
  },
  {
    id: 'site',
    label: 'About this site',
    bullets: [
      { lead: 'Purpose', text: 'a working portfolio of applied AI and data projects. Every tool here runs live; none of it is a mock-up.', compact: 'a working portfolio of applied AI and data projects; every tool here runs live.' },
      {
        lead: 'Backend',
        text: 'ShopAI runs on a Python service (Fly.io) with Postgres, reachable only through this site. Spending is capped per session, per visitor and per day, with 1,700+ automated tests and a locked evaluation set.',
        compact: 'ShopAI: Python on Fly.io with Postgres, spending caps, 1,700+ tests.',
      },
      { lead: 'What it shows', text: 'end-to-end ownership: data pipelines, LLM ranking with cost controls, evaluation, deployment, and the physics background to sanity-check results.', compact: 'end-to-end ownership: pipelines, LLM ranking with cost controls, evaluation, deployment.' },
      // DRAFT (to be confirmed): the stack row is back.
      { lead: 'Stack', text: 'Python, Fly.io, Postgres, React, TypeScript, Vercel.', compactHide: true },
    ],
  },
]

export const HOME_PLANETS: PlanetPanel[] = [
  {
    id: 'satpov',
    label: 'SatPOV',
    paragraphs: [
      { text: 'SatPOV shows every tracked satellite on a 3D globe and lets you ride along with any one of them to see what it sees.' },
      {
        text: "You see Earth below, the Sun, Moon and planets, and millions of real stars from ESA's Hipparcos and Gaia catalogues; a daily screening of public tracking data flags close approaches between satellites.",
        compact: "You see Earth below, the Sun, Moon and planets, and real stars from ESA's Hipparcos and Gaia.",
      },
    ],
    link: { to: '/satellite-conjunction-screening', text: 'Open SatPOV' },
  },
  {
    id: 'shopai',
    label: 'ShopAI',
    paragraphs: [
      { text: 'ShopAI is a shopping search: describe a product in plain words and it searches Google Shopping for matches.' },
      {
        text: 'An AI model ranks the matches. Rate results with Love, Like or Dislike, then press Shop Again for a new batch based on your ratings; loved and liked items are kept in a Saved list.',
        compact: 'An AI model ranks the matches; rate them, then press Shop Again for a new batch based on your ratings.',
      },
    ],
    link: { to: '/shop', text: 'Open ShopAI' },
  },
  {
    id: 'resume',
    label: 'Résumé',
    paragraphs: [
      { text: 'My Résumé: Senior Mass Properties Engineer at Joby Aviation and Mass Properties Engineer at Northrop Grumman.' },
      {
        text: "It also lists my DoD Secret clearance, my physics degree from Cal State Northridge, my skills (Python, SciPy, SGP4, orbital mechanics, data pipelines and mass properties) and this site's applied AI project.",
        compact: 'It also lists my DoD Secret clearance, my physics degree from Cal State Northridge and my skills.',
      },
    ],
    link: { to: '/resume', text: 'Open Résumé' },
  },
]
