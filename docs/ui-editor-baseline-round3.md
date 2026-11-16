# UI Editor formatting round 3: Step 1 baseline, bug reproduction, snap probe and scorer check

Recorded 2026-11-15 on branch `feat/ui-editor-format1`, at `c06ee13` (round 2 notes) plus the Step 0 commit `808c111` (round 3 rules and specs only).
Headless Chromium (Playwright, `--use-angle=swiftshader`), flag ON unless noted. **No page file had changed when any of the baseline numbers were
measured** (the page changes were set aside with `git stash` for the flag and `check:layout` runs, and restored after).

## The bug, reproduced first (T14 on the current code)

Script: open the landing sample, `landing.html` is showing, set the headline's font size (+1), compare each exported file to its original.

| File | Changed by the font size edit | Changed by Move up on `#card-build` |
|---|---|---|
| `landing.css` | **yes, 1 change** (one line) | no |
| `landing.html` | no | **yes, 2 changes** |

The font size is written to the companion stylesheet while the code view was showing `landing.html` (the file selector starts on it), so nothing was
highlighted, the counter read "No changes yet" and the selector showed no mark although the export had changed.

**T14 on the current code (the failing run, kept):** `T14 FAIL` (`scripts/ui-editor-gate/out`, log kept in the session record). Its three scenarios fail
for the reasons in the bug report:

- `bugState`: option "landing.css", want "landing.css (1)"; the shown file is landing.html, want landing.css; the tooltips "Copy code" and "Download"
  do not name landing.html; the counter is "No changes yet", want "0 of 1".
- `walkChanges`: the page counts 2 changes over all files (the shown file's), the diff has 3; the shown file is landing.html, want landing.css;
  options "landing.html" and "landing.css" carry no counts.
- `handPick`: option "landing.html", want "landing.html (2)".

After the fix (first build commit) T13 and T14 pass on the real page, and R11, R12, R13, S09 and S20 still pass.

## The snap probe (item 4: how a move's offset lands)

`scripts/ui-editor-gate/probe-snap.mjs` (read-only, writes nothing): for each element kind of the samples, ask the engine for an `offset` that would put
the element's top-left on the nearest multiple of 8 of the preview's document coordinates (exact fractional delta, and the delta rounded to whole px),
and measure where it lands.

| Element | Exact (fractional) offset | Whole-px offset |
|---|---|---|
| landing `#headline` (block, top 73.3) | lands on the grid line, off by 0 | off by 0.3 px |
| landing `#cta` (inline-block link, top 191.69) | lands exactly | off by 0.31 px |
| landing `#art` (flex item, fixed width) | exactly | exactly (its position is a whole number) |
| landing `#card-build` (flex item that grows, left 480.66) | exactly | off by 0.34 px |
| landing `.lead` (paragraph; the engine marks it `data-ue` first) | exactly | off by 0.31 px |
| landing `#footer` (block at the page edge) | exactly | exactly |
| email `#hello` (heading in a table cell), `#pick-one` (a table cell) | exactly | exactly |
| chart `#bar-tue` (SVG rect) | **refused as an unlinked edit**: "unlinked (environment-only) edits are not supported for SVG in v1" | same |

**Result:** the engine writes the move as `transform: translate(Xpx, Ypx)` inside the Desktop media rule and accepts **fractional pixels** (for example
`translate(38px, 38.7031px)`), so every HTML element kind can be put on a grid line exactly: the page computes the delta from the element's measured
position and passes it unrounded. An element at a fractional position is not a problem. An SVG element cannot be moved unlinked at all (the page moves
SVG linked, as before); snap is off for SVG by design.

## Spec flaws found while running the scorer check (mine, in the locked file; recorded, not fixed)

These were found at the first control run of the stub, before any page change. The locked files are not edited; each is handled by a logged runner
reading or reported as a miss.

1. **T10 cannot pass on any page.** It drags the east handle of `#art` and expects the element's right edge (left + width) to land on a multiple of 8.
   `#art` sits at the right end of its flex row (`justify-content: space-between`), so the width the page writes is honoured on the LEFT: measured on the
   current page, a 40 px east drag gives width 322 and the right edge stays at 1190 (the page's snap does write the snapped width, 322, which would put a
   left-anchored right edge on 1232). The second half of T10 (a resize within 2 px of the parent writes `width: 100%`) is fine. **T10 is expected to
   FAIL on the final page**; the cheapest next test is the same spec on `#cta` (left-anchored). A supplementary, unscored check on `#cta` is run beside
   the pass line (see the session record).
2. **T11 lists P5 but has no P5 assert.** The runner's round 1 rule fails a listed check with no assert. Read as vacuous for T specs (runner change #24):
   the line shows `VACUOUS: P5`.
3. **R07 loses its only P5 assert** when its retired steps (rules section 2) are skipped, which leaves P5 listed with nothing in it. The same reading
   (#24) applies, shown as `VACUOUS`.
4. **T09 `gridAbove`** says `elementsFromPoint` lists the overlay; an element with `pointer-events: none` (which the same assert requires) is never hit-tested.
   Read as: the overlay follows the iframe in document order and is positioned (#22).

## Baseline (before any page change)

| Check | Result |
|---|---|
| `npm test` | 837 tests: **821 pass, 0 fail, 16 skipped** |
| `tsc -b` | clean (exit 0) |
| `eslint .` | clean (exit 0) |
| `vite build`, flag ON | main `index-DGrC0ubE.js` **244.31 kB, 77.04 kB gzip**; page chunk `UiEditor-CvTaFxOo.js` **322.70 kB, 95.01 kB gzip**; page CSS `UiEditor-BMU_p1Y7.css` **17.52 kB, 3.59 kB gzip**; main CSS 23.38 kB (5.62 kB gzip) |
| `vite build`, flag OFF | main `index-B5dmkNX_.js` 244.28 kB, 77.03 kB gzip; the same page chunk is emitted (never requested) |
| Flag checks (OFF and ON, production-style builds) | **16 of 16** |
| Original 20, real page (`vite preview` of the flag-ON build, host 1920 x 1080) | **18 PASS, 2 REFUSED (S15, S16), 0 FAIL** |
| Round 1 N03 to N11 | **9 PASS, 0 FAIL** (N01 and N02 stay RETIRED) |
| Round 2 R01 to R16 | 16 PASS when the retired checks are skipped (R07's steps 11 to 17, R14's `onlyRotateText`); with the old strict reading R07 fails only because P5 is left empty (see flaw 3) |
| Round 3 T01 to T16 | **0 PASS, 16 FAIL**, as expected on the old layout (T13 and T14 fail on the bug, the rest on the missing tabs, groups, grid and snap) |
| `check:layout --home` | "All layout targets met (apart from the known misses in `scripts/check-layout.expected.json`)" |
| `check:layout --style`, `CHECK_PAGES="UI Editor"` | all targets met at 1280x720, 1366x768, 1440x900, 1920x1080, 2000x1100, 2560x1440 and 390x844 (chars per line 67-77 at 1280 and 1366, 47-65 at 1440 and 1920, 50-66 at 2000 and 2560, 46-58 at 390) |

## The Tablet grey (Max's item 3)

I could not reproduce a grey Tablet button as a disabled or dimmed one: in Tablet the selected view button is `disabled: false`, `opacity: 1`, background
navy once settled, and no style of the bar depends on the view. What the scripted read did find: the global `.btn` has `transition: background-color 0.15s`,
and T05's `viewStyle` run on the current page reads the selected button **mid-fade** (`rgba(11, 27, 51, 0.576)` with a grey text colour). That is a
transition caught half way, which is a grey button; in Tablet the preview is rebuilt for a larger device, so a busy main thread holds the fade longer. The
fix is at that cause: the quick bar's buttons have no colour transition, so a selected view button is black at once in every view. I cannot prove this is
the exact thing Max saw; T05 scores the computed style in all four views.

## Scorer check (the checks can fail where they should)

A new stub, `scripts/ui-editor-gate/reference/round3.html`, is a small editor on the real engine that follows the round 3 contract (quick bar, tab bar with
Home and Layout, a fixed-height panel, the Sides popover, the grid overlay and snap with Alt, a multi-file code view) with a switchable fault
(`?fault=NAME`, `run.mjs --stub4 --fault NAME --only ...`). The control (no fault) passes T01 to T09 and T11 to T16; **T10 fails in the control** (flaw 1).

| Fault | Must fail | Result |
|---|---|---|
| `wrong-group`: Border radius in Size, Move up on Home | T01 | **T01 FAIL** (Home/Shape: no control "Border radius"; Layout/Arrange: no control "Move up") |
| `height-shifts`: the Layout panel is 12 px taller | T02 | **T02 FAIL** (panel 104 against 92, ribbon 142 against 130, stage top 216 against 204) |
| `heights-off`: small controls 36 px | T03 | **T03 FAIL** (Font family 36.0 high, want 26-28) |
| `reset-near-undo`: Reset all after Redo | T04 | **T04 FAIL** (not the right-most; gap 6 px, want 24) |
| `tablet-grey`: the selected view button grey in Tablet | T05 | **T05 FAIL** (background rgb(136, 136, 136), want the text colour; the four views differ) |
| `enabled-empty`: ribbon enabled with nothing selected | T06 | **T06 FAIL** (73 controls, enabled: link, Font family, ...) |
| `sides-all`: Top plus changes all four sides | T07 | **T07 FAIL** (paddingRight 32, want 28; field "32px", want "mixed") |
| `grid-spacing`: lines 1 px too far apart | T08, T11 | **T08 FAIL** (declared 9, want 8) and **T11 FAIL** (9 against 8 on screen) |
| `grid-ignores-scale`: grid drawn outside the scaled device | T08, T11 | **T11 FAIL** (on screen 8.01, want 6.71 at scale 0.839); T08 passes (scale 1 there), as the rule says the scale is T11's |
| `grid-in-doc`: a grid element inside the preview document | T08 | **T08 FAIL** (in the preview document: true; element count 32 against 27; P2 and P3 too) |
| `snap-floor`: round down | T09 | **T09 FAIL** (left 120, nearest to 127 is 128; top 104, nearest to 110.3 is 112) |
| `no-alt`: Alt ignored | T09 | **T09 FAIL** (top 112.0 with Alt held, want 110.3 +-1.5) |
| `snap-default-on`: Snap on at load | T09 | **T09 FAIL** (Snap pressed at the start and after the reload) |
| `grid-beats-full`: the grid wins over 100% | T10 | **T10 FAIL**, and **it fails an extra check the control passes**: `exportHas width 100%` (so the second half of T10 does catch it; the first half fails in the control too) |
| `svg-snap`: Snap enabled for SVG | T12 | **T12 FAIL** (Snap enabled) |
| `no-switch`: the view never switches file | T13, T14 | **T13 FAIL** and **T14 FAIL** (shown landing.html, want landing.css) |
| `only-shown`: counts and walks the shown file only | T13, T14 | **T14 FAIL** (the page counts 1 change, the diff has 3). **T13 PASSES it**: T13's three scenarios each change one file, so the all-files count equals the shown file's. The fault is caught, but by T14, not T13 |
| `copy-wrong-file`: Copy always copies the first file | T14 | **T14 FAIL** (clipboard 1279 chars, download 1440) |
| `no-arrows`: tabs ignore the arrow keys | T15 | **T15 FAIL** (after ArrowRight the second tab is not selected) |
| `small-390`: controls 28 px at 390 | T16 | **T16 FAIL** (29 controls too small on Home, 15 on Layout) |

The earlier faults, re-run: the five of the first page gate on the original stub (`half-drag` S04, S05; `drop-last-edit` S04, S05, S09; `touch-neighbour`
S04, S05, S09; `extra-line` S04, S05, S09; `no-dot` S04) and the twelve of round 2 on `reference/round2.html` (`paste-stays` R03; `wrong-step` R06, R07;
`no-shift` R06, R10; `unit-px` R08; `no-snap` R08; `diff-off` R11; `diff-count` R11, R12; `no-wrap` R12; `same-icons` R14; `enabled-empty` R04;
`free-font` R05; `bullets` R15) **still fail where they did**, and the controls pass.

**Result:** the scorer check passed, with two things recorded: T10's control fails (spec flaw 1), and `only-shown` is caught by T14 alone.
