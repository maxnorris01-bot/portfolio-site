# UI Editor formatting round 6: baseline and scorer check (Step 1)

> **Update (2026-11-20): the STOP below was resolved.** Max decided to re-lock before building (nothing had been scored against the real page). The specs were corrected in `782f57c` (see "After the stop" at the end) and the round went on to Steps 2 and 3. The text below is the Step 1 record as it stood when it stopped.

Branch `feat/ui-editor-format1`, HEAD 3fee931 (the round 6 lock commit) with no page change. Headless Chromium only.

## Result: STOP

Three scorer controls fail, so by the brief ("if a control fails, STOP and report") nothing of Part A or Part B has been built. The three failures are mistakes in my locked round 6 specs, not in the stub:

| Spec | Flaw in the locked spec | Evidence | Proposed correction (for Max to decide) |
|---|---|---|---|
| W06 | Uses Height on `#card-build`, a flex-grow item; the engine refuses a height there | the control stub measures 131 against the wanted 135 | Use an element with no flex-grow (for example `#headline` or `#cta`) |
| W07a | The export check names `landing.css`, but the Shape Effects edit lands in `landing.html` (Link ON on a shared class gives an inline `style`) | `exportHas: landing.css does not match` on the correct stub, the only failing check | Name `landing.html` |
| W07d | Expects `linear-gradient(to bottom right`, and Chromium reports computed `to right bottom` | `css #card-build: backgroundImage ...` | Expect `to right bottom` (or accept either order) |

I did not edit, regenerate or run a modified copy of the locked rules or specs. A correction needs your decision, as a labelled iteration (as round 4's `--u06-distinct`) or a re-lock.

W04 and W07a "P4: landing.html changed" lines are not a flaw: P4 is not in those specs' `checks`, so it is not scored.

## Engine probe (read-only, `scripts/ui-editor-gate/probe-fill.mjs`)

The engine accepts every property the ribbon needs, with no new edit kind: `background` (colour and `background-image` gradients), `border-width`/`-style`/`-color`, `box-shadow`, `font-style`, `text-decoration`, `line-height`. Shorthand `background` and `border` rules are not refused. Height on a flex-grow item is refused. Edits follow the known rules: Link ON on a shared class goes inline into the HTML, an element's own unique rule is edited in place, Link OFF writes media-scoped rules into the CSS. Raw output is in the session scratchpad (`probe-fill*.txt`).

## HEAD baseline

- `npm test`: 875 tests, 859 pass, 0 fail (rest skipped as before).
- `tsc -b` 0, `eslint` 0, `vite build` clean (only the existing chunk-size notice).
- No-op round trips: byte-identical for landing html and css, email html and chart svg.
- Gate on HEAD: 76 PASS, 2 REFUSED, 9 RETIRED, 17 CHECK. FAIL: T10 (the known failed locked spec) and W01, W03, W04, W05, W06, W08, which are the new round 6 specs against a page not yet built; W07a to W07d report NOT BUILT.
- Geometry on HEAD: 1000 px 7 bands (ribbon 974 high), 1290 px 2 bands (230 high), 1440 px 2 bands (230), 1920 px 1 band (128).

## Scorer check

Stub: `scripts/ui-editor-gate/reference/round6.html`, with `--stub7 --fault NAME`.

- No-fault controls pass: W01, W02, W03, W04, W05, W07b, W07c, W08. Fail on the flaws above: W06, W07a, W07d.
- Injected faults caught by the intended spec: row-short, gap-14, centred (W02); control-32 (W03); menu-ignores-escape, swatch-wrong-prop, hex-lax, page-colours-all (W04); weight-no-style, no-dashes-double (W05); step-5 (W06); shadow-wrong (W07a); toggle-not-pressed (W07b); gradient-loses (W07d); no-gradient reports NOT BUILT; tablet-grey (W08).
- Earlier stubs (round 3 to 5 faults) re-run: all still caught. Two runs list a second spec that passes (`grid-ignores-scale` passes T08 and fails T11; `only-shown` passes T13 and fails T14), the same as before.

## After the stop (2026-11-20)

**Decision and lock.** Re-lock, not a labelled iteration. The first lock `3fee931` stays in history; the re-locked `docs/ui-editor-gate-rules-round6.md` and `scripts/ui-editor-gate/specs-round6.json` (`782f57c`) are
the locked set from there on. Each correction is a labelled amendment with its diff in `docs/ui-editor-gate-log.md` (#37 to #40).

**Dry run first (not scored).** The steps of the W specs that do not depend on the new UI ran once on the existing page through the old controls (a scratch copy of the runner with a scratch spec file; nothing of it is
committed):
- Height on `#headline` and on `#cta`: both pass the 4 px step, the Shift step and Undo; on `#card-build` it is refused (131 px against 135), as found. W06 uses `#cta`.
- The radius step on `#card-build`, the font size steps (1 px, Shift 10), `52` typed becomes `52px`, hold-to-repeat (8 steps in 1000 ms, inside the 3 to 16 the spec allows), the `%` width, the drag to the parent's edge
  with the "Full width" ghost, and `width: 100%` in `landing.css` for `#cta` all pass.
- The colour edits through the old Background, Border colour and Text colour fields on `#card-plan` pass P1, P2, P3 and P4; the edits are inline styles in `landing.html` (`.card` is shared and Link is on), so W07a's export
  check and the P4 annotation of W04 and W07a name `landing.html`.
- One more thing found: **on the old page a second typed value in the same box was ignored** (typing `52` and then `24` in the font size box left 52). The commit flag of `NumberInput` was never reset (the input was
  made new for each preview, the component that held the flag was not). W06 types `52` once, so this was not a spec flaw; the spec now types a second size (`30`), and the new number box fixes it.
- The elements the specs name (`#hello`, `#bar-tue`, `#card-plan`, `#art`, `#cta`, `#headline`, `#card-build`) all exist and are used by specs that already passed. No other mismatch was found.

**Scorer check on the re-locked specs.** The eleven controls (W01 to W08, W07a to W07d) all PASS on the stub; the 21 injected faults all fail the spec they should (three are new: `type-once` for W06,
`gradient-dir-swapped` and `gradient-bottom-omitted` for W07d, which fail only the written-text check while the computed-style check still passes). The earlier faults were re-run on the changed runner: 59 on `--stub` to
`--stub5` and the 13 of the round 5 stub, all caught; the round 3 stub's control still fails T10, as in round 3. No control failed, so the round went on.

**What the page then did against the locked specs** is in `docs/sessions/2026-11-20-ui-editor-format6.md`.
