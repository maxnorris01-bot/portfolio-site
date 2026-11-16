# UI Editor page (2026-11-15)

Branch `feat/ui-editor-page` (from `main` at ad60193, not pushed). The visitor-facing editor at `/ui-editor`, behind `VITE_SHOW_UI_EDITOR`.
Decisions are in `docs/working-notes-and-decisions.md`; the gate rules, written first and then locked, are in `docs/ui-editor-gate-rules.md`.

## What was built
- A flag (`src/data/uiEditorFlag.ts`): off, there is no route, nav button or Home planet, and the page's code is never requested. On, the nav gets a third tool button, Home a fourth planet, and the page works. All names and copy are in `src/data/uiEditor.ts`.
- The engine, vendored as one built file with strict types (`src/ui-editor/vendor/`), from the private engine repo at 27065d8. The engine repo was only read; its `git status` is clean.
- The editor: open a sample, paste or upload; a sandboxed preview with scripts off; click to select, drag to move, eight handles to resize; a panel with Text, Box, Colours and Position; Link checkbox and dots; Review unlinked; Undo, Redo, Reset all; Copy code and Download. A refusal shows the engine's own reason and applies nothing.
- Three original samples (a landing page with its own stylesheet, a table-based email, an SVG chart), the How it works, Limits and Data and credits sections.

## Gate and verdict (computed from the pass line only)
1. 20 scripted real-mouse actions on the real build: **18 PASS, 2 REFUSED (the designed refusals), 0 FAIL**, on the final build and on an earlier run (see the report in the pull request description for the table). Met.
2. Regression: `npm test` 790 tests, 774 pass, 0 fail, 16 skipped (baseline 755 / 739 / 0 / 16); `tsc -b`, `eslint`, `vite build` clean. Met.
3. Flag OFF and ON on production-style builds served with `vite preview`: 16 of 16 checks. Met.
4. `check:layout`: Home with four planets meets every target at the four sizes (one explained miss added to `check-layout.expected.json`: the 17.8 px row padding at 1920x1080, as for SatPOV and ShopAI); the new page's style check is clean at all seven sizes. The product-cards step of the full sweep crashes in this environment on `main` too, and the SatPOV page needs live data, so those were not run (see below).
5. Scorer check (`docs/ui-editor-baseline.md`): every injected fault failed the check meant to catch it. Met.
6. No-op: each sample, exported with no edits, is byte-identical (4 files). Met.

## Things that went wrong on the way, and what was done
- The first full run on the real page had 17 PASS and one FAIL (S20): the gate runner read the status line after its own Download, which says "Saved", not "Copied". That was a runner bug (the page said "Copied" right after the copy); the runner now records the status right after the copy. The specs, samples and rules were not touched.
- The first version dropped arrow-key presses while the preview was being rebuilt for a merged move, and lost keyboard focus when Undo disabled itself. Both were found by a separate functional script (`extras.mjs`) and fixed; they are not in the 20 actions.
- The side panel first scrolled the refusal message out of sight; only the panel scrolls now.
- The licence texts of the bundled packages contain three authors' email addresses; they are left out of the copy (the brief forbids email addresses anywhere).

## Not verified
See the pull request description.
