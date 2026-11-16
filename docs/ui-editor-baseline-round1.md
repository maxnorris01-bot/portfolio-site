# UI Editor formatting round 1: Step 1 baseline and scorer check

Recorded 2026-11-15 on branch `feat/ui-editor-format1`, at `910b228` (main) plus the Step 0 commit `1fc4ae3` (docs and specs only), headless Chromium
(Playwright, `--use-angle=swiftshader`), flag OFF unless noted. Nothing in the page had changed yet.

## Baseline (before any page change)

| Check | Result |
|---|---|
| `npm test` | 790 tests: **774 pass, 0 fail, 16 skipped** |
| `tsc -b` | clean (exit 0) |
| `eslint .` | clean (exit 0) |
| `vite build`, flag ON | main bundle `index-Su3KfRi8.js` **244.31 kB, 77.04 kB gzip**; page chunk `UiEditor-JpX2EBl8.js` **302.06 kB, 88.42 kB gzip**; page CSS `UiEditor-DvN9coXy.css` 9.13 kB (2.07 kB gzip); main CSS 23.38 kB (5.62 kB gzip) |
| `vite build`, flag OFF | main bundle `index-DFK8jLoo.js` 244.28 kB, 77.03 kB gzip; the same page chunk is emitted (never requested) |
| Original gate on the real page (`vite preview`, flag ON, host 1920 x 1080) | **18 PASS, 2 REFUSED (S15, S16), 0 FAIL** |
| `check:layout --home` (flag ON, four planets) | "All layout targets met", at 1280x720, 1366x768, 1440x900 and 1920x1080. Planet row padding 5.8 / 11.7 / 6.7 / 17.8 px (the 1920 value is the known explained miss); page height equals window height at every size; UI Editor planet card 209 / 213 / 242 / 253 px tall |
| `check:layout --style`, `CHECK_PAGES="UI Editor"` | "All layout targets met": h1 28 px (36 from 1920), body 16, min text 14; paragraph lines 59-76 characters on desktop, 33-47 at 390x844; at all seven sizes |

## Scorer check (the checks can fail where they should)

The runner's round 1 support was built first (see `docs/ui-editor-gate-log.md`), then run against two small stubs built on the real engine: the original one
(`reference/index.html`, picker UI) for the five original faults, and a new one (`reference/round1.html`: gallery, hidden-until-open bar, device frame, rotate,
scale to fit, pointer conversion) for the four new ones. A control (no fault) passes every action it runs.

| Stub | Fault | Must fail | Result |
|---|---|---|---|
| original | none (control) | none | S04, S05, S09: PASS on every check |
| original | `half-drag` | P1 | **P1 failed** on S04 (left 110 against 130) and S05 (width 260 against 240) |
| original | `drop-last-edit` | P2 | **P2 failed** on S04, S05, S09 |
| original | `touch-neighbour` | P3 | **P3 failed** on S04, S05, S09 (P4 also failed: the change adds a line) |
| original | `extra-line` | P4 | **P4 failed** on S04, S05, S09 |
| original | `no-dot` | P5 | **P5 failed** on S04 (no dot on Position) |
| round 1 | none (control) | none | N01, N02, N04, N05, N08, N09: all 6 PASS |
| round 1 | `no-scale`: pointer deltas not divided by the scale | N08, N09 | **N08 failed** (width 320, wanted 327.66 = 280 + 40 / 0.8393) and **N09 failed** (left 130, wanted 146.51 = 90 + 40 / 0.7078), both P1; N01, N02, N04, N05 passed |
| round 1 | `visible-undo`: Undo drawn in the bar on the first visit | N01 by P6 | **N01 failed**, P6 (`absent: visible: Undo`) and the bar-buttons check (Samples, Paste, Upload, Undo); the others passed |
| round 1 | `blank-mini`: blank miniatures | N01, N04 | **N01 failed** (miniature body has no children, marker box 0 x 0, on landing and email) and **N04 failed** (no marker in the miniature, all three samples); the others passed |
| round 1 | `off-centre`: frame pushed 30 px off the stage centre | N05 | **N05 failed** (centre off by 15.00 px); N08 and N09 also failed, because their device check includes the centring |

Two things went wrong on the way and are recorded: my first loop over the faults never applied them (a shell word-splitting slip: every run looked like a
control), which I noticed because all four came back PASS, and fixed; and the stub's gallery first stayed visible after opening a sample (its CSS `display: flex`
beat the `hidden` attribute), which N02 caught as a P6 failure; the stub was fixed, not the spec. A real page needs the same care with `hidden`.

**Result: the scorer check passed.** Every injected fault is caught by the check meant to catch it, and the controls pass. The stubs are not the product.
N06, N07, N10 and N11 are not part of the required fault list; they are exercised for the first time on the real page.
