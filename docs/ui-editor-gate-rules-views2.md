# UI Editor views stage 2: the "customised" mark and "Reset to Desktop view": gate rules (LOCKED)

Locked in its own commit before any change to the page (`docs: lock UI Editor views stage 2 rules, specs and retirements`). After it this file, `scripts/ui-editor-gate/specs-views2.json` (the H specs, the amendments of section 3, the truth values), `validate-views2.mjs`, `probe-views2.mjs` and `reference/views2-baseline.json` are never edited; a flaw found before anything is scored is a re-lock with numbered amendments in `amendments-views2.json` (section 9). The rules of the views round and of the nudge rounds (`docs/ui-editor-gate-rules-views1*.md`) stay in force. Brief: `~/Desktop/Projects/ui-editor-views2-brief.md`. Clauses marked **(mine)** are mine. Nothing calls an LLM or a paid service.

Question: **can a person see that Phone or Tablet has changes of its own, take them all back in one step (and undo that step exactly), and does nothing else about the editor change?**

## 1. The model (Max, 2026-11-25/26; the brief)
Phone and Tablet start as the Desktop setup scaled in proportion and follow it; an edit made in Phone or Tablet is custom to that view. The way back is one button for the whole view, with a warning that it undoes the changes; the export always reflects the current state. No per-item hand-back, no mode buttons.

## 2. What is built (the brief, five items)
1. A mark on the Tablet and Phone buttons when `customEdits(list, env).length > 0` (the engine's own count; Insert, Text, Delete and Notes never count). It follows Undo, Redo, Reset all and the list, in both orientations, is in the button's accessible name ("Phone, customised") and tooltip, changes no size, and Desktop never shows it.
2. "Reset to Desktop view": one button in the view strip, only while Tablet or Phone is open (upright or sideways), enabled only when that view has custom edits, acting on the open view. A click opens the existing confirm dialog; Confirm applies `resetView(list, env)`; the preview is rebuilt by the existing no-flash replay; the status line says what was done.
3. Undo and Redo of a view reset are exact. **(mine) The history:** a view reset is an entry of its own in the history (`{op: 'resetView', environment}`); `effectiveEdits` folds it away by applying the engine's `resetView` where it stands, so the engine only ever sees the effective list, while the edits it dropped stay in the history before it and one Undo puts them back in their place. Pure, in `state.ts`, unit-tested. A view with nothing custom is not offered a reset, so no empty entry.
4. The words (Adapt, the Limits, README) say a view can be reset, that customised properties stay when Desktop changes and that one property cannot be handed back. Home and the page description are not changed (two proposals go to Max).
5. Nothing else.

## 3. The RETIRED list and amendments (written before any run)
Found by searching every spec file, `checks.mjs`, `run.mjs`, the stubs and `tests/` for checks that list the view group's names, the bar's buttons or tab order, the view buttons' widths, or that say the strip holds only Desktop, Tablet, Phone and Rotate (`barNames`, `barButtons`, `barLacks`, `quickBarOrder`, `quickBarEnabled`, `liveButtons`, `tabSequence`, `toolbarEdges`, `viewStyle`, `viewStylesSame`, `rotateLabel`, `onlyRotateText`, `iconsDistinct`, `insertBarFits`, `device`, `present`, `absent`, `viewPressed`, `tooltips`). Most are retired by earlier rounds already or read the bar in Desktop or with no edit, where nothing is new (the mark and the Reset button are absent there). Two active specs list the bar's exact names or tab order AFTER an edit in a small view, where the names now carry "customised" and the Reset button is there. No spec is retired as a whole; **no check is simply dropped**:

| id | amendment | steps replaced |
|---|---|---|
| X17 | A1 | step(s) 16, 18 (1-based) |
| X28 | A1 | step(s) 13 (1-based) |

A1 replaces each of those lists by the same list with the new names (`Tablet, customised`, `Phone, customised`, `Reset to Desktop view`) in the state the spec is in; the check is the same check. **Runner, not spec (vocabulary, section 4):** a name given for a view button in a `view`, `viewPressed`, `device` or `barNames` context may be the plain name or the name followed by ", customised"; X27 and every other spec that switches view after a small-view edit clicks the button that is there.

**Unit tests (`tests/`), retired or amended with the build, each with its replacement** (found by running the unit tests against a throwaway copy of the change, the same day, not in the repository):
| test | why it cannot hold | replacement |
|---|---|---|
| `uieditorinsert1.test.ts` "a note is a content edit ...": `data-edit-list` and `JSON.stringify(list.edits)` | the page's edit list for the engine and for `data-edit-list` is `effectiveEdits(list.edits)` | the same test with that expression |
| `uieditorround5.test.ts` "west and north resize ...": `trialEdges(session, listRef.current.edits, ...` | the trial replays the effective list | the same test with `effectiveEdits(listRef.current.edits)` |
| `uieditorround2.test.ts` "the three bottom sections ... at most six items each" | the Limits gain a sentence and show seven short paragraphs (six cannot hold 300 words under the 50-word rule) | at most seven, each at most 50 words, every fact kept |
| `uieditorround4.test.ts` "the Limits list has the verified snapping sentence once, and still shows at most six paragraphs of at most 50 words" | the same | at most seven |
| `uieditorround7a.test.ts` "the limits list says a font shows only if the computer has it, and its paragraphs stay six of at most 50 words" | the same | at most seven |
| `uieditorviews1.test.ts` "How it works says what the three views do ...": `assert.doesNotMatch(adapt, /reset/i, 'no word about a feature that does not exist yet')` | the feature exists now | that one assertion becomes "Adapt says the view can be reset"; every other line stays |

**Old stubs** keep what they have; `retiredChecks` and `amendments` here apply to the real page and `--stub13` only.

## 4. Specs (`specs-views2.json`, H01 to H14; prefix H, which no earlier spec file uses: checked in all of them)
H01 the mark is absent at load (all views, both orientations), after a Desktop edit and after Insert, Text, Delete and a Note in Phone. H02 it shows on the right button only, with the name and the tooltip, and no button changes size or place. H03 it follows Undo, Redo and Reset all, and both orientations. H04 the Reset button: where it is and is not, enabled or disabled with its tooltip, SVG. H05 the dialog's words, Cancel, focus. H06 Reset in Phone, values measured in plain Chromium, bytes against the engine's export of the filtered list, text stays, status, focus. H07 the same in Tablet. H08 Desktop edits before and after stay; Undo and Redo exact. H09 the long mixed sequence of item 3; Reset all still clears everything. H10 sideways Phone and Tablet. H11 no flash frames. H12 the keyboard. H13 the layout against the baseline. H14 flag OFF (the X32 check).

Vocabulary added to the runner after this lock (own commit, like the earlier rounds): steps `snapshotList`, `snapshotBar`, `focusControl` for the bar's buttons; asserts `viewButtons`, `viewButtonBoxes`, `resetButton`, `dialog`, `listIs`, `exportEqualsFiltered`, `layoutBaseline`; the view-button name rule of section 3; `retiredChecks` and `amendments` of this file for the real page and `--stub13`.

## 5. Operational definitions (mine)
- **Customised**: a view button is customised when its accessible name is "<View>, customised", a mark element is drawn in it, and its tooltip contains the word customised; otherwise its name is the plain name, no mark, no such tooltip (`viewButtons`). Read from the DOM, never from the page's state.
- **Button boxes** (`snapshotBar`, `viewButtonBoxes`): the bounding boxes of Desktop, Tablet and Phone in the view group; after a change each box equals the snapshot within `tol` (0.5 px) in x, y, width and height.
- **Reset button** (`resetButton`): the visible button whose accessible name is exactly "Reset to Desktop view" in the bar ("Editor controls"); `enabled` is its `disabled` property; `tipHas` are phrases of its title (case-insensitive).
- **Dialog** (`dialog`): the group named Confirm; `has` are phrases of its text (case-insensitive), `buttons` the names of its buttons in order.
- **Filtered list** (`exportEqualsFiltered`): the runner takes the snapshot of the effective list, removes every `set`, `offset` and `reorder` whose environment is the given one (the engine's own definition of a view's custom edits, written again in the runner), has the vendored engine replay that list on the original files in a page of its own, and compares every file with the page's export. The page's list is never trusted for the filtering.
- **Truth**: the numbers of H06, H07, H08 and H10 are the computed `font-size` of the headline read in plain Chromium from the engine's export of the lists in `truth` (`validate-views2.mjs`: 28 of 28 before any run). The Desktop-scaled Phone value 40.9091 px is 30 px x 60 / 44, the page's own phone size scaled with the Desktop change.
- **Frames**: as in `docs/ui-editor-gate-rules-views1-nudge2.md` section 3.
- **Layout** (`layoutBaseline`): from `reference/views2-baseline.json` (`probe-views2.mjs` on the page at `636f580`, landing, headline selected). Pass: every ribbon group's x, width, top and height within 0.5 px; the same number of ribbon bands; the bar has the same number of rows and the same height; every button of the baseline is still there with the same width and height (0.5 px); no new button in Desktop; in Tablet and Phone exactly one new button, "Reset to Desktop view". Changes of x or y of the bar's buttons are printed. `check:layout` is part of the regression run.

## 6. Pass line
(1) every H spec meets its declared outcome, 0 FAIL; (2) every earlier spec not amended or retired here still passes, bytes unchanged; (3) `npm test` no fewer than the baseline (925 tests, 909 pass, 16 skipped) minus the retired plus the new, 0 fail; `tsc`, lint, build and `check:layout` clean; the flag-off build identical (H14); (4) the scorer check passed (section 7); (5) locked files byte-identical; (6) one complete final run on the FINAL commit; the full gate runs once at the end. Any miss means the iteration FAILS; no tuning; the cheapest next test is named; a post-run change is a labelled iteration and both runs stay on record.

## 7. Scorer check (before the page change)
A stub `reference/views2.html` (`--stub13`) with at most ten fault switches: (1) the mark shown for a Desktop edit (H01); (2) the mark counting a content edit (H01); (3) the mark on the wrong view's button (H02); (4) Reset also clears the other small view (H06, H07); (5) Reset also clears Desktop edits (H06, H08); (6) Reset removes content edits (H06, H07); (7) Undo after Reset not restoring the exact bytes (H08, H09); (8) the confirm skipped (H05); (9) the Reset button visible in Desktop (H04); (10) the old preview closed before the new one is ready (H11). Each must fail where stated; a control that does not fail STOPS the round. The unchanged page must fail the H specs it should.

## 8. Decided in advance (mine; Max may change them)
- **Sideways (view-only) Phone and Tablet: the button works** when the view has changes of its own: the changes belong to the view, not the orientation, and a reset is an edit of the list, not of the preview (H10).
- **SVG documents have no environments, so no view has changes of its own: the mark never shows and the button is there but disabled, and its tooltip says an SVG has no separate Phone or Tablet changes** (H04).
- **The Reset button is an icon button with its name and tooltip, no visible word.** With the words "Reset to Desktop view" beside the icon the quick bar no longer fits one row at 1280 px and the ribbon moves down 44 px in Tablet and Phone; the icon button changes nothing (probe, `636f580`).
- **A view reset says "Undid the reset: the Phone view has its changes again." on Undo and "Redid the reset: ..." on Redo.**
- The dialog's yes button reads "Reset Phone view" (or Tablet), the other "Keep editing" (the existing words). After the dialog the focus goes to the Reset button when nothing was done and to the open view's button when the reset was done (the Reset button is then disabled).

## 9. Amendments
None yet (`amendments-views2.json`).
