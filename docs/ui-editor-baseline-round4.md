# UI Editor formatting round 4: Step 1 baseline, Limits-sentence check and scorer check

Recorded 2026-11-17 on branch `feat/ui-editor-format1`, at `79d0f73` (round 3 notes) plus the Step 0 commit `16b17c1` (round 4 rules and specs only).
Headless Chromium (Playwright, `--use-angle=swiftshader`), flag ON unless noted. **No page file had changed when any baseline number was measured**: the
numbers come from a build of `79d0f73` made before the first page edit (`vite build` into the scratchpad, served by `vite preview`).

## Baseline (before any page change)

| Check | Result |
|---|---|
| `npm test` | 852 tests: **836 pass, 0 fail, 16 skipped** |
| `tsc -b`, `eslint .` | clean (exit 0) |
| `vite build`, flag ON | main `index-rBqAUEZn.js` **244.31 kB, 77.03 kB gzip**; page chunk `UiEditor-Cebpm6gV.js` **329.45 kB, 97.13 kB gzip**; page CSS `UiEditor-CSeffD78.css` **19.45 kB, 3.94 kB gzip**; main CSS 23.38 kB (5.62 kB gzip) |
| `vite build`, flag OFF | main `index-C1dO4ikj.js` 244.28 kB, 77.03 kB gzip |
| Original 20 (real page, host 1920 x 1080) | **18 PASS, 2 REFUSED (S15, S16), 0 FAIL** |
| Round 1 N03 to N11 | **9 PASS** (N01 and N02 stay RETIRED) |
| Round 2 R01 to R16 | **16 PASS** with the retired checks skipped (R04 steps 3, 10, 14, 16; R05 step 2; R07 steps 11 to 17; R14 `onlyRotateText`) |
| Round 3 T01 to T16 | **14 PASS, 1 FAIL (T10, the locked spec flaw of round 3), 1 RETIRED (T01)**; T02, T06 and T15 pass with their retired checks skipped |
| Round 4 U01 to U13 on the old page | **2 PASS (U05, U12), 11 FAIL** (as expected: the old page has tabs, no labels, a tall status card and so on). U05 and U12 already hold on the old layout, so on the real page they only guard against going backwards |
| No-op round trips | 4 of 4 files byte-identical |
| Engine repo | `git status` clean at 27065d8 |

## The Limits sentence (item "Limits sentence", spec U13): verified

`scripts/ui-editor-gate/probe-limits.mjs` (read-only; real mouse; flag-ON build of `79d0f73`):

| Drag | Result |
|---|---|
| `#cta` (left of its row), east handle, 37 px, Snap on | right edge 285.34 -> **320.00** (nearest line to 322.34) |
| `#cta`, east handle, 43 px, Snap on | right edge 285.34 -> **328.00** |
| `#cta`, east handle, 37 px, Snap on, Alt held | right edge 285.34 -> 322.00 (free) |
| `#art` (fixed to the right end of its row), east handle, 40 px, Snap on | right edge 1190.00 -> **1190.00** (it keeps its right edge) |
| `#art`, east handle, 37 px, Snap on | right edge 1190.00 -> **1190.00** |
| `#art`, west handle, -37 px, Snap on | left edge 910.00 -> **872.00** (a line: the edge that can move lands on one) |

So "With Snap on, a dragged edge lands on a grid line only when that edge can move; an element fixed to the right of its row keeps its right edge."
is true on this page for the two samples' elements. The sentence goes into the Limits list in Step 2 and U13 is scored (no `--u13-na`). The probe is
re-run on the final build.

## Runner changes (logged as #25 to #28 in `docs/ui-editor-gate-log.md`)

The runner loads `specs-round4.json`; a spec retired as a whole (T01) is reported `RETIRED` and not run; the round 4 retired checks apply to the real page
and the round 4 stub only (the earlier stubs still have tabs, and show that the earlier faults are still caught); the `tab` step does nothing when the page
has no tab; the Tab walks start by focusing the last focusable element before the ribbon (a script `focus()` after a mouse click does not get
`:focus-visible`, so the first control is reached by a real Tab press); 13 new asserts (vocabulary in `specs-round4.json`). One runner bug found at the
first control run and fixed in the runner: `ribbonLabels` read a `<select>`'s `innerText` (all its option texts) as its own label; only buttons have an
own text. No spec, rule, sample or expected value was touched.

## Scorer check (the checks can fail where they should)

A new stub, `scripts/ui-editor-gate/reference/round4.html`, is a small editor on the real engine that follows the round 4 contract (quick bar with words, a
strip, ONE ribbon of seven labelled groups that share the width and wrap into one or two bands, a slim status line, view aids always enabled, grid and
snap, a multi-file code view, a Limits list), with a switchable fault (`?fault=NAME`, `run.mjs --stub5 --fault NAME --only ...`). **The control (no
fault) passes U01 to U13**, and U13 reads FAIL under `--u13-na` (the sentence is present).

| Fault | Must fail | Result |
|---|---|---|
| `tab-bar`: a tab bar left in the strip | U01 | **U01 FAIL** (`noTabs`: found tablist and tab) |
| `group-missing`: the Grid group is absent | U01 | **U01 FAIL** (groups Font to Arrange, want Grid too) |
| `group-order`: Grid stands before Spacing | U01 | **U01 FAIL** (order differs) |
| `wrong-band`: Grid wraps into a second band at every width | U01 (brief) | **U02 FAIL** (2 bands at 1920, 3 at 1440 and 1280); **U01 passes it**: its definition ("all seven visible at 1920, every control in its group") does not look at bands, which the brief gives to U02 ("at 1920 there is one band"). Caught, by U02 |
| `left-packed`: groups do not grow, empty space at the right | U02 | **U02 FAIL** (last group 264, 516 and 356 px short of the right inner edge) |
| `no-label`: Height has no visible label | U03 | **U03 FAIL** (no visible label within 14 px for Decrease Height, Height, Increase Height) |
| `single-letter`: Width labelled W | U03 | **U03 FAIL** (a single character; the table) |
| `old-abbrev`: Border width labelled Thick | U03 | **U03 FAIL** (an abbreviation; the table) |
| `no-tooltip`: Border radius has no tooltip | U03 | **U03 FAIL** (`tooltips`: Border radius: no tooltip) |
| `height-selection`: the strip is taller while an element is selected | U04 | **U04 FAIL** (ribbon 143 against 129, stage top 249 against 235) |
| `heights-off`: small controls 34 px | U05 | **U05 FAIL** (34.0 high, want 26-28) |
| `clip-fill`: the Fill field is too narrow for "Transparent" | U06 | **U06 FAIL** (Background shows "Transparent" in 26 px, needs 68; the colour fields too) |
| `clip-font`: the Font family select is too narrow for "Georgia" | U06 | **U06 FAIL** (shows "Georgia" in 58 px, needs 76.2) |
| `status-tall`: a 64 px status card | U07 | **U07 FAIL** (64.0 px high, want at most 40) |
| `status-moves-stage`: the status has no height until it has a message | U07 (and U04) | **U07 FAIL** (height 28.0, idle was 2.0; stage top moves) and **U04 FAIL** (stage top 235 against 209) |
| `tab-jump`: a positive tabindex makes Tab jump | U08 | **U08 FAIL** (Tab order differs; Grid spacing is visited first) |
| `grid-disabled-empty`: Grid, Snap, Grid spacing disabled with nothing selected | U09 | **U09 FAIL** (Grid, Snap and Grid spacing disabled) |
| `snap-floor`: snap rounds down | U10 (and U09) | **U10 FAIL** (right edge 320, nearest to 325.34 is 328) and **U09 FAIL** (left 120, nearest to 127 is 128) |
| `review-no-words`: Review unlinked shows no words | U11 | **U11 FAIL** (shows "0", want the words) |
| `reset-no-words`: Reset all shows no words | U11 | **U11 FAIL** (shows "", want the words) |
| `small-390`: controls under 44 px at 390 | U12 | **U12 FAIL** (Font family 140x28 and others) |
| `no-sentence`: the Limits list lacks the sentence | U13 | **U13 FAIL** |

The earlier faults, **re-run with the changed runner** on their own stubs: the five of the first page gate on `reference/index.html` (`half-drag` S04, S05;
`drop-last-edit` S04, S05, S09; `touch-neighbour` S04, S05, S09; `extra-line` S04, S05, S09; `no-dot` S04), the twelve of round 2 on `reference/round2.html`
(`paste-stays`, `wrong-step`, `no-shift`, `unit-px`, `no-snap`, `diff-off`, `diff-count`, `no-wrap`, `same-icons`, `enabled-empty`, `free-font`, `bullets`) and
the twenty of round 3 on `reference/round3.html` (`wrong-group` T01 through `small-390` T16) **all still fail where they did**, and the controls pass (R01 to
R15; T01 to T09 and T11 to T16; **T10's control still fails**, spec flaw 1 of round 3; the original control S04, S05, S09). As in round 3, `grid-ignores-scale`
is caught by T11 only (T08 runs at scale 1) and `only-shown` by T14 only (T13's scenarios each change one file).

**Result: the scorer check passed. No control failed, so the round goes on.** Two notes: the brief lists "a group in the wrong band" under U01, and by the
specs' own definitions a band belongs to U02 (so `wrong-band` is caught by U02, and `group-order` by U01); U05 and U12 already pass on the old page, so they
cannot tell old from new, only that the new page did not get worse.
