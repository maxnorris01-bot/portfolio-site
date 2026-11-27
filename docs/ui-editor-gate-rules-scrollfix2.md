# UI Editor scroll fix 2: the outline in WebKit and a per-frame re-measure: gate rules (LOCKED)

Locked in its own commit before the fix (`docs: lock the scroll fix 2 rules and specs`). After it this file, `scripts/ui-editor-gate/specs-scrollfix2.json` and the probe `probe-scroll-webkit.mjs` are never edited; a flaw found before anything is scored is a numbered amendment in `amendments-scrollfix2.json` (section 8). The rules of the scroll fix (`docs/ui-editor-gate-rules-scrollfix.md`, amendment A1) and of the banner stay in force. Brief: `~/Desktop/Projects/ui-editor-scrollfix2-brief.md`. Clauses marked **(mine)** are mine. Nothing calls an LLM or a paid service.

Question: **does the selection outline follow a scrolling Phone preview in WebKit, and does a per-frame re-measure make it follow whatever the browser does with scroll events?**

## 1. What the probe shows (read-only, before any change; `probe-scroll-webkit.mjs`; the page at `4137689`; Playwright WebKit 27.2 (playwright webkit v2388), installed for this round, headless; Chromium for comparison)
Landing, Phone upright, the headline and a lower element selected in turn; the preview scrolled by 16 real wheel steps of 14 px, by `scrollTo` and by PageDown; the outline's distance from the element in px at the next frame, 100 ms and 500 ms; the events the probe's own listeners saw.

| browser | element and input | 1 frame | 100 ms | 500 ms | scrolled to | events |
|---|---|---|---|---|---|---|
| Chromium | #headline | wheel x16 (dy 14) | 0 | 0 | 0 | 224 | 16 wheel, 16 scroll |
| Chromium | #headline | scrollTo 120 | 0 | 0 | 0 | 120 | 0 wheel, 1 scroll |
| Chromium | #headline | PageDown | 0 | 0 | 0 | 231 | 0 wheel, 1 scroll |
| Chromium | #card-plan h3 | wheel x16 (dy 14) | 0 | 0 | 0 | 224 | 16 wheel, 16 scroll |
| Chromium | #card-plan h3 | scrollTo 120 | 0 | 0 | 0 | 120 | 0 wheel, 1 scroll |
| Chromium | #card-plan h3 | PageDown | 0 | 0 | 0 | 231 | 0 wheel, 1 scroll |
| WebKit | #headline | wheel x16 (dy 14) | 224 | 224 | 224 | 224 | 16 wheel, 0 scroll |
| WebKit | #headline | scrollTo 120 | 120 | 120 | 120 | 120 | 0 wheel, 0 scroll |
| WebKit | #headline | PageDown | 231 | 231 | 231 | 231 | 0 wheel, 0 scroll |
| WebKit | #card-plan h3 | wheel x16 (dy 14) | 7 | 7 | 7 | 224 | 16 wheel, 0 scroll |
| WebKit | #card-plan h3 | scrollTo 120 | 111 | 111 | 111 | 120 | 0 wheel, 0 scroll |
| WebKit | #card-plan h3 | PageDown | 0 | 0 | 0 | 231 | 0 wheel, 0 scroll |

- **WebKit reproduces the bug.** The preview scrolls (224, 120, 231 px) and the outline stays where it was, for the wheel, for `scrollTo` and for the keyboard: off by exactly the distance scrolled, and it never catches up (500 ms later it is the same). (The lower element's PageDown row reads 0 only because the element was already at the end of its travel.)
- **The cause is that WebKit delivers NO `scroll` event at all** to the preview's document or window (0 events of either kind, for the wheel, for `scrollTo` and for the keys), while Chromium delivers one per step (16 for 16 wheel steps). The preview is a sandboxed frame with scripts off; WebKit does not dispatch scroll events there. The page's outline is moved only by a `scroll` event, so in WebKit it is never moved. The wheel events do arrive (16 of 16) and the first few frames of the burst show the outline moving (14 px off at frame 4): the wheel handler scrolls the window, but nothing re-measures after it.
- So the earlier fix (`scroll` listener in the capture phase) was right for Chromium and cannot work in WebKit. **A listener is the wrong tool; the fix is a loop that reads the scroll position every frame.**

## 2. Expected behaviour (mine, change only with Max's word)
1. In Chromium and in WebKit, for the wheel in many small steps, `scrollTo` and the keyboard, the outline, handles and selection strip match the selected element within 1 px by the next animation frame after the content stops moving, and never lag more than one frame while it moves; after the scroll stops they stay right for 1 s; the same after an edit, Undo, Redo, a view switch and a replay.
2. An idle selection costs almost nothing: no change of the overlay, and a few cheap reads, per frame once the selection and the scroll position are unchanged.
3. The frame loop runs only while something is selected and the tool and the tab are visible; it stops when the selection is cleared, when the tab is hidden and on unmount (no frame callback of the tool left); exactly one per live selection. The flag OFF build is unchanged.

## 3. Specs (`specs-scrollfix2.json`, M01 to M09; prefix M, used by no earlier spec file: checked in all of them; no earlier spec conflicts, so there is no RETIRED list)
M01 a wheel burst: frame by frame the outline is within 1 px of the element of its frame or the frame before; M02 `scrollTo` and the keys, stays for 1 s, Phone, Tablet, sideways; M03 after an edit, Undo, Redo, a view switch and a replay; M04 an idle selection (0 overlay changes, at most 240 measures a second, a loop running); M05 the loop stops when the selection is cleared and starts when it is made; M06 it stops when the tab is hidden; M07 one loop only after ten replays, a view switch and a rotate; M08 nothing left after the Home link is followed (unmount); M09 flag OFF. They run in Chromium and, with `--browser webkit`, in WebKit.
**Dry run on the unchanged page.** Chromium: **M04 to M07 FAIL** (no loop), M01 to M03 and M08 PASS (Chromium delivers the scroll events; M08 passes because there is no loop). WebKit: **M01 to M07 FAIL**, M08 PASS.

## 4. Vocabulary added to the runner after this lock (own commit)
`--browser webkit`, `--scrollfix2`, `--stub16`; steps `wheelBurst`, `wait`, `resetCounters`, `tabHidden`, `navigate`; asserts `outlineLag`, `outlineStays`, `counters`; the init script of an M spec. **Definitions (mine).** The counters are made from the host window: `requestAnimationFrame` and `cancelAnimationFrame` are wrapped and count the tool's own requests only (a request whose call stack runs through the UiEditor chunk, or a function named `selectionLoop` on the stub), with the number still pending; `getBoundingClientRect` of the preview frame's elements is wrapped from the host window once the frame is inserted and counted; a `MutationObserver` on the pointer layer counts changes to it (attributes, nodes, text). `resetCounters` zeroes them and sets the clock; `counters` reads them per second since then. `outlineLag`: every frame of the burst is sampled (the outline's box, the preview's scroll position, the frame's box); the outline must equal the element's box computed from that frame's scroll position, or from the previous frame's, within `tol`, and the last 3 frames must equal the element's. `outlineStays`: every `every` ms for `ms` ms the outline is within `tol` of the element. `tabHidden`: `document.hidden` and `visibilityState` are overridden and `visibilitychange` is dispatched (what a hidden tab does, without a window to hide).

## 5. Scorer check (before the fix)
A stub `reference/scrollfix2.html` (`--stub16`) in which the scroll listener does nothing (as in WebKit) and a frame loop, a function named `selectionLoop`, moves the outline, with at most five fault switches: (1) the loop never starts; (2) it does not stop when the selection is cleared; (3) it keeps running after unmount; (4) it re-measures without comparing, so the overlay is rewritten every frame; (5) it reads the scroll position of a disposed document after a replay. Each must fail where it is meant to; a control that does not fail STOPS the round. The unfixed page must fail M04 to M07 in Chromium and M01 to M07 in WebKit.

## 6. Pass line
Every M spec 0 FAIL in Chromium and in WebKit; every earlier spec that selects, scrolls, drags, resizes, nudges, undoes, resets or reads the overlay still passes with its bytes unchanged; the L specs, B01 to B10, H, X, J, K and Q still hold; `npm test` no fewer than 938 plus the new, 0 fail; `tsc`, lint, build and `check:layout` clean; the flag-off build identical; the scorer check passed; the locked files byte for byte as locked. A miss means the iteration FAILS; no tuning; a post-run change is a labelled iteration.

## 7. Decided in advance (mine)
- The loop reads the live preview document's scroll position every frame (never one captured once) and the selected element's box through the existing `measure`, and calls `measure` only when the scroll position, the box or the scale changed since the last frame. The existing scroll and wheel handling stays.
- What is NOT verified, whatever the specs say: a real Safari, a real trackpad's momentum, touch, a real phone. The WebKit run is Playwright's build of WebKit, headless, with synthetic wheel events.

## 8. Amendments
None yet (`amendments-scrollfix2.json`).
