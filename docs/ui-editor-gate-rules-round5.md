# UI Editor formatting round 5: gate rules (LOCKED in Step 0)

Written 2026-11-18, before any page change of this round. After the commit that adds this file, the rules, the specs
(`scripts/ui-editor-gate/specs-round5.json`) and the earlier locked files are never edited. If a rule turns out to be wrong, it is recorded and Max
decides. Sections marked **(mine)** are operational definitions I wrote. The specs were written by Claude Code, the same agent that builds the page.

This file adds to `docs/ui-editor-gate-rules.md` and `-round1.md` to `-round4.md`. Byte-identical when the round ends (`git diff <hash> -- <paths>` empty):
originals at 910b228 (`docs/ui-editor-gate-rules.md`, `specs.json`, `src/ui-editor/samples/`); round 1 at 1fc4ae3; round 2 at 5680880; round 3 at 808c111;
round 4 at 16b17c1 (`docs/ui-editor-gate-rules-round4.md`, `specs-round4.json`).

## 1. What is scored

The ORIGINAL 20, round 1 N03 to N11, round 2 R01 to R16, round 3 and round 4 as before, except the retired checks of section 2; T10 stays the failed
locked spec of round 3; **round 5 V01 to V09** (`specs-round5.json`): scripted real-mouse and real-keyboard specs on the real built page, headless
Chromium, a fresh context per spec, no retries, host 1920 x 1080 unless a spec says otherwise.

**Round 4's labelled amendments stand as logged** (docs/ui-editor-gate-log.md #29 and the round 4 retired list), and are listed again in the report for
Max's explicit decision: U06 is scored with a minimum of **15** distinct elements (the locked 16 cannot be reached by any page: two plain `p` share a label
and a neighbour's click lands in a selected cell's handle hit area); the final run is given `--u06-distinct 15`. The retired checks of round 4 stay retired.

## 2. Locked checks that this round makes obsolete (retired, reported, Max decides)

I read every locked spec (S, N, R, T, U) against the new page: one card, a column grid, ONE `Download` that saves every file, no File selector, one section
per file in the Updated code area with its own Copy button, no `Copy code` in the quick bar.

| Locked check | Why it cannot hold | Replaced by |
|---|---|---|
| **U02**, the whole spec | Its clause "the gaps between the nearest controls of neighbouring groups differ by at most 8 px" cannot hold when contents are LEFT-aligned in weighted columns (the dead space at the right of a group differs by design). The rest (bands, edges, separators, no clipping) is in V01 and V02. | V01, V02 |
| **U11**, steps 2, 4, 6, 8 (`liveButtons`) | They name `Copy code` and `File`, which the quick bar no longer has. U11's `quickBarWords` stay. | V09 |
| **T04**, the whole spec | Its one assert orders the quick bar and names `Copy code` between Rotate and Download. | V09 (the same order without it) |
| **T05**, steps 2, 5, 8, 11 (`liveButtons`) | They name `Copy code`. T05's `viewStyle` asserts stay. | V09 |
| **T06**, steps 3, 14 (`quickBarEnabled`) | They name `Copy code` and `File`. | V09 |
| **T13**, the whole spec | `codeShowsEdit` reads the SHOWN file and the File selector's marks (`landing.css (1)`); there is no shown file. | V06 |
| **T14**, steps 4, 12, 18 (`bugState`, `walkChanges`, `handPick`) | The shown file switching by itself and a hand-picked file staying are gone (the brief). Its Copy step (5) stays. | V06 |

Already retired and still retired: R07 steps 11 to 17, R14 `onlyRotateText`, R04 steps 3, 10, 14, 16, R05 step 2, T01, T02 steps 25, 26, 29, 30, 33, 36, 37,
T06's `ribbonAllDisabled` asserts, T15 `tabArrows` (rounds 3 and 4).

**Readings that are NOT retirements (runner changes #30 onward, "same control, new UI"):**
- `selectFile` does nothing when the page has no File selector.
- `copy` (S20, R13, T14 step 5) clicks the Copy button of the file's section: `Copy code` when the document has one file, `Copy <file>` when it has two. The
  text is compared with the download as before.
- A download of a two-file document saves both: the runner clicks `Download` once, collects the downloads, and returns the one for the file asked for (the
  primary file has the `-edited` name, the stylesheet its own). S20 `downloadName`, the export reads of P2 to P4 and `--noop` use this.
- The code asserts (`codeText`, `codeDiff`, `changeCounter`, `changeVisible`, `changeMap`, `tick`, `markerText`, `noShowOnly`) read the section of the file in
  question (`[data-code-view][data-file=<file>]`); with one file they read the same elements as before.
- `R04`'s `ribbonBox` at 1920 still reads `[data-ribbon]` (the strip and the band(s), not the card).

## 3. The UI contract the round 5 specs rely on (mine)

Everything earlier stays unless this changes it. Accessible names, `data-field`, `data-dot`, hooks and edit semantics are unchanged.

- **One card.** `[data-card]` (the one outer border) contains, in order: the quick bar (group Editor controls), `[data-ribbon]` (the strip
  `[data-ribbon-strip]` and the panel `[data-ribbon-panel]`), and the status region "Edit result". The four have no side border of their own, no gap, and
  a hairline rule between them. Before a document is open the card holds the quick bar only. The confirm bar, the paste area, the warnings and the
  Unlinked list are below the card.
- **Column grid.** `[data-ribbon-panel]` is a CSS grid with no padding at its sides. The column weights (`fr`) are the measured natural content width of
  each group plus 28 px (14 px each side): **Font 290, Paragraph 200, Size 209, Shape 288, Spacing 197, Arrange 296, Grid 260** (sum 1740). Wide (the ribbon is at
  least about 1760 px): ONE band, seven columns. Medium (1000 px of ribbon up to the wide breakpoint): TWO bands on four columns: band 1 Font, Paragraph, Size,
  Shape; band 2 Spacing under Font, Arrange under Paragraph and Size together, Grid under Shape, so band 2's separators sit exactly under band 1's. Narrow
  (below 1000 px): groups stack, every control at least 44 x 44.
- **Groups.** Left-aligned (14 px padding), top-aligned rows; each control's label directly above it with its left edge on the control's; the group name on
  the bottom line of the band, centred, 11 px, muted. Labels 12 px. Small controls 26 px high, large buttons 72 x 58, number fields 72 px wide, control text
  13 px.
- **One Download.** No File selector. `Download` saves every file of the document (one: as before; two: the page as `<name>-edited.<ext>` and the stylesheet
  under its own name), one after the other; the status line says `Saved <a> and <b>.`
- **Code sections.** Inside `details` "Updated code": a toolbar (Previous change, Next change, the counter `[data-change-counter]`), then one
  `[data-code-section]` per file, stacked, each with `[data-section-header]` (`<file>: <n> change(s)`, or just the name when unchanged), its Copy button
  (`Copy code` for a one-file document, `Copy <file>` for two), its `[data-code-view][data-file]` and its `[data-change-map]` (ticks named `Change k of N`,
  k over all sections).
- **West and north resize.** Dragging the west (north) edge makes that edge follow the pointer and keeps the opposite edge: the width (height) plus a
  compensating margin-left (margin-top) that keeps the margin box the same size, so neighbours stay put. The page tries it on a scratch preview first;
  if the engine refuses it or any other element would move, the old behaviour is kept (the opposite edge moves) and the status line says one plain line:
  `The left edge could not follow the pointer for this element, so its right edge moved instead.` (north: `The top edge ... its bottom edge ...`). SVG
  elements keep the old behaviour with that line. East and south are unchanged; snap and the 100% snap apply to the moving edge.
- **Selection path.** In the strip, `[data-path]`: the deepest five elements of the chain from the child of `body` down to the selected one; an ellipsis
  `…` first when the chain is longer; every one but the last is a button named `Select <tag> <#id or .class>`; the last is `[data-selected-label]`.
  `Select parent` (button, and Alt+ArrowUp) selects the parent. Selecting never changes the document.

## 4. Dry run before locking (the numbers the specs ask for, measured on the real samples and engine)

- **West and north probe** (`scripts/ui-editor-gate/probe-west.mjs`, section "Probe" of `docs/ui-editor-baseline-round5.md`): width plus a compensating
  negative margin kept every other element still for `#cta` west (left -40, right 0), `#art` west and north (left or top -40, others 0), `#footer`; the
  offset way moved neighbours or doubled the move. The engine refuses the margin on elements whose rule has a margin shorthand (`#headline`, `.lead`:
  the old behaviour then applies), and a table cell or an inline-block `#cta` north is not exact. At widths 1280, 641, 640 and 390 with Link off, `#cta`
  west and `#art` north moved no other element and left Phone untouched. V07 therefore uses `#cta` (west), `#art` (north), `#headline` (the old behaviour
  plus the line), `#card-build` (refusal). (A north drag on `#cta` itself is not exact; V07 does not ask for it.)
- **Column weights**: natural content widths measured with the new sizes injected into the round 4 page: 262, 172, 181, 260, 169, 268, 232 (+28 each). Band 2
  fits its spans: Spacing 197 <= Font 290, Arrange 296 <= 409, Grid 260 <= 288.
- **Downloads**: Chromium delivers two downloads from one click (also with a task between them).
- **V06**: after a font size edit on `#headline` and Move up on `#card-build`, `landing.html` has 2 changes and `landing.css` 1 (round 3 baseline).
- **V08**: the chain of `#fine` in the email sample is table, tbody, tr, td, table .wrap, tbody, tr, td #fine: 8 elements, so five and an ellipsis.

## 5. Operational definitions (mine)

Band, spread and the earlier readings: as rounds 3 and 4. **Column edges (V01)**: group boxes' left and right edges. **Share (V01 at 1920)**: a group's
width over the sum of the seven widths against its constant over the sum of constants, within 3 percent of that share. **Row (V02)**: the controls of a
group are checked as the group's leftmost control (its left edge is the group's plus 14 px); labels are paired with the nearest control below them; the
"first row's top" is the topmost label or control of the group. **Download bytes (V05)**: each downloaded text equals the plain text of its section, and
a file the edit did not change equals the sample's source. **Edges (V07)**: the border box of the element in the preview's CSS px at 1280.
**Scorer-check faults (Step 1)**: band 2 offset by 8 px (V01); centred contents (V02); a separate border or gap between the four parts (V03); a large button
60 px wide (V04); a File selector left in, a Download that saves one file, a download with changed bytes (V05); a missing section header, a Copy button
copying the wrong file (V06); a west drag that changes the width only, a west drag that moves another element (V07); a path segment that edits the
document, a missing Select parent (V08); and the earlier faults of rounds 0 to 4 on their stubs.

## 6. The pass line (all must hold)

1. The ORIGINAL 20: 18 PASS, 2 REFUSED, 0 FAIL (with the logged mappings). 2. Round 1 N03 to N11 all PASS. 3. Rounds 2, 3 and 4 all PASS except the retired
checks, T10 and with U06 read at 15. 4. V01 to V09 all PASS. 5. `npm test`: no fewer passes than 848 plus the new tests, 0 fail; `tsc -b`, `eslint`,
`vite build` clean; flag checks 16/16 OFF and ON. 6. `check:layout` through `CHECK_PAGES`: Home meets every target; the UI Editor style check at
1280x720, 1440x900, 1920x1080 and 390x844 has no new unexplained misses. 7. The scorer check passed (a failing control STOPS the round, reported before any
build). 8. No-op round trips byte-identical. 9. Locked files byte-identical. 10. ONE complete run on the FINAL commit.

## 7. Decided in advance

Any miss fails the round, no tuning; the report names the cheapest next test. A change after the scored run is a labelled iteration; both runs are kept.
Runner changes only to reach the same controls through the new UI, each logged in `docs/ui-editor-gate-log.md` and covered by the scorer check.

## 8. Known limits

Written by the agent that builds the page; Chromium only; scripted mouse and keyboard; no touch; Safari and Firefox untested; Chromium may ask once before
allowing multiple downloads (not worked around); the drag of a west or north edge is scored on Desktop at 1280 with Link off (a linked Phone scaling is the
engine's own and is not scored).
