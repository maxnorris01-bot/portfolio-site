# UI Editor formatting round 1 (2026-11-15)

Branch `feat/ui-editor-format1` (from `main` at 910b228, not pushed). Max's notes on the running page, as seven changes, still behind `VITE_SHOW_UI_EDITOR`.
Decisions and choices are in `docs/working-notes-and-decisions.md`; rules (locked first) in `docs/ui-editor-gate-rules-round1.md`; baseline and scorer check in `docs/ui-editor-baseline-round1.md`; runner changes in `docs/ui-editor-gate-log.md`.

## What was built
Chips under the title and a full-width intro (the cap came from a 34em rule that nothing switched off for `fullLead`); a gallery of the three samples with live miniatures, and nothing else drawn until something is open; an icon toolbar in five groups with unchanged names; plain phone and tablet frames with Rotate and view-only sizes; scale to fit with every pointer distance converted to CSS px; the lists under the tool in columns.

## Verdict (computed from the pass line only): the round FAILS, on one spec
1. Original 20 actions: **18 PASS, 2 REFUSED, 0 FAIL**. Met.
2. N01 to N11: **10 PASS, 1 FAIL (N06)**. The line is "at least 10 PASS and 0 FAIL", so this is **not met**.
3. Regression: 815 tests, 799 pass, 0 fail, 16 skipped; `tsc -b`, `eslint`, `vite build` clean; flag checks 16 of 16 (OFF and ON). Met.
4. `check:layout`: Home with four planets meets every target at the four sizes; the UI Editor style check has no miss at any of seven sizes (line length 64-77 at 1280, 47-65 at 1440 and 1920, 36-50 at 390). No new expected misses were needed. Met.
5. Scorer check passed (nine faults, each caught where it should be). Met.
6. No-op round trip of all samples (4 files) byte-identical. Met.
7. Locked originals identical to 910b228 (`git diff` empty); the engine repository's `git status` is clean. Met.

**Why N06 failed.** Its last assertion says the view-only sentence is not on the page after rotating back to portrait. The runner reads the whole page, and the Limits section legitimately says "Tablet is view-only" (an earlier test requires that wording). The page behaved correctly in every other N06 check. The spec was my mistake. Per the pass line I did not tune it. **Iteration 1** (labelled): the runner reads only the editor's text; N06 then passes. Both runs are kept. Whether that change counts is Max's call; the cheapest next test is a re-run with that change.

## Things that went wrong on the way
- My first scorer-check loop never applied the faults (shell word splitting), so all came back PASS; I noticed and re-ran.
- The first real-page run found two runner problems (sample opening raced the lazy chunk; an SVG miniature has no `body`); logged, no spec touched.
- The first scaling build collapsed the device to 1 px high (flex stretch), then centred it wrongly, then enlarged handles so the hit area swallowed the click in a small button; each found by the gate and fixed in the page.
- A commit went in with a failing new test of mine (a regex matched `grid-template-columns`); fixed by amending before anything left the machine.
- Several tries at the list columns: nothing at 17 px met 45-80 characters at 1280, 1440 and 1920 at once; 16 px text, 26.5rem columns, two below 1400 px and a 34em item cap does.

## Not verified
See the final report.
