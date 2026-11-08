// The Home page's words, in one place.
// Background and About this site are always on the page (left column); the planets (SatPOV, ShopAI, Résumé) each fill the card under the solar system (right column).

export const HOME_TITLE = 'Applied AI & Data Engineer · Project Portfolio'

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
        text: 'An AI model ranks the matches. Rate results with Love, Like or Dislike, narrow them with Refine search (colour, material, price), then press Shop Again for a new batch. Loved and liked items are kept in a Saved list you can print, email or text to yourself.',
        compact: 'An AI model ranks the matches; rate them, refine by colour, material or price, then press Shop Again for a new batch.',
      },
    ],
    link: { to: '/shop', text: 'Open ShopAI' },
  },
  {
    id: 'resume',
    label: 'Résumé',
    paragraphs: [
      { text: 'My Résumé: Applied AI & Data Engineer with 10+ years in aerospace, Senior Mass Properties Engineer at Joby Aviation and previously Northrop Grumman.' },
      {
        text: 'It lists my projects, my DoD Secret clearance and my physics degrees from Cal State Northridge.',
        compact: 'It lists my projects, my DoD Secret clearance and my physics degrees.',
      },
    ],
    link: { to: '/resume', text: 'Open Résumé' },
  },
]
