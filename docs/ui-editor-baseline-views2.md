# UI Editor views stage 2: baseline (before any page change)

Recorded 2026-11-26 on branch `feat/ui-editor-views2`, created from `main` at `636f580` (PR #79, "three views (Tablet editable), no Link, dots or Review, nudge fixes"). Pulled first: already up to date. Engine: vendored `02b9466` (`customEdits` and `resetView` are in `src/ui-editor/vendor/engine.js` and its types; the engine is not rebuilt). The engine repo `~/Desktop/Projects/ui-editor` is clean.

| Item | Baseline |
|---|---|
| `npm test` | 925 tests, 909 pass, 0 fail, 16 skipped (2 s) |
| `tsc -b`, `eslint .` | clean |
| Gate | no full gate run of its own on `636f580`: the last regression (the no-nudge round, on the page that became `636f580`) was Q01 to Q09 9 of 9, X01 to X32 32 of 32, 80 older specs all PASS except T10 (the known failure) and S15 (REFUSED as before) |
| Layout | `reference/views2-baseline.json` (`probe-views2.mjs`): at 1000, 1280, 1440 and 1920 px in Desktop, Tablet and Phone, the x, width, top and height of every ribbon group and the boxes of every quick-bar button. The bar is one row at 1280, 1440 and 1920 px (52 px) and two or three rows at 1000 px; no view is customised |
| Quick bar names (Phone, nothing customised) | Samples, Undo, Redo, Insert, Comment, Desktop, Tablet, Phone, Rotate, Download, Reset all |
| Truth values | `validate-views2.mjs`: 28 of 28 (the headline's font size at 7 widths for four edit lists, from the engine's export read in plain Chromium) |

The unchanged page fails the new specs it should (the scorer check, `docs/ui-editor-gate-log.md`): H02 to H13 FAIL, H01 PASSes (nothing is marked, which is true there), X17 and X28 FAIL against their amended name lists.
