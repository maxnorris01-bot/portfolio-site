# UI Editor formatting round 5: Step 1 probe, baseline and scorer check

Recorded 2026-11-18 on branch `feat/ui-editor-format1`, at `e6f1b94` (round 4 session record) plus the Step 0 commit `1642321` (round 5 rules and specs only). Headless Chromium
(Playwright, `--use-angle=swiftshader`), flag ON. **No page file had changed when any baseline number was measured** (`git diff 7e6e8be..e6f1b94 -- src` is empty: the page of
the last round-4 build is the page measured here).

## Probe: resizing from the west and north edges (read-only, `scripts/ui-editor-gate/probe-west.mjs`)

Today a west drag changes the width only, so the left edge stays and the element grows to the right, pushing what follows. The probe asks the engine for the two exact
ways on each element kind of the samples (a 40 px drag outwards, desktop, unlinked) and measures the target's four edges and how many OTHER elements moved:

| Element (kind) | Way A: size + compensating negative margin | Way B: size + compensating offset (transform) |
|---|---|---|
| `#cta` (inline-block link), west | left -40, right 0, **0 others moved** | left -40, right 0, 0 others moved |
| `#art` (flex item at the right of its row), west | left -40, right 0, **0 others moved** | left -80 and right -40 (it moves twice), 3 others moved |
| `#art`, north | top -40, bottom 0, **0 others moved** | top -40, 21 others moved |
| `#footer` (block), west and north | exact, **0 others moved** | exact west; north moved 2 elements |
| `#headline`, `.lead` (block with a margin shorthand in its rule), west and north | **refused by the engine**: "margin-left and margin are the same property family; mixing shorthand and longhand is not supported in v1" | west: left -40 but 3 others moved; north: 21 others moved |
| `#card-plan` (flex item that grows), west | refused (flex-grow above 0, as for east) | refused |
| `#cta` (inline-block), north | top -21.3 and bottom +18.7: **not exact** (the line box's baseline moves it) | top -49.3, 21 others moved |
| email `#hello` (a heading in a table cell), `#pick-two` (a cell), west and north | not exact (the cell, not the element, takes the margin: 20 to 30 others moved) | 20 to 30 others moved |

**Choice: way A.** The width (height) goes up by what the edge moved and the margin goes down by the same amount, so the margin box keeps its size: the opposite edge and every
other element stay put (this works for a left-anchored element, for a right-anchored flex item and for a block alike). Way B pushes neighbours or moves the element twice.
Because A is not exact everywhere, the page tries it first on a scratch preview (offscreen, the same edit list plus the trial edit) and keeps it only when the dragged edge
landed within 1.5 px of the pointer, the opposite edge within 1 px of where it was, and no element outside the target moved more than 1 px. Otherwise the OLD behaviour (width or
height only, the opposite edge moves) is used and the status line says one plain line. An engine refusal on the trial leads to the same fallback, so the flex-grow refusal stays
the old refusal. SVG elements keep the old behaviour with the same line.
With Link off (Desktop only) `#cta` west and `#art` north moved no other element and left Phone untouched at 1280, 641, 640 and 390 (the dry run for V07).

## Baseline (before any page change)

| Check | Result |
|---|---|
| `npm test` | 864 tests: **848 pass, 0 fail, 16 skipped** |
| `tsc -b`, `eslint .` | clean |
| `vite build`, flag ON | main `index-DewwngZj.js` **244.31 kB, 77.04 kB gzip**; page chunk `UiEditor-B08IpN_h.js` **329.19 kB, 97.10 kB gzip**; page CSS `UiEditor-DZ2WO7Bt.css` **19.97 kB, 4.10 kB gzip** |
| Original 20 | **18 PASS, 2 REFUSED, 0 FAIL** |
| Round 1 N03 to N11 | **9 PASS** |
| Round 2 R01 to R16 | **16 PASS** (retired checks skipped: R04 steps 3, 10, 14, 16; R05 step 2; R07 steps 11 to 17; R14 `onlyRotateText`) |
| Round 3 | 12 PASS, T10 FAIL (the locked spec flaw), T01, T04, T13 RETIRED (whole), T02, T05, T06, T14, T15 pass with their retired checks skipped |
| Round 4 | 12 PASS (U06 read at 15), U02 RETIRED; U11 passes with its four `liveButtons` skipped |
| Round 5 V01 to V09 on the old page | **0 PASS, 9 FAIL**, as expected |
| No-op round trips | 4 of 4 files byte-identical |

**Ribbon geometry of the old page** (`scripts/ui-editor-gate/geometry-dump.mjs`, landing sample, `#card-build` selected; full JSON kept in the scratchpad): at 1280 x 800 the groups of
band 1 are Font 33..374, Paragraph 374..633, Size 633..901, Shape 901..1247 and those of band 2 are Spacing 33..393, Arrange 393..838, Grid 838..1247: **band 2's edges do not
match band 1's** (393 against 374, 838 against 901), which is the "separators do not line up" Max saw. At 1440 the same (448 against 416, 944 against 1019). At 1920 one band of
seven groups, widths 300, 219, 228, 307, 213, 299, 262 (their centred contents leave gaps). The ribbon is 224 px high in two bands (129 in one), the quick bar 54, the strip 26,
the status line 32 in its own box; they are separate bordered boxes with 16 px gaps.

## Runner changes (logged as #30 to #32 in `docs/ui-editor-gate-log.md`)

The runner loads `specs-round5.json` and applies its retired checks to the real page and the round 5 stub only; the new asserts and steps are the ones listed in its
`vocabulary`. Mappings: no File selector (`selectFile` does nothing), the Copy button of a file's own section, one Download that saves every file (the runner clicks it once and
collects every download; `--noop` too), the code asserts read the file's section. A reading: the path segments and `Select parent` are selection aids in the strip and are not
counted as ribbon controls by the asserts that count controls (`ribbonGroups`, `ribbonLabels`, `enabledOnly`). The `load` step re-points the runner's source files at the sample it
opens (V05 and V06 open two). No spec, rule, sample or expected value was touched.

## Scorer check

A new stub, `scripts/ui-editor-gate/reference/round5.html`, follows the round 5 contract on the real engine, with `?fault=NAME` (`run.mjs --stub6 --fault NAME --only ...`). **The
control passes V01 to V09.** Every fault fails where stated:

| Fault | Must fail | Result |
|---|---|---|
| `col-offset`: band 2 is 8 px off band 1's columns | V01 | **V01 FAIL** (Spacing left 21.0 against 13.0, and the other five edges) |
| `centred`: group contents centred | V02 | **V02 FAIL** (controls start 15 to 78 px inside the group, want 14) |
| `card-gap`: the status line is a separate box with its own border and a gap | V03 | **V03 FAIL** (own side border; 8 px between the ribbon and the status line) |
| `large-60`: the large buttons are 60 px wide | V04 | **V04 FAIL** (Move up is 60.0 x 58.0, and the other three) |
| `file-selector`: a File selector in the bar | V05 | **V05 FAIL** (1 control named File) |
| `download-one`: Download saves one file | V05 | **V05 FAIL** (landing-edited.html only; the status lacks landing.css) |
| `download-bytes`: a downloaded file has changed bytes | V05 | **V05 FAIL** (not the section's text) |
| `no-header`: a section has no header | V06 | **V06 FAIL** (header "null") |
| `copy-wrong`: a Copy button copies the other file | V06 | **V06 FAIL** (clipboard 1279 chars, export 1440) |
| `west-width-only`: a west drag changes the width only | V07 | **V07 FAIL** (left edge moved 0, want -40; right edge moved 39.66) |
| `west-moves-other`: a west drag by width and offset | V07 | **V07 FAIL** (right edge moved 39.66, want 0; neighbours pushed) |
| `path-edits`: clicking a path segment edits the document | V08 | **V08 FAIL** (Undo enabled; P3 font-size 16px -> 30px) |
| `no-select-parent`: no Select parent button | V08 | **V08 FAIL** (the button is not there: the runner times out clicking it) |

The earlier faults, **re-run with the changed runner** on their own stubs, **all still fail where they did**, and the controls pass: the five of the first page gate (`reference/index.html`),
the twelve of round 2 (`round2.html`), the twenty of round 3 (`round3.html`, T10's control still fails: spec flaw 1 of round 3) and the twenty-two of round 4 (`round4.html`).

**Result: the scorer check passed. No control failed, so the round goes on.**
