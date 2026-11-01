// The Home page's words, in one place.
// DRAFT: the Background and About this site texts (supplied by the owner's layout spec; the 1,700+ tests figure is theirs), and the SatPOV, ShopAI and Résumé texts (from the README and the pages), are first drafts for the owner to edit.
// Background and About this site are always on the page; the planets (SatPOV, ShopAI, Résumé) each fill the strip under them.

export const HOME_TITLE = 'Aerospace engineering, now pointed at data'
export const HOME_CREDENTIALS = ['DoD Secret Clearance', 'Physics — Cal State Northridge']

export type InfoPanelId = 'background' | 'site'
export type PlanetId = 'satpov' | 'shopai' | 'resume'

type PanelText = {
  /** The heading (for a planet, also its label and accessible name). */
  label: string
  paragraphs: string[]
}

/** A line of text, and a shorter version of it for windows too short for the full one (see Home.css). */
export type Copy = { text: string; short?: string }

/** A short list item with a bold lead-in. */
export type Bullet = { lead: string } & Copy

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
        text: 'Aerospace mass-properties engineer with 10+ years at Northrop Grumman and Joby Aviation, now building applied AI and data pipelines that are fast, transparent about their assumptions, and grounded in real physics.',
        short: 'Aerospace mass-properties engineer, 10+ years at Northrop Grumman and Joby Aviation, now building applied AI and data pipelines grounded in real physics.',
      },
    ],
  },
  {
    // The spec's closing stack line ("Vite, React 19 and TypeScript on Vercel; three.js for the satellite view.") did not fit the card at 1440x900 and is left out.
    id: 'site',
    label: 'About this site',
    bullets: [
      {
        lead: 'Purpose:',
        text: 'a working portfolio of applied AI and data projects. Every tool here runs live; none of it is a mock-up.',
        short: 'a working portfolio of applied AI and data projects; every tool here runs live.',
      },
      {
        lead: 'Backend:',
        text: 'ShopAI runs on a Python service (Fly.io) with Postgres, reachable only through this site. Spending is capped per session, per visitor and per day, and the service has 1,700+ automated tests and a locked evaluation set.',
        short: 'ShopAI runs on a Python service (Fly.io) with Postgres, reachable only through this site, with spending caps and 1,700+ automated tests.',
      },
      {
        lead: 'What it shows:',
        text: 'end-to-end ownership: data pipelines, LLM ranking with cost controls, evaluation, deployment, and the physics background to sanity-check results.',
        short: 'end-to-end ownership: data pipelines, LLM ranking with cost controls, evaluation, deployment.',
      },
    ],
  },
]

export const HOME_PLANETS: PlanetPanel[] = [
  {
    id: 'satpov',
    label: 'SatPOV',
    paragraphs: [
      "SatPOV, the Satellite Point-of-View Tool, shows the tracked satellites around the Earth on a 3D globe and lets you ride along with any one of them to see what it sees: Earth below, the Sun, Moon and planets, and millions of real stars from ESA's Hipparcos and Gaia catalogues.",
      'The same page shows a daily screening of public tracking data for close approaches between satellites, which uses real orbital mechanics and makes zero LLM calls.',
    ],
    link: { to: '/satellite-conjunction-screening', text: 'Open SatPOV' },
  },
  {
    id: 'shopai',
    label: 'ShopAI',
    paragraphs: [
      'ShopAI is a shopping search. Describe a product in plain words and it searches Google Shopping and ranks the matches with an AI model.',
      'Rate results with Love, Like or Dislike, add a comment if you like, then press Shop Again for a new batch based on your ratings. Loved and liked items are kept in a Saved list.',
    ],
    link: { to: '/shop', text: 'Open ShopAI' },
  },
  {
    id: 'resume',
    label: 'Résumé',
    paragraphs: [
      'My Résumé: Senior Mass Properties Engineer at Joby Aviation and Mass Properties Engineer at Northrop Grumman, a DoD Secret clearance, and a physics degree from Cal State Northridge.',
      'It also lists my skills (Python, SciPy, SGP4, orbital mechanics, data pipelines and mass properties) and the applied AI project on this site.',
    ],
    link: { to: '/resume', text: 'Open Résumé' },
  },
]
