# UI Editor formatting round 5 (2026-11-18)

Same branch, `feat/ui-editor-format1` (unpushed), on top of rounds 1 to 4; behind `VITE_SHOW_UI_EDITOR`. Rules and specs locked first (`1642321`); probe, baseline and scorer check: `docs/ui-editor-baseline-round5.md`; decisions: `docs/working-notes-and-decisions.md`; runner changes #30 to #32: `docs/ui-editor-gate-log.md`; ribbon design: `docs/ui-editor-ribbon-design.md`.

## Verdict (from the pass line only): PASSES
One complete run on `672cbd6` (everything after it is docs only).

| Pass-line item | Result |
|---|---|
| 1. Original 20 | 18 PASS, 2 REFUSED, 0 FAIL (with the logged mappings) |
| 2. Round 1 N03 to N11 | 9 PASS |
| 3. Rounds 2, 3, 4 | R2 16 PASS; R3 12 PASS, T01, T04, T13 RETIRED, T10 FAIL (the failed locked spec); R4 12 PASS (U06 read at 15), U02 RETIRED |
| 4. V01 to V09 | 9 PASS |
| 5. Regression | 875 tests, 859 pass, 0 fail, 16 skipped (848 before, 11 new); tsc, eslint, builds ON and OFF clean; flag checks 16 of 16 |
| 6. check:layout (CHECK_PAGES) | Home meets every target; UI Editor style check: no new misses |
| 7. Scorer check | passed (13 round 5 faults, 59 earlier re-run, no control failed) |
| 8. No-op round trips | 4 files byte-identical |
| 9. Locked files | byte-identical (0 diff lines for 910b228, 1fc4ae3, 5680880, 808c111, 16b17c1, 1642321) |
| 10. One run on the final commit | done |

Bundles, flag ON: main 244.31 kB / 77.03 gzip (244.31 / 77.04 before); page chunk 333.26 / 98.40 (329.19 / 97.10); page CSS 21.45 / 4.31 (19.97 / 4.10). Flag OFF main 244.28 / 77.03.
Not in the pass line: extras 20 of 20; the Limits probe verified; the snapped resize on `#cta` PASS.

Found on the way (fixed before the scored run): Alt+Up was an arrow-key nudge in the stage and the key did not reach the tool when a click had taken the focus; my `ue-card` class collided with the gallery's; the Copy buttons were unreachable for S20 while the code area was closed (it is open by default now).
