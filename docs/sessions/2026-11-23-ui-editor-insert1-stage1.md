# UI Editor insert round 1, stage 1 (2026-11-23)

Branch `feat/ui-editor-insert1` (unpushed), from `main` at `bcbf335`; behind `VITE_SHOW_UI_EDITOR`. The round is split into three stages, each ending with a report; this is **stage 1: Insert menu, placing,
inserted elements, text editing and Delete (Y01 to Y05) and the kept checks (Y14)**. Rules and specs locked first (`00078b1`), the engine vendored at `a5f954a` (`3a1afc6`), the pass line per stage and seven
numbered amendments in `docs/ui-editor-gate-rules-insert1.md` section 7; baseline, probes and the clean run on the vendored tree: `docs/ui-editor-baseline-insert1.md`; runner changes #42 to #47 and the edited tests:
`docs/ui-editor-gate-log.md`.

## Before building: one clean full run on the vendored tree
Run `A` on `a3c1db7` (no code change; a throwaway timed copy of the gate): **clean, 205 s, 87 specs timed**, the same result as the pre-vendor tree (originals 18/2/0; rounds 1 to 6 all PASS except the known T10; round 6 **12 PASS**).
The earlier "2 PASS, 6 FAIL, 4 NOT BUILT" did not repeat, so there was no first failing spec to chase and the comparison build of engine `27065d8` was not needed (it is ready: it rebuilds to exactly the pre-vendor `engine.js`).
I do not know why `v0` and `v1` failed and make no claim about it.

## Verdict (from the stage 1 pass line only): PASSES, after one labelled iteration
Two complete runs. **Run 1 on `bc70f83`: one miss, U03** (the tooltip check of the locked round 4 spec: the new `Edit text` and `Delete` buttons had tooltips starting `Change` and `Remove`, which that check does not know).
**Iteration 1 on `8233ed8`** (only the two tooltips changed): everything passes. Everything after `8233ed8` is docs only.

| Stage 1 pass-line item | Result |
|---|---|
| 1. Original 20 | 18 PASS, 2 REFUSED, 0 FAIL |
| 2. Round 1 N03 to N11 | 9 PASS |
| 3. Rounds 2 to 6 | R2 16 PASS; R3 12 PASS, 3 RETIRED, T10 FAIL (the already-failed locked spec); R4 12 PASS (U02 retired; U06 read at 15); R5 6 PASS, 3 RETIRED; R6 12 PASS |
| 4. Y01 to Y05, Y14 | **Y01, Y02, Y03, Y04, Y05 PASS** (as amended, A2 to A7), **Y14 PASS** (W01 to W06, W08, W09 and the no-op round trips); **Y06 to Y13 NOT BUILT** |
| 5. Regression | 892 tests, 876 pass, 0 fail, 16 skipped (868 before, 8 new); `tsc`, `eslint`, builds ON and OFF clean; flag checks 16 of 16 |
| 6. check:layout (CHECK_PAGES) | Home meets every target (the known misses only); UI Editor style check at all seven sizes met |
| 7. Scorer check (stage 1) | passed after amendments A6 and A7 (the first run missed two faults, which stopped the build); 93 earlier fault runs re-run and caught |
| 8. Vendored engine | exactly a build of `a5f954a`: rebuilt twice, SHA-256 `7d23069c...7916` both times and equal to `engine.js`; the engine repo's `git status` is clean |
| 9. Locked files | byte-identical (0 diff lines for `910b228`, `1fc4ae3`, `5680880`, `808c111`, `16b17c1`, `1642321`, `782f57c` and the insert specs `00078b1`; the insert rules lock text is an exact prefix of the file, the rest is the amendments) |
| 10. One run on the final commit | done (twice: run 1 and the iteration, both kept) |

Bundles, flag ON: main 244.31 kB / 77.04 gzip (244.31 / 77.03 before the round); page chunk 370.78 / 110.57 (348.66 / 103.19 at the end of round 6; the vendored engine alone made it 365.15 / 108.93); page CSS 26.87 / 5.27 (26.04 / 5.12).
Flag OFF main 244.28 / 77.03. No-op round trips: 4 files byte-identical. Extras 20 of 20. Time of the final gate run: 264 s (Y01 3.7 s, Y02 19.8 s, Y03 3.9 s, Y04 6.8 s, Y05 7.1 s).

## What was built
- **Insert** (quick bar, directly after Redo; the menu component of the ribbon): Text box, Rectangle, Rounded rectangle, Ellipse, Button. Choosing one starts placing: an insertion line in the overlay (outside the iframe) across the top
  edge (the top third of the hovered element), across the bottom edge (the bottom third) or around the element's box (the middle, as its last child); over the empty page, at the end of `body`. At every pointer move the page
  asks the engine (`applyEdit`, nothing committed, nothing touched) and the line turns grey where the engine refuses, with the engine's reason in the status line; a click on an accepted spot makes ONE `insert` edit and selects the
  new element (`selected`). Escape, or Insert/another item, cancels with no edit. Disabled, with the reason in its tooltip, on an SVG document, on Tablet and in a view-only size.
- **Text editing**: a double-click, `F2`, or `Edit text` in the selection strip opens a one-line text box exactly over the element's box (in the overlay); Enter applies one `text` edit, Escape or leaving cancels, Enter never makes a
  line break; an element with child elements is refused with the engine's reason and nothing opens. Works on HTML and on SVG `<text>`.
- **Delete**: `Delete` in the strip and the Delete or Backspace key with the focus in the preview (never in a field or the text box); the selection moves to the parent; disabled where the engine refuses (an implied element such as the
  email's `tbody`). Undo, Redo and Reset restore the exact bytes (they replay the edit list).
- **Limits text** ("How it works and limits"): flow placement and HTML only; text editing refuses an element with child elements and takes no line breaks; Delete keeps the page's own rules and does not check links to a removed id. The
  sentence about "invented elements" is gone (inserted elements can be edited). The preview hint now mentions double-click, F2 and Delete.
- The ribbon, the Home card, the page lead and the nav are untouched; no Duplicate, no free positioning.

## The engine's default look of each inserted kind
(Read from screenshots at 1280, 1440 and 390 on the landing page and the email; they are the engine's own defaults, not the page's.) **Text box**: a plain paragraph reading "Text", no box. **Rectangle**: a grey (`#d9d9d9`) 200 x 120 px box with a 1 px
grey border. **Rounded rectangle**: the same with 12 px corners. **Ellipse**: the same at 50% radius. **Button**: a real `<button>` reading "Button" in the browser's default grey. All carry `max-width: 100%`, so they stay inside the screen at 390.
Two things you will see: inside the landing page's row of three cards, an inserted element becomes a fourth flex item, so the cards narrow (their text wraps in a narrow column) and a Button is stretched to the row's height (a tall grey strip);
in the email's table cell the boxes simply stack under the text.

## What I looked at (headless Chromium, never Max's Chrome profile)
Screenshots at 1000, 1290, 1440, 1920 and 390 for the landing page, the email and the SVG chart (80 images each pass): the Insert menu open, placing with the line before and inside the hovered element, each of the five kinds inserted (all five in a row at
every width, and one by one at 1440 and 390), the text editor open, and on the chart the disabled Insert button and the editor over an SVG `<text>`. I read the Insert menu at 1440, 1000 and 390, the placing line at 1440 and 390, the five kinds
at 1440, the editor at 1440, 390 and on the chart, the refusal on the email, and the final set at 1920 and 1290. What showed and what I did: the text box was 14 px taller than an SVG heading (a global `min-height: 36px` on text inputs;
fixed, the box is now exactly the element's); a refusal stayed in the status line after the pointer moved to an accepted spot (the placing hint comes back now); the list of limits no longer fitted six paragraphs of 50 words (shortened, and the
three new sentences placed after the snapping sentence). Not changed: at 390 the Desktop preview is scaled to about a quarter, so the text box is small there (it is the element's box); inserting into a flex row narrows its siblings (the engine's default).

## Found on the way (all before the final run)
- Two gaps in the locked Y specs, found by the scorer check, before anything was scored (amendments A6 and A7): Y04 never typed new text and then pressed Escape, and Y05 outside its note steps never checked where the selection goes or used the button.
- A flaw in Y05 (A4): `body` cannot be selected, so the "Delete disabled where the engine refuses" clause is tested on the email's implied `tbody`.
- My own runner bug: the new `present` assert shadowed the old one (log #46); found by the re-run of the earlier faults and fixed.

## For Max to decide
- **Retired checks: none** in stage 1.
- **Edited tests:** `tests/uieditorengine.test.ts` (the engine commit pin, one line, approved) and `tests/uieditorround2.test.ts` (the bar's `text=` count 1 to 2), both in gate log #47.
- **The amendments** A1 to A7 (rules section 7), especially the stage pass lines (A1) and the moves to stage 2 and 3 (A2).
- Round 6's undecided items still stand (the retired checks of round 6, round 5's amendments, T10 as a failed locked spec).

## How to look locally
`VITE_SHOW_UI_EDITOR=true npm run dev`, open `/ui-editor`. Things to try: open the landing page, press **Insert** and pick **Rectangle**, move the pointer over the Build card (line above it, then inside it, then below it), click; try the email and hover a
table cell's row (the line goes grey and the status line says why); press Escape while placing; select the new box and change its fill; **double-click** the "See what we build" button, type, press Enter (and Escape); select the section that holds the three
cards and press **F2** (refused: it has child elements); select a card and press **Delete**, then **Undo**; open the chart (Insert is greyed with the reason) and double-click its heading.
