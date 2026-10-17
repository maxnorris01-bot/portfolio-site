// Static facts about the Satellite Point-of-View Tool (the satellite viewer and the
// conjunction-screening pipeline behind the page). Live run numbers (counts, risk
// breakdown, near misses) come from GET /api/satellite/summary instead.

export interface SatelliteToolInfo {
  /** The tool's name: the page title, the Home card and the Resume entry. */
  name: string
  /** Two sentences, one per entry: the short intro under the title (also the Home card and Resume text). */
  intro: [string, string]
  repoUrl: string
  /** The browser tab title and meta description while the tool page is open. */
  pageTitle: string
  pageDescription: string
  techStack: string[]
}

export const satelliteTool: SatelliteToolInfo = {
  name: 'Satellite Point-of-View Tool',
  intro: [
    "Ride along with any tracked satellite and see what it sees: Earth below, the Sun, Moon and planets, and millions of real stars from ESA's Hipparcos and Gaia catalogues.",
    'The same page shows a daily screening of public tracking data for close approaches between satellites, which uses real orbital mechanics and makes zero LLM calls.',
  ],
  pageTitle: 'Satellite Point-of-View Tool — Max Norris',
  pageDescription:
    'Ride along with any tracked satellite and see what it sees: Earth below, the Sun, Moon and planets, and millions of real stars from Hipparcos and Gaia. Also screens public tracking data daily for close approaches between satellites.',
  repoUrl: 'https://github.com/maxnorris01-bot/satellite-conjunction-screening',
  techStack: ['Python', 'SGP4', 'scipy cKDTree', 'CelesTrak', 'three.js', 'ESA Gaia'],
}
