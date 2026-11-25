# UI Editor formatting round 7a: gate rules (Sides popover fits, more fonts)

Locked in its own commit before any page change (`docs: lock UI Editor formatting round 7a gate rules and specs`). Never edited afterwards: amendments are appended in section 7, numbered, and this text stays an exact prefix of the file. Specs: `scripts/ui-editor-gate/specs-round7a.json` (Z01, Z02, Z07). The brief is `~/Desktop/Projects/ui-editor-format7a-brief.md`; the colour menu (Part C, Z03 to Z06) is round 7b and is not in this file.

## 1. What is gated
- **Part A (a bug).** The Padding and Margin `Sides` popover (`.ue-popover`) is capped at `max-width: 100%` of the Spacing group, which is 190 to 250 px wide at 1440 and 1920, while its four steppers need about 282 px. On the baseline build (HEAD of main, c75b34c) the Right and Left steppers run past the popover's border at 1440 (popover 872..1062, right stepper 1033..1153) and 1920 (1163..1416, right stepper 1324..1444); it fits at 1000, 1290 and 390. The fix must make it as wide as its content and keep it inside the window, with Escape closing it and returning focus to the Sides button, and the names and `data-` hooks unchanged.
- **Part B.** The font select keeps the page's own family first and the 12 original entries in their order, and gains 29 system fonts in four groups (the table in section 3). No web fonts, no link or @import, no free text; the select shows names only. The values are exact strings and are locked here.

## 2. Z01, the Sides popover (P1, P5)
For `Padding` and for `Margin`, with an element selected (`#card-build` of the landing page) and the popover open, at the windows 1000x900, 1290x900, 1440x900, 1920x900 and, with the Phone view selected, 390x844 (my operational definition of "the Phone frame at 390": the Phone view at a 390 px window, where the ribbon is stacked). Steps: open the popover with the button named `<Field> sides`; the popover is open with focus inside (P5, as round 3 T07); then the `sidesFit` assert (P1); then Escape; the popover is closed and focus is on the Sides button (P5).
`sidesFit` (defined in the specs file, vocabulary): (a) every stepper box, its minus, input and plus buttons, every cell and every label box lies inside the popover's border box within 1 px; (b) the popover lies inside the window within 0.5 px; (c) it lies inside the editor card (`[data-editor]`) left to right within 1 px (my addition: the brief's "must not run off the preview's edge"); (d) the document does not scroll sideways; (e) the four stepper boxes have equal widths within 1 px; (f) no label box overlaps a button (touching edges are allowed: today the label sits directly above its stepper with no gap, and the brief does not ask for a gap).
**Z01 must FAIL on the baseline build**, at 1440 and 1920 (dry-run before locking: it fails on those two sizes only, for both fields, with the details above, and passes at 1000, 1290 and 390). With the intended fix (a scratch copy: `width: max-content`, `max-width: calc(100vw - 16px)`, and a layout effect that moves it left when it would leave the window) the dry-run measured the popover at 872..1170 (1440), 1163..1461 (1920), 29..327 (1290), 31..217 (1000) and 25..211 (390), steppers 120 px wide (152 px in the single column), everything inside, and Z01 PASS. The same fix was also measured at 1048, 1100, 1200, 1366, 1600 and 2560 px (not gated): the popover is inside the window at every one.

## 3. Z02, the fonts (P1, P2, P5)
The select named `Font family` with `#headline` of the landing page selected. `fontList` (P5): a SELECT; its first option is the page's own family, shown by its first name (`Georgia`); then the 41 options of the table below, each with exactly that label and that value; the 12 originals first and in order; no label contains a comma or a quote; independently of the table, every value ends in a generic family (serif, sans-serif, monospace, cursive, fantasy or system-ui) and every name inside a value that contains a space is double-quoted. No text input in the font field. Then, for each of the 41 options: choose it by its value; the computed `font-family` of `#headline` in the preview equals the value exactly (P1); `landing.css` contains `font-family:` followed by the value, as written (P2); Undo; the computed `font-family` is back to `Georgia, "Times New Roman", serif` and the export equals the original bytes (P2). The specs check the value written, never how the glyphs look (the test machine has few of these fonts). Dry-run before locking on a scratch copy with the 29 fonts added: Z02 PASS.

| # | Group | Name shown | Value written (and the text expected in the export) |
|---|---|---|---|
| 1 | original | Georgia | `Georgia, serif` |
| 2 | original | Times New Roman | `"Times New Roman", serif` |
| 3 | original | Arial | `Arial, sans-serif` |
| 4 | original | Helvetica | `Helvetica, Arial, sans-serif` |
| 5 | original | Verdana | `Verdana, sans-serif` |
| 6 | original | Trebuchet MS | `"Trebuchet MS", sans-serif` |
| 7 | original | Tahoma | `Tahoma, sans-serif` |
| 8 | original | Courier New | `"Courier New", monospace` |
| 9 | original | system-ui | `system-ui` |
| 10 | original | serif | `serif` |
| 11 | original | sans-serif | `sans-serif` |
| 12 | original | monospace | `monospace` |
| 13 | serif | Palatino Linotype | `"Palatino Linotype", "Book Antiqua", Palatino, serif` |
| 14 | serif | Book Antiqua | `"Book Antiqua", Palatino, "Palatino Linotype", serif` |
| 15 | serif | Garamond | `Garamond, "Times New Roman", serif` |
| 16 | serif | Baskerville | `Baskerville, "Baskerville Old Face", "Times New Roman", serif` |
| 17 | serif | Cambria | `Cambria, Georgia, serif` |
| 18 | serif | Constantia | `Constantia, Georgia, serif` |
| 19 | serif | Didot | `Didot, "Bodoni MT", "Times New Roman", serif` |
| 20 | serif | Rockwell | `Rockwell, "Courier Bold", Courier, serif` |
| 21 | sans-serif | Segoe UI | `"Segoe UI", Tahoma, Geneva, sans-serif` |
| 22 | sans-serif | Calibri | `Calibri, Candara, "Segoe UI", sans-serif` |
| 23 | sans-serif | Candara | `Candara, Calibri, "Segoe UI", sans-serif` |
| 24 | sans-serif | Corbel | `Corbel, "Lucida Grande", "Segoe UI", sans-serif` |
| 25 | sans-serif | Century Gothic | `"Century Gothic", CenturyGothic, "Apple Gothic", sans-serif` |
| 26 | sans-serif | Gill Sans | `"Gill Sans", "Gill Sans MT", Calibri, sans-serif` |
| 27 | sans-serif | Optima | `Optima, Candara, "Segoe UI", sans-serif` |
| 28 | sans-serif | Futura | `Futura, "Trebuchet MS", Arial, sans-serif` |
| 29 | sans-serif | Franklin Gothic Medium | `"Franklin Gothic Medium", "Arial Narrow", Arial, sans-serif` |
| 30 | sans-serif | Lucida Sans Unicode | `"Lucida Sans Unicode", "Lucida Grande", sans-serif` |
| 31 | sans-serif | Geneva | `Geneva, Verdana, sans-serif` |
| 32 | monospace | Consolas | `Consolas, "Lucida Console", monospace` |
| 33 | monospace | Menlo | `Menlo, Monaco, Consolas, monospace` |
| 34 | monospace | Monaco | `Monaco, Menlo, Consolas, monospace` |
| 35 | monospace | Lucida Console | `"Lucida Console", Monaco, monospace` |
| 36 | monospace | Andale Mono | `"Andale Mono", "Courier New", monospace` |
| 37 | display | Impact | `Impact, "Arial Narrow Bold", Haettenschweiler, sans-serif` |
| 38 | display | Arial Black | `"Arial Black", "Arial Bold", Gadget, sans-serif` |
| 39 | display | Comic Sans MS | `"Comic Sans MS", "Comic Sans", cursive` |
| 40 | display | Brush Script MT | `"Brush Script MT", "Brush Script Std", cursive` |
| 41 | display | Copperplate | `Copperplate, "Copperplate Gothic Light", fantasy` |

The groups are the order of the list (serif, sans-serif, monospace, display). Fallbacks end in `serif`, `sans-serif`, `monospace`, `cursive` (Comic Sans MS, Brush Script MT) or `fantasy` (Copperplate); `Impact` and `Arial Black` fall back to `sans-serif`.

## 4. Z07, kept
An aggregate with no steps: PASS when, in the same run, the original 20 are 18 PASS and 2 REFUSED with 0 FAIL, round 1 N03 to N11 PASS, rounds 2 to 6 PASS except their retired checks and the already failed locked T10 (as the earlier rounds read them), and insert 1 Y01 to Y14 all PASS (run with `--stage 3`).

## 5. Pass line
Z01, Z02 and Z07 PASS; `npm test` no fewer than 885 passes plus the new tests with 0 fail (16 skipped as before); `tsc -b`, `eslint` and both builds clean; flag checks 16/16; `check:layout` via `CHECK_PAGES` with Home meeting every target and the UI Editor check showing no new unexplained misses; the scorer check passed; no-op round trips byte-identical; locked files 0 diff lines; ONE complete final run on the FINAL commit. Any miss fails the round; no tuning.

## 6. Scorer check (before any page change)
Each injected fault must fail where stated, on the stub page (`--stub8`, `reference/insert1.html`, extended): the popover capped back to 100% of its group (`sides-cap`), a stepper pushed outside the popover (`sides-stepper-out`), a popover running off the window at 390 (`sides-off-390`): Z01; a new font that writes the wrong stack (`font-wrong-stack`), one without a generic fallback (`font-no-generic`), one of the original 12 dropped (`font-drop-original`): Z02. The earlier faults (original, rounds 1 to 6, insert 1) are re-run. If a control does not fail where it should, the round STOPS.

## 7. Amendments
(none yet; numbered amendments are appended below this line)

**A1. Round 4's `fontShows` (U06) lists the select's options exactly; round 7a appends 29 options after them (found by the first run of U06 on the built page, before the final run; no spec was scored).** The brief itself keeps the twelve originals at the head and appends more, so an exact list cannot hold. From round 7a, on the real page and the round 7a stub (`--stub8`) the assert compares `options` with the FIRST `len(options)` options of the select (the page's own family and the twelve, as before); the earlier stubs (`--stub` to `--stub7`) have exactly those and are still read exactly. Everything else in the assert is unchanged (the shown name, the stack in the tooltip, no option shows a whole stack). Z02 is the spec that reads the whole list.
