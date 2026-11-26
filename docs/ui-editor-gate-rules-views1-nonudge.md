# UI Editor views round 1, fix 3: the Nudge X / Nudge Y boxes are removed: gate rules (LOCKED)

Locked in its own commit before any change to the page (`docs: lock views round 1 no-nudge rules, specs and retirements`). After it this file, `scripts/ui-editor-gate/specs-views1-nonudge.json` (the Q specs, the RETIRED list and the numbered amendments), `reference/views1-nonudge-baseline.json` and the probe `probe-nonudge-views1.mjs` are never edited; a flaw found before anything is scored is a re-lock with numbered amendments (section 8). The rules of the views round and of the two nudge rounds stay in force except where section 3 retires them. Brief: `~/Desktop/Projects/ui-editor-views1-nonudge-brief.md`. Clauses marked **(mine)** are mine. Nothing calls an LLM or a paid service.

Question: **with the Nudge boxes gone, does everything else about moving an element stay as it was (Move up and Move down, dragging, the arrow keys with the no-flash replay and the "Not applied" check), and does the ribbon stay one piece?**

## 1. Decision (Max, 2026-11-26)
The Nudge X and Nudge Y boxes confuse people (they sit under Move up and Move down and nothing says what they do). They are REMOVED. Move up and Move down stay exactly as they are (labels, tooltips, behaviour). Dragging and the arrow keys stay (1 px, 10 px with Shift), with the double-buffered replay of fix 2 and the "Not applied" check.

## 2. What changes (the brief, smallest change)
1. Ribbon: the Nudge row (label, both boxes, the hint) goes; the Arrange group keeps its name and holds Move up and Move down only. The ribbon stays one band wherever it was one band and no other group moves.
2. Dead code that only fed the boxes goes (`onNudgeTo`, `shift`, the `offsetOf` call and function and its tests, the `nudge` step key, minimum and strings, the `typeTip` Nudge branch, the CSS used only by the boxes). Kept because the arrow keys use them: `onNudge`, `arrowNudge`, `pendingNudge`, `mergeOffsets` and `sameScope`, `moveEdit`, the `watch` check, `messages.nudgeNoEffect`, the double-buffered replay. Each removal is checked with a search; section 4, Q08 makes it a spec.
3. Copy: the preview hint no longer says "nudge" (**(mine)** the sentence becomes "With an element selected, the arrow keys move it by 1 px (10 px with Shift)."). No new text.
4. Nothing else: not the names Move up and Move down, not Reset, not the Adapt text.

## 3. The RETIRED list (written before any run)
Found by searching every spec file, `checks.mjs`, `run.mjs`, the stubs, `flags.mjs` and `tests/` for `Nudge X`, `Nudge Y`, the boxes' `data-field` and ids, `ue-nudge-hint`, `offsetOf`, "shows where the element is", typed numbers as positions, `STEP.nudge` and the old copy. Retired items report RETIRED, never PASS. They apply to the real page and the no-nudge stub (`--stub12`) only; the earlier stubs still have the boxes.

| id | what is retired | what it did | why it cannot hold | replacement |
|---|---|---|---|---|
| K08 | whole spec | Repeated nudges of one element in one view are one merged edit: Nudge X typed 5 three times on Desktop is one edit (15, 0); three arrow clicks on Nudg | typed numbers no longer exist: the spec types 5 three times into a Nudge box and wants the sum; the Nudge X / Nudge Y boxes are removed (docs/ui-editor-gate-rules-views1-nonudge.md section 2). The merge of repeated moves is read by Q05 and Q06 and by J01 to J05, J13 and J14 with the arrow keys. K08's earlier FAIL (the typed number is the new shift) is settled by this. | Q05, Q06 (none for typed numbers: feature removed) |
| K11 | whole spec | A typed 0 or a non-number in a nudge box changes nothing and says nothing wrong: no edit, no undo entry, no "Not applied" line | a typed 0 or a non-number in a Nudge box: there is no box to type in. | none: feature removed |
| J06 | whole spec | The Nudge boxes show where the element is: after five arrow clicks X shows 5 and Y 0, after five more X shows 10; in Tablet and Phone the same element | the boxes show 5 then 10 and 0 in the other views: the spec reads or types in the Nudge boxes, which are removed. | none: feature removed |
| J07 | whole spec | A typed number is the new shift: typing 30 in Nudge X shows 30 and the list has one offset of 30, the export one translate of 30 above the phone break | a typed 30 shows 30 and is one offset of 30; typed -8: the spec reads or types in the Nudge boxes, which are removed. | none: feature removed |
| J08 | whole spec | Typed 0 puts a moved element back: after a nudge of 12, typing 0 leaves no offset in the list, the box shows 0 and the export equals the original | typed 0 puts the element back: the spec reads or types in the Nudge boxes, which are removed. | none: feature removed |
| J09 | whole spec | A typed non-number changes nothing: after a nudge of 7, typing abc in Nudge X and in Nudge Y leaves the list as it was and the boxes show 7 and 0 agai | a typed non-number changes nothing: the spec reads or types in the Nudge boxes, which are removed. | none: feature removed |
| J10 | whole spec | After a drag the boxes show the drag's distance (within 1 px of the 40 and 24 dragged), and a nudge after it continues from there | the boxes show the distance of a drag: the spec reads or types in the Nudge boxes, which are removed. | none: feature removed (a nudge after a drag: Q06) |
| J11 | whole spec | Each view keeps its own shift and each element its own: Desktop 12, Tablet 3 and Phone 7 on #cta read back 12, 3 and 7 after the selection went to #he | each view keeps its own shift, read in the boxes: the spec reads or types in the Nudge boxes, which are removed. | none: feature removed (the scopes themselves are read by K05 to K07 and Q06) |
| J12 | whole spec | Undo and Redo restore the box: 12 typed then 5 more arrow clicks show 17; Undo shows 0 (the merged edit is one entry); Redo shows 17 | Undo and Redo restore the value in the boxes: the spec reads or types in the Nudge boxes, which are removed. | none: feature removed (Undo and Redo bytes: K12, Q06) |
| J13 | step(s) 5 (1-based) | Input during a rebuild is kept: five arrow clicks fired one after the other with no wait (the first rebuild is still running for the next ones) end wi | the Nudge X box shows 5: the box is removed. The edit count and the export (one translate of 5) stay. | none: feature removed |
| J14 | step(s) 8 (1-based) | No leaked iframe, no moved scroll, no lost overlay: the page scrolled to the cards, #card-ship selected, fifty arrow clicks in a burst leave one previ | the Nudge X box shows 50: the box is removed. The frames, the one iframe and the scroll stay. | none: feature removed |

**Kept and rewritten as numbered amendments (steps replaced, never the locked files).** A1: the boxes were only the way the move was made, so the steps become arrow-key presses (`keys`; a typed N is N // 10 Shift+arrow presses and N % 10 plain ones; after a view change `focusOverlay` gives the keys the preview layer again). K01's message line reads "nudged by 1, 0 px" (the message of the last press). A2: the ribbon name lists of older specs lose the Nudge entries; nothing else about them changes.

| id | amendment | steps replaced |
|---|---|---|
| K01 | A1 | step(s) 3, 7 (1-based) |
| K02 | A1 | step(s) 3 (1-based) |
| K03 | A1 | step(s) 2, 4 (1-based) |
| K04 | A1 | step(s) 2, 4 (1-based) |
| K05 | A1 | step(s) 3, 4, 5 (1-based) |
| K06 | A1 | step(s) 2, 4, 5, 6 (1-based) |
| K07 | A1 | step(s) 3, 4, 5 (1-based) |
| K09 | A1 | step(s) 3, 4, 9, 10, 13, 14 (1-based) |
| K10 | A1 | step(s) 2, 4, 9, 10 (1-based) |
| K12 | A1 | step(s) 3, 4, 5 (1-based) |
| J01 | A1 | step(s) 4 (1-based) |
| J02 | A1 | step(s) 3, 5 (1-based) |
| J03 | A1 | step(s) 3, 5 (1-based) |
| J04 | A1 | step(s) 6 (1-based) |
| J05 | A1 | step(s) 3 (1-based) |
| J13 | A1 | step(s) 3 (1-based) |
| J14 | A1 | step(s) 5 (1-based) |
| R10 | A1 | step(s) 6, 8, 10 (1-based) |
| R04 | A2 | step(s) 7 (1-based) |
| U01 | A2 | step(s) 4 (1-based) |
| U03 | A2 | step(s) 3, 6, 10 (1-based) |
| X14 | A2 | step(s) 7 (1-based) |
| X28 | A2 | step(s) 3, 8, 11 (1-based) |

**Already retired earlier:** T01 (the whole spec, round 4). S-specs and the other older specs name no Nudge control. **Not spec files, changed with the page:** `tests/uieditorpage.test.ts` (panel.nudgeX and nudgeY), `tests/uieditorround2.test.ts` (the step table and `MIN.nudge`), `tests/uieditorround4.test.ts` (the Nudge label and the type tip), `tests/uieditorstate.test.ts` (the `offsetOf` tests), the comment of `tests/uieditorviews1.test.ts`. **Old stubs** (`round2.html` to `views1-nudge2.html`) keep their boxes: they are the scorer-check pages of their rounds. **Documents** that mention the boxes (`docs/ui-editor-ribbon-design.md`, working notes, older rules) are history and are not changed.

## 4. Specs (`specs-views1-nonudge.json`, Q01 to Q09; no earlier spec file uses a Q id: checked in all of them)
Q01 no Nudge anywhere in the DOM, the hidden text or the roles, in HTML (nothing selected, headline selected; three views) and in SVG. Q02 no "nudge" text, and the hint says the arrow keys move the element. Q03 the Arrange group holds exactly Move up and Move down, no input, enabled or disabled as before for a first, a middle and a last card in three views. Q04 Move up and Move down give byte-identical exports to the page before (six scenarios, SHA-1). Q05 the arrow keys (1 px, Shift 10 px, five presses merged to one offset) with no flash frame. Q06 a drag then arrow keys merge, a Phone press is its own edit, Undo and Redo give exact bytes. Q07 the ribbon layout against the baseline at four widths. Q08 a source search. Q09 flag OFF (the X32 check).

Vocabulary added to the runner after this lock (own commit, like the earlier rounds): steps `keys`, `focusOverlay`; asserts `noNudge`, `arrangeGroup`, `exportHash`, `ribbonBaseline`, `sourceSearch`; `retiredChecks` and `amendments` of this file are read for the real page and `--stub12`.

## 5. Operational definitions (mine)
- **No Nudge anywhere** (`noNudge`): in the whole editor section, for every element (hidden or not): its `id`, `name`, `title`, `aria-label`, `aria-describedby` target, every `data-*` attribute and its own text, none contains "nudge" in any case; and no element with the role textbox, spinbutton or button has an accessible name containing "nudge". The runner reads the DOM; it does not ask the page.
- **Arrange group**: the element with `data-ribbon-group="position"` (named Arrange). `names` are its buttons' accessible names in order, `disabled` their disabled flags in that order, `inputs` the number of `input`, `select` and `textarea` in it.
- **Move bytes** (`exportHash`): the SHA-1 of the exported files, sorted by file name, each as its name, a newline and its text, joined by a line `---`, from a Download of every file read from disk. The baseline values are those `probe-nonudge-views1.mjs` read from the page at `eaf790d`.
- **Ribbon baseline** (`ribbonBaseline`), at one host width with the headline selected: the number of distinct group tops (bands), the ribbon's height, and for every group its x, width and top (page coordinates, 0.01 px). Pass: same bands and ribbon height (0.5 px); every group but Arrange: x, width and top within 0.5 px of the baseline; Arrange: x and top within 0.5 px and width not greater than the baseline plus 0.5 px. The change of Arrange's width, and of any group's x, is printed. (The ribbon is a grid with fixed column proportions, so the removal is expected to move nothing; if it does, the spec says so and the report says by how much.)
- **Source search** (`sourceSearch`): every `.ts`, `.tsx` and `.css` file under `src/` (not `vendor/`, not `src/globe`) is searched; no `forbidden` pattern may match; every `required` pattern must match in its file.
- **Frames** as in `docs/ui-editor-gate-rules-views1-nudge2.md` section 3 (flash frame, visible preview, rest, overlay, scroll).
- **Keys**: `keys` presses the key with the browser's keyboard that many times; with `settle` it waits, after each press, until nothing is busy (as a person pressing one key at a time), without it presses without waiting (a held key).

## 6. Scorer check (before the change)
A stub `reference/views1-nonudge.html` (`--stub12`): the fix-2 stub without the boxes and the hint, with at most five fault switches: (1) one Nudge box left in the DOM; (2) the word Nudge left in the hint or a tooltip; (3) the arrow keys broken (no move); (4) Move down disabled wrongly after the removal; (5) another ribbon group shifted by 3 px. Each must fail where it is meant to; a control that does not fail STOPS the round. The unchanged page must fail the Q specs it should (Q01, Q02, Q07's sources, Q08) and pass the kept K, J, R10 specs and Q03 to Q06 and Q09 (the amended specs are dry-run on it: the arrow keys exist there).

## 7. Not decided here, left to Max
The customised indicator and Reset on Desktop (stage 2). Any new way of typing a position.

## 8. Amendments
None yet.
