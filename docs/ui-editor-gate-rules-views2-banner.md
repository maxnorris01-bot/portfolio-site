# UI Editor views stage 2 fix: "Reset to Desktop view" moves into a banner above the preview: gate rules (LOCKED)

Locked in its own commit before any change to the page (`docs: lock views stage 2 banner rules, specs and retirements`). After it this file, `scripts/ui-editor-gate/specs-views2-banner.json` (the B specs, the retirements, the amendments of section 3) and `amendments-views2-banner.json` are never edited; a flaw found before anything is scored is a numbered amendment in `amendments-views2-banner.json` (section 9). `docs/ui-editor-gate-rules-views2.md` and its files stay in force except where section 3 retires or amends them. Brief: `~/Desktop/Projects/ui-editor-views2-banner-brief.md`. Clauses marked **(mine)** are mine. Nothing calls an LLM or a paid service.

Question: **with the Reset button out of the quick bar and into a banner with words, does the bar equal main's, does the stage stay put when a view gets its first change, and does everything else of stage 2 still hold?**

## 1. The decision (Max, 2026-11-26)
The icon-only Reset button in the view strip is not clear enough. Max chose a banner above the preview, with words. The confirm dialog, the history (exact Undo and Redo), the dot on the view buttons and the no-flash replay stay.

## 2. What is built (the brief)
1. The Reset icon button, its drawing and the strings written only for it go; the quick bar is exactly main's again.
2. A banner directly above the preview (inside the preview area, below the ribbon, in the flow), in Tablet and Phone, upright and sideways; never in Desktop, never for an SVG, never with no document. **(mine) How the height is reserved:** both sentences are always in the banner, one in front of the other; the one that does not apply is hidden (`visibility: hidden`, so it is out of the accessible tree and the tab order), so the banner is as high as the taller one at every width and the stage never moves when a view gets its first change.
   - No changes of its own: "Phone follows Desktop. Changes you make here apply to Phone only." (Tablet the same with Tablet); no button.
   - Has changes (the engine's `customEdits`, the dot's source): "This Phone view has changes that don't follow Desktop. Reset to Desktop view removes them." and the button "Reset to Desktop view" (the existing confirm dialog, text, yes label, Undo).
   - `role="group"`, named "About the Phone view" (Tablet likewise), not `role="status"`. **(mine) Tab order:** the banner is after the ribbon and its status line and before the preview, so the button is the next stop after the ribbon's last control (Grid spacing) and the one before the preview's pointer layer. After the dialog closes the focus goes to the banner's button on Keep editing, and to the open view's button on Confirm (the banner's button is gone then).
3. Words in `labels`; the strings only the icon used go.
4. Nothing else.

## 3. The RETIRED list and amendments (written before any run)
Found by searching every spec file, `checks.mjs`, `run.mjs`, the stubs and `tests/` for the icon button (`data-reset-view`, "Reset to Desktop view" as a bar button, the bar name lists that the stage 2 amendments changed, the H specs that click or read the icon, layout and tab-order checks that allowed the new button), and by building the change in a throwaway copy of the repository and running the whole gate on it (the same day; not in the repository). That run found one more break the search could not: **U04**.

| id | retired | why it cannot hold | replacement |
|---|---|---|---|
| H04 | whole spec | every check reads the icon button in the quick bar ('Reset to Desktop view' as a bar button, present, enabled, its tooltip, disabled in an SVG): the icon button is gone, the banner replaces it. | B02, B03 (where the control is and what it says in each state) |
| H13 | whole spec | it expects the quick bar to gain one new button, 'Reset to Desktop view', in Tablet and Phone: the bar is main's again. | B01 (the same layout comparison, with no new button) |
| U04 | step(s) 12, 28, 44 (1-based) | the stage's top edge is the same after switching from Desktop to Tablet: the banner is in the flow above the preview in Tablet and Phone (Max's decision), so the stage starts one banner lower there (62 px at 1280) than in Desktop. The ribbon-height checks, the selecting, deselecting and edit-message checks stay. | B04 (the stage does not move within a view when it gets its first change, Undo, Redo or reset) |

**Amended (numbered A1; the check is the same check, aimed at where the control now is):**

| id | amendment | steps replaced |
|---|---|---|
| H06 | A1 | step(s) 29 (1-based) |
| H07 | A1 | step(s) 26 (1-based) |
| H09 | A1 | step(s) 54 (1-based) |
| H10 | A1 | step(s) 12, 19, 24 (1-based) |
| H12 | A1 | step(s) 16 (1-based) |
| X17 | A1 | step(s) 16 (1-based) |
| X28 | A1 | step(s) 13 (1-based) |

H06, H07, H09, H10: the `resetButton` asserts (present, enabled or disabled in the bar) become `bannerState` asserts (changed or follows). H12: the bar's tab sequence loses the Reset button (main's list plus the ", customised" names). X17, X28: the bar name list and tab sequence return to main's, with ", customised". **Runner, not spec:** `focusControl` also finds the banner's button; a name given for a view button may carry ", customised" (as in stage 2). The H specs that click the button by its name (H05, H06 to H09, H11) keep working: the banner's button has the same name.
**Unit tests (`tests/uieditorviews2.test.ts`):** the test "Reset to Desktop view: only in Tablet and Phone ..." (it reads the icon button, its tooltips and `labels.resetViewTip*`) and "the dialog gives the focus back ..." (it reads `data-reset-view` in `icons.tsx`) are changed with the build to read the banner; nothing else in `tests/` names the icon.

## 4. Specs (`specs-views2-banner.json`, B01 to B10; prefix B, which no earlier spec file uses: checked in all of them)
B01 the quick bar is main's (layout against `reference/views2-baseline.json`, names, tab order, no Reset button). B02 no banner in Desktop, SVG or with no document. B03 the banner's two states in Tablet and Phone, upright and sideways, and what changes and does not change them. B04 the stage does not move (frame sampling and boxes) at the first edit, Undo, Redo and reset. B05 the banner is as high in both states at 1280, 1000 and 768 px. B06 the dialog, Keep editing, focus. B07 Confirm resets only that view (truth from plain Chromium, filtered-list export, text stays, focus, banner). B08 Undo and Redo exact. B09 keyboard, tab order, the group's name. B10 flag OFF. `check:layout` and the one-band ribbon are in B01 and in the regression run.

Vocabulary added to the runner after this lock (own commit): steps `snapshotStage`, `snapshotBanner`; asserts `bannerState`, `stageSame`, `bannerHeightSame`, `bannerOneLine`; `frames` gains `stageTopSame`; `layoutBaseline` gains `noNew`; `focusControl` finds the banner's button; `--stub14`; the retirements and amendments of this file apply to the real page and `--stub14` only.

## 5. Operational definitions (mine)
- **Banner** (`bannerState`): the element with role group whose name is "About the <View> view". `absent`: no such group is visible. `follows`: it is visible, its visible text is exactly "<View> follows Desktop. Changes you make here apply to <View> only." and it has no visible button. `changed`: its visible text starts "This <View> view has changes that don't follow Desktop. Reset to Desktop view removes them." and it has exactly one visible button named "Reset to Desktop view". `name: true` also checks the group's accessible name. Visible means what a person can read: `innerText` and `isVisible` (a hidden sentence is neither).
- **Stage** (`snapshotStage`, `stageSame`): the top of the stage area (`[data-stage-area]`), of the device frame (when there is one) and of the preview iframe, in page coordinates (scroll added); equal to the snapshot within `tol` (0.5 px). `stageTopSame` in `frames`: the iframe's top has one value in every recorded frame and equals the value at the start.
- **Banner height** (`snapshotBanner`, `bannerHeightSame`): the group's bounding height; equal within 0.5 px. `bannerOneLine`: the visible sentence is one line high (its height under 1.6 line heights) and the button is level with it.
- **Truth**: B07's numbers are the stage 2 ones (`validate-views2.mjs`, 28 of 28, unchanged): 40.9091 px = 30 x 60 / 44.
- **Layout**: as in `docs/ui-editor-gate-rules-views2.md` section 5 with `noNew`: the same rows and height of the bar, every button where it was (0.5 px), no ribbon group moved (0.5 px), and no new button.
- **Frames**: as in `docs/ui-editor-gate-rules-views1-nudge2.md` section 3.

## 6. Pass line
Every B spec 0 FAIL; every earlier spec not retired or amended here still passes with its bytes unchanged; `npm test` no fewer than 935 (baseline) minus the two changed tests plus the new, 0 fail; `tsc`, lint, build and `check:layout` clean; the flag-off build identical (B10); the scorer check passed; the locked files byte-identical; one complete run of the WHOLE gate on the final page commit (the change is layout-affecting). Any miss means the iteration FAILS; no tuning; a post-run change is a labelled iteration and both runs stay on record.

## 7. Scorer check (before the page change)
A stub `reference/views2-banner.html` (`--stub14`) with at most seven fault switches: (1) the Reset icon left in the strip (B01); (2) the banner shown in Desktop (B02); (3) shown for an SVG (B02); (4) its height differs between the two states, so the stage jumps at the first edit (B04, B05); (5) the changed sentence for a view with no changes of its own, or for the other small view (B03); (6) the confirm skipped (B06); (7) Undo after the banner's reset not restoring the exact bytes (B08). Each must fail where stated; a control that does not fail STOPS the round.

## 8. Decided in advance (mine; Max may change them)
- **One line at 1000 px and wider, not at 768 px.** The sentence (91 characters) and the button cannot share one line in 14 px type in the 734 px the banner has at a 768 px window; there it wraps to two lines, and the banner's reserved height is the same in both states (measured: 54 px at 1280 and 1000, 62 px at 768, in the throwaway copy).
- Where the button sits in the tab order: after the ribbon, before the preview.
- The yes button of the dialog stays "Reset Phone view" / "Reset Tablet view"; the banner's button reads "Reset to Desktop view".

## 9. Amendments
None yet (`amendments-views2-banner.json`).
