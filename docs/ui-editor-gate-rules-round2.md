# UI Editor formatting round 2: gate rules (LOCKED in Step 0)

Written 2026-11-15, before any page change of this round. After the commit that adds this file, the rules, the specs
(`scripts/ui-editor-gate/specs-round2.json`) and the earlier locked files are never edited. If a rule turns out to be wrong, it is
recorded and Max decides. Sections marked **(mine)** are operational definitions I wrote. The specs were written by Claude Code, the
same agent that builds the page: that is a limit of this gate, not a hidden fact.

This file adds to `docs/ui-editor-gate-rules.md` and `docs/ui-editor-gate-rules-round1.md`; it does not replace them. Byte-identical
when the round ends (`git diff <hash> -- <paths>` is empty):

- at 910b228: `docs/ui-editor-gate-rules.md`, `scripts/ui-editor-gate/specs.json`, `src/ui-editor/samples/`;
- at 1fc4ae3: `docs/ui-editor-gate-rules-round1.md`, `scripts/ui-editor-gate/specs-round1.json`.

## 1. What is scored

- The ORIGINAL 20 actions (`specs.json`, S01 to S20), unchanged.
- Round 1, **N03 to N11** (`specs-round1.json`).
- **N01 and N02 of round 1 are RETIRED by this round.** They assume three gallery cards and Paste and Upload buttons in the bar, both
  of which this round removes on purpose (item 3 of Max's list). This changes the applicability of a locked file; **Max decides**
  whether that is acceptable. The runner reports them as `RETIRED`, never `PASS`, and does not run them. R01 and R02 replace them.
  N06 keeps its fixed assertion (the editor's own text, iteration 1 of round 1, change #12).
- Round 2, **R01 to R16** (`specs-round2.json`): 16 scripted real-mouse specs on the real built page, headless Chromium, a fresh
  context per spec, no retries. Host window 1920 x 1080 unless a spec says otherwise. Outcomes are PASS or FAIL. A spec passes when
  every check it lists passes (P1 to P6; P2 to P4 only where the spec lists them).

Checks P1 to P5 are as in `docs/ui-editor-gate-rules.md`, P6 as in round 1 (a control that must be hidden is neither visible nor
focusable). New checks are asserts inside P1, P5 and P6; their meaning is in `specs-round2.json` (`vocabulary`).

## 2. The specs, in one line each

- **R01** First visit: exactly four cards (Landing page, HTML email, SVG chart, "Your own code"); Paste and Upload are not toolbar
  buttons; no editing controls, ribbon, stage or code area visible (P6).
- **R02** "Your own code": Paste opens the paste area and pasting valid HTML loads it; Upload with a file loads it. Both reach the
  editor with the toolbar and the ribbon visible.
- **R03** The round 1 bug: open the paste area, click Samples: the paste area is gone and four cards show.
- **R04** No side panel; the ribbon is full width and at most two rows; with nothing selected every ribbon control is disabled and
  the plain line shows; after a click on an element its controls are enabled; in Tablet view they are disabled with the view-only
  sentence; the Link control carries its explanation as a tooltip.
- **R05** Font family is a select: the page's own family first, then the twelve listed families; choosing Arial changes the computed
  font; no free-text input for it; the export matches (P2, P3, P4).
- **R06** Font size stepper: three clicks +3; Undo takes back one click; Shift+click +10; minus -1; typing 52 and Enter gives 52.
- **R07** Width stepper +4 on Desktop (Phone by the engine's ratio rule); padding one stepper +4 on all four sides; Expand shows four
  steppers and Top changes only the top; border radius +2.
- **R08** Unit switch and snap: % shows the percent of the parent's content width and the next write is in %; a drag ending 6 px short
  does not snap; a drag to the parent's right edge snaps to `width: 100%` with the label "Full width"; at 390 the element still equals
  the parent's content width; the export matches (P2, P3, P4).
- **R09** Alignment buttons and colour: Centre sets `text-align: center` and `aria-pressed`; a hex typed in sets the computed colour
  and the swatch shows it; the swatch is a native colour input.
- **R10** Position: Move up reorders as S12 did; a nudge stepper moves 1 px, Shift 10 px.
- **R11** Code view: after three edits the highlighted line groups equal an independent line diff; removed-line markers sit where lines
  were removed; each changed line has a margin marker element with text (not colour alone); no "Show only changes" control.
- **R12** Previous and Next change: the counter, wrap-around in both directions, the target scrolled into the code box; the change
  map has one button per change, in line order and in proportion to the line number; clicking a tick equals reaching that change;
  "No changes yet" and disabled buttons before any edit.
- **R13** Copy and Download equal the export byte for byte, per file, after the code view has highlights; the code view's plain text
  equals it too.
- **R14** Toolbar at 1440: Samples at the left edge, the icon group at the right edge; Rotate shows the word "Rotate" and is the only
  icon button with visible text; no two toolbar icons share their drawing; Undo, Redo and Reset all keep their names.
- **R15** Bottom sections: three `h2` headings with the same font, size, weight and class; no list markers; at most six items a list; a
  thin rule between items; two or more columns at 1440, one at 390; line length 45 to 80.
- **R16** Desktop, Phone 390 x 844 and Tablet 768 x 1024 render at scale 1 at 1920 x 1080 with the ribbon present and the whole
  preview inside the window; at a 390 px window the ribbon wraps, every control is at least 44 px, and the page has no horizontal
  scroll.

## 3. The UI contract the round 2 specs rely on (mine)

Everything in the earlier contracts stays unless this section changes it. Accessible names that the earlier specs use are unchanged.

- **Bar** (group "Editor controls"): `Samples` at the left edge (visible text, `aria-expanded` while the gallery is open); the icon
  group at the right edge: View group (Desktop, Tablet, Phone), `Rotate` (Phone and Tablet only; icon plus the visible word
  "Rotate"), Undo, Redo, Reset all, `Review unlinked (N)`, the `File` select, Copy code, Download. **No Paste or Upload button in the
  bar.** Icon buttons keep `aria-label` and `title`.
- **Gallery** `[data-gallery]`: cards `[data-sample-card="landing|email|chart|own"]`. The `own` card (title "Your own code")
  holds `[data-blank-page]` (a blank-page miniature with a non-empty box) and two buttons named `Paste` and `Upload`. Paste shows the
  paste area (group "Paste code": textareas "HTML or SVG" and "Companion CSS (optional)", buttons "Open pasted code" and "Cancel") in
  place of the gallery; Upload opens the file chooser (the same accepted types and limits as before). The Samples button shows the
  gallery and closes the paste area.
- **Ribbon** `[data-ribbon]` (no side panel: no `aside`, no `.ue-side`, no `.ue-panel`, the words "side panel" nowhere on the page),
  full width of `[data-editor]`, groups `[data-ribbon-group="text|box|colours|position"]` in that order, then `[data-selected-label]`,
  the Link checkbox (`Link to Phone` / `Link to Desktop`) whose explanation is its `title`, and `[data-ribbon-note]`: "Click an
  element to edit it" with nothing selected, the view-only sentence (contains "view-only") in a view-only size. The ribbon is drawn
  as soon as a document is open. Controls that read as before keep `data-field`, `data-dot` and their accessible names.
- **Controls (HTML element):** `Font family` select (`[data-field="font-family"]`); `Font size`, `Height`, `Border width`, `Border
  radius`, `Nudge X`, `Nudge Y`, `Width` each a text input with that name plus buttons `Decrease <name>` and `Increase <name>`;
  `Width unit` group of buttons `px` and `%` (`aria-pressed`); `Padding` and `Margin` a text input ("mixed" when the four sides
  differ), `Decrease`/`Increase <name>`, a button `Expand <name>` (`aria-expanded`) and, expanded, inputs `<name> top|right|bottom|left`
  each with `Decrease`/`Increase <name> <side>`; `Font weight` select; alignment buttons `Align left`, `Align centre`, `Align right`,
  `Justify` in a group named `Alignment` (SVG: `Anchor start`, `Anchor middle`, `Anchor end`), `aria-pressed`; colour fields `Text
  colour`, `Background`, `Border colour` a text input plus a native `input[type=color]` named `Pick text colour`, `Pick background`,
  `Pick border colour`; buttons `Move up` and `Move down`. The number of a stepper is always a real text input.
- **Code view** (inside "Updated code"): `[data-code-view]` is the scrolling code box. Each line is `[data-line="N"]` (N the
  1-based line of the NEW file) holding `[data-code-text]` (the plain text of the line). A changed or added line also has
  `data-change="k"` and a `[data-margin-marker]` with visible text. A removal point is `[data-removed]` with `data-change="k"` and
  `data-removed-after="N"` (it sits after new line N, 0 at the top). Counter `[data-change-counter]`; buttons `Previous change`,
  `Next change`; change map `[data-change-map]` holding one button `Change k of n` per change.
- **Drag label** `[data-drag-label]` while a resize or move is in progress.

## 4. Operational definitions (mine)

- **Line diff (R11 to R13):** the independent diff is the runner's own longest-common-subsequence over lines, comparing the
  ORIGINAL file with the exported file (a final newline does not make an extra line). Ties are broken by removing an original line
  first. A **change** (a hunk) is a maximal run of removed and added lines between two matched lines. It has added lines, removed lines
  or both. Highlighted groups are the added lines of each hunk (consecutive new lines); removal points are the hunks with removed
  lines, at "after new line N" where N is the number of new lines before the hunk. A removal-only hunk counts as a change (so a
  removal can be reached). The page's diff is its own pure function; the runner never calls it.
- **Counter:** "No changes yet" with no changes; otherwise "k of n", where k is the change last jumped to, and 0 before any jump.
- **Change map position:** the centre of tick k as a share of the strip's height equals (first line of change k - 1) divided by the
  file's line count, within 0.03 of the height plus 8 px (a tick cannot leave the strip).
- **Visible in the code area:** the change's first line (or removal point) lies wholly inside the vertical extent of
  `[data-code-view]`, within 1 px.
- **Snap (R08):** the drag's right edge is measured against the right edge of the parent's content box. "Within 2 CSS px" snaps.
- **Percent shown (R08):** the element's width divided by its parent's content width, times 100, within 0.1; the value after one
  Increase is the shown value plus 1 (a percent step of 1, 10 with Shift).
- **Ratio rule (R07):** the Phone width after a linked Desktop edit is the engine's: baseline Phone width times new Desktop width over
  old Desktop width (within 0.6 px).
- **Toolbar edges (R14):** the bar's inner edge (the box inside its border and padding).
- **Disabled ribbon (R04):** every `button`, `input`, `select` inside `[data-ribbon]` matches `:disabled`, and there are at least 20.
- **Ribbon rows (R04):** the number of distinct tops (rounded to 6 px) of the `[data-ribbon-group]` elements; "about 110 px" is
  scored as a box height of at most 130 px.
- **Whole preview in the window (R16):** after scrolling the preview's iframe to the middle of the window, its box lies inside
  `0..innerHeight` and `0..innerWidth`.
- **Hit area (R16):** a control's box is at least 44 x 44 CSS px (a text input or select: at least 44 tall and 44 wide).
- **Line length (R15):** as N11 of round 1; **columns** as N11.
- **Scorer-check faults (Step 1)**, each of which must fail where listed: paste area left open after Samples (R03); a stepper using
  the wrong step (R06, R07); Shift ignored (R06); the unit switch writing px while showing % (R08); snap off (R08); a diff that
  highlights the wrong line or miscounts (R11, R12); wrap-around missing (R12); two identical icons (R14); controls enabled with
  nothing selected (R04); a free-text font input present (R05); bullets left on (R15); and the five faults of the earlier page gate.

## 5. The pass line (all must hold)

1. The ORIGINAL 20: 18 PASS, 2 REFUSED, 0 FAIL, `specs.json` untouched.
2. Round 1 N03 to N11: all PASS (N01 and N02 are RETIRED, reported as such).
3. R01 to R16: all PASS.
4. `npm test`: no fewer passes than 799 plus the new tests, 0 fail; `tsc -b`, `eslint`, `vite build` clean; the 16 flag checks pass
   with the flag OFF and ON.
5. `check:layout` through `CHECK_PAGES` (the full sweep crashes on `main`: noted, not required): Home meets every target as before;
   the UI Editor page's style check at 1280x720, 1440x900, 1920x1080 and 390x844 has no new unexplained misses.
6. The scorer check (Step 1) passed.
7. The no-op round trip of all samples is byte-identical.
8. The locked originals above are byte-identical.

## 6. Decided in advance

Any miss fails the round. The report says so plainly, does not tune rules or specs, and names the cheapest next test. A change made
after the scored run is a labelled iteration; both runs are kept. Runner changes are allowed only to reach the same controls through
the new UI (the "Your own code" card for paste and upload, reading the ribbon instead of the panel) and to implement the asserts
listed in `specs-round2.json`; each is logged in `docs/ui-editor-gate-log.md`, touches no spec, rule, sample or expected value, and is
covered by the scorer check.

## 7. Known limits

Written by the agent that builds the page; Chromium only; a scripted mouse, not a person; headless software rendering; no touch;
Safari and Firefox untested; hold-to-repeat timing is not scored; the native colour picker's dialog is not driven (the colour input's
value is); the device frames are generic CSS shapes.
