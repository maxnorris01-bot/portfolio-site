// The Home page's words, in one place. The Background text is the page's intro as it was.
// DRAFT: the Site Info text below is a first draft, written from the README and the pages, for the owner to edit.

export const HOME_EYEBROW = 'Aerospace engineer · Applied AI & data'
export const HOME_TITLE = 'Aerospace engineering, now pointed at data'
export const HOME_CREDENTIALS = ['DoD Secret Clearance', 'Physics — Cal State Northridge']

export type HomePanelId = 'background' | 'site'

export type HomePanel = {
  id: HomePanelId
  /** The planet's label and the panel's heading. */
  label: string
  paragraphs: string[]
}

export const HOME_PANELS: HomePanel[] = [
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
      'SatPOV is a satellite point-of-view tool: ride along with any tracked satellite and see what it sees, alongside a daily screening of public tracking data for close approaches. ShopAI is a shopping search: describe a product, rate the results, and use Shop Again to get a new batch based on your ratings.',
      'The site is built with Vite, React 19 and TypeScript, and deployed on Vercel from git. The satellite view is drawn with three.js. The ShopAI backend is a Python service on Fly with a Postgres database.',
    ],
  },
]
