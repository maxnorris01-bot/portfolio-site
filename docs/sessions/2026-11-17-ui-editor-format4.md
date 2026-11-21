# UI Editor formatting round 4 (2026-11-17)

Same branch, `feat/ui-editor-format1` (unpushed), on top of rounds 1 to 3; behind `VITE_SHOW_UI_EDITOR`. Rules and specs locked first (`16b17c1`); baseline, Limits-sentence check and scorer check: `docs/ui-editor-baseline-round4.md`; decisions: `docs/working-notes-and-decisions.md`; runner changes #25 to #29: `docs/ui-editor-gate-log.md`.

## Verdict (from the pass line only): FAILED on item 5 (U06, a flaw in my spec)
One complete run on `7e6e8be` (everything after it is docs and one labelled runner iteration).

| Pass-line item | Result |
|---|---|
| 1. Original 20 | 18 PASS, 2 REFUSED, 0 FAIL |
| 2. Round 1 N03 to N11 | 9 PASS |
| 3. Round 2 R01 to R16 | 16 PASS with retired checks skipped (R04 steps 3, 10, 14, 16; R05 step 2; R07 steps 11 to 17; R14 `onlyRotateText`) |
| 4. Round 3 | 14 PASS, T01 RETIRED, T10 FAIL (the failed locked spec of round 3, replaced by U10); T02, T06, T15 pass with retired checks skipped |
| 5. Round 4 U01 to U13 | **12 PASS, 1 FAIL: U06** (`minDistinct` 16, 15 reached; see below) |
| 6. Regression | 864 tests, 848 pass, 0 fail, 16 skipped (836 before, 12 new); tsc, eslint, build ON and OFF clean; flag checks 16 of 16 |
| 7. check:layout (CHECK_PAGES) | Home meets every target; UI Editor style check: no miss at 7 sizes |
| 8. Scorer check | passed (22 round 4 faults, 37 earlier re-run, no control failed) |
| 9. No-op round trips | 4 files byte-identical |
| 10. Locked files | byte-identical (0 diff lines for 910b228, 1fc4ae3, 5680880, 808c111, 16b17c1) |
| 11. One run on the final commit | done |

U06: every no-clipping check, "Georgia" and "Transparent" passed; only the count of distinct selected elements failed. Cheapest next test: re-score U06 with `minDistinct` 15. **Iteration 1** (labelled, `--u06-distinct 15`, same build): U06 PASS. Both runs kept.

Bundles, flag ON: main 244.31 kB / 77.04 gzip (244.31 / 77.03 before); page chunk 329.19 / 97.10 (329.45 / 97.13); page CSS 19.97 / 4.10 (19.45 / 3.94). Flag OFF main 244.28 / 77.03.
Not in the pass line: Limits probe verified on the final build; supplementary snapped resize on `#cta` PASS; extras 19 of 20 in the final run ("Upload refuses two pages", a timing flake) and 20 of 20 in three reruns.
