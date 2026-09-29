# portfolio-site

Personal portfolio for Max Norris. Built with Vite, React, TypeScript and React Router.

## Routes

- `/` — Home
- `/resume` — Resume
- `/satellite-conjunction-screening` — Satellite conjunction screening project

## Development

```sh
npm install
npm run dev      # local dev server
npm run build    # type-check + production build to dist/
npm run preview  # serve the production build
```

## Structure

- `src/styles/tokens.css` — design tokens (colors, fonts). All colors are referenced through these variables.
- `src/data/satelliteTool.ts` — stats shown on the satellite tool page; swap in values from the pipeline's report JSON here.
- `src/pages/` — one component per route; `src/components/` — shared nav bar and orbit illustration.

## Deployment

Deploys to Vercel as a static Vite app (framework preset: Vite, output `dist`).
`vercel.json` rewrites all paths to `index.html` so client-side routes like `/resume` work on direct load and refresh.
