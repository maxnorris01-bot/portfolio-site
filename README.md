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
- `api/satellite/summary.ts` — Vercel function, `GET /api/satellite/summary?limit=N` (default 25, max 200). Reads the screening pipeline's full report (`reports/current.json`, ~78 MB) from the public Tigris bucket server-side and returns risk-level counts plus the top-N conjunctions, ranked by risk tier then miss distance (~11 KB at the default limit). Cached by Vercel's CDN for an hour. The satellite page and the home page's featured stats read from it via `src/hooks/useSatelliteSummary.ts`.
- `src/pages/` — one component per route; `src/components/` — shared nav bar and orbit illustration.

## Deployment

Deploys to Vercel as a Vite app (framework preset: Vite, output `dist`) plus the serverless functions in `api/`.
`vercel.json` rewrites every path except `/api/*` to `index.html`, so client-side routes like `/resume` work on direct load and refresh without shadowing the functions.
