# Vendored UI Editor engine

`engine.js` is the editing engine of the UI Editor, copied in as one built file. The page (`src/pages/UiEditor.tsx` and
`src/ui-editor/`) imports only this file, through `engine.d.ts` (strict types, no `any`). It is **not** a dependency: the
engine's source lives in its own repository (`ui-editor`, https://github.com/maxnorris01-bot/ui-editor, public, MIT), and this copy is public too (see the README at the repo root).

- **Source:** the `ui-editor` repository at commit `02b946673684aa26e5699fefcde49ad673a4888d` (`main`).
- **Size:** 292,819 bytes, 82.8 KB gzip. SHA-256 `a073a76d306cf8326cd833fd34ff449ef046144d20d05464518b566e9bede9bb`.
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
