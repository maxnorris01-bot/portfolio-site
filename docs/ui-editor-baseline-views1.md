# UI Editor views round 1: baseline (before any page change)

The page as on `main` at `05d80d9` (the 12 px Desktop frame merged), run on 2026-11-26 before anything was changed. Rules: `docs/ui-editor-gate-rules-views1.md` section 8; log: `docs/ui-editor-gate-log.md` #65 to #71.

| Item | Result | Time |
|---|---|---|
| `npm test` | 915 tests: 899 pass, 16 skipped, 0 fail | 2 s |
| `tsc -b`, `eslint` | clean | 3 s, 7 s |
| builds, flag OFF and ON | clean | under 1 s each |
| `flags.mjs` | 16 of 16 | 3 s |
| full gate (`--stage 3`, 15:15:53 to 15:21:43 UTC) | exit 0: originals 18 PASS 2 REFUSED; round 1 9 PASS; round 2 16; round 3 12 PASS, 3 RETIRED, T10 FAIL (the known failure); round 4 12; round 5 6 PASS, 3 RETIRED; round 6 12; insert 14; round 7a 7 (Z07 PASS) | 350 s |
| no-op round trips, extras | PASS; 20 of 20 | |
| `check:layout` | Home meets every target (the known misses only); the UI Editor style check met | |
| second gate run with every export dumped (`--dump-exports`, 16:29 to 16:36 UTC) | exit 0, the same outcomes; 101 spec folders of exports kept for the byte comparison | 7 min |

Bundles, flag ON: main 244.31 kB / 77.04 gzip; page chunk 384.06 / 114.48; page CSS 30.32 / 6.02. The vendored engine: `a5f954a`, 290,095 bytes.

**The unchanged page against the new specs** (the old engine; each control that is gone times out, so it took 8 min): X01 to X05 PASS (a Desktop edit behaves as before); X06 to X30 FAIL (25 of 30). X31 and X32 need the new build.

**What the unchanged page does that the new model changes** (found while writing the specs): Tablet is view-only (X14, X15, X16); the Link checkbox decides whether a Phone or Desktop edit scales the other size (X06, X11, X12); Review unlinked and the dots list those edits (X17, X18, X28, X29); a Phone resize also set Desktop's width (retired S08; N08's bytes, A5); a refused Tablet edit cannot happen because Tablet cannot be edited (X13).
