# UI Editor insert round 1: gate rules (LOCKED)

Locked in the commit `docs: lock UI Editor insert round 1 gate rules and specs`. After it this file and
`scripts/ui-editor-gate/specs-insert1.json` are never edited. A flaw found before anything is scored is a re-lock (a new commit, the first lock
kept, corrections logged as numbered amendments). The earlier gate rules (original and rounds 1 to 6), their specs and amendments stay in force.
Brief: `~/Desktop/Projects/ui-editor-insert1-brief.md`. Nothing here calls an LLM or a paid service. Sections marked **(mine)** are operational
definitions written by the implementing agent; the rest is the brief's wording.

Question: **can a visitor insert a Text box, Rectangle, Rounded rectangle, Ellipse or Button into their own page, edit an element's text, delete an
element, and leave notes for an AI, through the page, with every edit coming from the engine, nothing of the editor's own marks in the preview or the
code, and everything from earlier rounds still working?**

## 1. The behaviour being tested

- **Insert.** `Insert` menu button in the quick bar directly after Redo (the existing menu component); items, in order: `Text box`, `Rectangle`,
  `Rounded rectangle`, `Ellipse`, `Button`. Choosing one starts PLACING: while the pointer is over the preview an insertion line (in the overlay
  layer, outside the iframe) shows where the element would land: the top third of the hovered element is `before`, the bottom third `after`, the
  middle `inside` as the last child (my choice of thirds). A click drops it (one `insert` edit), Escape or choosing another tool cancels with no edit.
  The new element becomes selected. The line is inactive when the engine would refuse the spot (the engine's trial: `applyEdit` on the model without
  committing); the status line then says the engine's plain reason, a click inserts nothing and placing continues. Flow placement only. Insert is
  disabled, with a tooltip saying why, on an SVG document ("SVG") and on Tablet ("Tablet").
- **Text editing.** Double-click the hovered or selected element, press `F2` with an element selected, or the `Edit text` button in the selection
  strip. An overlay text box (outside the iframe, named `Element text`) covers the element's box with its current text; Enter applies one `text`
  edit, Escape cancels with no edit; Enter never inserts a line break. An element with child elements is refused with the engine's plain reason and
  nothing opens. Works on HTML elements and SVG `<text>`.
- **Delete.** `Delete` button in the selection strip and the Delete or Backspace key while the focus is in the preview (never in a field); the
  selection moves to the parent; disabled when the engine would refuse; the element's note goes with it. No Duplicate.
- **Comments.** `Comment` button in the quick bar after Insert opens a popover for the selected element: a text area named `Note for the AI`, `Save`,
  and `Delete note` when one exists; a blank Save deletes. A numbered pin (a small filled circle, `[data-pin][data-n]`, accessible name `Note N`) sits
  at the element's top-left corner in the overlay layer; clicking it opens that note's popover. Pins are never in the preview's DOM or the code.
- **Notes list.** A `Notes` button (its count as a badge, not in its name) in the selection strip opens a popover: the page-level note row first
  (or `Add a note for the whole page`), then each note with its pin number, the element's path label and the text; a click on the label selects the
  element and scrolls it into view; each row has `Edit` and `Delete`. Keyboard reachable; Escape closes and returns focus to `Notes`.
- **Include comments.** A checkbox `Include comments` next to Download, ON by default, enabled only while a note exists. OFF: Download, Copy code and
  the Updated code view contain no notes and no header and equal the export of the same edit list with the note edits left out; copy equals
  download in both states.
- **Reloaded notes.** On opening a document (paste, upload, sample) the notes in its code (`listNotes`) appear in the Notes list and as pins;
  editing one is a `note` edit.
- Notes ignore the Link checkbox and the environment. Names: `Insert`, `Text box`, `Rectangle`, `Rounded rectangle`, `Ellipse`, `Button`, `Comment`,
  `Notes`, `Edit text`, `Delete`, `Include comments`, `Note for the AI`, `Element text`, `Save`, `Delete note`, `Edit`.

## 2. Hooks the page provides (mine)

`[data-placing]` on `[data-stage]` while placing; `[data-insert-line]` with `data-active` and `data-zone`; `[data-text-editor]`; `[data-pin]` with
`data-n`; `[data-comment-popover]`; `[data-notes-list]` with `[data-note-row]` rows; the status line as before; every existing hook kept.

## 3. Measures and tolerances (mine)

Insertion line: 2 px of the hovered element's edge (inside: of its box). Text overlay: 2 px on every edge. Pin: 3 px of the element's top-left, in
window points with the device scale applied. Touch targets at 390: 44 px. Preview versus exported box: 1 px. Export checks follow
`docs/insert-comments-rules.md` (parse in Chromium, exact comment texts, byte equality for round trips); the engine's neutralising rule: every run of
two or more hyphens gets a space between each pair.

## 4. Locked checks this round makes obsolete

None is expected: Insert and Comment appear in the same quick-bar group as Redo only while a document is open, so round 1's exact bar lists
(N01, before any document is open) and its `includes` lists (N02) still hold; the ribbon is not touched. A locked check that the new controls make
obsolete, when found by the Step 1 run, is reported RETIRED with its reason and replacement and logged, never PASS. Existing assertions in
`tests/uieditor*.test.ts` that count or name the bar's or the strip's controls may be edited (each edit logged in the gate log with the old and new
assertion): found at Step 1.

## 5. Pass line

1. Original 20: 18 PASS, 2 REFUSED, 0 FAIL. 2. Round 1 N03 to N11 PASS. 3. Rounds 2 to 6 PASS except retired checks and the already-failed locked T10.
4. Y01 to Y14 PASS. 5. `npm test` no fewer than the current passes plus new, 0 fail; `tsc -b`, `eslint`, `vite build` clean; flag checks 16/16 OFF and
ON. 6. `check:layout` via `CHECK_PAGES`: Home meets every target; the UI Editor style check at 1280x720, 1440x900, 1920x1080, 390x844 has no new
unexplained misses. 7. Scorer check passed. 8. The vendored engine is exactly a build of engine main `a5f954a` (rebuilt twice, same SHA-256).
9. Locked files byte-identical. 10. One complete final run on the final commit. Decided in advance: any miss fails the round, no tuning, name the
cheapest next test; post-run changes are labelled iterations with both runs kept; runner changes only to reach the same control through new UI, each
logged and covered by the scorer check.

## 6. The specs

`specs-insert1.json`: Y01 Insert menu; Y02 placing (15 placements, a refused spot, Escape); Y03 inserted elements; Y04 text editing; Y05 Delete; Y06
Comment and pins; Y07 Notes list; Y08 Include comments; Y09 hostile notes; Y10 reloaded notes; Y11 structure and pins; Y12 keyboard and names; Y13
small screens; Y14 earlier behaviour kept (aggregate of W01 to W06, W08, W09 and the no-op round trips). Each step and assert kind is defined in the
file's `vocabulary`. Selectors and expected positions were dry-run against the real samples (`landing`, `email`, `chart`) before locking: every
selector is unique, `#card-build` is the second child of `#plans` (so before/after give indexes 1 and 2), `#art` is an empty `div`.
