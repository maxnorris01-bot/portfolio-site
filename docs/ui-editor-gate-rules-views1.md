# UI Editor views round, stage 1: gate rules (LOCKED)

Locked in its own commit before any page change (`docs: lock UI Editor views round 1 rules, specs and retirements`). After that commit this file, `scripts/ui-editor-gate/specs-views1.json`, `scripts/ui-editor-gate/validate-views1.mjs` and the two fixtures `scripts/ui-editor-gate/reference/views1-tab900.html` and `views1-bp768.html` are never edited: a flaw found before anything is scored is a re-lock (a new commit), and corrections are numbered amendments in section 9 (so this text stays an exact prefix of the file). The earlier gate rules (original and rounds 1 to 7b), their specs and amendments stay in force except the RETIRED list in section 7. Brief: `~/Desktop/Projects/ui-editor-views1-brief.md`. Nothing here calls an LLM or a paid service. Sections and clauses marked **(mine)** are operational definitions written by the implementing agent; the rest is the brief's wording.

Question: **with three views (Desktop, Tablet, Phone) in the page, does a Desktop edit reach Phone and Tablet in proportion (sizes) or as written (colours, fonts, order, text), does an edit made in Phone or Tablet stay in its own view and survive later Desktop edits, is Tablet portrait editable like Phone, are Link, the unlinked dots and Review unlinked gone, and does everything else still work?**

## 1. The behaviour being gated

1. **The environment follows the view.** Desktop sends `environment: 'desktop'`, Tablet `'tablet'`, Phone `'phone'`. A Desktop element edit carries no `link` field (the engine reads it as linked), except dragging to move, which stays unlinked on Desktop (`link: false`). A Phone or Tablet element edit carries its environment and **no** `link` field (the engine ignores it there). Insert, text, remove and note edits carry no environment and no link. An SVG document has no environments: its element edits carry no environment (an SVG move carries `link: true`, as before).
2. **What the engine does (merged: ui-editor PR #5 and #6, main `02b9466`).** A Desktop edit reaches Phone and Tablet in proportion for sizes (font-size, padding, margin, width, height) and as written for colours, fonts, order and text, and does not change a property that is custom in a view. A Phone or Tablet edit is custom to that view (written inside that view's media range and pinned), never reaching Desktop or the other small view. Ranges: Phone = widths at or below B (the page's own phone breakpoint), Tablet = `floor(B)+1` up to T (the page's largest `max-width` between 769 and 1100 px, else 1024), Desktop above T. A page whose own phone breakpoint is 768 has no tablet band: a Tablet edit is refused (`tablet-covered-by-phone`) with the engine's plain reason, nothing changes; a Phone edit covers 768.
3. **Tablet portrait is editable** like Phone portrait: the ribbon, the handles, Insert, Edit text, Delete, Comment and Notes work. The Tablet view stays 768 px wide. A device turned sideways stays view-only, Phone and Tablet alike (a phone turned sideways is 844 px wide, inside the Tablet range, so it stays view-only); Phone keeps its wording exactly (`turn the phone upright`), Tablet landscape has a wording of its own that says it is turned sideways (decision 5 of section 10).
4. **A refusal shows the engine's plain reason in the status line** (for `tablet-covered-by-phone`: it says what to do, "make the edit in Phone instead"), changes nothing in the code and does not enter the undo list.
5. **Link, the unlinked dots and Review unlinked are gone** (flag ON): the Link checkbox and its hint, the per-field dots, the Review unlinked button, its list and its jump, every `listUnlinked` call and every label that becomes unused or false. Nothing else in the ribbon or the layout moves; the one-band ribbon layout stays. The `data-field` attribute stays (other locked specs read it: `fontList`, `noTextInput`); only the `data-field` of the Arrange group, which fed nothing but the Position dot, goes.
6. **Dragging to move:** on Desktop it is one unlinked rule for every width above the phone breakpoint (so the Tablet range too when the page has one); in Tablet it covers the tablet range only; in Phone the phone range only. The status line says which (decision 1 of section 10 reports the measured widths).
7. **Copy that was false is rewritten** in plain sentences about the new model (the Adapt text, the limits, the tooltips, the view-only messages, `insertTipTablet`, `commentTipViewOnly`): Phone and Tablet start as the Desktop setup scaled in proportion and follow it; a change made in Phone or Tablet applies to that view only; a change made in Desktop reaches all three except what was customised there. No sentence about Reset (stage 2) and none about a feature that does not exist. Home, the README and the other tools are not touched.
8. **The flag OFF behaves exactly as today** (section 6, X32).

## 2. Ranges, fixtures and the truth (mine)

B and T as in 1.2; the test widths of each page are 1280, 1024, 768, 390, B, B+1, T and T+1 (the specs list them: landing 1280, 1025, 1024, 768, 641, 640, 390; tab900 1280, 1024, 901, 900, 768, 641, 640, 390; bp768 1280, 769, 768, 390).

- **landing** (the sample, with its stylesheet): B 640 (its one `max-width: 640px` rule), no rule between 769 and 1100, so T = 1024.
- **tab900** (hand-written, `reference/views1-tab900.html`, copies nothing real): `#title` 40 px, 34 px at 900 and below, 28 px at 640 and below; `#panel` width 480 px (100% at 640 and below) and padding 24 px (16 px at 640 and below); B 640, T 900.
- **bp768** (hand-written, `reference/views1-bp768.html`): one `max-width: 768px` rule (title 28 px, panel 100% wide with 16 px padding); B 768, no tablet band.

**The truth for a Desktop edit** is the one of the engine's size rules, written before any run: the new value above the phone breakpoint; at every other width the page's OWN value there times the ratio of the new to the old Desktop value; a value that is not a length (a percentage, a colour, a font) is kept as written; a width is never wider than its parent's content (the width guard: 593 px for a 600 px panel in a 641 px window with 24 px of page padding). The truth of a custom edit is its own range only (Phone: widths at or below B; Tablet: `floor(B)+1` to T); the other widths keep what they had. Every expected value in `specs-views1.json` (`truth`) is derived by hand from these rules and was validated in plain Chromium **without the engine** by `scripts/ui-editor-gate/validate-views1.mjs` (a hand-written reference stylesheet per entry): 177 of 177 values equal the reference. The page is scored against those numbers.

Tolerances: lengths in px within 0.05 px (collateral within 0.5 px), colours, font families and transforms exactly; a drag of d window px is d / scale CSS px (the gate's window is 1920 x 1080, where every view is at scale 1) within 1.5 px.

## 3. Independent checks (mine)

Headless Chromium through the existing harness, a fresh context per spec; the verdict never reads the page's own state for the numbers that matter: every `P2` computed value is read in plain Chromium on the **exported files loaded fresh** at the width; the engine-replay equality replays the page's edit list through the vendored engine in the checker's own page; collateral values (other elements, hand-written from the original pages) and the sideways overflow at 390 and 768 are read in the preview.

## 4. Hooks the page provides (mine)

None new. The checker reads the ones that exist: `[data-editor]` with `data-edit-list` (the page's edit list, read only), `[data-ribbon]`, `[data-ribbon-note]`, `[data-handle]`, the group `Editor controls`, the status line.

## 5. The specs (vocabulary in the specs file)

All specs are `X01` to `X32` (decision 6 of section 10: the brief says V01 to V30; round 5 already has V01 to V09 and the runner keys by id). 32 specs. Each lists the checks it needs (`P1` preview, `P2` export and engine, `P5` page behaviour, `P6` external).

| spec | what it gates |
|---|---|
| X01 | Desktop font size reaches Phone and Tablet in proportion (landing `#headline` 44 to 52): computed values at the seven widths in the preview and in the export, collateral, no overflow at 390 and 768, the edit list, the field in each view |
| X02, X03, X04 | the same for a font size, a padding and a width on a page with a tablet band (tab900), at its eight widths (X04 includes the width guard) |
| X05 | a Desktop colour and a Desktop font family apply at every width as written |
| X06, X07 | a Phone custom edit changes only the phone range; a Tablet custom edit only the tablet range; the edit carries its environment and no link; the other views show their own value |
| X08 | a Tablet custom padding on a page with a tablet band (tab900) |
| X09, X10 | a Tablet custom edit then a Desktop edit of the same property, and the reverse: the tablet range keeps its value, Desktop and the phone range follow |
| X11 | a Phone custom size then a Desktop size on the same element: Phone keeps its value, no refusal |
| X12 | a Desktop colour after a Phone custom colour: no refusal, Phone keeps its colour |
| X13 | bp768: a Tablet edit is refused with the plain reason in the status line and nothing changes (export = original, empty edit list, Undo disabled); a Phone edit covers 768 |
| X14 | Tablet portrait is editable: every Desktop ribbon control enabled, 8 handles, Insert, Edit text, Delete, Comment, Notes enabled, no view-only note, an edit applies |
| X15 | in Tablet portrait Insert, Edit text (F2), Delete and Comment work; content edits carry no environment; the new element shows at 1280, 768 and 390 |
| X16 | Tablet and Phone landscape are view-only with their wording (note, disabled Insert and Comment with the reason, Edit text and Delete disabled); upright again they edit |
| X17, X18 | no Link checkbox, no dot, no Review button or wording in the editor (DOM, accessible names, tooltips) at the three views, with a selection and after an edit, on an HTML page and on the SVG chart |
| X19 | SVG documents have no environments: the same fill typed in Desktop, Tablet and Phone gives the same bytes, with no environment on the edit |
| X20 | Undo and Redo across views: three edits, Undo three times gives the original bytes, Redo three times the same bytes as before |
| X21 | Reset all still clears everything (bytes, edit list, values in every view) |
| X22 | the export equals the vendored engine's own export of the page's edit list, byte for byte (the checker replays the list), after Desktop, Phone, Tablet, insert and text edits |
| X23, X24 | what a drag changes: Desktop (above the phone breakpoint, the tablet range included), Tablet (the tablet range) and Phone (the phone range), by measured transform at the seven widths |
| X25 | a resize in Phone is custom to Phone (replaces the retired S08) |
| X26 | a reorder in a block parent is refused in Phone and Tablet with the engine's reason and still works on Desktop (replaces the retired S16) |
| X27 | a custom edit follows its element through Insert, Delete and Move up and survives a later Desktop edit; a Phone width on an inserted element is custom (replaces the retired Y11 and the Link steps of Y03) |
| X28 | keyboard: the Tab sequences of the ribbon (Desktop, Phone, Tablet) and of the quick bar are the earlier sequences without the Link checkbox and the Review button; the Tab order stays the visual order |
| X29 | the quick bar without Review unlinked: order, words, icon-only Undo and Redo, fits at 1000, 1440, 1920 and 390 |
| X30 | the words of the page (How it works, Limits, the editor) describe the new model and say nothing about Link, Review unlinked, the other way round, a view-only Tablet or one size only |
| X31 | layout kept: an aggregate of W01, W02, W03 and Y01 (the ribbon fits one band at 1440 and 1920, the bar fits); `check:layout` is run separately by script |
| X32 | the flag OFF: `flags.mjs` 16 of 16, and the flag-off build equals the baseline's (section 6) |

Dry run before the lock (a throwaway prototype of the page built in a scratch copy of the repository, nothing of it committed; the vendored engine of the prototype is a build of `02b9466`): X01 to X30 PASS on it. The dry run found four spec slips that were fixed before locking (X22 read the runner's old engine when the prototype's was not given; X27 inserted into a part of the landing page that is below the fold in Phone; X28 expected Undo and Redo in the quick bar's Tab sequence although they are disabled with no edit; X29 put Insert, a menu button, in an order check that refuses menu buttons).

## 6. Pass line

1. Every X spec meets its declared outcome: `X01` to `X32` PASS, 0 FAIL.
2. Every earlier spec **not on the RETIRED list** still passes with its bytes unchanged: the original 20 are 16 PASS, 1 REFUSED and 3 RETIRED (S08, S10, S16), 0 FAIL; round 1 N03 to N11 PASS (N01 and N02 were retired by round 2); rounds 2 to 6 PASS except their retired checks and the already failed locked T10; insert round 1 Y01 to Y10, Y12 to Y14 PASS and Y11 RETIRED; Z01 to Z07 PASS. **Bytes unchanged:** `--dump-exports` writes the exported files of every spec that has them; those of the final run equal those of the baseline run (Step 1) byte for byte for every spec not on the RETIRED list.
3. `npm test`: no fewer than 899 passes (the baseline) minus the whole tests retired in section 7.2 plus the new tests, 0 fail (16 skipped as before); `tsc -b`, `eslint` and both builds clean; flag checks 16 of 16 OFF and ON; **the flag-off build is identical (mine):** every file of the build without `VITE_SHOW_UI_EDITOR` is byte for byte the baseline's after the names of the two editor chunk families (`UiEditor-*`, the page, and `uiEditor-*`, its words) are normalised, those two families being the only files that differ (only the editor loads them; `flags.mjs` checks that the page's chunk is never requested with the flag off); both families exist in both builds.
4. The scorer check passed (section 8).
5. The locked files are byte for byte what the lock commit holds (and the earlier locks).
6. ONE complete final run on the FINAL commit, by script, no hand-judging, no retries.
7. `docs/ui-editor-views1-export-shape.md` exists and was generated by script (`scripts/ui-editor-gate/export-shape-views1.mjs`) from the three built-in samples and the two fixtures.
8. `check:layout` (Home meets every target; the UI Editor style check at 1280x720, 1440x900, 1920x1080 and 390x844 has no new unexplained misses) as before; the one-band ribbon is also read by X31.

Decided in advance: any miss means the iteration FAILS; no tuning; the cheapest next test is named; post-run changes are labelled iterations and both runs stay on record. **Readings of the earlier aggregates (mine, written before any run):** Y14 (W01 to W09 PASS) is read as locked. Z07 ("the original 20 (18 PASS, 2 REFUSED, 0 FAIL), round 1 N03 to N11, rounds 2 to 6 except their retired checks and T10, Y01 to Y14, Z01 and Z02, all PASS") is read with the RETIRED list of section 7: the original 20 are 16 PASS, 1 REFUSED and 3 RETIRED, Y11 is RETIRED, every other spec it names is PASS. A retired spec reports RETIRED, never PASS, and is not counted as passed.

## 7. RETIRED list (written before any run)

Retired specs, checks and tests report RETIRED, never PASS, and are NOT counted in the pass line. A step index in `specs-views1.json` (`retiredChecks`) is 0-based, as in `specs-round6.json`; the step number (1-based, as the scans below print it) is in `stepNumbers`. A check that still guards something that matters keeps a replacement that guards it (X28 focus order, X29 and X31 the quick bar and the one-band layout).

**How they were found (search commands used, from the repository root):**
- `node` over the ten spec files (`specs.json`, `specs-round1.json` to `specs-round6.json`, `specs-insert1.json`, `specs-round7a.json`, `specs-round7b.json`): every step whose JSON matches `/link|"dot"|review|unlink|data-dot/i`, then `/tablet|tabletSentence|noHandles|ribbonAllDisabled|viewOnly|view-only|fieldDisabled|landscape/i`, listed with spec id and step number (false matches such as `Preview` and a note's text `Link to pricing` were read and dropped).
- `grep -nE "Link to|ue-link|setLink|uncheck|Review unlinked|\[data-dot|view-only|Tablet" scripts/ui-editor-gate/run.mjs`, the same over `checks.mjs`, `extras.mjs`, `flags.mjs`, `geometry-dump.mjs`, `screenshots.mjs`, `probe-*.mjs`, `supplementary-snap.mjs`.
- `grep -nE "Link\b|linkTo|linkHint|svgLink|\bdot\b|Review|review|unlinked|listUnlinked|view-only|viewOnly|isEditable|viewOnlyReason|insertTipTablet|panel\.tablet|Tablet|rowOfPin" tests/uieditor*.test.ts`.
- a run of the **earlier gate on a throwaway prototype of the page** (section 5) with `--no-retire-views1` that shows which steps fail without the retirements, and one with them that shows nothing else fails (the results are in the gate log).
- `npx tsc -b` and `npm test` on the same prototype, which list the tests below by their type and runtime errors.

### 7.1 Specs and checks (`retiredChecks` of `specs-views1.json`)

| id | what it did | why it can no longer hold | replaced by |
|---|---|---|---|
| S04 steps 14, 15 | Review unlinked 1 and a dot on the Position row after a Desktop drag | the button and the dots are removed (the drag itself is checked by S04's other steps) | none: feature removed; X23 reads the widths |
| S05 steps 10, 11; S06 steps 10, 11 | a dot on Width (Height) and Review unlinked 0 | removed | none: feature removed |
| S07 step 10, S12 step 11, S13 step 12, S15 step 10, S17 step 10, S18 step 12 | Review unlinked 0 | removed | none: feature removed |
| S08 (whole) | a resize in Phone with Link on, and Desktop's width also became 330 (the "other way round") | the engine no longer scales Desktop from a Phone edit; the Link checkbox it reads is gone | X25 |
| S09 steps 10, 12, 13 | the Link to Desktop checkbox, a dot, Review unlinked 0 (the scaled Phone value 35.45 px and Desktop 52 px stay checked) | removed | X01 |
| S10 (whole) | unchecks Link to Phone, expects a dot, a Review list and a jump | all removed | X06 |
| S11 steps 8, 14, 15, 16 | the Link checkbox; Tablet: the view-only sentence, no handles, Font size disabled | removed; Tablet portrait is editable (widths, pressed view and environment stay) | X14, X17 |
| S14 steps 3, 13 | the disabled Link checkbox on an SVG; Review unlinked 0 | removed | X18, X19 |
| S16 (whole, an expected REFUSAL) | unchecks Link to Phone on Desktop to make an unlinked reorder in a block parent, refused | without Link a Desktop Move up is the linked reorder, allowed in a block parent; the refusal still exists for a Phone or Tablet reorder | X26 |
| S19 steps 8, 19 | Review unlinked 1 and 0 | removed | none: feature removed |
| N03 step 23 | Review unlinked 0 | removed | none: feature removed |
| N07 steps 6, 7, 8 | Tablet portrait: no handles, Font size disabled, the view-only sentence (its landscape steps 13, 14, 15 stay) | Tablet portrait is editable | X14, X16 |
| R04 steps 9, 12 | the Link to Phone tooltip; the view-only note in Tablet with an element selected | removed; editable | X14 |
| T06 step 14 | the view-only note in Tablet with an element selected | editable | X14, X16 |
| T08 step 25, V08 step 13 | Review unlinked 0 | removed | none: feature removed |
| U09 step 12 | `enabledOnly` Grid, Snap, Grid spacing in Tablet with an element selected | Tablet portrait is editable | X14 |
| U11 steps 2, 10; V09 steps 2, 4 | quick bar order and words naming Review unlinked | removed | X29 |
| V09 step 11 | `enabledOnly` in Tablet with an element selected | editable | X14 |
| V07 step 3 | unchecks Link to Phone before the west and north resize drags | the checkbox is gone: the resize is a Desktop (linked) edit; its edge checks are read as before | the edge checks themselves; X01 |
| W08 step 6 | `disabledStyle` of the Tablet controls with an element selected | enabled in Tablet portrait (the view button style, step 5, stays) | X16 |
| Y01 step 16 | Insert disabled in Tablet with the reason "Tablet" | Tablet portrait is editable (the SVG and Phone landscape reasons stay) | X14, X16 |
| Y03 steps 7, 11 | `setLink` false and true | the checkbox is gone (the edits on the new element stay) | X27 |
| Y11 (whole) | unchecks Link to Phone, reads Review unlinked three times; an unlinked edit follows Insert, Delete and Move up | both removed; what it guarded is X27 | X27 |
| `extras.mjs` "Tablet: handles and fields are off, with one plain sentence" | the Tablet view is view-only | editable | X14, X16 |

(Some of these steps are also retired by an earlier round's list; the lists are merged and nothing is retired twice in the count.)

### 7.2 Unit tests (`tests/`), by file and title (line numbers of the lock commit)

| test | what changes | why | replaced by (new file `tests/uieditorviews1.test.ts`) |
|---|---|---|---|
| `uieditordevices.test.ts:22` "only Desktop and Phone upright are editable; landscape phone and both tablet orientations are view-only" | **whole test retired** | its Tablet portrait row is now editable | "Desktop, Tablet portrait and Phone portrait are editable; every landscape is view-only" |
| `uieditordevices.test.ts:38` in "only Phone and Tablet can be rotated; ..." | the assertion `viewOnlyReason('Tablet','portrait') === 'tablet'` | portrait has no reason now | `viewOnlyReason('Tablet','portrait') === null`, `('Tablet','landscape') === 'tablet'` |
| `uieditorinsert1.test.ts:54` and `:121` | the clauses `... < bar.indexOf('icon="review"')` ("before Review unlinked") | the button is removed | the same clauses against `aria-label={labels.view}` (the view group that follows the tools) |
| `uieditorpage.test.ts:21` and `:24` in "the controls the gate drives are named..." | `labels.review(3)` and `panel.linkTo('Phone')` | removed | none: feature removed |
| `uieditorpage.test.ts:32` "the limits text mentions each limit of the brief" | the parts `desktop and phone`, `tablet is view-only`, `one size only` | the sentences are rewritten | the parts `desktop, tablet and phone upright are editable`, `turned sideways`, `phone breakpoint is 768`, `covers every width above phone` |
| `uieditorpage.test.ts:39,40` in "How it works: ..." | `/always unlinked/` and `/later version/` | the Adapt text is rewritten | `/start as your Desktop setup scaled in proportion/`, `/applies to that view only/` |
| `uieditorround2.test.ts:80` | the part `labels.review(` of the quick bar order | removed | none: feature removed |
| `uieditorround2.test.ts:310` "the three bottom sections..." | the facts `nine test pages`, `missed on two of the 20`, `its second on one`, `two later rule changes` | the two bullets that said them describe the old Link model | the facts `45 scripted edits`, `17 test pages`, `one scored run` |
| `uieditorround4.test.ts:78,79` and `:92` | the entries `['link', panel.linkHint]`, `['svg link', panel.svgLink]` and the assertion that the Link tooltip names Review unlinked | removed | none: feature removed |
| `uieditorround4.test.ts:115` | the part `id="ue-link"` of the strip | removed | none: feature removed |
| `uieditorround4.test.ts:158` | the end marker `'.ue-dot {'` of the CSS slice | the rule is removed | the end marker `'/* The status line (round 4)'` (the same slice, tokens only) |
| `uieditorround4.test.ts:161` "the quick bar shows the words of Review unlinked and Reset all; ..." | the Review regular expression (the Reset all and the icon-only Undo and Redo parts stay) | removed | none: feature removed |
| `uieditorround7b.test.ts:99` | the end marker `'const unlinkedDot'` of the source slice | the helper is removed | the end marker `'const fontColour'` (the same slice) |
| `uieditorscale.test.ts:82` "the copy says what the scaling does, ..." | `/Tablet is view-only, and so is a phone turned sideways/` | the sentence is rewritten | `/Desktop, Tablet and Phone upright are editable; turned sideways they are view-only/` |
| `uieditorvalues.test.ts:6,126-128` | the import of `rowOfPin` and its three assertions | the dots are removed (the function is deleted) | none: feature removed |

Tests that fail on the prototype for another reason are not retirements: `uieditorengine.test.ts` ("the vendored engine is one built file whose header names the source commit...") reads the vendor README and is satisfied by the vendor commit.

## 8. Step 1: baseline and scorer check (before any page change)

**Baseline** (the page as on `main` at `05d80d9`, run before anything changed): 915 tests (899 pass, 16 skipped, 0 fail), `tsc`, `eslint`, both builds clean, flags 16 of 16, the full gate with `--stage 3` (exit 0, T10 the known failure), no-op round trips, extras. The exports of the earlier specs are dumped (`--dump-exports`) in a second baseline run for the byte comparison of section 6.2.

**Scorer check** on the views stub `scripts/ui-editor-gate/reference/views1.html` (`--stub9`, a copy of the insert round 1 stub rebuilt for the new model, with the vendored engine at `02b9466`). Controls: X01 to X30 PASS on it (X31 and X32 read the real page). **Twelve fault switches** (at most 12, counted first, none dropped), each must FAIL where stated; a control that does not fail STOPS the round and is reported before anything is built:

| # | fault (`?fault=`) | must fail |
|---|---|---|
| 1 | the Link checkbox is still rendered (`link-checkbox`) | X17, X18, X28 |
| 2 | one dot is left on a field after a custom edit (`dot-left`) | X17 |
| 3 | the Review button is left in the quick bar (`review-button`) | X17, X28, X29 |
| 4 | a Phone edit is sent with `environment: 'desktop'` (`phone-as-desktop`) | X06, X11, X12, X20, X22 |
| 5 | a Tablet edit is sent as `'phone'` (`tablet-as-phone`) | X07, X08, X09, X10 |
| 6 | Tablet landscape is editable (`tablet-landscape-edit`) | X16 |
| 7 | the refusal is swallowed: no status message on the bp768 page (`refusal-silent`) | X13 |
| 8 | a refused Tablet edit still enters the undo list (`refused-in-undo`) | X13 |
| 9 | a Desktop drag is sent as linked (`drag-linked`) | X23 |
| 10 | Insert is disabled in Tablet portrait (`insert-off-tablet`) | X14, X15 |
| 11 | a stale Link sentence is left in the Adapt copy (`stale-adapt`) | X30 |
| 12 | the vendored engine is one commit behind: the stub is served `ENGINE_JS` = the build of `a5f954a` (`engine-behind`; on the real page the same shows as a hash mismatch in `tests/uieditorengine.test.ts`) | X07, X08, X09, X10, X13 |

The earlier rounds' controls that still apply are re-run on their own stubs (`--stub8`: the insert round 1 and round 7 faults; the earlier stubs for the earlier faults), which are unchanged and still have Link.

## 9. Amendments (numbered; the lock above and its commit stay as they are)

(none yet; numbered amendments are appended below this line)

## 10. Decisions for Max (written now, answered in the report)

1. **A Desktop drag changes widths above the phone breakpoint, the tablet range too** (measured on the landing page, B 640: 1280, 1025, 1024, 768 and 641 move, 640 and 390 do not; a Tablet drag moves 1024, 768 and 641 only, a Phone drag 640 and 390 only; the status line says "Desktop and Tablet sizes", "Tablet only" or "Phone only"; on a page with B = 768 it says "Desktop only"). Whether Desktop moves should stay unlinked (this rule), become linked (every width) or be limited to Desktop above T is Max's.
2. **The old measured sentences about Link are replaced** by one about the engine's gate for the three views (45 scripted edits over 17 test pages: 44 right, one refused with a true reason, one scored run); the facts come from the engine repository's session notes.
3. **`data-field` stays** (other locked specs read it); only the Arrange group's goes.
4. **The flag-off build** is compared as in 6.3 (the two editor chunk families apart).
5. **Tablet landscape has its own view-only wording** ("Tablet turned sideways is view-only ... Turn it upright, or switch to Desktop or Phone, to edit"); Phone landscape keeps its wording exactly. The brief says landscape "stays view-only with its existing wording"; the existing Tablet sentence ("Tablet is a view-only width") is the very copy the brief asks to correct.
6. **The specs are `X01` to `X32`, not `V01` to `V30`**: round 5 has V01 to V09 and every runner table, report line and `--only` is keyed by the id.
7. **Phone and Tablet edits send no `link` and Desktop edits send none either** (the engine's default is linked); the drag is the only `link: false`.

## Amendments after the lock (numbered; section 9 above stays as locked)

**A1. X29 has no check that would see a Review button left in the quick bar (found by the scorer check of Step 1, before the page was built; no spec had been scored).** Section 8 says fault 3 (the Review button left, `review-button`) must fail X17, X28 and X29. On the stub it failed X17 and X28 and PASSED X29: X29's `quickBarOrder` names only the buttons it expects, none of them Review, and a Review button with no pins is disabled. One step is added to X29 after step 2 (`amendments-views1.json`, index 1): `barNames` (P5), the exact visible buttons of the quick bar in order (`Samples`, `Undo`, `Redo`, `Insert`, `Comment`, `Desktop`, `Tablet`, `Phone`, `Download`, `Reset all`). Nothing else of X29 changes. With it the fault fails X17, X28 and X29 as stated. (The stub's `review-button` was also made faithful in the same step: the button counts `listUnlinked` and is enabled when a custom edit has pins, as the old page's was; X28 reads that, in its last bar sequence after a Tablet edit.)

**A2. Two retired checks would still pass (found by the run of the earlier gate on the prototype with `--no-retire-views1`, before the lock was used for anything).** `tabletSentence` in S11 (step 14) and N07 (step 8) reads the text of the whole body, which now says "view-only" in the Limits; so they pass although the Tablet portrait view is not view-only. They stay retired (section 7.1): what they were about no longer holds, and a check that passes because of another sentence says nothing about Tablet. The list is unchanged.

**A3. `tests/uieditorengine.test.ts` names the vendored commit (found while preparing the vendor commit, before any page change; nothing was scored).** Its constant `COMMIT` (line 9) is the commit the engine's banner and the vendor README must name; vendoring another engine changes it from `a5f954a…` to `02b9466…`. The rest of the test is unchanged and still reads the README's size and SHA-256 and the types (the new `engine.d.ts` declares `tabletMax`, `tabletMin`, `resetView` and `customEdits` as functions, which the test requires of every runtime function). It is not on the RETIRED list (section 7.2) because it is not a retirement: it is the test of the vendored file itself, and it is edited in the vendor commit.
