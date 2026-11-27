# UI Editor views stage 2: the "customised" mark and "Reset to Desktop view" (2026-11-26)

Branch `feat/ui-editor-views2` (unpushed), from `main` `636f580`. Behind `VITE_SHOW_UI_EDITOR`; flag OFF is as before (H14: flags 16 of 16, flag-off build equals the baseline's). Brief: `~/Desktop/Projects/ui-editor-views2-brief.md`. Details, numbers and every run: `docs/ui-editor-gate-log.md` (#82 to #85), rules `docs/ui-editor-gate-rules-views2.md`, baseline `docs/ui-editor-baseline-views2.md`, screenshots `docs/ui-editor-views2-report/`.

## Verdict: iteration 1 FAILS (R15, and Z07 with it); iteration 2 (amendment A5, no page change) meets the pass line apart from T10, the known failure.
- H01 to H14: 14 of 14 in both iterations. X01 to X32 32 of 32. Q 9 of 9. The bytes of 95 earlier specs equal the baseline page's, 0 differ.
- `npm test` 935 tests, 919 pass, 0 fail, 16 skipped. `tsc`, eslint, builds, `check:layout` clean. Gate about 8 minutes.
- The scorer check: ten faults each caught where stated; the unchanged page fails H02 to H13.

## What was built
- A mark (a 7 px dot) on the Tablet and Phone buttons while the view has custom edits (the engine's `customEdits`); the button's name is "Phone, customised" and its tooltip says customised; no size changes.
- "Reset to Desktop view": an icon button in the view strip, Tablet and Phone only, enabled only when the open view has changes; a confirm dialog; the engine's `resetView`; the existing no-flash replay; Undo and Redo exact.
- History: a view reset is an entry of its own, `effectiveEdits` folds it away, so the engine never sees it and one Undo restores the exact list (pure, unit-tested).
- Words: Adapt, one more Limit (seven short paragraphs), README. Home and the page description are unchanged (two proposals are in the report).

## Decisions for Max (also in the report)
1. The Reset button is icon-only (name and tooltip): with its words the quick bar wraps at 1280 px and the ribbon moves down 44 px in Tablet and Phone.
2. Sideways (view-only) Phone and Tablet: the button works. SVG: the button is there, disabled, and says an SVG has no separate Phone or Tablet changes.
3. The Limits now show seven paragraphs, not six (the 50-word rule cannot hold the new sentence in six); R15 was amended to allow it for the Limits only. Say if you want six: other sentences must then be shortened.
4. Two proposals for the Home planet card and the page description are in the report.

## Next commands (Max runs git)
`git log --oneline main..feat/ui-editor-views2`, review, then push and open the PR yourself.
