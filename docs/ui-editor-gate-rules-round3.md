# UI Editor formatting round 3: gate rules (LOCKED in Step 0)

Written 2026-11-15, before any page change of this round. After the commit that adds this file, the rules, the specs
(`scripts/ui-editor-gate/specs-round3.json`) and the earlier locked files are never edited. If a rule turns out to be wrong, it is
recorded and Max decides. Sections marked **(mine)** are operational definitions I wrote. The specs were written by Claude Code, the
same agent that builds the page: that is a limit of this gate, not a hidden fact.

This file adds to `docs/ui-editor-gate-rules.md`, `-round1.md` and `-round2.md`; it does not replace them. Byte-identical when the
round ends (`git diff <hash> -- <paths>` is empty):

- at 910b228: `docs/ui-editor-gate-rules.md`, `scripts/ui-editor-gate/specs.json`, `src/ui-editor/samples/`;
- at 1fc4ae3: `docs/ui-editor-gate-rules-round1.md`, `scripts/ui-editor-gate/specs-round1.json`;
- at 5680880: `docs/ui-editor-gate-rules-round2.md`, `scripts/ui-editor-gate/specs-round2.json`.

## 1. What is scored

- The ORIGINAL 20 (`specs.json`, S01 to S20), unchanged.
- Round 1, **N03 to N11** (N01 and N02 stay RETIRED, as round 2 decided).
- Round 2, **R01 to R16**, except the **retired checks** of section 2.
- Round 3, **T01 to T16** (`specs-round3.json`): 16 scripted real-mouse and real-keyboard specs on the real built page, headless
  Chromium, a fresh context per spec, no retries. Host window 1920 x 1080 unless a spec says otherwise. Outcomes are PASS or FAIL. A
  spec passes when every check it lists passes (P1, P5; P2 to P4 only where the spec lists them). Checks are as in the earlier rules;
  new checks are asserts inside P1 and P5, and their meaning is in `specs-round3.json` (`vocabulary`).

## 2. Locked checks that this redesign makes obsolete (retired, reported, Max decides)

I read every locked round 2 spec against the new layout (quick bar, tab bar with Home and Layout, a fixed ribbon panel, the Sides
popover). Two locked CHECKS cannot hold. Nothing else in rounds 1 and 2 is retired: the rest must still pass.

| Locked check | Why it cannot hold | Replaced by |
|---|---|---|
| **R07**, steps 11 to 17: the `Expand Padding` click, the presence of four textboxes after it, the `Padding top` stepper and the four padding values after it | The inline Expand control is replaced by the `Sides` popover (Max, round 3, section 2). There is no `Expand Padding` button. R07's other steps (width +4 with the ratio rule, padding +4 on all sides, radius +2: steps 0 to 10 and 18 and 19) stay and must pass. | **T07** (padding plus is +4 on all sides; Sides popover; Top only; Escape; focus; 390) |
| **R14**, the assert `onlyRotateText` ("only Samples and Rotate show text") | Max's wireframe gives the view buttons, Copy code, Download and Reset all a visible word beside the icon. R14's other checks (Samples at the left edge, the last control at the right edge, the word on Rotate, ten different icons, the names kept) stay and must pass. | **T04** (order and separation), **T05** (view style), **T15** (every icon-only button has a name and a tooltip) |

The runner reports these as `RETIRED CHECK` lines under the spec, skips exactly those steps and asserts (`retiredChecks` in
`specs-round3.json`), and the spec's outcome is then the outcome of the checks that remain. They are never counted as passed.
A spec that has a retired check is listed in the report as "PASS (n checks retired)".

Readings of locked checks that I expect to be needed and that are **not** retirements (each is logged in `docs/ui-editor-gate-log.md`
as a runner change, "same control, new UI"):

- A step that acts on a ribbon control first clicks the tab that holds it when the control is not visible (for example `Move up`,
  `Padding` and the nudges are on Layout; `Font size` and `Background` are on Home). The controls are in the DOM of both tabs, so the
  asserts that read a control's state (`fieldDisabled`, `ribbonEnabled`, `ribbonAllDisabled`, `checkbox`) need no change.
- The File select's options now read `landing.css (2)` for a changed file. The runner selects a file by its option **value** (the file
  name), where it selected by label before. When the wanted file is already shown it does not touch the select (so a download does not
  count as the visitor choosing a file).

## 3. The UI contract the round 3 specs rely on (mine)

Everything in the earlier contracts stays unless this section changes it. Accessible names the earlier specs use are unchanged.

- **Quick bar**: the group "Editor controls". Before anything is open only `Samples` is in it. Open: `Samples`, `Undo`, `Redo`,
  `Review unlinked (N)`, the group "View" (`Desktop`, `Tablet`, `Phone`, each icon and word), `Rotate` (Phone and Tablet), the File
  select, `Copy code`, `Download`, `Reset all` last. Visible words are allowed; accessible names are exactly the earlier ones.
- **Ribbon** `[data-ribbon]`: full width of `[data-editor]`; a `role=tablist` with two `role=tab` elements (`Home` selected on open,
  `Layout`), at the right of the same row the element label (`[data-selected-label]`), the view name (`[data-env]`), the Link
  checkbox and `[data-ribbon-note]`; then one `role=tabpanel` (`[data-ribbon-panel]`) per tab, the unselected one `hidden`. Both
  panels are in the DOM. The tabs are not `button` elements, so "every button inside the ribbon is disabled" (R04) can hold.
- **Groups**: `[data-ribbon-group]` with `role=group` and `aria-label` = the group's name, a `[data-group-label]` under the controls.
  Home: Font (Font family, Font size, Font weight, Text colour), Paragraph (Align left, Align centre, Align right, Justify), Size
  (Width with the px and % buttons, Height), Shape (Background, Border colour, Border width, Border radius). Layout: Spacing
  (Padding and Margin, each with a button `Padding sides` or `Margin sides`), Arrange (`Move up`, `Move down`, `Nudge X`, `Nudge Y`),
  Grid (`Grid`, `Snap`, the select `Grid spacing` with options `4 px`, `8 px`, `16 px`, `32 px`). Steppers keep the names
  `Decrease <name>`, `Increase <name>`; colour fields keep `Pick <name>`.
- **Sides popover**: opened by `Padding sides` or `Margin sides`; `role=dialog`, `aria-label` the button's name; four steppers named
  `Padding top|right|bottom|left` (and for Margin). Focus moves in; Escape closes it and returns focus to the button.
- **Grid**: `[data-grid-overlay]`, a host element over the preview (not in the preview document), `pointer-events: none`, drawn with a
  repeating background; `Grid` and `Snap` are `aria-pressed` buttons, both off at every page load. For SVG, `Snap` is disabled and
  `[data-snap-note]` shows the line.
- **File select**: option value = file name; option text = file name, or `<file> (<n>)` for a file the export changed.
- **Copy code** and **Download**: `aria-label` exactly `Copy code` and `Download`; `title` names the shown file.
- The hooks of the earlier rounds (`data-selection`, `data-handle`, `data-field`, `data-dot`, `data-env`, `data-selected-label`,
  `data-editor`, the status region "Edit result", the list "Unlinked edits", the iframe title "Preview", the group "View") stay.

## 4. Operational definitions (mine)

- **Change, hunk, diff**: as round 2 section 4 (the runner's own line diff, `hunks.mjs`; a removal-only hunk counts). Over several
  files the changes are numbered in File-select order, then in line order. A file's count is its number of hunks.
- **Small and large controls (T03)**: large is decided by accessible name (`Move up`, `Move down`, `Grid`, `Snap`), everything else in
  the panel is small. "26 to 28 px (1 px)" is scored as 25 to 29. Large is 54 to 62 (1 px: 53 to 63) and at least 40 wide.
- **Group name under its controls**: the label's top is not above the bottom of the lowest control of its group (0.5 px). 11 px is its
  computed font size.
- **Black (T05)**: the computed background colour equals the colour the runner gets by resolving the page's `--color-text` on a probe
  element. Light: relative luminance of at least 0.85. "Identical across the four views": background, text colour and icon stroke
  strings are equal.
- **Not greyed (T05)**: no `disabled`, no `aria-disabled`, and the computed opacity of the control and of every ancestor up to
  `[data-editor]` is 1.
- **Ribbon height (T02)**: the box height of the visible `[data-ribbon-panel]`, and of `[data-ribbon]`. All the heights taken in one
  spec (both tabs, with and without a selection, Tablet, 1280 and 1920 wide) are equal to 1 px. Stage top: `[data-stage-area]`'s top
  plus the page scroll, equal to 1 px across tab switches and a selection at one window size.
- **Grid line spacing (T08, T11)**: the overlay's computed `background-size` in CSS px, and that value times the overlay's on-screen
  scale (`getBoundingClientRect().width / offsetWidth`), against the spacing and the spacing times the device scale the runner
  measures from `[data-device-scale]`. Lines are not read from pixels: a grid that draws something else than it declares is not
  caught by this definition (a known limit).
- **Snap (T09, T10, T11)**: nearest multiple of the spacing to where an unsnapped drag would have put the element (left, top; or the
  right edge), in the preview's document coordinates, measured by `getBoundingClientRect`; 0.5 px. A move starting at a fractional
  position cannot be exact if the engine rounds offsets: 0.5 px is the stated tolerance. `Math.round` ties may go either way.
- **Alt (T09)**: the key held from before the pointer goes down to after the release.
- **Tab reach and focus (T15)**: the runner presses Tab from the selected tab and records `document.activeElement` until focus leaves
  `[data-ribbon]`. A focus indicator is a different computed `outline` or `box-shadow` than the same control unfocused.
- **Clipped (T16)**: a visible control's box is not inside `0..innerWidth` or not inside the box of an ancestor with overflow other
  than visible.
- **File switching (T14, T13)**: the runner reads the page first and only then downloads the files (a download through the File select
  counts as the visitor choosing a file, so it is done last in each scenario).
- **Scorer-check faults (Step 1)**, each of which must fail where listed: a control in the wrong group or tab (T01); a ribbon whose
  height changes between tabs or on selection (T02); control heights off (T03); Reset all next to Undo (T04); the Tablet view button
  greyed (T05); controls enabled with nothing selected (T06); Sides changing all four sides (T07); grid lines at the wrong spacing or
  ignoring the scale (T08, T11); a grid element added inside the preview document (T08); snap rounding down (T09); Alt ignored (T09);
  snap on by default (T09); `100%` losing to the grid (T10); SVG snapping (T12); the code view not switching file or counting only the
  shown file (T13, T14); Copy acting on the wrong file (T14); tabs without arrow keys (T15); controls under 44 px at 390 (T16); and the
  faults of the earlier rounds.

## 5. The pass line (all must hold)

1. The ORIGINAL 20: 18 PASS, 2 REFUSED, 0 FAIL.
2. Round 1 N03 to N11: all PASS (N01 and N02 RETIRED).
3. Round 2 R01 to R16: all PASS except the retired checks of section 2, reported with their replacements.
4. T01 to T16: all PASS.
5. `npm test`: no fewer passes than 821 plus the new tests, 0 fail; `tsc -b`, `eslint`, `vite build` clean; the 16 flag checks pass
   with the flag OFF and ON.
6. `check:layout` through `CHECK_PAGES` (the full sweep crashes on `main`: noted, not required): Home meets every target; the UI
   Editor page's style check at 1280x720, 1440x900, 1920x1080 and 390x844 has no new unexplained misses.
7. The scorer check (Step 1) passed.
8. The no-op round trip of all samples is byte-identical.
9. The locked files of the list at the top are byte-identical.
10. ONE complete run of everything above on the FINAL commit.

## 6. Decided in advance

Any miss fails the round. The report says so plainly, does not tune rules or specs, and names the cheapest next test. A change made
after the scored run is a labelled iteration; both runs are kept. Runner changes are allowed only to reach the same controls through
the new UI (the tab that holds a control, the file's option value) and to implement the asserts listed in `specs-round3.json`; each is
logged in `docs/ui-editor-gate-log.md`, touches no spec, rule, sample or expected value, and is covered by the scorer check.

## 7. Known limits

Written by the agent that builds the page; Chromium only; a scripted mouse and keyboard, not a person; headless software rendering; no
touch; Safari and Firefox untested; hold-to-repeat timing is not scored; the native colour picker's dialog is not driven; whether snap
"feels right" with a real hand is not scored; grid lines are read from the overlay's declared spacing, not from pixels; the device
frames are generic CSS shapes.
