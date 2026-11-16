# UI Editor formatting round 3 (2026-11-15)

Same branch, `feat/ui-editor-format1` (unpushed), on top of rounds 1 and 2; behind `VITE_SHOW_UI_EDITOR`. Rules and specs locked first (`808c111`); bug reproduction, snap probe, baseline and scorer check: `docs/ui-editor-baseline-round3.md`; decisions: `docs/working-notes-and-decisions.md`; runner changes #20 to #24: `docs/ui-editor-gate-log.md`.

## Verdict (from the pass line only): FAILED on one item
One complete run on `7e18c04` (everything after it is docs only).

| Pass-line item | Result |
|---|---|
| 1. Original 20 | 18 PASS, 2 REFUSED, 0 FAIL |
| 2. Round 1 N03 to N11 | 9 PASS (N01, N02 RETIRED) |
| 3. Round 2 R01 to R16 | 16 PASS with the retired checks skipped (R07 steps 11 to 17, R14 `onlyRotateText`) |
| 4. T01 to T16 | **15 PASS, 1 FAIL: T10** (spec flaw: `#art` is right-anchored, its east edge cannot move; only `snapEdge` fails, the 100% half passes). T11 passes with P5 read as vacuous |
| 5. Regression | 852 tests, 836 pass, 0 fail, 16 skipped (821 before); tsc, eslint, build clean; flag checks 16 of 16 |
| 6. check:layout (CHECK_PAGES) | Home meets every target; UI Editor style check: no miss at 7 sizes |
| 7. Scorer check | passed, with two notes (T10's control fails; `only-shown` caught by T14 only) |
| 8. No-op round trips | 4 files byte-identical |
| 9. Locked files | byte-identical (`git diff` empty for 910b228, 1fc4ae3, 5680880, 808c111 paths) |
| 10. One run on the final commit | done |

Bundles, flag ON: main 244.31 kB / 77.03 gzip (244.31 / 77.04 before); page chunk 329.45 / 97.13 (322.70 / 95.01); page CSS 19.45 / 3.94 (17.52 / 3.59). Flag OFF main 244.28 / 77.02.
Supplementary (not scored): snapped resize on left-anchored `#cta` lands on the grid (320, 328) and with Alt is free.
