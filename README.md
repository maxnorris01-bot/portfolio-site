# portfolio-site

Personal portfolio for Max Norris. Built with Vite, React, TypeScript and React Router.

## Routes

- `/` — Home
- `/resume` — Resume
- `/satellite-conjunction-screening` — Satellite conjunction screening project

## Development

```sh
npm install
npm run dev      # local dev server (also serves api/ functions)
npm run lint     # eslint
npm test         # node:test unit tests in tests/
npm run build    # type-check (app, vite config, api) + production build to dist/
npm run preview  # serve the production build
```

## Structure

- `src/styles/tokens.css` — design tokens (colors, fonts). All colors are referenced through these variables.
- `src/data/satelliteTool.ts` — static facts about the satellite project (repo link, tech stack).
- `api/satellite/summary.ts` — Vercel function, `GET /api/satellite/summary?limit=N` (default 25, max 200; add `&date=YYYY-MM-DD` for a retained day's report). Reads the screening pipeline's full report (`reports/current.json`, ~78 MB) from the public Tigris bucket server-side and returns risk-level counts plus the top-N conjunctions, ranked by risk tier then miss distance (~11 KB at the default limit). Cached by Vercel's CDN for an hour. The satellite page and the home page's featured stats read from it via `src/hooks/useSatelliteSummary.ts`.
- `src/components/SatelliteGlobe.tsx` + `src/globe/` — the 3D globe on the satellite page, lazy-loaded so three.js and satellite.js (~150 KB gzipped) stay out of the main bundle. It fetches `objects/current.json` (and retained `objects/<date>.json.gz` snapshots for past days, listed in `history/index.json`) straight from the public bucket, whose CORS rule allows the production origin and `localhost:5173`/`4173`. Every object is propagated with SGP4 in its inertial frame, a tenth of the catalog per frame. The Earth mesh is rotated by GMST so the texture lines up with real geography (`tests/globe.test.ts` checks this). Includes near-miss replay from the table (both objects ringed, with a labelled miss line), point colouring by type, owner or flat with per-category show/hide, curated name filters (constellations and the two historical debris events), ISS/Tiangong station views that follow the station, click-to-inspect any point with its nearest neighbour, a sourced collision-history panel, a time slider (retained days back, ~24 h forward, Live at 1/10/50x), and a Globe | Sky toggle: the Sky view shows every tracked object above a chosen location's horizon on a first-person dome (browser geolocation, or a place looked up with OpenStreetMap Nominatim; the location stays in the browser). Sky geometry lives in `src/globe/sky.ts` and is checked against satellite.js look angles in `tests/sky.test.ts`. The globe is shaded day/night by the Sun's position at the displayed time (`src/globe/sun.ts`, satellite.js's low-precision solar formula, checked against astronomy-engine in tests only), with a soft twilight band and city lights on the night side; a Day/night switch turns it off. Earth textures, 2048×1024 in `public/textures/`: NASA Visible Earth Blue Marble (day) and NASA Earth Observatory Black Marble 2016 city lights (night).
