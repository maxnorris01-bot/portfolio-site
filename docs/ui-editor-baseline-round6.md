# UI Editor formatting round 6: baseline and scorer check (Step 1)

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
