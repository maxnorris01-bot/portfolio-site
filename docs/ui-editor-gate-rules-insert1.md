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

## 7. Amendments (numbered; the Step 0 lock above and its commit stay as they are)

Added 2026-11-23, after the vendoring and before anything of the round was scored or built. Max split the round into three stages, each ending with a report before the next starts. The
machine-readable form of this section is `scripts/ui-editor-gate/amendments-insert1.json` (the runner reads it with `--stage N`; without `--stage` the locked specs run as locked).

**A1. The stages and a pass line for each.**
- **Stage 1** covers Y01 to Y05 (the Insert menu, placing, inserted elements, text editing, Delete) and the kept checks. Pass line: items 1 to 3, 5 to 10 of section 5 as written (original 20 18 PASS 2 REFUSED 0 FAIL; round 1
  N03 to N11; rounds 2 to 6; tests, `tsc`, `eslint`, build, flag checks; `check:layout`; scorer check; the vendored engine is a build of `a5f954a`; locked files; one final run), and instead of item 4: **Y01 to Y05 PASS as amended
  (A2 to A5) and Y14 PASS; Y06 to Y13 report NOT BUILT** (never PASS). The scorer check of stage 1 covers the stage 1 faults only. The ribbon is not touched: W01 to W08 pass unchanged.
- **Stage 2** will cover Y06 to Y10 (Comment and pins, the Notes list, Include comments, hostile notes, reloaded notes) and the clauses moved by A2. **Stage 3** will cover Y11 to Y13, the stage 2 leftovers and the
  last full run. Their pass lines are written when they start, as numbered amendments, before anything of them is scored.

**A2. Clauses that move out of stage 1 (each listed).**
1. **Y01 step 2** (`insertBarOrder` with `names` `Insert`, `Comment`): in stage 1 the names are `["Insert"]`; the original step, with `Comment`, runs again in stage 2 when the Comment button exists.
2. **Y05 steps 1 to 10** (a note given through the Comment popover, deleted with its element, `exportCommentCount` 0 and 0, Undo restores the bytes): they need Comments, so they move to stage 2. Steps 11 to 24 (the
   button and the keys, Undo, the field that keeps its Delete key) stay in stage 1.
3. **Y12, Y13** (keyboard and names, small screens) involve the Comment popover, pins and the Notes list; they report NOT BUILT in stage 1 and run in stage 3. The stage 1 controls (`Insert`, `Edit text`, `Delete`)
   are tested for their 44 px size and their names in stage 3 as well.
4. **Y14** has no clause that needs notes (it is an aggregate of W01 to W06, W08, W09 plus the no-op round trips of the four files), so it stays whole in stage 1.

**A3. `type` takes `value`.** Y03 writes `{"do":"type","field":...,"value":...}`; the runner's `type` (since round 1) reads `text`. The runner reads `value` as `text` when `text` is absent. Runner change, logged, covered by the scorer check.

**A4. Y05 steps 25 and 26 (select `body`, then `Delete` disabled) cannot be run as written.** The selection path starts below `body` (it shows the deepest five elements from the child of `body`), and a click on the
empty page selects nothing, so `body` can never be selected on this page and there is no `body` segment to click. The clause is about a place where the engine refuses a removal; the same refusal exists for an implied
element, which can be selected: the email sample's table has no `<tbody>` in its source, the parser adds one, and the path shows it. The two steps become: load the email, click `#hello`, `selectPath` `tbody`,
`buttonDisabled` `Delete` `true`. The `body` case cannot arise, so nothing is untested.

**A5. Reading of the status line in Y02 step 14.** `statusContains` `<tr>` is met by the engine's own reason, which contains `<tr>` ("a `<div>` cannot go directly inside `<tr>` ..."); the page shows the engine's reason
(prefixed with a plain lead), not a rewording that drops the tag.

**A6. Y04 has no step that types new text and then presses Escape (found by the scorer check, before anything was scored).** The brief says "Escape cancels (no edit)", but Y04 opens the text box and
presses Escape only on the element's unchanged text (steps 3 and 9), and applying the unchanged text is a no-op in the export, so a page whose Escape applies the text would pass (the injected fault
`edit-escape-applies` passed Y04). In stage 1 and after, five steps are inserted after step 11 (the box is open from the `Edit text` button): `fillText` `Escape must not apply this`, `Escape`,
`textEditorOpen` false, `exportEqualsOriginal`, then `Edit text` again, so that the original step 12 finds the box open as before.

**A7. Y05 had no check, outside the note steps, that the selection moves to the parent, and no use of the `Delete` button.** Its only `selectedIs` (step 6) and its only `Delete` button click (step 5) are in steps
1 to 10, which A2 moves to stage 2, so a page that clears the selection after Delete (injected fault `delete-parent-wrong`) passed. In stage 1 and after: `selectedIs` `#plans` is added after step 13 (the Delete
key on `#card-build`), and after step 15 six steps use the button (select `#card-ship`, `Delete`, `#card-ship` gone, `selectedIs` `#plans`, `Undo`, `exportEqualsOriginal`). Steps 1 to 10 still run in stage 2
as locked.

### Stage 2 amendments (2026-11-24; stage 1 was accepted)

**What ran in Y05 in stage 1, and what A2 moved.** Stage 1 ran step 0 (load), steps 11 to 24 (the Delete key on `#card-build`, Undo and the exact bytes; the Backspace key on `#card-plan`; the Width field that keeps its Delete key),
step 26 (`Delete` disabled) after the replacement of step 25 (A4: load the email, click `#hello`, select `tbody`), and the six-plus-one steps A7 added (`selectedIs` `#plans` after the key; the `Delete` button on `#card-ship`, `#card-ship` gone,
`selectedIs` `#plans`, Undo, the exact bytes). A2 moved only steps 1 to 10: select `#card-ship`, give it a note through the Comment popover, Save, click `Delete`, `selectedIs` `#plans`, `#card-ship` gone, `exportCommentCount` 0 and 0, Undo,
the exact bytes. **None of Y05's Delete button, Delete key or selection behaviour was skipped in stage 1**: the button, the keys and the selection moving to the parent were all run (the button and the selection by A7's additions, which stage 1 needed
because the locked steps that held them were the moved ones); what stage 1 could not run was "its note goes with it", which needs Comments.

**A8. The stage 2 pass line.** Items 1 to 3 and 5 to 10 of section 5 as in A1 (original 20 18 PASS 2 REFUSED 0 FAIL; round 1 N03 to N11; rounds 2 to 6; tests, `tsc`, `eslint`, build, flag checks; `check:layout`; scorer check; the vendored engine is a build of `a5f954a`;
locked files; one final run), and instead of item 4: **Y01 to Y10 PASS as amended (A2 to A10) and Y14 PASS; Y11 to Y13 report NOT BUILT**. The scorer check of stage 2 covers the stage 2 faults (a pin 12 px off, a pin in the iframe DOM, Delete leaving its note,
a header left after the last note is deleted, Include comments OFF leaving the header, a download that differs from the code view, a note with `-->` left raw, notes not read back on reload, and a few more of mine for the other asserts) and re-runs the stage 1 faults and the earlier ones.

**A9. Readings of steps and asserts the locked vocabulary leaves open or gets wrong** (found by reading Y05 to Y10 against the runner before anything was built; each is a runner change, logged and covered by the scorer check):
1. Y08 step 3 `fillStyle` is not in the vocabulary. It is read as `type` into the ribbon field named (`Font size`, `50px`): a style edit made through the ribbon, as its place in the spec (a style edit before the note) says.
2. Y06 step 17 `exportLacks` has `text` (a literal) where the earlier `exportLacks` has `file` and `pattern`. With `text` it is read as: no exported file contains that literal.
3. `rotate` ("as before") is the click on the `Rotate` button; the earlier specs wrote it as `button Rotate`.
4. `exportCommentCount` takes either a `file` (the downloaded export now) or a `snapshot` name and a `file` (a stored export); `comments` counts the comments starting ` NOTE FOR AI` (the whole-page note included), `headers` the header comment.
5. `equalsListWithout` needs the edit list the page holds. The page puts it, read only, in `data-edit-list` (JSON) on the editor element (`[data-editor]`); the gate removes the `note` edits and asks the vendored engine, in its own page, for the export of what is left on the original files. (A hook of the page for the gate, written in section 2 as mine.)
6. `iframeClean` is read as: the preview document has no element with a `data-pin` attribute, and as many elements as the original document plus one for each insert minus one for each removal in the edit list.
7. `noteEach` selects each target the way a visitor can: a click inside it (its inset, else its centre), else a click on a descendant followed by the path segment of the target (a group or a container that a click cannot reach). A target the runner cannot select is a FAIL of its spec, not a skip.
8. Row actions of the Notes list: `jump`, `Edit`, `Delete` and, on the page row, `Add a note for the whole page` and `Delete page note`; each one closes the list (the spec opens it again with `Notes` before the next action).

**A10. Stage 2 runs the clauses A2 moved, as locked.** Y01 step 2 (`insertBarOrder` after `Redo`: `Insert`, `Comment`) and Y05 steps 1 to 10 run unamended in stage 2. A4 (the `tbody` replacement of step 25), A6 (Y04) and A7 (Y05's added steps) stay, since they added checks and removed none.

**A11. Y05 steps 1 to 10 cannot end at the original bytes with one Undo (found by running them on the stub, before anything was scored).** The note is an edit of its own. Saving it is one edit; `Delete` is a second; one `Undo` takes the delete back, and the element comes back WITH its note (the edit list still holds the note), so step 10 (`exportEqualsOriginal`) fails on any correct page, and so would every later `exportEqualsOriginal` of Y05 (steps 15 and 24), because the list never goes back to empty. After step 9 two steps are inserted: `exportCommentCount` 1 and 1 (the element is back with its note and the header), then a second `Undo` (the note edit); step 10 then holds as written.

**A12. Y10 steps 11 and 15 assert `notesList` with `open: true` right after the document was opened again, with nothing that opens the list.** `open: true` is kept strict (Y12 uses it to check that Enter opened the list), so in stage 2 and after one step is inserted after each `reloadFromExport` (steps 10 and 14): `clickButton` `Notes`.

**A13. Y07 step 18 cannot tell a Notes row that jumps to its element from one that does nothing (found by the stage 2 scorer check: the extra fault `jump-no-select` passed).** At step 17 `#footer` is already the selected element (it was the last one commented, step 6), so `selectedIs #footer` holds with or without the jump. One step is inserted after step 16 in stage 2: click `#headline` (centre), so the selection is somewhere else before the jump. The seven faults named for stage 2 and the extras each fail on their own spec; this was the only extra that did not.
