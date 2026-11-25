# UI Editor formatting round 7a: the Sides popover fits, and more fonts (2026-11-25)

Branch `feat/ui-editor-format7` (the existing branch, unpushed), on `main` `c75b34c`. Behind `VITE_SHOW_UI_EDITOR`; flag OFF is as before (flag checks 16/16). Parts A and B only; the colour menu is round 7b. No engine change (the vendored engine is a build of `a5f954a`, rebuilt twice to the same SHA-256; the engine repo is clean).

## Verdict: PASSES (final run on `86dad72`, gate 07:50:53 to 07:56:11 UTC, 5 min 18 s, 102 specs timed)
| Item | Result |
|---|---|
| Z01 (Sides popover) | PASS (both fields at 1000, 1290, 1440, 1920 and the Phone view at 390) |
| Z02 (fonts) | PASS (41 options, each written and undone) |
| Z07 (kept) | PASS: the original 20 18 PASS 2 REFUSED 0 FAIL; round 1 9 PASS; R2 16 PASS; R3 12 PASS, 3 RETIRED, T10 FAIL (the already-failed locked spec); R4 12 PASS (U02 retired); R5 6 PASS, 3 RETIRED; R6 12 PASS; Y01 to Y14 all PASS |
| `npm test` | 907 tests, 891 pass (885 before + 6 new), 0 fail, 16 skipped |
| `tsc -b`, `eslint`, builds ON and OFF | clean; flag checks 16 of 16; no-op round trips (4 files) PASS; extras 20 of 20 |
| check:layout | Home meets every target (known misses only); the UI Editor style check met |
| Scorer check | the six faults caught first time; every earlier fault (stage 1 to 3 of insert 1, rounds 1 to 6, originals) re-run, all caught |
| Locked files | 0 diff lines for the seven earlier locks, the insert specs and the round 7a specs; the insert rules lock and the round 7a rules lock are exact prefixes of their files |
| Baseline | Z01 FAILS on HEAD at 1440 and 1920 (see the gate log, #57 to #60) |

Bundles, flag ON: main 244.31 kB / 77.04 gzip (unchanged); page chunk 382.35 / 113.84 (379.47 / 113.05 before); page CSS 29.87 / 5.94 (29.84 / 5.93).

## What changed
- **Sides popover:** `.ue-popover` is `width: max-content` with `max-width: calc(100vw - 16px)` (it was `max-width: 100%` of the Spacing group, which is 190 to 250 px wide at 1440 and 1920); a layout effect moves it left when it would end within 8 px of the window's edge. Measured: 872..1170 at 1440, 1163..1461 at 1920, 29..327 at 1290; in the stacked layout it is one column, 186 px wide (31..217 at 1000, 25..211 at 390), steppers 152 px. Also checked at 1048, 1100, 1200, 1366, 1600 and 2560 px: inside the window at all.
- **Fonts:** `ORIGINAL_FAMILIES` (12) then `SYSTEM_FONTS` (29: serif 8, sans-serif 11, monospace 5, display 5; the values are in `docs/ui-editor-gate-rules-round7a.md` section 3), `FAMILIES` is the two together. The page's limits list gains "Fonts show only if your computer has them." (regrouped to six paragraphs of at most 50 words).

## Amendments
**A1** (rules section 7): round 4's `fontShows` (U06) reads the first options of the select on the real page and the round 7a stub, because the 29 new fonts follow the twelve; found by the first run of U06 on the built page, before the final run; the earlier stubs are still read exactly. No other amendment.

## Iterations
No labelled iteration: the final run is the first complete run of the final code. Earlier partial runs (kept): the dry runs before the lock (a scratch copy), the first run of U06 on the built page (A1), the first re-run of the earlier faults (a stub fault in my own stub's font select width, fixed in the stub; both sets kept).

## Existing tests edited (for Max's decision)
1. `tests/uieditorround2.test.ts` (on the list): the `FAMILIES` labels assertion now checks the first 12 and the length 41; the option count is `1 + FAMILIES.length`.
2. `tests/uieditorround4.test.ts` (**not on the list**): `o.length === 13` could not hold with 41 families; it is now `1 + FAMILIES.length`, with a new assertion that the twelve are still first in order. Please say if you want it handled differently.
Nothing deleted or weakened. New: `tests/uieditorround7a.test.ts`. No file was reverted with git.

## Font list
Serif: Palatino Linotype, Book Antiqua, Garamond, Baskerville, Cambria, Constantia, Didot, Rockwell. Sans-serif: Segoe UI, Calibri, Candara, Corbel, Century Gothic, Gill Sans, Optima, Futura, Franklin Gothic Medium, Lucida Sans Unicode, Geneva. Monospace: Consolas, Menlo, Monaco, Lucida Console, Andale Mono. Display: Impact, Arial Black, Comic Sans MS, Brush Script MT, Copperplate. Each stack: its name, two or three fallbacks, a generic family (serif, sans-serif, monospace, cursive or fantasy).

## Screenshots (headless; read 6 of the 30 taken)
Padding and Margin popovers at 1000, 1290, 1440, 1920 and 390 on the landing page and the email (the chart, an SVG, has no Sides), and the font select after choosing Palatino Linotype. Read: landing 1440 Padding, landing 1290 Margin, landing 1000 Margin, landing 390 Padding, email 1920 Margin, email 1440 font chosen. All fit, labels sit above their steppers. **The native font select's open list cannot be captured headless**, so its look is not verified. One visible limit: a long font name is clipped in the closed select (at 1440 "Palatino Linotype" shows as "Palatino |"), because the select is as wide as before; widening it would change the group layout, which this round must not do.

## Not verified
A real device, Safari, Firefox; how any of the fonts look on a machine that has them (the gate checks only the value written); the native select's open list.

## How to look locally
`VITE_SHOW_UI_EDITOR=true npm run dev`, open `/ui-editor`, click an element (a card), open `Sides` under Padding or Margin, open the font select.
