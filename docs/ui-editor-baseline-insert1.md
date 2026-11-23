# UI Editor insert round 1: vendoring, baseline and probes (Step 1, partly done)

Branch `feat/ui-editor-insert1`, from `main` at `bcbf335`. Rules and specs locked in `00078b1` (Y01 to Y14). **Status: the round STOPPED at Step 1.4 (the scorer
check) by my own decision, no page UI was changed.** See "Where it stopped" below.

## Step 1.1: the engine is vendored (`3a1afc6`)

`src/ui-editor/vendor/engine.js` is a build of engine main `a5f954a610cfdf2693fadd2a7b105b4acf59a9e3`: 290,095 bytes (81.9 KB gzip), SHA-256
`7d23069c17f658eb7836abedfda8fc4601f03e1eb0cda986e63107948c827916`. Rebuilt twice with the README's command into a scratch file: same SHA-256. The engine repo
`git status` is clean. `engine.d.ts` was updated by hand (`ElementEdit`/`ContentEdit`, `InsertKind`, `CommentInfo`, `EditResult.selected` and `className`, the three new DOM ops,
`NoteInfo`, `NoteList`, `listNotes`, `neutralise`); `tsc -b`, strict, no `any`. The bundled packages did not change, so `THIRD-PARTY-NOTICES.md` is untouched.

## Step 1.2: the earlier gate and the tests with no UI change

- **Existing test edited (logged, not named in the brief's "Tests that may change"):** `tests/uieditorengine.test.ts` pinned the engine commit `27065d8…` in one constant; it is now
  `a5f954a…` (one line). Every other assertion is unchanged. Decision for Max: confirm.
- `npm test`: 884 tests, 868 pass, 0 fail after that edit (before it: 1 fail, that pin). `tsc -b` and `eslint` clean; `vite build` clean (UiEditor chunk 365.15 kB, 108.93 kB gzip; index 244.31 kB).
- **Gate on the pre-vendor tree (`bcbf335`, run `b1`):** originals 18 PASS 2 REFUSED 0 FAIL; round 1 9 PASS; round 2 16 PASS; round 3 12 PASS 1 FAIL (T10, already failed) 3 RETIRED; round 4 12 PASS;
  round 5 6 PASS 3 RETIRED; round 6 12 PASS. (V09 shows P1 XX but PASS in that run.)
- **Gate on the vendored tree, two full runs (`v0`, `v1`):** the same except **round 6: 2 PASS, 6 FAIL, 4 NOT BUILT** both times (W01, W03, W04, W05, W06, W08 failed with 30 s Playwright
  timeouts and "no control Shape Fill"; W07a to W07d "NOT BUILT" as a consequence). By the brief this is a stop condition, so I investigated rather than continue:
  - Opening the vendored build by hand: the ribbon has all seven groups and the Shape Fill button; no console or page errors.
  - The same runner on the vendored build, rounds 5 and 6 only (V03, V05 to V09, W01 to W09, run `o4`): **round 5 6 PASS, round 6 12 PASS**, with W07a to W07d built and passing. W04 alone and the W set alone also pass.
  - So the vendored engine does not break the ribbon; the full 25-minute run is unstable late in the run (the first full run on the pre-vendor tree, `b0`, failed everything because its preview server was not up
    yet; its second run `b1` was clean except V09's P1, while the vendored full runs failed a different late block). **I treat the six W failures as runner instability, not as an engine effect, but this is
    NOT proven by a clean full run on the vendored tree: a third full run is the cheapest next test, and the round must not be scored on a run like `v0`/`v1`.** Everything that passed pre-vendor and was
    re-run in isolation on the vendored build passed.

## Step 1.3: probes

- **What an inserted element looks like** (read from screenshots at 1280 and 390, landing and email; the engine's own defaults): Text box = a plain paragraph reading "Text", no box. Rectangle = a grey (#d9d9d9) 200 x 120 px
  box with a 1 px grey border. Rounded rectangle = the same with 12 px corners; Ellipse = the same with 50% radius. Button = a real `<button>` reading "Button" in the browser's default grey with 8 x 16 px padding.
  All carry `max-width: 100%`, so at 390 they stay inside the screen. **Two things to see on the page:** inside the landing page's flex row of cards an inserted Button is stretched to the row's height (a tall
  grey strip), and in the email's table cell the boxes simply stack under the text.
- **Refusal reasons at the spots a visitor will hover** (the engine's words): inside or next to a table cell's row on the email: "a `<div>` cannot go directly inside `<tr>`: the parser moves it elsewhere or the content
  model forbids it"; inside a paragraph (`.lead`): "the HTML parser would not keep the new `<div>` where it was asked to be (first-child `<p>`, inside `<p>`)…"; before or after `<html>`: "`<html>` is the root element: a new
  element cannot go next to it". Inside an `<a>` and at the end of `<body>` are accepted. These are plain enough to show, but the page should still say them in its own words ("A box cannot go directly inside a table row").
- **`applyEdit` as the placing trial:** it is a pure function of `(model, edit, probe, state)`: it returns patches, DOM operations and the new `state` and touches neither the model nor the DOM nor the live preview (only
  `applyEditSteps` applies the DOM operations). The page can call it on `session.preview.model` and `preview.probe` for every pointer move (it re-parses the patched text once per call; its cost was not measured here, so throttle it) and show `refusal.message` or accept `selected`. `resizeedge.ts`'s `trialOk` is the different, heavier scratch-preview trial and is not needed here.
- **Existing tests that name or count the bar's or strip's controls:** `tests/uieditorpage.test.ts` (the label list through Keep editing: unaffected, the labels object only gains keys), `tests/uieditorround2.test.ts` ("no two toolbar
  icons share a drawing" and the source-order check of `labels.view` … `labels.download` in the bar), `tests/uieditorround4.test.ts` ("the quick bar shows the words of Review unlinked and Reset all; Undo and Redo stay icon-only").
  The locked gate checks that count the bar (`barButtons`, `quickBarOrder`, `quickBarEnabled`, `liveButtons`) use exact lists in N01 (retired), "includes" lists in N02 (retired) and R01; none is expected to be affected.

## Where it stopped, and why

Done: the lock (Step 0), the vendoring (1.1), the earlier-gate comparison with the instability finding above (1.2), the probes (1.3). **Not done: 1.4, the scorer check.** The brief requires, before any page change, the 14 Y
specs to be runnable and every listed injected fault to fail where stated. The runner has no steps or asserts for placing, the insertion line, the text overlay, pins, popovers or Include comments (about 20 new steps and 30 new
assert kinds, `vocabulary` in `specs-insert1.json`), and the round 6 method also needs a new stub page (`reference/insert1.html`, a second implementation of all of this behind the same hooks, with 20 fault switches)
and `--stub8` mode. That is a piece of work of the size of the whole of round 6's gate, before the page itself (Insert menu, placing, text overlay, Delete, Comment, pins, Notes, Include comments, labels, limits text). I did not
start a partial stub: a half-working scorer would give false comfort, and the brief says nothing is built until it passes. Recommended split for the next sessions: (a) runner and stub for Y01 to Y05, then build those; (b) Y06 to
Y10 (comments and notes); (c) Y11 to Y14 and the final run. Locked Y specs can stay as they are (unbuilt parts report FAIL until built).
