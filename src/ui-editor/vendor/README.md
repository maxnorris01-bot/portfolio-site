# Vendored UI Editor engine

`engine.js` is the editing engine of the UI Editor, copied in as one built file. The page (`src/pages/UiEditor.tsx` and
`src/ui-editor/`) imports only this file, through `engine.d.ts` (strict types, no `any`). It is **not** a dependency: the
engine's source lives in a private repository (`ui-editor`), and this copy is public once merged (see the README at the repo root).

- **Source:** the `ui-editor` repository at commit `a5f954a610cfdf2693fadd2a7b105b4acf59a9e3` (`main`).
- **Size:** 290,095 bytes, 81.9 KB gzip. SHA-256 `7d23069c17f658eb7836abedfda8fc4601f03e1eb0cda986e63107948c827916`.
- **Contents:** the engine plus parse5, entities, postcss, nanoid, picocolors and source-map-js, bundled. Their licences are in
  `THIRD-PARTY-NOTICES.md`.
- **Do not edit `engine.js` by hand.** If the engine changes, rebuild.

## Rebuild

In a checkout of `ui-editor` at the commit you want (its `npm install` done), from the engine repo's root:

```sh
git rev-parse HEAD   # the commit; put it in the banner below
./node_modules/.bin/esbuild engine/src/index.ts --bundle --format=esm --platform=browser --target=es2022 \
  --minify --legal-comments=none \
  "--banner:js=/* Vendored UI Editor engine (Max Norris, MIT). Source: the private ui-editor repo, commit <HASH>. Built with: esbuild engine/src/index.ts --bundle --format=esm --platform=browser --target=es2022 --minify --legal-comments=none (see README.md). Bundles parse5, entities, postcss, nanoid, picocolors and source-map-js: see THIRD-PARTY-NOTICES.md. Do not edit by hand. */" \
  --outfile=/path/to/portfolio-site/src/ui-editor/vendor/engine.js
```

The output goes straight into this folder, so nothing is written inside the engine repository (its `git status` stays clean). Then:

1. Update the commit, size and SHA-256 above, and `THIRD-PARTY-NOTICES.md` if the bundled packages changed (leave email addresses out of the
   copied licence texts).
2. If the engine's API changed, update `engine.d.ts` by hand from `engine/src/types.ts` and the signatures in `engine/src/index.ts`.
3. Run `npm test`, `npx tsc -b` and the gate (`docs/ui-editor-gate-rules.md`).
