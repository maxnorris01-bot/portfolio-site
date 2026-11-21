# UI Editor formatting round 6 (2026-11-20)

Same branch, `feat/ui-editor-format1` (unpushed), on top of rounds 1 to 5; behind `VITE_SHOW_UI_EDITOR`. Rules and specs locked first (`3fee931`) and RE-LOCKED before any page change (`782f57c`, Max's decision after the
scorer check stopped the round on three flaws in my specs); the probe, the baseline, the scorer check and the stop: `docs/ui-editor-baseline-round6.md`; runner changes #33 to #37, the amendments and the test
assertions changed: `docs/ui-editor-gate-log.md`; the ribbon and the PowerPoint table: `docs/ui-editor-ribbon-design.md`; decisions: `docs/working-notes-and-decisions.md`.

## Verdict (from the pass line only): PASSES
One complete run on `fb71ae8` (everything after it is docs only).

| Pass-line item | Result |
|---|---|
| 1. Original 20 | 18 PASS, 2 REFUSED, 0 FAIL |
| 2. Round 1 N03 to N11 | 9 PASS |
| 3. Rounds 2 to 5 | R2 16 PASS; R3 12 PASS, T01, T04, T13 RETIRED, T10 FAIL (the failed locked spec); R4 12 PASS (U06 read at 15), U02 RETIRED; R5 6 PASS, V01, V02, V04 RETIRED (by round 6) |
| 4. W01 to W09 | 12 of 12 PASS: W01 to W06, W08, W09 and each of W07a, W07b, W07c, W07d PASS (none NOT BUILT) |
| 5. Regression | 884 tests, 868 pass, 0 fail, 16 skipped (859 before, 9 new); tsc, eslint, builds ON and OFF clean; flag checks 16 of 16 |
| 6. check:layout (CHECK_PAGES) | Home meets every target (the known misses in the expected file only); UI Editor style check at 1280x720, 1366x768, 1440x900, 1920x1080, 2000x1100, 2560x1440 and 390x844: all met |
| 7. Scorer check | passed: 11 controls pass on the re-locked specs, 21 round 6 faults caught (3 new), 72 earlier faults re-run and caught; no control failed |
| 8. No-op round trips | 4 files byte-identical |
| 9. Locked files | byte-identical (0 diff lines for 910b228, 1fc4ae3, 5680880, 808c111, 16b17c1, 1642321 and the re-lock 782f57c) |
| 10. One run on the final commit | done |

Bundles, flag ON: main 244.31 kB / 77.03 gzip (unchanged); page chunk 348.66 / 103.19 (333.26 / 98.40 before); page CSS 26.04 / 5.12 (21.45 / 4.31). Flag OFF main 244.28 / 77.03.
Not in the pass line: extras 20 of 20.

## The ribbon, measured
- **Bands.** At the gate's host width 1920 the ribbon is 1834 px wide: one band, 122 px high with the strip (95 px of groups). At 1440 it is 1375 px: one band, 122 px. **At 1290 it is 1231 px: two bands, 218 px high**
  (the one-band target did not fit without shrinking controls below the brief's sizes: one band needs a ribbon of 1352 px, a window of about 1417 px). Below a ribbon of 1000 px (a window of about 1047 px or less) the groups stack.
- **Weights (measured, `RIBBON_COLUMNS`).** Font 225, Paragraph 143, Size 182, Shape Styles 273, Spacing 187, Arrange 205, Grid 133 (sum 1348) as both the floor and the `fr` weight of each column. Widths at 1440: 229, 146, 186,
  278, 191, 209, 136; at 1920: 306, 195, 248, 371, 254, 279, 181. The brief's starting weights (255, 140, 150, 215, 175, 190, 165) could not hold: at those the Size group would be 150 px and its second row needs 165.
- **Row labels** are sized to their words (Height and Width 40 px, Corner radius 80, Padding and Margin 48, Nudge 38) rather than the brief's 46, 74, 50 and 40, because "Corner radius" does not fit in 74 px at 13 px type and the others
  save 10 px of the room the one band needs.

## Part B
B1 Shape Effects, B2 Italic and Underline, B3 Line spacing and B4 Gradient are all built and each passes its spec (W07a to W07d). Italic and Underline show pressed from the computed style, so an `a` that is underlined by the
browser shows pressed; the shadow, the line spacing and the gradient are HTML only (an SVG shape has no box shadow, line height or background image, so those controls are switched off for SVG).

## What I looked at (headless Chromium, never Max's Chrome profile) and fixed
Screenshots at 1000, 1290, 1440, 1920 and 390 for the landing page, the email, the chart and a pasted page ("Your own code"), with the Shape Fill, Shape Outline (Weight, Dashes), Font colour, Shape Effects, Line spacing,
Font size presets and Gradient menus open where the element allowed, and I read them (the ribbon crops of all four samples at the five widths, and the menus at 1440, 1000 and 390). What showed, and what I did:
- `Move down` wrapped to two lines, and `Shape Outline` was cut to "Shape Outl…": each control now has a declared minimum and the group floors are measured from them.
- A width showed as "268.67p": a width or height is shown with at most one decimal and the number box keeps 70 px (what is written is never rounded).
- At 390 a menu opened low on the screen ran off the bottom: a menu too low for its height now slides up until it fits, and one taller than the window scrolls inside.
- A submenu did not close with Left (found by W05): fixed.
- The chart had an empty Spacing group: an SVG element's missing controls are drawn switched off, so no group is empty.
- The Line spacing menu showed "✓ 1.5" with the tick at the left and the label at the right: radio items keep a column for the tick.
- Menu items are 44 px high wherever the ribbon stacks (about 1047 px or less), not only at phone width.

## Found on the way
- On the old page a second typed value in the same number box was ignored (the commit flag was never reset). The new number box makes each typed value commit; W06 now types a second size.
- Three spec flaws of mine (W06, W07a, W07d), found by the scorer check before anything was built; see the baseline and the log. No flaw was found in the scored run.

## For Max to decide
- **The retired checks:** V01, V02, V04 as wholes; V09 step 6; U01 step 3; U03 steps 2, 5, 9; U05 steps 2 and 4; T03 steps 2, 4, 6, 8; U06 step 23; R04 step 6; R09 steps 8 and 9 (`docs/ui-editor-gate-rules-round6.md`).
- **Three existing unit tests were edited** (four assertions), because the brief replaces what they pinned: the alignment and unit captions, 26 px controls, the round 5 column weights (log #41).
- **Round 5's labelled amendments stand as logged** and are not yet decided: U06 is read at 15 distinct elements (`--u06-distinct 15`, round 4's amendment), the round 5 retired checks (U02, T04, T13 whole; parts of U11, T05, T06, T14) and reading #32 (the path segments and `Select parent` are not counted as ribbon controls).
- **T10** stays a failed locked spec (round 3's, on `#art`), replaced by U10.
