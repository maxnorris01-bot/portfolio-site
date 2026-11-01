// The Home page's words, in one place. The Background text is the page's intro as it was.
// DRAFT: the Site Info, SatPOV, ShopAI and Résumé texts below are first drafts, written from the README and the pages, for the owner to edit.
// Background and Site Info are always on the page; the planets (SatPOV, ShopAI, Résumé) each open a card under them.

export const HOME_TITLE = 'Aerospace engineering, now pointed at data'
export const HOME_CREDENTIALS = ['DoD Secret Clearance', 'Physics — Cal State Northridge']

export type InfoPanelId = 'background' | 'site'
export type PlanetId = 'satpov' | 'shopai' | 'resume'

type PanelText = {
  /** The heading (for a planet, also its label and accessible name). */
  label: string
  paragraphs: string[]
}

/** Always on the page, in this order. */
export type InfoPanel = PanelText & { id: InfoPanelId }

/** One card per planet: its text and a button-styled link to its page. */
export type PlanetPanel = PanelText & { id: PlanetId; link: { to: string; text: string } }

/** Shown in the planet slot until a planet is chosen (and again when it is chosen a second time). */
export const HOME_HINT = 'Select a planet to explore the site.'
export const HOME_SLOT_LABEL = 'Explore the site'

export const HOME_INFO: InfoPanel[] = [
  {
    id: 'background',
    label: 'Background',
    paragraphs: [
      "I spent 10+ years at Northrop Grumman and Joby Aviation making sure aircraft and spacecraft hit their mass, balance, and inertia targets, work that lives or dies on careful data handling and physics you can defend. Now I'm pointing that same rigor at applied AI and data engineering: building pipelines that are fast, transparent about their assumptions, and grounded in the real physics of the problem.",
    ],
  },
  {
    id: 'site',
    label: 'Site Info',
    paragraphs: [
      'This site is a portfolio of applied AI and data projects. It has two working tools and my Résumé.',
      'Select a planet in the solar system to explore each part of the site.',
      'The site is built with Vite, React 19 and TypeScript, and deployed on Vercel from git. The satellite view is drawn with three.js. The ShopAI backend is a Python service on Fly with a Postgres database.',
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
