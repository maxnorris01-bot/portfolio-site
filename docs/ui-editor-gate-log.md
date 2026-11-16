# UI Editor gate: runner change log

Every change to the gate runner (`scripts/ui-editor-gate/run.mjs`, `checks.mjs`) after its rules were locked is listed here: what and
why. A runner change may only reach the same controls through the page's UI (a scorer mapping). It must not touch a spec, a rule, a
sample or an expected value, and the scorer check (the injected faults) must still catch what it caught before.

## 2026-11-15, UI Editor page (`feat/ui-editor-page`)

- **S20, "Copy code" status.** The runner read the status line after its own Download, which says "Saved", not "Copied". It now records
  the status right after the copy. Specs, rules and samples untouched. (First full run: 17 PASS, 1 FAIL; after the fix 18 PASS, 2 REFUSED.)

## 2026-11-15, formatting round 1 (`feat/ui-editor-format1`)

Rules: `docs/ui-editor-gate-rules-round1.md`; specs: `scripts/ui-editor-gate/specs-round1.json` (locked in `1fc4ae3`). No spec, rule,
sample or expected value was changed by any entry below. The scorer check is in `docs/ui-editor-baseline-round1.md`.

| # | Change | Why |
|---|---|---|
| 1 | The runner loads both spec files (`specs.json` and `specs-round1.json`); `--only` picks ids; the pass line is computed per file (originals: 18 PASS, 2 REFUSED, 0 FAIL when all 20 ran; round 1: at least 10 PASS and 0 FAIL when all 11 ran). | The brief: "The runner must run both files". |
| 2 | N-spec support: new steps (`visit`, `openCard`, `clickCard`, `waitMarker`, `host`), new asserts (`barButtons`, `absent`, `present`, `cards`, `markerIn`, `miniFidelity`, `device`, `measureScaled`, `handles`, `noteText`, `textAbsent`, `chips`, `ledeReach`, `columns`, `lineLength`), a `P6` result bucket, `outcomeOfRound1` in `checks.mjs`, and P2 to P4 only for the specs that list them. | The N specs need them. The original path is unchanged: a spec without `checks` runs exactly as before. |
| 3 | `load` (and the `--noop` round trip) opens a sample through its gallery card when the page has one, else through the Sample picker. | **Mapping.** The Sample dropdown is replaced by the gallery and the Samples button. The old stub keeps the picker, so the original five faults still run against it. |
| 4 | The `review` assert reads the button's accessible name (`aria-label`) and falls back to its text. | **Mapping.** Review unlinked becomes an icon button with the count in a badge; its name `Review unlinked (N)` is unchanged. |
| 5 | `point` and `elementBox` convert preview pixels to window pixels with the iframe's scale (`getBoundingClientRect().width / offsetWidth`, 1 when not scaled). | **Mapping.** A scaled device (round 1, item 6) makes the preview's CSS px differ from window px. At scale 1 the values are identical to before. |
| 6 | `fieldDisabled` takes an optional `disabled` (default true). | N06 checks a field is enabled again after rotating back. With no parameter it is the old assert. |
| 7 | The code that read the "before" values and the original dumps after `load` is a function (`captureBefore`), also called after the first `openCard`. | Same code, reused. Also runs `measureScaled` before-values. |
| 8 | A `drag` step records the device scale just before the mouse goes down. | `measureScaled` wants `screen / scale`. |

Covered by the scorer check: the five original faults on the original stub (S04, S05, S09) and the four new faults on
`scripts/ui-editor-gate/reference/round1.html`, both in `docs/ui-editor-baseline-round1.md`.
