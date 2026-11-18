# UI Editor formatting round 4: gate rules (LOCKED in Step 0)

Written 2026-11-17, before any page change of this round. After the commit that adds this file, the rules, the specs
(`scripts/ui-editor-gate/specs-round4.json`) and the earlier locked files are never edited. If a rule turns out to be wrong, it is
recorded and Max decides. Sections marked **(mine)** are operational definitions I wrote. The specs were written by Claude Code, the
same agent that builds the page: that is a limit of this gate, not a hidden fact.

This file adds to `docs/ui-editor-gate-rules.md`, `-round1.md`, `-round2.md` and `-round3.md`; it does not replace them. Byte-identical
when the round ends (`git diff <hash> -- <paths>` is empty):

- at 910b228: `docs/ui-editor-gate-rules.md`, `scripts/ui-editor-gate/specs.json`, `src/ui-editor/samples/`;
- at 1fc4ae3: `docs/ui-editor-gate-rules-round1.md`, `scripts/ui-editor-gate/specs-round1.json`;
- at 5680880: `docs/ui-editor-gate-rules-round2.md`, `scripts/ui-editor-gate/specs-round2.json`;
- at 808c111: `docs/ui-editor-gate-rules-round3.md`, `scripts/ui-editor-gate/specs-round3.json`.

## 1. What is scored

- The ORIGINAL 20 (`specs.json`, S01 to S20), unchanged.
- Round 1, **N03 to N11** (N01 and N02 stay RETIRED).
- Round 2, **R01 to R16**, except the retired checks of section 2.
- Round 3, **T01 to T16**, except the retired checks of section 2. **T10 stays a failed locked spec**: it drags `#art`, which is anchored to
  the right end of its flex row, so no page can move that edge (`docs/ui-editor-baseline-round3.md`, spec flaw 1). The failed round 3 run
  is kept on record; T10 is replaced by U10 and is not counted against this round.
- Round 4, **U01 to U13** (`specs-round4.json`): scripted real-mouse and real-keyboard specs on the real built page, headless Chromium, a
  fresh context per spec, no retries. Host window 1920 x 1080 unless a spec says otherwise. A spec passes when every check it lists passes
  (P1, P5; the meaning of each assert is in `specs-round4.json`, `vocabulary`). A listed check with no assert of that kind in the spec
  is reported VACUOUS, never counted (as round 3, log #24); every U spec lists only checks it has asserts for.

## 2. Locked checks that this redesign makes obsolete (retired, reported, Max decides)

I read every locked spec (S01 to S20, N03 to N11, R01 to R16, T01 to T16) against the new layout: one ribbon with no tab bar, seven groups
that share the full width in one band at 1920 and at most two at 1440 and 1280, a visible label on every control, a selected-element strip,
a slim status line, and Grid, Snap and Grid spacing always enabled while a document is open. These locked checks cannot hold:

| Locked check | Why it cannot hold | Replaced by |
|---|---|---|
| **T01**, the whole spec (`ribbonStructure`: exactly two tabs, `Home` selected on open, each tab with its groups, a `tabpanel` per tab) | There is no tab bar. Its only assert is the two-tab structure. | **U01** |
| **T02**, steps 25, 26, 29, 30, 33, 36, 37 (the ribbon and panel heights read at 1280 against the heights remembered at 1920) | The groups wrap into two bands at 1280, so the ribbon is taller than at 1920 by design. T02's comparisons inside one width (all steps at 1920; the stage-top steps 31 and 34 at 1280) stay. | **U04** (heights compared inside each width) and **U02** |
| **T06**, every `ribbonAllDisabled` assert (steps 1, 5, 12, 16: nothing selected, both tabs, Tablet) | Grid, Snap and Grid spacing are enabled with nothing selected and in a view-only size (decision 1 below), so "every ribbon control is disabled" is false by design. The rest of T06 stays (note text, quick bar live, the shown controls enabled after a selection). | **U09** |
| **T15**, the `tabArrows` assert (steps 2) | No tabs. T15's `tabReach` (Tab reaches every enabled control, each with a focus indicator) and `iconNames` stay. | **U08** |
| **R04**, steps 3 and 10 (`ribbonAllDisabled`) | The same reason as T06. | **U09** |
| **R04**, steps 14 and 16 (`ribbonBox` at 1280 and 1440: at most 130 px high) | Two bands of labelled controls cannot be 130 px high. R04's step 2 (the same assert at 1920, one band) is NOT retired and must pass. | **U02**, **U04** |
| **R05**, step 2 (`selectOptions`: the first option reads as the whole computed stack) | Round 4 shows the first family name only ("Georgia") and keeps the stack in a tooltip (item 5). R05's steps 3 to 6 stay. | **U06** |

Already retired by round 3, still retired (reported again): R07 steps 11 to 17 (replaced by T07) and R14's `onlyRotateText` (replaced by
T04, T05, T15 and now U11).

Runner change #21 of round 3 (clicking the tab that holds a control before using it) becomes a no-op when the page has no element with role
`tab`; with the earlier stubs (which have tabs) it behaves as before (logged as #25).

The runner reports each retired check as `RETIRED CHECK`, never PASS, and the spec's outcome is the outcome of the checks that remain.
A spec with a retired check is listed as "PASS (n checks retired)". T01 is listed as RETIRED.

Readings that are **not** retirements (each is logged in `docs/ui-editor-gate-log.md` as a runner change, "same control, new UI"):

- `tabReach` of T15 has no tab to click, so the runner starts the walk by focusing the first enabled control of the ribbon (and counts it).
  Both of T15's tab names run the same walk.
- `ribbonEnabled`, `linkTip` and the other asserts that name controls inside `[data-ribbon]` find the Link checkbox in the strip, which is
  inside `[data-ribbon]`.
- `[data-ribbon-panel]` is now the one band container (it holds all seven groups). T02's `panelHeight`, T03's `controlSizes` and T06's
  `shownTabEnabled` read it as before: the visible panel.

## 3. The UI contract the round 4 specs rely on (mine)

Everything in the earlier contracts stays unless this section changes it. Accessible names are unchanged (`data-field`, `data-dot`,
`aria-label`s, and the Link checkbox's name `Link to Phone` / `Link to Desktop`).

- **No tab bar.** No element has role `tablist`, `tab` or `tabpanel`.
- **`[data-ribbon]`** is the full-width wrapper of the strip and the band container, one box. First child: **`[data-ribbon-strip]`**, one
  slim line above the groups: the words "Selected element", the element label (`[data-selected-label]`, empty text when nothing is
  selected is allowed to be a placeholder word), the view name (`[data-env]`, exactly `Desktop`, `Phone` or `Tablet`), the Link checkbox
  and the one plain note (`[data-ribbon-note]`, as before). Second child: **`[data-ribbon-panel]`**, the band container: all seven
  `[data-ribbon-group]` elements (`role=group`, `aria-label` the group's name), in order Font, Paragraph, Size, Shape, Spacing, Arrange,
  Grid.
- **Groups**: Font (Font family, Font size stepper, Font weight, Text colour field and swatch), Paragraph (four alignment buttons; SVG
  three), Size (Width stepper, the px and % buttons inside the group `Width unit`, Height stepper), Shape (Background and swatch, Border
  colour and swatch, Border width stepper, Border radius stepper), Spacing (Padding stepper and `Padding sides`, Margin stepper and
  `Margin sides`), Arrange (`Move up`, `Move down`, `Nudge X`, `Nudge Y`), Grid (`Grid`, `Snap`, select `Grid spacing`). Each group's
  name sits under its controls in `[data-group-label]` (11 px). Steppers keep `Decrease <name>` / `Increase <name>`, colour fields keep
  `Pick <name>`.
- **Labels**: each control has a visible `[data-ctl-label]` (an element with `aria-hidden`, so accessible names are not doubled) above it, or
  under an icon button, 11 to 12 px, sentence case, one to three words, in `--color-text-secondary`. The label table (accessible name to
  visible label) is in `specs-round4.json` (`ribbonLabels.table`): Font family, Font size, Weight (name `Font weight`), Text colour; Left,
  Centre, Right, Justify (SVG Start, Middle, End); Width, Unit (for px and %), Height; Fill colour (name `Background`), Line colour (name
  `Border colour`), Line thickness (name `Border width`), Corner rounding (name `Border radius`); Padding, Margin; Nudge X, Nudge Y; Grid
  spacing. `Sides`, `Move up`, `Move down`, `Grid` and `Snap` are buttons that show their own word. In the quick bar `Review unlinked (N)`
  shows the words "Review unlinked" (with the count as a badge) and `Reset all` its words; `Undo` and `Redo` stay icon-only.
- **Tooltips**: every control keeps a `title` that is a short verb-first sentence (for example `Move up`: "Move this element earlier in the page
  order.").
- **Spread and bands**: from 1000 px the groups grow equally to fill the band (the extra width is shared evenly, inside and around each group),
  the thin separators stay, and the groups wrap at group boundaries: one band when the ribbon is wide enough for all seven, otherwise two
  (never a split group, never a sideways scroll). Below 1000 px they wrap into as many bands as needed and every control is at least 44 CSS px
  high and wide.
- **Status line**: `role=status`, `aria-label` "Edit result", directly under the ribbon and above `[data-stage-area]`: one line of at most 40 px
  with its height always reserved (an empty message leaves the same height).
- **View aids**: `Grid`, `Snap` and `Grid spacing` are enabled whenever a document is open (Snap is off for SVG, as in round 3); every other ribbon
  control is disabled with nothing selected and in a view-only size, with the one plain note.
- **Font family**: the select shows the first family name of the element's computed stack ("Georgia"); its options are names only (the page's
  own family, then the twelve of round 2); the full stack is in the select's tooltip. The Fill field reads "Transparent" in full for a
  transparent background.
- The hooks of the earlier rounds (`data-selection`, `data-handle`, `data-field`, `data-dot`, `data-env`, `data-selected-label`,
  `data-editor`, `data-ribbon-note`, `data-stage-area`, `data-device-scale`, `data-grid-overlay`, `data-snap-note`, the status region "Edit
  result", the list "Unlinked edits", the iframe title "Preview", the group "View") stay.

## 4. Operational definitions (mine)

- **Band**: the distinct tops, rounded to 6 px, of the visible `[data-ribbon-group]` elements. **Inner edges** of the ribbon: the box of
  `[data-ribbon-panel]` less its border and padding.
- **Spread (U02)**: for every band the first group's left edge is within 24 px of the inner left edge and the last group's right edge within
  24 px of the inner right edge; the gaps between neighbouring group boxes differ by at most 8 px; and (mine, my reading of "distributed
  evenly between and around the groups") the gaps between the nearest controls of neighbouring groups differ by at most 8 px. A group
  box that grows to fill its band is how the extra width is shared; a lone group of a band therefore fills it. A thin separator is a
  border of at least 1 px that is not transparent. Left-packed groups with empty space at the right fail the right edge test.
- **Label (U03)**: either the control's own visible text of three or more letters, or the nearest `[data-ctl-label]` within 14 px (distance
  between the rectangles) that overlaps the control horizontally. Forbidden labels, exact and without case: W, H, Thick, Round, Fill, Line,
  Pad, Mar, Size, Text, X, Y, and any single character. The Link checkbox is exempt (its label is beside it, by design). "A visible label
  contains the control's accessible name or matches the label table": contained without case, or the table entry for the name (a leading
  `Decrease `, `Increase ` or `Pick ` removed first).
- **Tooltip (U03)**: `title` of at least three words whose first word is in the verb list of `specs-round4.json` and which differs from the
  accessible name.
- **Clipped value (U06)**: an input whose `scrollWidth` exceeds its `clientWidth`; a select whose selected option's text, measured on a canvas
  in the select's font, plus its horizontal padding and border and 22 px for the arrow, exceeds its `clientWidth` by more than 0.5 px (a
  select does not report its own overflow). The 18 elements are listed in U06: 10 of the landing sample and 8 of the email sample.
- **Status line one line (U07)**: its text box (a Range over its contents) has a single line top, and no child is taller than 1.6 times the
  line height. "Reserved": its height equals the height it had with no message (1 px).
- **Visual order (U08)**: the strip first, then band by band; in a band group by group left to right; in a group row by row (tops within 12
  px are one row), left to right. A focus indicator: an outline of at least 1 px with a style other than none, or a box-shadow other than
  none, and different from the same control unfocused.
- **Stable size (U04)**: `[data-ribbon]`'s box height and `[data-stage-area]`'s top plus the page scroll, equal to 1 px between the states
  of one width (nothing selected, selected, after an edit message, Tablet, deselected).
- **Snap, Alt, scale** as in round 3 section 4.
- **U13 reading**: the Limits list must contain the sentence below exactly when it was verified in Step 1 (recorded in
  `docs/ui-editor-baseline-round4.md`); if the verification fails, the sentence is left out, the runner is given `--u13-na`, and U13 reads
  NOT APPLICABLE (with the reason in the log) and is not counted as PASS. The sentence: *With Snap on, a dragged edge lands on a grid line
  only when that edge can move; an element fixed to the right of its row keeps its right edge.*
- **Scorer-check faults (Step 1)**, each of which must fail where listed or the round STOPS: a tab bar left in (U01); a group missing (U01);
  a group in a wrong band, wrapped away from the others at 1920 (U02); groups left-packed with empty space at the right (U02); a control
  with no visible label, a single-letter label and an old abbreviation (U03); a control without a tooltip (U03); a ribbon whose height
  changes with selection (U04); control heights off (U05); a clipped Fill value and a clipped font value (U06); a tall status card and a
  status that moves the stage (U07); a Tab order that jumps between bands (U08); Grid disabled with nothing selected (U09); a snap on `#cta`
  that rounds down (U10); Review unlinked or Reset all without words (U11); a control under 44 px at 390 (U12); and the earlier faults of
  rounds 0 to 3 on their stubs.

## 5. The pass line (all must hold)

1. The ORIGINAL 20: 18 PASS, 2 REFUSED, 0 FAIL.
2. Round 1 N03 to N11: all PASS (N01 and N02 RETIRED).
3. Round 2 R01 to R16: all PASS except the retired checks of section 2.
4. Round 3 T01 to T16: all PASS except the retired checks of section 2 (T01 retired as a whole) and T10 (a failed locked spec, replaced by U10).
5. Round 4 U01 to U13: all PASS (U13 NOT APPLICABLE only if the sentence was not verified).
6. `npm test`: no fewer passes than 836 plus the new tests, 0 fail; `tsc -b`, `eslint`, `vite build` clean; the 16 flag checks pass with the
   flag OFF and ON.
7. `check:layout` through `CHECK_PAGES` (the full sweep crashes on `main`: noted, not required): Home meets every target; the UI Editor page's
   style check at 1280x720, 1440x900, 1920x1080 and 390x844 has no new unexplained misses.
8. The scorer check (Step 1) passed. **A control that fails in the scorer check STOPS the round: it is reported to Max before anything is
   built.**
9. The no-op round trip of all samples is byte-identical.
10. The locked files of the list at the top are byte-identical.
11. ONE complete run of everything above on the FINAL commit.

## 6. Decided in advance

Any miss fails the round. The report says so plainly, does not tune rules or specs, and names the cheapest next test. A change made after
the scored run is a labelled iteration; both runs are kept. Runner changes are allowed only to reach the same controls through the new UI
(no tab to click, the Link checkbox in the strip, the one panel) and to implement the asserts listed in `specs-round4.json`; each is logged
in `docs/ui-editor-gate-log.md`, touches no spec, rule, sample or expected value, and is covered by the scorer check.

Three decisions the scoper made, which Max can strike:

1. Grid, Snap and Grid spacing are enabled whenever a document is open, even with nothing selected and in a view-only size (view aids). All
   other ribbon controls stay disabled with nothing selected and in view-only sizes.
2. T10 is re-pointed: round 3's T10 resized `#art`, which no page can move on the right. T10 is kept as it was and its failed run stays on
   record; U10 does the same check on `#cta`. The Limits gets one plain sentence about it only if Step 1 verifies it.
3. The Home planet card wording stays as it is.

## 7. Known limits

Written by the agent that builds the page; Chromium only; a scripted mouse and keyboard, not a person; headless software rendering; no touch;
Safari and Firefox untested; hold-to-repeat timing is not scored; the native colour picker's dialog is not driven; whether snap "feels
right" with a real hand is not scored; the spread is scored on boxes and control gaps, not on how it looks; a select's clipping is measured
on a canvas, not read from the control; the device frames are generic CSS shapes.
