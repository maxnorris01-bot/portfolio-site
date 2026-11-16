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

Found at first contact with the real page (logged as the earlier S20 fix was; no spec, rule, sample or expected value touched):

| # | Change | Why |
|---|---|---|
| 9 | Opening a sample waits for `[data-editor]` before deciding between a gallery card and the Sample picker. | The page's chunk loads lazily: the first look found no cards yet and fell back to the picker, which no longer exists. The old stub has `[data-editor]` from the start, so its path is unchanged. |
| 10 | "The miniature's body has rendered children" reads `body`, or the document element for an SVG document (which has no body). | The SVG sample's miniature is an SVG document, like the editor's own preview of it (the engine loads an SVG that way; an inline svg in an HTML page would lay out differently and fail N04). The blank-miniature fault is still caught: an empty HTML miniature has an empty body. |
| 11 | `extras.mjs` and `screenshots.mjs` (not part of the pass line) open a sample through the gallery card when there is one. | Same mapping as #3, for the two helper scripts. |

**Iteration 1 (after the scored run; labelled, both runs kept).** The scored run gave N06 a FAIL: its last check ("the view-only sentence is gone after rotating back") reads the whole page's text, and the Limits section (an existing text that an earlier test requires) says "Tablet is view-only", so it can never pass. That is a flaw in my locked spec, not in the page. The scored run stands; the iteration changes only the runner's reading:

| # | Change | Why |
|---|---|---|
| 12 | `textAbsent` reads the text of the editor (`[data-editor]`), not the whole page. | See above. This is NOT a pure "same control, new UI" mapping: it changes what an assertion looks at, so Max decides whether it counts. Result: N06 PASS on the iteration run; nothing else changed. |

## 2026-11-15, formatting round 2 (`feat/ui-editor-format1`, on top of round 1)

Rules: `docs/ui-editor-gate-rules-round2.md`; specs: `scripts/ui-editor-gate/specs-round2.json` (locked in `5680880`). No spec, rule, sample or expected value was
changed by any entry below. The scorer check is in `docs/ui-editor-baseline-round2.md`.

| # | Change | Why |
|---|---|---|
| 13 | The runner loads the third spec file; **N01 and N02 are reported as RETIRED and not run** (the list is `retired` in `specs-round2.json`); the pass line is computed per file (originals 18 PASS, 2 REFUSED, 0 FAIL; round 1: N03 to N11 all 9 PASS; round 2: all 16 PASS). `--stub3` runs the round 2 stub. | Rules section 1 and 6 of round 2. |
| 14 | New steps `ownAction` (Paste or Upload on the "Your own code" card, Upload through the real file chooser), `fill`, `stepper` (with Shift), `choose`, `openCode`, `unit`, `tick`, `release`; `drag` takes `dxToParentEdge` and `hold`. | The round 2 specs need them. **Mapping** for paste and upload: they are no longer toolbar buttons. |
| 15 | New asserts, all listed in `specs-round2.json` (`vocabulary`): gallery, toolbar, ribbon, font select, computed CSS, percent and parent width, export patterns, code view diff, counter, change map, headings, markers, rules, window and hit-area checks. A pure line diff of the runner's own is in `hunks.mjs` (ties: remove the original line first). | Same. The page's diff is never called. |
| 16 | An assert whose `k` is a number is the change-counter check for that change. | **My slip in the locked R12**: nine counter asserts were written with the change number in `k`, which is also the assert's name, so the name was lost from the JSON. A reading, not an edit; Max may want the file regenerated in a later round. |
| 17 | The code asserts share one download per file and edit state. | Chromium blocks a page's many automatic downloads in a row (the R12 run downloaded 16 times). The export is still what the Download button saved. |
| 18 | `captureBefore` also records the "before" of `css` (delta) and `pctWidth` asserts. | Same code, reused. |

Covered by the scorer check: the twelve round 2 faults on `reference/round2.html` and the five original faults on `reference/index.html`
(`docs/ui-editor-baseline-round2.md`).

**Iteration 1 of round 2 (after the scored run; labelled, both runs kept).** The scored run had misses (see `docs/sessions/2026-11-15-ui-editor-format2.md`). Page fixes are listed there. One runner change:

| # | Change | Why |
|---|---|---|
| 19 | The `message` assert reads the last message the ACTION gave, as it stood before the runner's own Download (the runner downloads to read the export, and the page then says "Saved ..."). The memory is cleared by the next step that can edit. | R08 ends with "the message says applied" after export checks that download; the real page (as S20 requires) then says "Saved landing.css." The stub never changed its message on a download, so the scorer check could not see it. NOT a pure "same control, new UI" mapping: it changes what an assertion reads, so Max decides whether it counts. |

## 2026-11-15, formatting round 3 (`feat/ui-editor-format1`, on top of round 2)

Rules: `docs/ui-editor-gate-rules-round3.md`; specs: `scripts/ui-editor-gate/specs-round3.json` (locked in `808c111`). No spec, rule, sample or expected value was
changed by any entry below. The scorer check is in `docs/ui-editor-baseline-round3.md`.

| # | Change | Why |
|---|---|---|
| 20 | The runner loads the fourth spec file; `retiredChecks` of `specs-round3.json` skip exactly R07's steps 11 to 17 and R14's assert `onlyRotateText`, shown as `RETIRED CHECK` lines (never counted as passed); the pass line adds T01 to T16 all PASS. `--stub4` runs the round 3 stub. A file is chosen in the File select by its option **value** (the file name), and the select is left alone when the file is already shown. | Rules sections 2 and 6. **Mapping**: the option text now carries a count (`landing.css (1)`), so a label can no longer name the file; and a runner download through the select must not count as the visitor choosing a file. |
| 21 | A step that acts on a control (`button`, `type`, `stepper`, `choose`, `unit`, `uncheck`) first clicks the ribbon tab that holds it when the control is not visible (`reveal`). New steps `tab`, `remember`, `key`, `reload`; `drag` takes `alt`. | **Mapping**: the same control, now on the Home or the Layout tab. Both panels stay in the DOM, so the asserts that read a state need no change. |
| 22 | New asserts, all listed in `specs-round3.json` (`vocabulary`): ribbon structure, sizes, quick-bar order, view style, disabled rules, popover, grid, snap, file marks and the walk, tabs and focus, narrow window. **Reading of `gridAbove`:** the locked text says `elementsFromPoint` lists the overlay before the iframe, but an element with `pointer-events: none` (which the same assert requires) is never hit-tested, so it is read as "the overlay follows the iframe in document order and is positioned (absolute or fixed, no negative z-index)". | **My slip in the locked T08.** A reading, not an edit; Max decides. |
| 23 | **Reading of `walkChanges`:** "the shown file did not change from the first changed file after the second edit" is read as "after the font size edit (which changes `landing.css` only: S09 and S20) and then the reorder (`landing.html`), the shown file is still `landing.css`". | The locked text does not say which file the first edit changed. |
| 24 | A check listed by a spec that has no assert of that kind is reported as `VACUOUS` and not scored, for T specs and for R07 (its only P5 assert is a retired check). The earlier files keep the strict reading. | **My slip in the locked T11** (lists P5, has no P5 assert); and R07 once its retired steps are skipped. Max decides whether that counts. |

Covered by the scorer check: the twenty round 3 faults on `scripts/ui-editor-gate/reference/round3.html`, the twelve round 2 faults on `reference/round2.html` and the five original
faults on `reference/index.html` (`docs/ui-editor-baseline-round3.md`).
