# UI Editor page: Step 1 baseline and scorer check

Recorded 2026-11-15 on branch `feat/ui-editor-page`, at `ad60193` (main) plus the Step 0 commit (docs, samples and specs only, no code
change), headless Chromium, flag OFF (the default).

## Baseline (before any page code)

| Check | Result |
|---|---|
| `npm test` | 755 tests: **739 pass, 0 fail, 16 skipped** (Max saw 737 pass, 0 fail, 16 not run on 2026-11-08; two tests were added since) |
| `tsc -b` | clean (exit 0) |
| `eslint .` | clean (exit 0) |
| `vite build` | clean. Main bundle `index-DhWpuj8W.js` **243.46 kB, 76.70 kB gzip**; `Shop` chunk 115.96 kB (29.73 kB gzip); main CSS 23.38 kB (5.62 kB gzip) |
| `npm run check:layout -- --home` | "All layout targets met (apart from the known misses in scripts/check-layout.expected.json)" at 1280x720, 1366x768, 1440x900 and 1920x1080, for SatPOV, ShopAI and Résumé chosen. Page height equals window height at every size (720, 768, 900, 1080). Planet card 153 to 187 px tall, 63 to 79 characters a line; Home row padding 5.8 / 11.7 / 6.7 / 17.8 px (the 1920x1080 value is the known explained miss) |

The Home numbers are the reference for the four-planet comparison in Step 3.

## Scorer check (the checks can fail where they should)

The gate runner (`scripts/ui-editor-gate/run.mjs`, pure checks in `checks.mjs`) was run against a small stub editor
(`scripts/ui-editor-gate/reference/index.html`) built on the real engine, which follows the same UI contract as the page and can be
switched into five faults with `?fault=NAME`. Three actions were run per fault: S04 (drag-move), S05 (drag-resize from the east handle)
and S09 (typed font size, Link ON). Without a fault all three are PASS on every check (the control).

| Fault | Check that must fail | Result |
|---|---|---|
| `half-drag`: moves and resizes by half the pointer distance | P1 | **P1 failed** on S04 (left edge 110 against 130) and S05 (width 260 against 240); S09 has no drag and passed |
| `drop-last-edit`: the export lacks the last edit | P2 | **P2 failed** on S04, S05 and S09 (the fresh page differs from the preview) |
| `touch-neighbour`: an edit also changes the next sibling's colour, in preview and export | P3 | **P3 failed** on S04, S05 and S09 (a colour change on the sibling; P4 also failed, as the change adds a line) |
| `extra-line`: the export has one extra added line | P4 | **P4 failed** on S04, S05 and S09 (2 changed lines against a budget of 1; 3 against 2) |
| `no-dot`: the unlinked dot is never drawn | P5 | **P5 failed** on S04 (no dot on Position); S05 and S09 draw no dot by design and passed |

A first run of `touch-neighbour` used a margin on the neighbour; the engine refused it on two of the three actions (a margin shorthand
on the neighbour), so P3 was only exercised once. The fault was changed to a colour change and re-run: P3 fails on all three. Both runs
are recorded here. Result: **the scorer check passed**; every injected fault is caught by the check meant to catch it, and the control
passes. The stub is not the product: it only exists so the scorer could be checked before the page was built.
