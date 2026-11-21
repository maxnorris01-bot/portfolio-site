# UI Editor formatting round 6: gate rules (LOCKED in Step 0)

Written 2026-11-19, before any page change of this round, and RE-LOCKED 2026-11-20 (still before any page change; see "Re-lock" at the end). After the commit that
re-locks this file and the specs (`scripts/ui-editor-gate/specs-round6.json`), these two files and the earlier locked files (910b228, 1fc4ae3, 5680880, 808c111 and the
round 4 and round 5 lock commits) are never edited. The first lock commit (3fee931) stays in history. If a rule turns out to be wrong, it is recorded and Max decides. Sections marked **(mine)** are operational definitions I wrote. The specs were written by
Claude Code, the same agent that builds the page. The brief is `~/Desktop/Projects/ui-editor-format6-brief.md`.

## Pass line (all must hold)
1. Original 20: 18 PASS, 2 REFUSED, 0 FAIL.
2. Round 1 N03 to N11 PASS.
3. Rounds 2 to 5 PASS, except the checks retired below and the already failed locked T10 (and the earlier retirements, which stay).
4. W01 to W06, W08, W09 PASS; each of W07a to W07d PASS or NOT BUILT (never a half-working control).
5. `npm test` no fewer than 859 passes plus the new tests, 0 fail; `tsc -b`, `eslint`, `vite build` clean; flag checks 16 of 16 with the flag OFF and ON.
6. `check:layout` via `CHECK_PAGES` (the full sweep crashes on `main`): Home meets every target; the UI Editor style check at 1280x720, 1440x900, 1920x1080 and 390x844 has no new unexplained misses.
7. Scorer check passed (a failing control STOPS the round).
8. No-op round trips byte-identical.
9. Locked files byte-identical.
10. ONE complete final run on the FINAL commit; the verdict comes from the script.

Any miss fails the round: no tuning, name the cheapest next test. Changes after the scored run are labelled iterations with both runs kept. Runner changes only to
reach the same control through the new UI, each logged in `docs/ui-editor-gate-log.md` and covered by the scorer check.

## Locked checks this round makes obsolete (they report RETIRED, never PASS)
| Check | Why | Replaced by |
|---|---|---|
| V01 (whole) | It reads band-2 edges against band-1 columns and the seven widths against the round 5 weights; round 6 has one band of two-row groups. | W01 |
| V02 (whole) | Its 14 px left padding and first-row tops describe the round 5 groups; round 6 groups have 8 px padding and fill each row to the right edge. | W02 |
| V04 (whole) | The 72 x 58 large buttons and 72 px number fields no longer exist (28 px rows). | W03 |
| V09 step 6 (`ribbonLabels`) | It expects a label above every control; row labels now sit beside their control. V09's other steps stay. | W03 |
| U01 step 3 (`ribbonGroups`) | It names the group Shape and the inline colour, thickness and swatch fields. U01's `noTabs` stays. | W01 |
| U03 steps 2, 5, 9 (`ribbonLabels`) | Same as V09 step 6. U03's `tooltips` steps stay. | W03 |
| U05 steps 2, 4 and T03 steps 2, 4, 6, 8 (`controlSizes`) | They expect large buttons 54 to 62 px high and 11 px group names. | W03 |
| U06 step 23 (`fillShows`) | It reads the Background input, which lives in the Shape Fill menu (More colours) now. | W04 |
| R04 step 6 (`ribbonEnabled`) | It names Text colour, Background, Border colour and Border width as inline controls; they are menus now. | W04, W05 |
| R09 steps 8, 9 (`swatch`, `swatchNative`) | They read the native colour input `Pick text colour`, which no longer exists. The typed hex (step 6) and its computed colour (step 7) stay, reached through the menu. | W04 |

Mapped, not retired: the runner reaches the hex fields `Background`, `Border colour` and `Text colour` through their menu (Shape Fill, Shape Outline, Font colour,
then More colours), a logged runner change covered by the scorer check; `stepper` reaches the spin arrows and the grow and shrink buttons; `choose` reaches the font
family and weight dropdowns. Everything else is mapped, not retired.

## Specs W01 to W09 (`specs-round6.json`; vocabulary and operational definitions are in its `vocabulary` block)
- **W01 bands (P1).** At 1920 and 1440 exactly one band; at 1290 one or two bands (the count is reported); at 1100 two bands; at 390 stacked (seven bands, every group as wide as the panel). No horizontal overflow at any of them. A band is a distinct group top (6 px). With one band the ribbon panel is at most 96 px high. The seven group names are Font, Paragraph, Size, Shape Styles, Spacing, Arrange, Grid, in that order.
- **W02 fill rule (P1).** At 1000, 1290, 1440 and 1920 on all three samples, for every row of every group: the last control's right edge equals the group's inner right edge within 2 px; neighbouring controls are at most 8 px apart; the row has at least one stretching control (`data-stretch`); nothing is centred (the first control starts at the group's inner left edge within 2 px). **(mine)** "Inner edge" is the group's box less its border and padding.
- **W03 sizes (P1).** Controls 26 to 28 px high (spin arrows excluded); fixed icon buttons (`data-fixed-icon`) 28 px wide; row labels 12 to 13 px; control text 13 to 14 px; group names 11 to 12 px (0.5 px tolerance, inclusive).
- **W04 colour menus (P1, P2, P5).** Open by click and by Enter, Space and Down; the contents are the page colours (the document's distinct colours, up to 16, in first-use order), the 8 standard colours, `No fill` (`No outline` in the outline menu, none in the Font colour menu) and `More colours…`; a swatch makes the same edit as the hex box (the exports are byte for byte equal); an invalid hex (`red`, `#12`) makes no edit and shows one plain line ("not a colour"); Escape and an outside click close the menu with focus back on its button; `aria-expanded` follows; the chosen colour is marked (`aria-checked`). **(mine)** The page colours are read from the original files in order, matching `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`, `hsl()` and `hsla()`; the runner lower-cases them and writes them as 6-digit hex, dropping duplicates. P4 allows 4 changed lines of `landing.html` (the card is on the shared class `.card`, so its edits are inline styles; a guard against runaway edits, not tuned; P4 is not in W04's scored checks).
- **W05 outline menu (P1, P2, P5).** Weight (1, 2, 3, 4, 6, 8 px) and Dashes (Solid, Dotted, Dashed, Double) give the computed style in the preview and the matching export; an element with no border gets a VISIBLE line (width and style both written); Undo restores; Right opens a submenu and Left closes it; Double under 3 px shows "3 px or more". **(mine)** Weight is the item before Dashes, and Dashes is the last item of the menu (the keyboard path in the spec depends on it).
- **W06 number controls (P1, P5).** Spin step 4 px (Height, measured on `#cta`, an element with no flex-grow; 2 px radius on `#card-build`, 1 px font), Shift times 10, hold-to-repeat, typing `52` gives `52px`, a second typed size in the same box (`30`) applies too, the presets list 12 14 16 18 20 24 28 32 36 44 48 60 72, grow and shrink, the px/% toggle and the snap to `100%` (round 2's R08 steps).
- **W07a to W07d (P1, P5; W07a also P2).** B1 Shape Effects (None, Subtle, Medium, Strong write the stated `box-shadow`); B2 Italic and Underline (pressed state follows the computed style); B3 Line spacing (1.0, 1.15, 1.5, 2.0, unitless `line-height`); B4 Gradient (two colours, four directions, `No gradient`). Each reports PASS or NOT BUILT. **(mine)** B1's edit on `#card-plan` is an inline style in `landing.html` (so its export check reads `landing.html`). B4 checks the written text of the export (`linear-gradient(to bottom right,`, `to top`, `to bottom` in `landing.html`; `to right` in `landing.css` for `#art`, which has its own rule); where it reads the computed style it accepts either keyword order (`to bottom right` or `to right bottom`). **(mine)** B4 defaults: with no gradient yet, From is the element's fill colour (white when transparent) and To is its text colour.
- **W08 environments (P5).** Tablet's disabled controls look the same as with nothing selected, and the selected Tablet button is black like Desktop's; at 390 every control, spin arrow and menu item is at least 44 px high and wide and a menu stays inside the window (scrolling inside if taller).
- **W09 kept.** An aggregate: PASS when V03, V05, V06, V07 and V08 (round 5) are PASS in the same run.

## Step 1 probe results this document does not decide
The engine writes `border-width` and `border-style` as separate declarations and does not refuse a rule whose `background` or `border` is a shorthand (it writes a more specific longhand rule that wins); so the plain line for a shorthand in W05 and W07d is never expected, and the specs say so. Measured in `docs/ui-editor-baseline-round6.md`.

## Re-lock (2026-11-20, before any page change)
Max decided to re-lock instead of running a labelled iteration, because nothing had been scored against the real page. The first lock (3fee931) found three mistakes in
my specs in the scorer check (the control stub failed W06, W07a and W07d). A dry run of the specs' steps that do not depend on the new UI (Height, radius, font
size, width %, the full-width snap, hold-to-repeat, the colour edits through the old hex fields, the element lists and where each edit lands) then ran once on the
existing page through the old controls; dry runs are not scored. The corrections, each logged in `docs/ui-editor-gate-log.md` with its diff:
1. **W06** measures Height on `#cta` (not `#card-build`, a flex-grow item, which the engine refuses: both `#cta` and `#headline` passed the dry run); the radius step selects `#card-build` first. Added from the dry run: a second typed size (`30`) after `52` and `24` (on the old page a second typed value in one box was ignored); the hold-to-repeat step starts from 30.
2. **W07a** reads `landing.html` (an inline style: `.card` is shared and Link is on); W04's and W07a's unscored P4 annotation names `landing.html` too.
3. **W07d** reads the written text in the export (`landing.html`, and `landing.css` for `#art`) with exactly the brief's wording for To right, To bottom, To bottom right and To top (`to bottom` is added: Chromium omits it from the computed value); its computed-style checks accept either keyword order for `to bottom right` (new `startsWithAny`, runner change #37).
No other mismatch was found. Unchanged: the pass line, the retired-checks table, W01 to W05, W07b, W07c, W08, W09.
