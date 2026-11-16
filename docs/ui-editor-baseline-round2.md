# UI Editor formatting round 2: Step 1 baseline, engine probe and scorer check

Recorded 2026-11-15 on branch `feat/ui-editor-format1`, at `a44cd31` (the round 1 docs commit) plus the Step 0 commit `5680880` (rules and
specs only). Headless Chromium (Playwright, `--use-angle=swiftshader`), flag ON unless noted. **No page file had changed when any of this was
measured.**

## The engine probe (item 7: width in %)

`scripts/ui-editor-gate/probe-width.mjs` (read-only, writes nothing): set `width: 100%` and `width: 50%` on an element of each sample, linked and
unlinked, in the Desktop and the Phone environment, and measure Desktop (1280) and Phone (390) afterwards.

| Sample, element | What came back |
|---|---|
| landing, `#art` (a fixed 280 px box in a flex row) | accepted in all 8 cases, no refusal, no note. Linked: the rule `.hero-art { width: 100% }` or `50%` is rewritten in place. Unlinked: a `@media (min-width: 641px)` or `(max-width: 640px)` rule. A % width is **not scaled** between Desktop and Phone: `100%` gives 862 px wide on Desktop and 350 on Phone, which are the percent of each parent. |
| landing, `#headline` (a block) | accepted in all 8 cases; the width equals the parent's, or half of it |
| landing, `#card-plan` (a flex item that grows) | **linked: accepted** (the engine adds `flex-basis` to the width). **Unlinked on Desktop: refused**, with the engine's flex-grow reason (the same reason S15 scores for a px width). Unlinked on Phone: accepted |
| email, `#hello` (a heading) and `#pick-one` (a table cell) | accepted in all 8 cases each; a cell's `width: 100%` makes it the table's width |
| chart, `#bar-tue` (an SVG rect, linked only: an SVG has one size) | accepted; `width="100%"` and `"50%"` are percents of the SVG's viewport (480) |

**Result: no new refusal.** The only refusal is the flex-grow one that already exists and is already designed (S15, Limits). So no STOP. Three
things the probe shows that the build must honour: the engine gives **no note** for a % width it leaves unscaled, so the page's own sentence about
percentages (in Limits, and in the ribbon's tooltip) is the only warning; **a px width gets `max-width: 100%` added next to it** by the engine for
an inline-block (seen in the scorer check); and the engine **refuses to mix a shorthand with a longhand** of the same property (`padding` then
`padding-top`: "mixing shorthand and longhand is not supported in v1"), so the four-sides steppers write the whole shorthand.

## Baseline (before any page change)

| Check | Result |
|---|---|
| `npm test` | 815 tests: **799 pass, 0 fail, 16 skipped** |
| `tsc -b` | clean (exit 0) |
| `eslint .` | clean (exit 0) |
| `vite build`, flag ON | main `index-o2dzYOR4.js` **244.30 kB, 77.03 kB gzip**; page chunk `UiEditor-CpOzpVkA.js` **308.78 kB, 90.52 kB gzip**; page CSS `UiEditor-BZxqAk8O.css` **12.57 kB, 2.76 kB gzip**; main CSS 23.38 kB (5.62 kB gzip) |
| `vite build`, flag OFF | main `index-DdAyDkA4.js` 244.27 kB, 77.03 kB gzip; the same page chunk is emitted (never requested) |
| Original 20, real page (`vite preview` of the flag-ON build, host 1920 x 1080) | **18 PASS, 2 REFUSED (S15, S16), 0 FAIL** |
| Round 1 N03 to N11, same page | **9 PASS, 0 FAIL** (N01 and N02 retired by round 2, not run) |
| `check:layout` | see the end of this file |

One thing went wrong and is recorded: my first gate run of the baseline was against a stale `vite preview` that an earlier session had left listening on
port 4190 (my own server failed to start on the busy port and the runner talked to the old one), so its N01 to N11 all failed. I noticed because they all
failed, moved to a free port and re-ran; the numbers above are the second run. I did not stop the old servers (not mine to stop).

## Runner changes made before the scorer check (logged in `docs/ui-editor-gate-log.md`)

The runner loads the third spec file, reports N01 and N02 as RETIRED (it does not run them), implements the round 2 steps and asserts listed in
`specs-round2.json` (`vocabulary`), and has its own line diff (`scripts/ui-editor-gate/hunks.mjs`) for R11 to R13. Nothing in `specs.json`,
`specs-round1.json` or `specs-round2.json` was touched.

## Scorer check (the checks can fail where they should)

A new stub, `scripts/ui-editor-gate/reference/round2.html`, is a small editor on the real engine that follows the round 2 contract (gallery with the
fourth card and the paste area, bar, ribbon with steppers, unit switch and snap, code view with its own diff and change map, three bottom lists) with a
switchable fault (`?fault=NAME`, `run.mjs --stub3 --fault NAME --only ...`). The control (no fault) passes R01 to R15. R16 is not run on the stub (it
measures the real page's device scale).

| Fault | Must fail | Result |
|---|---|---|
| `paste-stays`: paste area left open after Samples | R03 | **R03 FAIL** (P6: "paste area visible", twice) |
| `wrong-step`: font size steps by 2, width and padding by 5 | R06, R07 | **R06 FAIL** (font size 50 against 47, 68 against 56) and **R07 FAIL** (width 285 against 284, padding 29 against 28) |
| `no-shift`: Shift ignored | R06 (and R10) | **R06 FAIL** (47 against 56) and **R10 FAIL** (left 92 against 101) |
| `unit-px`: the unit switch shows % but writes px | R08 | **R08 FAIL**, but see the note below on which check caught it |
| `no-snap` | R08 | **R08 FAIL** (P5: the drag label reads "780", not "Full width") |
| `diff-off`: the code view highlights the line below | R11 | **R11 FAIL** (groups [[28,28],[34,34],[47,47]] against [[27,27],[33,33],[46,46]]) |
| `diff-count`: nearby changes merged into one | R11, R12 | **R11 FAIL** (3 changes against 4) and **R12 FAIL** (counter "0 of 3" against 4) |
| `no-wrap`: Next at the last change stays there | R12 | **R12 FAIL** (counter "4 of 4" against "1 of 4") |
| `same-icons`: Undo and Redo draw the same icon | R14 | **R14 FAIL** (10 icons, same drawing: Redo) |
| `enabled-empty`: ribbon controls enabled with nothing selected | R04 | **R04 FAIL** (70 controls, enabled: Font family, Decrease Font size, ...) |
| `free-font`: font family is a text input | R05 | **R05 FAIL** (INPUT, not SELECT; 1 text input, 0 selects) |
| `bullets`: bullet markers, no rules | R15 | **R15 FAIL** (12 list items show a marker, 12 have no rule) |

The five faults of the earlier page gate, on the original stub, still fail where they did: `half-drag` P1 (S04 left 110 against 130; S05 width 260
against 240), `drop-last-edit` P2 (S04, S05, S09), `touch-neighbour` P3 (S04, S05, S09), `extra-line` P4 (S04, S05, S09), `no-dot` P5 (S04). The control
passes S04, S05 and S09.

**Result: the scorer check passed**, with one weakness recorded.

- **`unit-px` is caught, but not by the check meant for it.** The engine puts `max-width: 100%` next to a px width on an inline-block, and my locked
  regular expressions (`width:\s*\d+%` and `width:\s*100%`) are not anchored, so they also match `max-width: 100%`. In the faulty stub the "writes a
  percent" check therefore passed by accident, and R08 failed on the "no 100% after a drag 6 px short" check and on P4 instead. A faulty page would still
  fail R08, but the "% is written" check is weaker than the rules suggest. The same expressions could, in principle, make the real page fail R08 if the
  engine adds `max-width: 100%` for a % width; the dry run for the budgets did not show that. I did not change the locked file.
- **A slip in my locked R12 (found while building the runner, before any run).** Nine of its counter asserts carry the change number in a field called
  `k`, which is also the assert's name, so the JSON lost the name. The runner reads an assert whose `k` is a number as the change-counter check for that
  change (a reading, not an edit; logged). Nothing in the file changed.
- **The change map's ticks must be thin.** In the stub the first ticks were 8 px tall and overlapped, so a real click on tick 2 hit tick 3. The stub's
  ticks are 3 px; the page's must not overlap either (R12 clicks them with a real mouse).
