# UI Editor formatting round 1: gate rules (LOCKED in Step 0)

Written 2026-11-15, before any page change of this round. After the commit that adds this file, the rules, the specs
(`scripts/ui-editor-gate/specs-round1.json`) and the originals are never edited. If a rule turns out to be wrong, it is
recorded and Max decides. Sections marked **(mine)** are operational definitions I wrote. The specs were written by Claude
Code, the same agent that builds the page: that is a limit of this gate, not a hidden fact.

This file adds to `docs/ui-editor-gate-rules.md`; it does not replace it. The original rules, the 20 original specs
(`scripts/ui-editor-gate/specs.json`) and the three samples stay byte-identical to commit 910b228.

## 1. What is scored

11 scripted real-mouse specs, **N01 to N11** (`specs-round1.json`), on the real built page, headless Chromium, a fresh
context per spec, no retries. The host window is 1920 x 1080 unless a spec says otherwise (N08 and N09: 1366 x 768; N10 and
N11: 1440 x 900, N11 also 390 x 844). Outcomes are **PASS** or **FAIL** (there is no REFUSED here). A spec passes when every
check it lists passes.

- **N01** First visit with the flag on, nothing open: only Samples, Paste and Upload are visible in the bar; none of View
  (Desktop, Tablet, Phone), Undo, Redo, Reset all, Review unlinked, File, Copy code, Download, Rotate, the stage, the side
  panel, the "Updated code" area is in the DOM or visible; the gallery shows exactly 3 cards, each with a title and a
  miniature frame whose body has rendered children and a non-zero box.
- **N02** Picking each of the three cards opens that sample (the preview iframe contains its marker element), the toolbar
  appears, and the gallery is gone.
- **N03** The Samples button reopens the gallery; with an unsaved edit, picking a card asks to confirm. Cancel keeps the
  current document and edit list; confirm loads the other sample and clears the edit list.
- **N04** Miniature fidelity: each miniature's marker element, scaled by the card's scale factor, sits where the real sample
  has it (within 2 px after scaling).
- **N05** Phone view at host 1920 x 1080: the device frame is horizontally centred in the stage (within 2 px) and its
  preview iframe is 390 CSS px wide at scale 1 (measured from the transform matrix).
- **N06** Rotate on the phone: the iframe becomes 844 wide; the view is view-only (no handles, panel controls disabled, the
  plain sentence shown, a click still selects); rotating back restores portrait and editing.
- **N07** Tablet portrait is 768 x 1024 and landscape 1024 x 768, both centred and both view-only.
- **N08** Scaled device, resize: at host 1366 x 768 the Phone frame scales (scale below 1, measured); an east handle dragged
  by 40 SCREEN px changes the width by 40 / scale CSS px within 1.5 px; the export matches the preview (P2).
- **N09** Scaled device, move: a 40 screen px drag-move changes the element's left by 40 / scale CSS px within 1.5 px; nothing
  else changes (P3).
- **N10** Header: four chips (TypeScript, React, parse5, postcss) in the chip list; the intro paragraph's box reaches within
  8 px of the page container's right edge at 1440 px.
- **N11** At 1440 px the three lists below the tool have at least two distinct column positions (item left edges) and at
  390 px exactly one; each list item's line length is within 45 to 80 characters on average per item (measure below).

## 2. The checks

The checks P1 to P5 are as in `docs/ui-editor-gate-rules.md` (same tolerances, same P2 and P3 and P4 machinery). Each spec
lists the checks that apply to it (`checks` in the JSON); **P2, P3 and P4 apply only to N08 and N09** (the specs that make an
edit whose export can be compared). A check that does not apply to a spec is not part of its outcome.

**P6, visibility (new).** A control that must be hidden is neither visible nor focusable. A control that is not in the
DOM satisfies this. A control that is in the DOM satisfies it only if none of its matching elements has a layout box
(`getClientRects().length === 0`, which covers `hidden`, `display: none` and an unrendered ancestor) and none is
reachable by keyboard.  **(mine)** "Visible" for a control that must be shown means a non-empty bounding box and no
`visibility: hidden`.

## 3. The UI contract the new specs rely on (mine)

Everything in the original contract stays, with these changes. Accessible names are EXACTLY as before, and a control that
becomes an icon button keeps its name through `aria-label`.

- **Samples** button (name `Samples`, `aria-expanded` while the gallery is open) replaces the select named "Sample".
- **Gallery:** `[data-gallery]` (a region), holding one `[data-sample-card="landing|email|chart"]` per sample (a focusable
  element that opens the sample on click and on Enter). A card holds the title text (Landing page, HTML email, SVG chart), a
  one-line description, and `iframe[data-miniature]`: a scripts-off sandboxed frame (`sandbox` without `allow-scripts`)
  whose own width is 1280 CSS px (the sample at its real width), scaled down with CSS to fit the card.
- **Bar:** the group named "Editor controls". Its buttons are found by accessible name.
- **Stage area and device:** `[data-stage-area]` is the box the preview is centred in. `[data-device-scale]` carries the
  CSS `transform: scale()` (its computed matrix `a` is the scale). `[data-device-frame]` (with `data-device` = `phone` or
  `tablet`, and `data-orientation` = `portrait` or `landscape`) is the bezel and exists only for Phone and Tablet. The
  preview is still `iframe[title="Preview"]`. A button named `Rotate` exists only for Phone and Tablet.
- **Note:** `[data-device-note]` reads "Previewed at a typical phone width (390 px). Other phones show the same code at
  their own width." (Phone view).
- **View-only:** one visible sentence containing "view-only", shown when the view is not editable.
- **Review unlinked:** the button's accessible name is `Review unlinked (N)`; the count may also be drawn as a badge.
- **Header:** `ul.chip-list.page-chips` with `li.chip`; the intro is `.page-lede`; the three lists are `ul.ue-list`.

## 4. Operational definitions (mine)

- **Scale** is the `a` of the computed `transform` matrix of `[data-device-scale]` (1 when `none`).
- **Centred:** the horizontal centre of `[data-device-frame]` (for Desktop, which has no frame, of the iframe) is within
  2 px of the horizontal centre of `[data-stage-area]`.
- **Editable sizes:** Desktop (1280) and Phone portrait (390). Landscape phone, Tablet portrait and Tablet landscape are
  view-only.
- **Miniature fidelity (N04):** before opening, the miniature iframe's scale is its screen width divided by its
  `offsetWidth`; the marker's box inside it (CSS px) is measured; then the sample is opened and the marker's box in the
  real Desktop preview is measured. For left, top, width and height, `|miniature x scale - real x scale|` is at most 2 px.
- **Line length (N11):** for each item of the three lists that has at least two rendered lines, the mean number of
  characters per line over all lines except the last (the check:layout style check's own measure), taken from the line
  boxes of the item's text. Every such item's mean must be 45 to 80.
- **Columns (N11):** the item left edges of one list, rounded to 2 px; the number of distinct values.
- **Header reach (N10):** the right edge of `.page-lede` against the right edge of the content box of the first
  `main .page-container`.
- **Measures from a scaled device (N08, N09):** the wanted change is `screen / scale`, scale read just before the drag.
- **Scorer-check faults (Step 1)**, each of which must fail where listed: a stage that does not divide pointer deltas by the
  scale (N08 and N09); a toolbar control left visible on first visit (N01, by P6); a miniature left blank (N01 and N04); a
  frame that is not centred (N05); and the five faults of the original page gate.

## 5. The pass line (all must hold)

1. The ORIGINAL 20 actions still give 18 PASS, 2 REFUSED (S15, S16) and 0 FAIL, with `specs.json` untouched.
2. N01 to N11: at least **10 PASS and 0 FAIL**.
3. Regression: `npm test` (no fewer passes than 774 plus the new tests, 0 fail), `tsc -b`, `eslint`, `vite build` clean,
   and the 16 flag checks (`flags.mjs`) still pass with the flag OFF and ON.
4. `check:layout` through the `CHECK_PAGES` filter: Home with four planets at the four sizes meets every target as in the
   baseline, and the UI Editor page's style check at 1280x720, 1440x900, 1920x1080 and 390x844 has no new unexplained misses
   (new explained ones go into `check-layout.expected.json` with reasons).
5. The scorer check (Step 1) passed.
6. The no-op round trip of all three samples is byte-identical.
7. The three locked originals (`docs/ui-editor-gate-rules.md`, `scripts/ui-editor-gate/specs.json`, the three samples
   under `src/ui-editor/samples/`) are byte-identical to 910b228 (`git diff 910b228 -- <paths>` is empty).

## 6. Decided in advance

Any miss on the pass line means the round FAILS. The report says so plainly, does not tune rules or specs, and names the
cheapest next test. A change made after the scored run is a labelled iteration: both runs are kept. Runner changes are
allowed only to reach the same controls through the new UI; each is listed in `docs/ui-editor-gate-log.md`, touches no
spec, rule, sample or expected value, and is covered by the scorer check.

## 7. Known limits

Written by the agent that builds the page; Chromium only; a scripted mouse, not a person; headless software rendering; no
touch; Safari and Firefox untested; the device frames are generic CSS shapes, not real devices.
