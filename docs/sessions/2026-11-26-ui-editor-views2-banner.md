# UI Editor views stage 2 fix: Reset to Desktop view in a banner (2026-11-26)

Branch `feat/ui-editor-views2` (unpushed), on `0d06acd`. Behind `VITE_SHOW_UI_EDITOR`; flag OFF as before (B10). Brief `~/Desktop/Projects/ui-editor-views2-banner-brief.md`; rules `docs/ui-editor-gate-rules-views2-banner.md`; log `docs/ui-editor-gate-log.md` #86 to #88 and the entry after them; screenshots `docs/ui-editor-views2-report/banner-*.png`.

## Verdict: the pass line is met (iteration 1), apart from T10, the known failure
B01 to B10 10 of 10; the earlier specs pass with their bytes unchanged (114 equal, 0 differ); `npm test` 935 tests, 919 pass; tsc, lint, builds, `check:layout` clean; whole gate 609 s.

## What changed
The icon button is out of the view strip (the quick bar is main's again: B01 against the main baseline). A banner sits above the preview in Tablet and Phone (not Desktop, not SVG): "Phone follows Desktop. Changes you make here apply to Phone only." or "This Phone view has changes that don't follow Desktop. Reset to Desktop view removes them." with a button. Both sentences are always in the box, so the height is the same in both states (54 px at 1280 and 1000, 62 px at 768) and the stage does not move. The dialog, the history, the dot and the replay are unchanged.

## Decisions for Max
1. The button is the next Tab stop after the ribbon's last control (Grid spacing) and before the preview.
2. At 768 px of window the changed sentence and the button do not fit on one line; it wraps, to the same height.
3. The confirm dialog still pushes the preview down while it is open (existing behaviour).
4. U04 (the stage's top equal in Desktop and Tablet) is retired: the banner makes Tablet and Phone start 54 px lower.

## Next commands (Max runs git)
`git log --oneline main..feat/ui-editor-views2`, review, then push and open the PR yourself.
