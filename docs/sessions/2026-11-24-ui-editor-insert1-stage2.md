# UI Editor insert round 1, stage 2: Comments (2026-11-24)

Branch `feat/ui-editor-insert1` (unpushed), on top of stage 1 (accepted). Behind `VITE_SHOW_UI_EDITOR`; the ribbon, the Home card, the page lead and the nav are unchanged. **Stage 2: Comment, pins, the Notes list, Include comments, hostile and reloaded notes (Y06 to Y10), and the clauses A2 moved here (Y01's Comment in the bar order, the note steps of Y05).** Stage 3 (Y11 to Y13) is not started.

## What ran in Y05 in stage 1, and what A2 moved (stated before anything was built)
Stage 1 ran Y05's step 0, steps 11 to 24 as locked, a replacement of step 25 (load the email, click `#hello`, select `tbody` by the path) with step 26 as locked, and the steps A7 added (the selection after the button and the key). A2 moved only steps 1 to 10 (the note steps: Comment, Save, Delete, Undo). Nothing of Delete's button, the Delete key or the selection behaviour was skipped. Stage 2 runs steps 1 to 10 as locked (A10; with A11's extra Undo).

## Pass line (A8) and verdict: PASSES
Y01 to Y10 and Y14 PASS; Y11 to Y13 NOT BUILT; items 1 to 3 and 5 to 10 as in A1. Final run on **`17fde71`** (gate 00:10:34 to 00:15:00 UTC, 266 s, 97 specs timed; a timestamp and the elapsed time for every spec and step in `gate.txt`):

| Item | Result |
|---|---|
| Original 20 | 18 PASS, 2 REFUSED, 0 FAIL |
| Round 1 N03 to N11 | 9 PASS |
| Rounds 2 to 6 | R2 16 PASS; R3 12 PASS, 3 RETIRED, T10 FAIL (the already-failed locked spec); R4 12 PASS (U02 retired); R5 6 PASS, 3 RETIRED; R6 12 PASS |
| Y01 to Y10, Y14 | all PASS (as amended: A2 to A16); Y11 to Y13 NOT BUILT |
| Regression | 899 tests, 883 pass, 0 fail, 16 skipped (892 / 876 after stage 1; 7 new); `tsc`, `eslint`, builds ON and OFF clean; flags 16 of 16; no-op round trips (4 files) PASS; extras 20 of 20 |
| check:layout | Home meets every target (the known misses only); UI Editor style check met |
| Scorer check | all 8 named faults caught; one of my 9 extras missed (spec gap, A13); 21 stage 1 faults and the 99 runs of the earlier scripts (controls included) re-run, all caught |
| Vendored engine | exactly a build of `a5f954a`, rebuilt twice, SHA-256 `7d23069c...7916` both times, equal to `engine.js`; engine repo `git status` clean |
| Locked files | 0 diff lines for the seven earlier locks and the insert specs; the insert rules lock text is an exact prefix of the file |

Bundles, flag ON: main 244.31 kB / 77.04 gzip (unchanged); page chunk 379.19 / 112.96 (370.78 / 110.57 after stage 1); page CSS 29.66 / 5.90 (26.87 / 5.27).

**Iterations (labelled; every run kept).** First full run on the page (`6dd1e4a`-era): U09 (A15), U04 (A16), T10 (known). The first final run on `183b6af` passed the gate and failed two extras (arrow-key nudge moved 2; Ctrl-Shift-Z redo): a timing race made worse by my extra draws (see the gate log, #53 notes); fixed on `17fde71`, which is the final run. Nothing else changed between them.

## What was built
- `src/ui-editor/notes.ts` (pure): the header text (the engine's, word for word), `stripNotes` (the code without its notes and header: a note that has its line to itself goes with the line), the numbered rows.
- **Comment** (speech-bubble icon, quick bar after Insert; disabled with nothing selected and at a view-only size, with the reason in the tooltip) opens a popover under it with one text area ("Note for the AI"), `Save`, and `Delete note` when the element has a note; Save on blank text deletes. A note is one `note` edit (a content edit: no Link, no environment).
- **Pins**: numbered discs in the overlay (never in the preview), centred on the element's top-left, the size of a disc on the screen even on a scaled device; a click selects the element and opens its note.
- **Notes** (strip, always on, with the count): a popover with the whole-page note first (`Add a note for the whole page`, or its text with `Edit` and `Delete page note`), then every note with its pin number, the element's label (jump), the text, `Edit`, `Delete`. Each action closes the list; Escape closes it and returns focus to `Notes`.
- **Include comments** beside Download (on by default, off and disabled while the code has no notes): off, Copy, Download and the Updated code view all show the code without notes and header, equal to the export of the same edit list without its note edits.
- Documents opened with notes in their code (paste, upload, sample) show them (pins and list), because the page reads them from the engine.
- Words: `src/data/uiEditor.ts`; one more sentence in the limits (notes are comments; two hyphens in a row get a space), regrouped to six paragraphs of at most 50 words.

## Screenshots (headless, software WebGL; 90 taken: 5 widths x landing, email, chart x 6 views)
Taken at 1000, 1290, 1440, 1920 and 390 for the landing page, the email and the SVG chart: the comment popover, pins on three elements, the Notes popover, Include comments off (the bar and the code view), Include comments on. **Looked at (in this stage, fixed what was seen):** landing 1440 (popover, pins, Notes list, Include off bar), landing 390 (popover, pins, Notes list, bar), chart 1440 (pins, Notes list), chart 1000 (popover), chart 390 (pins), email 1000, 1920 and 390 (pins), landing 1290 (Include off). Seen and fixed: the Notes list rows were stacked and the buttons too big (now one grid row per note, 430 px wide, 28 px buttons, 44 px at phone widths); the pins were tiny at 390 on the scaled device (now the size of a disc on the screen); the 390 pin shots first showed the wrong part of the page (my script, not the page). Seen and left: pins of nested elements that share a corner overlap (email, 1000 and 1920); a pin covers the first letter of a heading by design (within 3 px of the corner); at 1000 the strip's Link checkbox is large (existing responsive rule, not this stage). Not all 90 were opened one by one; the ones not opened are the same views at other widths.

## How to look locally
`VITE_SHOW_UI_EDITOR=true npm run dev`, open `/ui-editor`, pick a sample, click an element, press the speech-bubble button, type, Save; try `Notes`, the pins, `Include comments` and Download.

## Amendments (rules section 7)
A8 pass line; A9 readings; A10 Y01 step 2 and Y05 steps 1 to 10 run as locked; A11 (Y05 second Undo); A12 (Y10 opens the list); A13 (Y07 jump from another selection); A14 (numbering corrections); A15 (`enabledOnly` leaves `Notes` out); A16 (Comment is icon-only). None changes a locked file.

## Existing tests edited
`tests/uieditorround5.test.ts`: `const text = session.files[f]` is now `const text = outFiles[f]` (one line). No other.

## Retired checks
None.

## Open for Max
- A15 is a change to how round 4's U09 reads (the Notes button is always on); say if you would rather have it disabled with no notes and a selection.
- The extras check for arrow-key nudges is timing-sensitive (the stage 1 build passed it five times in eight); not touched.
- T10 still fails (the round 3 locked spec), as before.
