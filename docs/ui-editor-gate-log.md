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

`scripts/ui-editor-gate/supplementary-snap.mjs` (not part of the pass line, not a runner change): the snapped resize of T10 on `#cta`, which is anchored at its left edge, because T10's own `#art` cannot have its east edge moved (`docs/ui-editor-baseline-round3.md`, spec flaw 1).

## 2026-11-17, formatting round 4 (`feat/ui-editor-format1`, on top of round 3)

Rules: `docs/ui-editor-gate-rules-round4.md`; specs: `scripts/ui-editor-gate/specs-round4.json` (locked in `16b17c1`). No spec, rule, sample or expected value was
changed by any entry below. The scorer check is in `docs/ui-editor-baseline-round4.md`.

| # | Change | Why |
|---|---|---|
| 25 | The runner loads the fifth spec file. A spec retired as a whole (T01) is reported `RETIRED` and not run; the round 4 `retiredChecks` (T02, T06, T15, R04, R05) apply to the real page and the round 4 stub, not to the earlier stubs (`--stub` to `--stub4`, which still have tabs); `--stub5` runs the round 4 stub; `--u13-na` reads U13 as NOT APPLICABLE; the pass line adds round 4 (U01 to U13 all PASS) and reads round 3 as "all PASS except the retired T01 and the failed locked T10". The `tab` step does nothing when the page has no element with role `tab`; with tabs it clicks as before. | Rules sections 2, 4 and 6. **Mapping**: there is no tab bar to click. |
| 26 | New asserts, all listed in `specs-round4.json` (`vocabulary`): `noTabs`, `ribbonGroups`, `ribbonSpread`, `ribbonLabels`, `tooltips`, `fieldsFit`, `fontShows`, `fillShows`, `statusLine`, `tabOrder`, `enabledOnly`, `quickBarWords`, `limitsHas`. | The U specs need them. |
| 27 | `tabReach` (T15) and `tabOrder` (U08) start a Tab walk by focusing the last focusable element before the ribbon (`__gate.focusBeforeRibbon`), then pressing Tab; the first control is reached by a real key press. Both of T15's tab names run the same walk when there are no tabs. | **Mapping**: no tab to start from. A script `focus()` after a mouse click does not match `:focus-visible`, so a first control focused that way would show no ring. |
| 28 | `ribbonLabels` reads a control's own text for buttons only. | **My bug in the runner**, found at the first control run: a `<select>`'s `innerText` is all its option texts, so Font family and Grid spacing were judged by their option list. |

Covered by the scorer check: the twenty-one round 4 faults on `reference/round4.html` (plus `group-order`), the twenty round 3 faults on `reference/round3.html`, the twelve
round 2 faults on `reference/round2.html` and the five original faults on `reference/index.html` (`docs/ui-editor-baseline-round4.md`).

`scripts/ui-editor-gate/probe-limits.mjs` (not part of the pass line, not a runner change): the read-only check of the Limits sentence of U13 (`docs/ui-editor-baseline-round4.md`).

**Iteration 1 of round 4 (after the scored run; labelled, both runs kept).** The scored run on `7e6e8be` gave U06 a FAIL on one check only: `fieldsFit` with `minDistinct` 16 (15 distinct elements were selected by the 18 clicks: two plain `p` elements share the label "p", and the click on `#pick-two` lands in the resize-handle hit area of the cell selected before it). That is a flaw in my locked spec, not in the ribbon: every no-clipping, "Georgia" and "Transparent" check passed. The scored run stands. The iteration changes only the runner:

| # | Change | Why |
|---|---|---|
| 29 | `--u06-distinct N` replaces the locked `minDistinct` of the one `fieldsFit` call that has it. NOT a "same control, new UI" mapping: it changes an expected value, so Max decides whether it counts. | Result on the same build, `--only U06 --u06-distinct 15`: **U06 PASS**. Nothing else changed (same commit, same page). |

## 2026-11-18, formatting round 5 (`feat/ui-editor-format1`, on top of round 4)

Rules: `docs/ui-editor-gate-rules-round5.md`; specs: `scripts/ui-editor-gate/specs-round5.json` (locked in `1642321`). No spec, rule, sample or expected value was changed by any entry
below. The scorer check is in `docs/ui-editor-baseline-round5.md`.

| # | Change | Why |
|---|---|---|
| 30 | The runner loads the sixth spec file (`--stub6` runs the round 5 stub). The retired checks of round 5 (U02, T04, T13 whole; U11, T05, T06, T14 in part) apply to the real page and the round 5 stub only. **Mappings:** `selectFile` does nothing without a File selector; `copy` clicks the Copy button of the file's section (`Copy code` in a one-file document, `Copy <file>` in a two-file one); a download of a two-file document is one click of `Download` with every download collected, and `grab` returns the one for the file asked for (the primary has the `-edited` name); the code asserts read `[data-code-view][data-file=F]`; `--noop` collects every download; the `load` step re-points `src` at the sample it opens. | Rules sections 2 and 7. **Mapping**: no File selector, one Download, one section per file. |
| 31 | New asserts and steps, all in `specs-round5.json` (`vocabulary`): `ribbonColumns`, `ribbonAlign`, `oneCard`, `ribbonSizes`, `noFileSelector`, `downloadFiles`, `codeSections`, `copyButtons`, `walkAll`, `edgesMoved`, `othersUnmoved`, `pathSegments`, `pathSelected`; steps `snapshotBoxes`, `clickPath`. | The V specs need them. |
| 32 | **Reading:** `ribbonGroups` (U01), `ribbonLabels` (U03, V09) and `enabledOnly` (U09, V09) do not count the path segments (`[data-path]`) and, for the group and enabled asserts, `Select parent`: they are selection aids in the strip, not editing controls, and are enabled whenever an element is selected, also in a view-only size. | The round 4 asserts were written before the strip had them. NOT a pure mapping: it changes which controls those asserts look at, so Max decides whether it counts. |

Covered by the scorer check: the thirteen round 5 faults on `reference/round5.html`, the twenty-two round 4 faults on `reference/round4.html`, the twenty round 3, the twelve round 2
and the five original faults on their stubs (`docs/ui-editor-baseline-round5.md`).

`scripts/ui-editor-gate/probe-west.mjs` and `geometry-dump.mjs` (not part of the pass line, not runner changes): the read-only west and north probe and the ribbon geometry dump.

## 2026-11-19, formatting round 6 (`feat/ui-editor-format1`, on top of round 5)

Rules: `docs/ui-editor-gate-rules-round6.md`; specs: `scripts/ui-editor-gate/specs-round6.json` (locked in `3fee931`, RE-LOCKED in `782f57c` before any page change; see "Re-lock" below). No spec, rule, sample or
expected value was changed by entries #33 to #36. The scorer check and the Step 1 stop are in `docs/ui-editor-baseline-round6.md`.

| # | Change | Why |
|---|---|---|
| 33 | The runner loads the seventh spec file (`--stub7` runs `reference/round6.html`). The retired checks of round 6 (V01, V02, V04 whole; parts of V09, U01, U03, U05, T03, U06, R04, R09) apply to the real page and the round 6 stub only. W09 has no steps: it is PASS when V03, V05, V06, V07 and V08 are PASS in the same run (run them together: `--only V03,V05,V06,V07,V08,W09`). W07a to W07d read NOT BUILT when the page lacks the control (a Shape Effects button; Italic and Underline; a Line spacing button; a Gradient item in the Shape Fill menu), checked in a throwaway page before the spec runs. | The W specs say so (`vocabulary.aggregate`, the pass line). |
| 34 | **Mappings (same control, new UI):** `type` into `Background`, `Border colour` or `Text colour` opens the Shape Fill, Shape Outline or Font colour menu and chooses `More colours…` first when the field is not shown (a page that still shows the field is typed into directly); `stepper` clicks the spin arrow `[data-spin][data-for=<field>]` when the field has no Increase or Decrease button (the font size keeps its grow and shrink buttons; the Sides popover keeps its + and − buttons); `snapshotExport` gives focus back to the element that had it before the runner's own Download click; `menuContents` leaves a submenu open when it was open before the assert; `clickPage` clicks the window point (x, y) when nothing clickable is there, else the status line. | The inline colour fields and the stepper buttons of the number fields no longer exist; the runner's own Download click must not move the page's focus. |
| 35 | New steps and asserts, all in `specs-round6.json` (`vocabulary`): `openMenu`, `menuItem`, `focusControl`, `clickPage`, `holdButton`, `snapshotExport`; `ribbonBands`, `rowFill`, `ribbonSizes6`, `menuState`, `menuContents`, `menuChecked`, `menuFocus`, `submenuOpen`, `exportsEqual`, `fontPresets`, `holdSteps`, `togglePressed`, `lineHeightRatio`, `disabledStyle`, `touchTargets`, `menuFits`; `css` also reads `contains`. | The W specs need them. |
| 36 | **Reading:** the spec files list the checks that count in `checks`; W04 and W07a carry a `p4` block but do not list P4, so their P4 line is printed and not scored (the runner has always read `checks` this way, `outcomeOfRound1`). | Found at the first control run. |

Covered by the scorer check: the round 6 faults on `reference/round6.html` and the earlier stubs' faults re-run on the changed runner (`docs/ui-editor-baseline-round6.md`).

`scripts/ui-editor-gate/probe-fill.mjs` and `geometry-dump.mjs` (not part of the pass line, not runner changes): the read-only probe of what the engine writes for the properties of the new menus, and the ribbon geometry dump (now at 1000, 1290, 1440 and 1920).

### Re-lock of the round 6 specs (2026-11-20, `782f57c`), labelled amendments

Max decided to re-lock before building (nothing had been scored against the real page, so no tuning is involved). The first lock `3fee931` stays in history. The re-locked
`docs/ui-editor-gate-rules-round6.md` and `scripts/ui-editor-gate/specs-round6.json` are the locked set from here on. Before re-locking, the steps of the W specs that do not depend
on the new UI ran once on the existing page through the old controls (a dry run, not scored): Height on `#headline`, `#cta` and `#card-build`, the radius step, font size steps,
typing, hold-to-repeat (8 steps in 1000 ms), the `%` width, the drag to full width and its `width: 100%` in `landing.css`, the colour edits through the old Background,
Border colour and Text colour fields (P1, P2, P3, P4 all passed, the edits are in `landing.html`), the element lists, and the engine writes recorded in `docs/ui-editor-baseline-round6.md`.

| # | Amendment | Why |
|---|---|---|
| 37 | **Runner:** the `css` assert reads `startsWithAny` (the computed string starts with any listed prefix). Covered by the scorer check (stub faults `gradient-dir-swapped`, `gradient-bottom-omitted`). | Chromium reports `to bottom right` as `to right bottom`. |
| 38 | **A1, W06:** Height is measured on `#cta` instead of `#card-build` (the click, the three `measure` asserts; the radius step selects `#card-build` first). **Added from the dry run:** a second typed size (`30` after `52` and `24`) and the hold-to-repeat starts from 30. | `#card-build` is a flex-grow item and the engine refuses its height (131 px against 135). `#cta` and `#headline` both passed the dry run; `#cta` was chosen so Height and the font steps do not share an element. On the old page a second typed value in the same box was ignored (the commit flag in `NumberInput` is never reset); W06 types `52` once, so this was not a spec flaw, but the new number box must commit repeatedly and the spec now says so. Stub fault `type-once`. |
| 39 | **A2, W07a (and W04's unscored P4 annotation):** the export check reads `landing.html`; the P4 annotation names `landing.html`. | `#card-plan` is on the shared class `.card`; with Link on the engine writes an inline style into the HTML file (`landing.css` was my mistake; W04 had the same mistake in an unscored annotation). |
| 40 | **A3, W07d:** the computed-style check for `to bottom right` accepts `to right bottom`; the export is read for the exact written wording (`linear-gradient(to bottom right,`, `to top`, `to bottom` in `landing.html`, `to right` in `landing.css` for `#art`); a `To bottom` step is added. | The brief's wording is the written text. Chromium reports the computed value with the keywords swapped, and omits `to bottom` (the default) from it, so the export is where that direction can be read. |

The diff of each amendment (`git diff -U1 3fee931 782f57c -- scripts/ui-editor-gate/specs-round6.json`):

**#38 (A1, W06)**
```diff
@@ -1408,4 +1408,4 @@
      "do": "click",
-     "sel": "#card-build",
-     "at": "inset"
+     "sel": "#cta",
+     "at": "center"
     },
@@ -1423,3 +1423,3 @@
      "at": "current",
-     "sel": "#card-build",
+     "sel": "#cta",
      "q": "height",
@@ -1441,3 +1441,3 @@
      "at": "current",
-     "sel": "#card-build",
+     "sel": "#cta",
      "q": "height",
@@ -1459,3 +1459,3 @@
      "at": "current",
-     "sel": "#card-build",
+     "sel": "#cta",
      "q": "height",
@@ -1465,2 +1465,7 @@
     },
+    {
+     "do": "click",
+     "sel": "#card-build",
+     "at": "inset"
+    },
     {
@@ -1600,2 +1605,18 @@
     },
+    {
+     "do": "type",
+     "field": "Font size",
+     "text": "30"
+    },
+    {
+     "do": "assert",
+     "p": "P1",
+     "k": "measure",
+     "at": "current",
+     "sel": "#headline",
+     "q": "fontSize",
+     "mode": "abs",
+     "value": 30,
+     "tol": 0.05
+    },
     {
@@ -1613,3 +1634,3 @@
      "max": 16,
-     "from": 24
+     "from": 30
     },
```

**#39 (A2, W07a and W04 P4)**
```diff
@@ -552,3 +552,3 @@
     "files": {
-     "landing.css": 4
+     "landing.html": 4
     },
@@ -1716,3 +1737,3 @@
     "files": {
-     "landing.css": 2
+     "landing.html": 2
     },
@@ -1806,3 +1827,3 @@
      "k": "exportHas",
-     "file": "landing.css",
+     "file": "landing.html",
      "pattern": "box-shadow:\\s*0 4px 12px rgba\\(0,\\s*0,\\s*0,\\s*\\.?0?\\.25\\)"
```

**#40 (A3, W07d and the vocabulary line of `css`)**
```diff
@@ -111,3 +111,3 @@
    "menuFits": "P5. The open menu lies inside the window horizontally (0.5 px) and, if taller than the window, scrolls inside (its overflow-y is auto or scroll); every item is at least itemMin high.",
-   "css": "As before, plus `contains` and `startsWith` on the computed string.",
+   "css": "As before, plus `contains`, `startsWith` and `startsWithAny` (the computed string starts with any listed prefix: Chromium reports `to bottom right` as `to right bottom`) on the computed string.",
    "pressed": "As before."
@@ -2081,3 +2102,13 @@
      "prop": "backgroundImage",
-     "startsWith": "linear-gradient(to bottom right"
+     "startsWithAny": [
+      "linear-gradient(to bottom right",
+      "linear-gradient(to right bottom"
+     ]
+    },
+    {
+     "do": "assert",
+     "p": "P5",
+     "k": "exportHas",
+     "file": "landing.html",
+     "pattern": "background-image:\\s*linear-gradient\\(to bottom right,"
     },
@@ -2103,2 +2134,28 @@
     },
+    {
+     "do": "assert",
+     "p": "P5",
+     "k": "exportHas",
+     "file": "landing.html",
+     "pattern": "background-image:\\s*linear-gradient\\(to top,"
+    },
+    {
+     "do": "openMenu",
+     "name": "Shape Fill"
+    },
+    {
+     "do": "menuItem",
+     "name": "Gradient"
+    },
+    {
+     "do": "menuItem",
+     "name": "To bottom"
+    },
+    {
+     "do": "assert",
+     "p": "P5",
+     "k": "exportHas",
+     "file": "landing.html",
+     "pattern": "background-image:\\s*linear-gradient\\(to bottom,"
+    },
     {
@@ -2195,2 +2252,9 @@
      "startsWith": "linear-gradient(to right"
+    },
+    {
+     "do": "assert",
+     "p": "P5",
+     "k": "exportHas",
+     "file": "landing.css",
+     "pattern": "background-image:\\s*linear-gradient\\(to right,"
     }
```
The rules file changed in the same commit (its W04, W06 and W07 lines and the new "Re-lock" section).

Scorer check on the re-locked specs (`reference/round6.html`, `--stub7`): the eleven controls W01 to W08 (W07a to W07d included) all PASS; the 21 injected faults all fail the spec they are
meant to fail (row-short, gap-14, centred: W02; control-32: W03; menu-ignores-escape, swatch-wrong-prop, hex-lax, page-colours-all: W04; weight-no-style, no-dashes-double: W05;
step-5 and the new type-once: W06; shadow-wrong: W07a; toggle-not-pressed: W07b; gradient-loses and the new gradient-dir-swapped and gradient-bottom-omitted: W07d, the last two
failing the written-text check only while the computed-style check still passes; no-gradient: W07d NOT BUILT; tablet-grey, item-40, menu-offscreen: W08). The faults of the earlier
stubs (59 on `--stub` to `--stub5`, the round 5 stub's in a second pass) were re-run on the changed runner and are all still caught; the round 3 stub's control still fails T10, as it
did in round 3.

### Existing test assertions updated while building the page (#41, for Max's decision)

The brief says existing tests are not edited or weakened. Three existing unit tests pinned facts that the same brief replaces, so they could not both hold; as in round 5 (`53dcd89`) I changed only the lines that state
the replaced fact, kept every other line, and said why in a comment in the test. Nothing else in an existing test was touched.

| # | Test | Assertion before | Now | Why |
|---|---|---|---|---|
| 41a | `tests/uieditorround4.test.ts`, "every control has its word" | `<CtlLabel text={P.alignCaptions[b.label] ?? b.label} />` and `<CtlLabel text={P.unitLabel} />` are in `Ribbon.tsx` | `<RowLabel text={P.rowLabels[f.label] ?? f.label}` and `data-row-label` are; the `ue-cl` label span and the "no abbreviations" assertion stay | The alignment buttons are icon-only like PowerPoint's (their names and tooltips are unchanged) and the px/% toggle sits in the Width row, so their captions are no longer drawn; a number box has its word beside it. The locked round 6 rules retire the gate checks of the same facts (U03 steps 2, 5, 9). |
| 41b | `tests/uieditorround4.test.ts`, "the ribbon keeps its container, its 26 px controls and its 44 px narrow rule" | `.ue-tool .ue-ribbon .ue-rbtn { ... height: 26px }`, and the narrow rule names `.ue-al` | The same two facts for the shared rule that now covers buttons, selects and number boxes: `height: 28px`, and `min-width: 44px; height: 44px` in the narrow rule; the "tokens only" slice starts at the round 6 heading | The brief makes every control 28 px high (the gate retires the 26 px checks: U05 steps 2 and 4, T03). The container, the 12 px label size and the 44 px narrow rule are asserted as before. |
| 41c | `tests/uieditorround5.test.ts`, "the column weights of the grid are the measured widths plus 28 px" | The round 5 weights (290, 200, 209, 288, 197, 296, 260), `padding: 4px 14px 2px`, `.ue-lg` 72 px | The round 6 weights (`RIBBON_COLUMNS`: 225, 143, 182, 273, 187, 205, 133) as both floor and weight of every column, the medium rule, one band from their sum, `padding: 8px`, rows 28 px high with 5 px between | Round 6 replaces the round 5 groups (V01, V02 and V04 are retired whole by the locked rules). The test is rewritten to say the same kind of thing about the new groups, not weakened to say less. |

The new tests are in `tests/uieditorround6.test.ts` (9).

## 2026-11-22, UI Editor insert round 1 (`feat/ui-editor-insert1`)

Rules: `docs/ui-editor-gate-rules-insert1.md`; specs: `scripts/ui-editor-gate/specs-insert1.json` (locked in `00078b1`). No runner change yet. Baseline and stop: `docs/ui-editor-baseline-insert1.md`.

| # | Change | Why |
|---|---|---|
| 1 | `tests/uieditorengine.test.ts`: the constant `COMMIT` is now `a5f954a610cfdf2693fadd2a7b105b4acf59a9e3` (was `27065d8847738f61b7b9538ab6070122559e842f`). Old assertion: the engine's header, the README and the commit equal `27065d8…`. New: they equal `a5f954a…`. | Vendoring the new engine makes the old pin untrue. Not in the brief's list of tests that may change: flagged for Max. |

## 2026-11-23, insert round 1, stage 1 (`feat/ui-editor-insert1`, on top of `main` at `bcbf335`)

Rules: `docs/ui-editor-gate-rules-insert1.md` (locked in `00078b1`; numbered amendments A1 to A7 in its section 7, in a form the runner reads: `scripts/ui-editor-gate/amendments-insert1.json`); specs:
`scripts/ui-editor-gate/specs-insert1.json` (never edited). Stage 1 covers Y01 to Y05 and the kept checks (Y14); Y06 to Y13 report NOT BUILT. The scorer-check stub is `reference/insert1.html` (`--stub8`).

| # | Change | Why |
|---|---|---|
| 42 | The runner loads `specs-insert1.json` and `amendments-insert1.json`. `--stage N` runs the Y specs of that stage with their amendments applied (steps skipped, replaced or added after) and reports the others NOT BUILT; Y14 is an aggregate (W01 to W06, W08, W09 PASS in the same run) plus the four no-op round trips. Without `--stage` (or `--only Yxx`) the Y specs are not run, so the earlier gate runs are as they were. `--stub8` serves `reference/insert1.html`. A plain page (`/ref.html`) loads the vendored engine so the gate can ask it for its own result of one edit on given files (placing). | The brief's stages and amendments A1 to A7. |
| 43 | New steps: `hoverElement`, `dblclickElement`, `placeCases`, `fillText`, `clickButton`, `confirm`, `pressPage`, `focusField`, `selectPath`, `setLink`; `click` reads `at: top`. New asserts: `insertBarOrder`, `menuItemsOrder`, `disabledWithReason`, `insertBarFits`, `placing`, `insertLine`, `statusContains`, `exportEqualsOriginal`, `insertedVisible`, `previewText`, `exportText`, `exportParse`, `textEditor`, `textEditorOpen`, `gone`, `present` (with `sel`; the earlier `present` with `items` keeps its meaning), `selectedIs`; `noOverflowX` with `widths` measures the preview at each width. | The Y specs' `vocabulary`. |
| 44 | **Readings:** a P2 assert of a Y spec is one of the export checks, and a Y spec's P2 is PASS when it has such asserts and all hold (the dump comparison of the earlier specs needs `widths`, which Y specs do not have). `type` reads `value` when `text` is absent (A3). A menu button, and `menuState`, are looked for in the quick bar as well as the ribbon (Insert is in the bar). The selected element is the deepest element whose box is the selection outline's box (`selectedEl`); `selectedIs` compares boxes. `placeCases` takes the files before the click, asks the vendored engine for the same one insert on them, and compares byte for byte; the new element's box is read in the exported file loaded fresh at the preview's width. | Operational definitions, mine. |
| 45 | `--timing`: a timestamp and the elapsed time at the start of every spec and step. | Asked for by Max, to see where a long run first goes wrong. |
| 46 | **A runner bug of mine, found and fixed:** my first `present` assert for the Y specs shadowed the earlier `present` (a `switch` takes the first matching case), so the round 1 and round 2 specs that use it (R02, R14) failed on their own stub control. The re-run of the earlier faults found it (the control of `--stub3` failed); it was fixed, and the whole earlier fault set was run again. The first run is kept (`earlier-results-run1-present-bug`). | The re-run did its job. |
| 47 | **Existing tests edited** (see below). | The brief lists them as allowed. |

**Scorer check (stage 1, `--stub8`).** Controls: Y01 to Y05 PASS, Y06 to Y13 NOT BUILT. 21 injected faults, each must fail where stated: insertion line 12 px off (`line-12`), a click that inserts at the wrong place (`wrong-place`),
Escape that still inserts (`escape-inserts`), Escape that does not cancel placing (`escape-keeps-placing`), the line active at a refused spot (`refused-line-active`): Y02; no engine reason in the status line
(`status-no-reason`): Y02 and Y04; a text edit applied on Escape (`edit-escape-applies`), typed `<script>` as markup (`script-markup`), the text box 12 px off (`editor-12-off`), double-click that opens nothing
(`dblclick-no-open`), F2 that opens nothing (`f2-no-open`), a text box over an element with child elements (`edit-child-opens`): Y04; menu items out of order (`insert-order`), Insert not disabled on SVG
(`insert-no-svg-disable`), no reason in its tooltip (`insert-no-reason`), a 760 px Insert button (`bar-wide`): Y01; the selection cleared after Delete (`delete-parent-wrong`), the Delete key deleting while a field has
focus (`delete-in-field`), Delete enabled on an implied element (`delete-implied`): Y05. **The first run missed two** (`edit-escape-applies` and `delete-parent-wrong` passed), which STOPPED the build until the spec was fixed:
amendments A6 and A7 (see the rules, section 7); after them both fail, and the other 19 failed already. Stage 2 and 3 faults (a note left by Delete, pins, headers, Include comments, hostile notes, reloaded notes, a pin
after Move up, a 40 px control at 390) are not part of this stage. The earlier faults were re-run on the changed runner: 59 (`--stub` to `--stub5`), 13 (round 5 stub) and 21 (round 6 stub) = 93 fault runs, all caught; the
controls of the earlier stubs are as before (only T10 on the round 3 stub, as in round 3).

**Existing test assertions edited (for Max's decision).**
| # | Test | Before | Now | Why |
|---|---|---|---|---|
| 47a | `tests/uieditorengine.test.ts` (approved by Max, added to the list) | `const COMMIT = '27065d8847738f61b7b9538ab6070122559e842f'` | `const COMMIT = 'a5f954a610cfdf2693fadd2a7b105b4acf59a9e3'` | The test names the commit the vendored engine is a build of; the vendoring changed it. One line. |
| 47b | `tests/uieditorround2.test.ts`, "Rotate is drawn as a device outline ... the one icon button that shows its word" | `assert.equal((bar.match(/ text=\{/g) ?? []).length, 1, 'only Rotate has a visible label')` | the count is 2, with a second assertion that the other is `text={labels.insert}` | The quick bar gains the Insert menu button, which shows its word like Rotate (the brief lists assertions that count the bar's controls). |

The new tests are in `tests/uieditorinsert1.test.ts` (8). No locked check is retired by stage 1 (none of the new controls changes what a locked check names), and no locked file was edited.

**Runs kept** (the raw logs are outside the repository, in the session's scratch folder; the numbers are here): `A` (the vendored tree, clean: 205 s, 87 specs); the stage 1 scorer-check runs (first with the two misses, then
after A6 and A7); the earlier faults twice (the first with the `present` bug); the final run 1 on `bc70f83` (gate 06:37:11 to 06:41:11 UTC: **one miss, U03**, see below) and the final run 2 on `8233ed8` (gate 06:43:30 to
06:47:54, clean). **Iteration 1 (labelled):** run 1's only miss was U03's tooltip check: the tooltips of `Edit text` (`Change the text ...`) and `Delete` (`Remove this element ...`) do not start with one of the verbs of
that locked check (it has no Change, Remove or Delete). The two tooltips were rewritten (`Edit the text ...`, `Use this or the Delete key to remove the element.`) and everything was run again. Nothing else changed.
