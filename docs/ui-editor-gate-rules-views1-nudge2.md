# UI Editor views round 1, nudge fix 2: gate rules (LOCKED)

Locked in its own commit before the fix (`docs: lock views round 1 nudge 2 rules and specs`). After it this file, `scripts/ui-editor-gate/specs-views1-nudge2.json`, `validate-views1-nudge2.mjs` and the probe `probe-flash-views1.mjs` are never edited; a flaw found before anything is scored is a re-lock with numbered amendments (section 7). The rules of the views round and of the nudge fix (`docs/ui-editor-gate-rules-views1.md`, `docs/ui-editor-gate-rules-views1-nudge.md`, with their amendments) stay in force. Brief: `~/Desktop/Projects/ui-editor-views1-nudge2-brief.md`. Clauses marked **(mine)** are mine. Nothing calls an LLM or a paid service.

Question: **can an element be nudged or dragged repeatedly without the preview flashing, and do the Nudge X / Nudge Y boxes show where the element is?**

## 1. What the probe shows (read-only, before any change; `probe-flash-views1.mjs`, headless Chromium, landing headline, branch at `cc99cd0`)
- In Desktop, Tablet and Phone alike: 193 frames sampled over five Nudge X arrow clicks and one drag; the page added and removed five preview iframes; **5 flash frames** in each view (a frame with no visible preview iframe); never more than one iframe at once; the stage and the scroll position did not move in those frames; the selection overlay was present in all of them.
- After every arrow click and after the drag the Nudge X and Nudge Y boxes show **0**.
- Cause (the brief's, confirmed by the iframe counts): two moves of one element in a row merge into one edit, so the page rebuilds the preview from the original; the effect closes the old session before the new one is open.

## 2. Decisions (Max's, change only with his word)
1. **No flash.** The new preview is built behind the old one, which stays on screen untouched until the new session has opened and replayed the list; the swap is one step (new in, old disposed once). No frame of the swap shows an empty stage, a collapsed height, a moved scroll position or a lost selection overlay. Applies to every replay that is not a new document or a view or orientation change: merged moves, Undo, Redo, Reset all. A replay that cannot be done safely is reported and left as it is. Input that arrives while the new preview is building is kept and applied after the swap. The old session is disposed exactly once; after the swap no second live preview, no leaked iframe or listener.
2. **The boxes show the element's shift in that view.** Nudge X and Nudge Y show the sum of `dx` and `dy` of every offset edit in the list for the selected element in the scope the next nudge would use (same target, environment and `link`). A pure function in `state.ts` with unit tests. A drag updates the boxes; Undo and Redo restore them; selecting another element or switching view shows that element's value in that view (0 when none). Unit "px" and the look stay.
3. **Stepping and typing.** An arrow adds or subtracts one step (Shift keeps its multiplier). A typed number is the NEW shift (the edit applied is the difference, so the list still merges to one offset). The same number or a non-number changes nothing and the box shows the current value again. Negative numbers work. The refusal wording and the "Not applied" check stay.
4. SVG documents and the other ribbon boxes are unchanged. Desktop, Tablet and Phone each keep their own shift.

## 3. Operational definitions (mine)
- **Frame**: one `requestAnimationFrame` callback of the host page, recorded from the `frames start` step to the `frames stop` step. A recording is the list of all its frames.
- **Preview iframe**: an `iframe` titled "Preview" in the document. **Visible** preview iframe: computed `display` not `none`, `visibility` not `hidden`, bounding height above 0 and left edge not further than 1000 px left of the window. The page may keep a second, hidden iframe while it builds; "one iframe at every frame" means exactly one VISIBLE preview iframe at every frame, and **at rest** (the frame after `frames stop`, once nothing is busy) exactly ONE preview iframe in the document (`restIframes`).
- **Flash frame**: a frame with no visible preview iframe, or whose visible preview iframe has height 0. `maxFlash` is the most flash frames allowed (0).
- **Overlay lost**: a frame in which no element with `data-selection` (the selection overlay) exists while an element is selected (`overlayAlways`). Not asserted in J05 (Reset all ends with the selection as the page leaves it today).
- **Scroll same** (`scrollSame`): the window's `scrollY` and the stage scroller's `scrollTop` have one value in every frame. **Stage height same** (`stageHeightSame`): the `.ue-frame` height has one value in every frame.
- **The shown value** is the text in the box as typed ("5", "-8", "0"), compared as a number within `tol` (default 0).
- **Offset sum scope**: only edits with `op: offset`, the selected `target`, `(environment ?? 'desktop')` and `(link ?? true)` equal to the scope of the next nudge (Desktop: environment desktop, link false; Tablet, Phone: their environment, link absent). A Desktop shift is never in the Phone box and the other way round.
- **Truth**: transforms are the same hand-written rules as in the nudge round, checked in plain Chromium by `validate-views1-nudge2.mjs` (35 of 35 on the real landing sample) before any run. Frame recordings, computed boxes and export bytes come from the browser, never from the page's own state.

## 4. Specs (`specs-views1-nudge2.json`, J01 to J14; no earlier spec file uses a J id)
J01 to J03 no flash for five arrow clicks in Desktop, Tablet, Phone. J04 drag, drag and nudge. J05 Undo, Redo and Reset all. J06 boxes show 5 then 10, and 0 in the other views. J07 typed 30, one offset of 30, typed same number, typed -8. J08 typed 0 puts the element back. J09 typed non-number. J10 the box after a drag. J11 independent views, elements and reselection. J12 Undo and Redo restore the box. J13 input during a rebuild. J14 fifty burst clicks: one iframe, same scroll, overlay always. **Flag OFF identical** is X32 in the regression run, not a new spec. Not in the specs: leaked listeners (not observable from outside; the fix disposes the old session once and the unit test counts its calls).

Vocabulary added to the runner after this lock (own commit, like the earlier rounds): step `frames` (start, stop), step `burst`, step `scrollTo`, assert `frames`, assert `box`.

## 5. Scorer check (before the fix)
A stub `reference/views1-nudge2.html` (`--stub11`) with at most eight fault switches: (1) old session closed before the new one is ready; (2) the swap leaves two iframes; (3) overlay lost at the swap; (4) scroll position reset; (5) box shows only the last step; (6) typed number applied as "move by"; (7) a Desktop shift shown in the Phone box; (8) input during rebuild dropped. Each must fail where it is meant to; a control that does not fail STOPS the round. The unfixed page must fail the new specs.

## 6. Not decided here, left to Max
Whether the customised indicator and Reset belong on Desktop (stage 2). Replays that change the document or the view (a new file, Desktop/Tablet/Phone, rotate) keep today's behaviour.

## 7. Amendments
None yet.
