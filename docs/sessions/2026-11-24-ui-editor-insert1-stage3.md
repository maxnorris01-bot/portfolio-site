# UI Editor insert round 1, stage 3: structure and pins, keyboard and names, small screens, the final run (2026-11-24)

Branch `feat/ui-editor-insert1` (unpushed). **Y11, Y12, Y13 and the final complete run of every spec; Y01 to Y14 all required (A17).** Behind `VITE_SHOW_UI_EDITOR`; the ribbon, the Home card, the page lead and the nav are unchanged.

## Verdict: PASSES (final run on `546bf0e`, gate 00:55:37 to 01:00:07 UTC, 270 s, 100 specs timed)
| Item | Result |
|---|---|
| Original 20 | 18 PASS, 2 REFUSED, 0 FAIL |
| Round 1 N03 to N11 | 9 PASS |
| Rounds 2 to 6 | R2 16 PASS; R3 12 PASS, 3 RETIRED, T10 FAIL (the already-failed locked spec); R4 12 PASS (U02 retired); R5 6 PASS, 3 RETIRED; R6 12 PASS |
| **Y01 to Y14** | **all 14 PASS**, none NOT BUILT (as amended) |
| Regression | 901 tests, 885 pass, 0 fail, 16 skipped; `tsc`, `eslint`, builds ON and OFF clean; flags 16 of 16; no-op round trips PASS; extras 20 of 20 |
| check:layout | Home meets every target (the known misses only); UI Editor style check met |
| Scorer check | the 12 stage 3 faults caught (one first missed: spec gap A19); the 21 stage 1, the 17 stage 2 faults and the 99 earlier runs re-run, all caught |
| Vendored engine | a build of `a5f954a`, rebuilt twice, SHA-256 `7d23069c...7916` both times, equal to `engine.js`; the engine repo's `git status` clean |
| Locked files | 0 diff lines for the seven earlier locks and the insert specs; the insert rules lock text is an exact prefix of the file |

Bundles, flag ON: main 244.31 kB / 77.04 gzip (unchanged); page chunk 379.47 / 113.05 (370.78 / 110.57 after stage 1, 379.19 / 112.96 after stage 2); page CSS 29.84 / 5.93.

## What was built in stage 3
Y11 and Y13 passed on the page at once. Y12 found two focus bugs (after Save in the Comment popover; after Escape in the text box opened by Edit text); both give the focus back to the opener now. The text box is at least 16 px on the screen and, on a scaled device, at least 44 x 160 px (it was 14 CSS px, 3.8 px on screen at 390).

## Text-editing overlay at 390 px: readable
Measured (headless, `getComputedStyle` times the scale): **16.0 px on the screen** at 390 for the landing page, the email and the chart, 44 px high, 160 px wide, over the element. Looked at: landing 390 and 1000, email 390 and 1920, chart 390 and 1440 (15 taken, 6 opened). One thing seen and left: a long text (the email's footnote at 390) is wider than the 160 px box, so the box shows the end of it (the caret is at the end); it scrolls as any input does.

## Amendments (all in `docs/ui-editor-gate-rules-insert1.md` section 7; none edits a locked file)
A1 stages; A2 clauses moved out of stage 1; A3 Y02 readings; A4 Y05 steps 25 and 26; A5 Y03 reading; A6 Y04 Escape after typed text; A7 Y05 selection after Delete; A8 stage 2 pass line; A9 stage 2 readings; A10 steps run as locked in stage 2; A11 Y05 second Undo; A12 Y10 opens the Notes list; A13 Y07 jump from another selection; A14 numbering corrections; A15 `enabledOnly` leaves `Notes` out; A16 Comment icon-only; A17 stage 3 pass line; A18 stage 3 readings; A19 Y11 Move up with Link on. (Read the file for the exact wording of A2 to A5: stage 1 numbered them.)

## Retired checks (none new; the round 6 list stands, for your decision)
V01, V02, V04 as wholes, parts of V09, U01, U03, U05, T03, U06, R04, R09 (`docs/ui-editor-gate-rules-round6.md`); N01, N02, T01, T04, T13, U02 as shown in the gate. Round 5's amendments stand and are undecided.

## Existing tests edited (for your decision)
1. `tests/uieditorengine.test.ts`: the commit pin `27065d8` to `a5f954a` (approved).
2. `tests/uieditorround2.test.ts`: the bar's `text=` count 1 to 2 (Insert shows its word like Rotate).
3. `tests/uieditorround5.test.ts`: `const text = session.files[f]` to `const text = outFiles[f]` (Download writes what the page shows).
Reverted by hand in stage 2: the round 2 test edit I had made for a Comment word (Comment has no word). No file needed a `git checkout`, `restore` or `reset` in stage 3.

## Known limits for the README
- **Arrow-key nudge drops keys while the preview rebuilds.** The second nudge in a row rebuilds the preview; keys that arrive in those ~20 ms are dropped (a held arrow key moves in steps). The extras check for it is timing-sensitive: the stage 1 build passed it five times of eight, the stage 2 and 3 builds eight of eight.
- **Unexplained slow full runs.** At the start of the round one clean run on the vendored tree went wrong ("2 PASS, 6 FAIL, 4 NOT BUILT" in an earlier attempt) and did not repeat in four later complete runs (205 to 270 s each); I do not know why and make no claim.
- **T10** (round 3, snap on resize) still fails, as in the pre-round baseline.
- Engine limits as written on the page (flow placement, HTML only for Insert; text editing refuses elements with child elements and line breaks; Delete keeps the page's own rules; notes are comments, two hyphens in a row get a space; one element at a time; tested in Chromium only).
- Pins of nested elements that share a corner overlap; a pin covers the first letter of a heading by design.
- Unlinked reorder refuses to place an element between siblings (engine rule): Move up with Link off is only first or last.
- Headless WebGL is software-rendered; frame rates are relative.

## How to look locally
`VITE_SHOW_UI_EDITOR=true npm run dev`, open `/ui-editor`: Insert, double-click to edit text, Comment (speech bubble), Notes, Include comments, Delete; narrow the window to 390 px.
