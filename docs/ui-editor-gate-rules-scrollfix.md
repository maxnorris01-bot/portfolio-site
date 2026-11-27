# UI Editor: the selection outline and the scrolled preview: gate rules (LOCKED)

Locked in its own commit before the fix (`docs: lock the scroll fix rules and specs`). After it this file, `scripts/ui-editor-gate/specs-scrollfix.json`, the two fixtures `reference/scrollfix-inner.html` and `reference/scrollfix-body.html` and the probe `probe-scroll-views2.mjs` are never edited; a flaw found before anything is scored is a numbered amendment in `amendments-scrollfix.json` (section 8). The rules of the earlier rounds stay in force. Brief: `~/Desktop/Projects/ui-editor-scrollfix-brief.md`. Clauses marked **(mine)** are mine. Nothing calls an LLM or a paid service.

Question: **does the selection outline follow the selected element, however and wherever the preview is scrolled, and does a rebuilt preview keep where it was scrolled?**

## 1. What the probe shows (read-only, before any change; `probe-scroll-views2.mjs`, headless Chromium, the landing, email and chart samples, five views, two elements each, wheel, keyboard and `scrollTo`; `05d80d9` (before stage 1), `main` `636f580` and the branch `7d9f7a7` run identically)
The numbers are the same on all three: **these are old problems, not something stage 1 or 2 brought in.**

```
== 1. outline minus element, px at 200 ms, worst over wheel/keys/scrollTo and the samples; sticks = outline outside the device screen (cases of 36)
Desktop          old: max 0, sticks 0/36 | main: max 0, sticks 0/36 | branch: max 0, sticks 0/36
Phone upright    old: max 0, sticks 5/36 | main: max 0, sticks 5/36 | branch: max 0, sticks 5/36
Tablet upright   old: max 0, sticks 0/36 | main: max 0, sticks 0/36 | branch: max 0, sticks 0/36
Phone sideways   old: max 0, sticks 2/36 | main: max 0, sticks 2/36 | branch: max 0, sticks 2/36
Tablet sideways  old: max 0, sticks 0/36 | main: max 0, sticks 0/36 | branch: max 0, sticks 0/36
== 2. pages whose own element scrolls (a scrolling element or body)
inner scroller       old: 60:60/60 140:200/200 | main: 60:60/60 140:200/200 | branch: 60:60/60 140:200/200
scrolling body       old: 60:60/60 140:200/200 | main: 60:60/60 140:200/200 | branch: 60:60/60 140:200/200
scrolling document   old: 60:0/0 140:0/0 | main: 60:0/0 140:0/0 | branch: 60:0/0 140:0/0
== 3. after an edit that rebuilds the preview: preview scroll before->after, outline diff after a further wheel/scrollTo, scroll listeners (live; left on dropped documents)
first edit                 old: 150 -> 150, outline 0, live 1 left 0 | main: 150 -> 150, outline 0, live 1 left 0 | branch: 150 -> 150, outline 0, live 1 left 0
Undo                       old: 150 -> 0, outline 0, live 1 left 0 | main: 150 -> 0, outline 0, live 1 left 0 | branch: 150 -> 0, outline 0, live 1 left 0
Redo                       old: 150 -> 0, outline 0, live 1 left 0 | main: 150 -> 0, outline 0, live 1 left 0 | branch: 150 -> 0, outline 0, live 1 left 0
view switch Tablet and back old: 150 -> 0, outline 0, live 1 left 0 | main: 150 -> 0, outline 0, live 1 left 0 | branch: 150 -> 0, outline 0, live 1 left 0
rotate and back            old: 150 -> 0, outline 0, live 1 left 0 | main: 150 -> 0, outline 0, live 1 left 0 | branch: 150 -> 0, outline 0, live 1 left 0
view Reset                 old: error: Error: no Reset to Desktop view button on this page | main: error: Error: no Reset to Desktop view button on this page | branch: 150 -> 0, outline 0, live 1 left 0
Delete another element     old: 150 -> 184, outline 0, live 1 left 0 | main: 150 -> 184, outline 0, live 1 left 0 | branch: 150 -> 183, outline 0, live 1 left 0
Insert a Rectangle         old: 150 -> 184, outline 0, live 1 left 0 | main: 150 -> 184, outline 0, live 1 left 0 | branch: 150 -> 183, outline 100, live 1 left 0
20 Undo and Redo replays   old: -, outline 0, live 1 left 0 | main: -, outline 0, live 1 left 0 | branch: -, outline 0, live 1 left 0
```
- **On the three samples the outline follows** the element within 1 px in the next frame and after 200 ms, in every view, for the wheel, the keys and `scrollTo`. The page's `scroll` listener is on the live preview document after every rebuild (an edit, Undo, Redo, a view switch, a rotate, a view Reset, a Delete), there is exactly one, and none is left on a dropped document after 20 replays (the probe counts them itself, from the host window). So causes (a), (b) and (e) of the brief are not what happens on these pages.
- **(c) is real.** A `scroll` event of an ELEMENT does not bubble, and the page listens on the document: on a page whose own element scrolls (an inner scrolling element, a scrolling body, both pasted through Paste) the outline stays where it was and is off by exactly the distance scrolled (60, 200 px). Same on all three versions.
- **(d)/(f), a second cause.** A rebuilt preview starts at the top: with Phone scrolled to 150, Undo, Redo, a view Reset and a merged arrow-key move (a replay) leave it at 0. The outline is right for the new picture, but the content jumps away from under the pointer. Same on all three versions.
- **The keyboard does not scroll the preview.** PageDown, PageUp, Home, End and Space with the focus on the pointer layer scroll the host page (the preview did not move: `no scroll`), never the preview.
- **A drag, a resize and the wheel** on a scrolled preview are right (the drag already adds the scroll offsets). The outline of an element straddling the screen's top edge is drawn clipped to the screen (a screenshot shows the handles at the edge), so "outline outside the screen" in the table counts only boxes whose rectangle leaves the screen, not pixels drawn there. A thin hover outline of whatever is under a parked pointer is another thing and is left as it is.
- The probe's first runs had two faults of their own (a script injected into the sandboxed preview changed how it behaved; an outline compared with the wrong element); both were corrected before the numbers above.

## 2. Expected behaviour (mine, change only with Max's word)
1. The outline, the handles and the selection follow the selected element within 1 px at every scroll position, for the wheel, the keys, a direct scroll of the document, and a scroll of any scrolling element of the page, in Phone, Tablet (upright and sideways) and Desktop, HTML and SVG.
2. PageDown, PageUp, Home, End and Space with the focus on the pointer layer scroll the PREVIEW (the way the wheel already does), and only when it can scroll; the arrow keys stay the nudge.
3. A replay (a merged move, Undo, Redo, a view Reset) keeps the preview where it was scrolled (clamped to what the rebuilt page allows); a new document or a new view or orientation starts at the top.
4. An outline never shows outside the device's screen (the existing clipping stays).
5. Exactly one scroll listener per live preview document and none on a dropped one. No flash frames and no stage movement; dragging and resizing a scrolled preview give the right edit.

## 3. Specs (`specs-scrollfix.json`, L01 to L11; prefix L, used by no earlier spec file: checked in all of them)
L01 Phone upright, two elements, every kind of scroll, the keys move the preview. L02 Tablet upright, Phone and Tablet sideways. L03 Desktop, the email sample, the SVG chart. L04 pages whose own element scrolls. L05 after every step that rebuilds. L06 a replay keeps the scroll. L07 the screenshot of the margin round the screen. L08 the scroll listeners. L09 drag and resize while scrolled. L10 no flash and no stage movement. L11 flag OFF.
On the unchanged page (the dry-run, before any change): **L01 FAIL** (the keys do not move the preview), **L04 FAIL** (60, 200 and 20 px off), **L06 FAIL** (the preview is at 0, was 150); L02, L03, L05, L07, L08, L09 and L10 PASS, as they should: they guard what already works (L07 cannot fail on this page: the outline is already clipped).

## 4. Vocabulary added to the runner after this lock (own commit)
Steps `scrollPreview {how, y, sel}` (wheel: the real mouse wheel over the preview; pagedown, pageup, home, end, space: the key with the focus on the pointer layer; scrollTo: the preview window; scrollTop: the scrolling element, `#scroller` or the body or `sel`), `snapshotScroll`, `scrollHost`; asserts `outlineFollows`, `previewScrollSame`, `previewScrollChanged`, `scrollListeners`, `outlineClipped`; fixtures `scrollinner`, `scrollbody` (`READY` `#r5`); the init script of an L spec that counts the scroll listeners; `--scrollfix`; `--stub15`.
**Definitions (mine).** `outlineFollows {sel, tol}`: the largest of the differences of left, top, width and height between the outline (`[data-selection]`, host coordinates) and the element's real box (the iframe's box plus the element's own box times the scale), in the next animation frame and again after 200 ms, at most `tol` (1 px). `previewScrollSame`: the preview window's `scrollY` within `tol` of its snapshot. `previewScrollChanged`: it moved by at least `min` (20 px). `scrollListeners`: the net count of `scroll` listeners on the live preview document and window, and on every dropped one, from wrappers the probe puts on `addEventListener` and `removeEventListener` of each preview frame from the host window once it has loaded (never a script inside the sandboxed frame). `outlineClipped`: a screenshot of the band above the screen (500 px, less the first `allow` = 8 px next to it) and below it, decoded in a page of its own: no pixel of the accent colour or a thin blend of it.

## 5. Scorer check (before the fix)
A stub `reference/scrollfix.html` (`--stub15`) with at most six fault switches: (1) the scroll listener not re-attached after a replay swap; (2) the outline measured without the scroll offset; (3) a listener left on a disposed document; (4) the outline not clipped to the screen; (5) keyboard scroll ignored; (6) a stale selection element after Undo. Each must fail where stated; a control that does not fail STOPS the round. The unchanged page must fail L01, L04 and L06.

## 6. Pass line
Every L spec 0 FAIL; every earlier spec that selects, scrolls, drags, resizes, nudges, undoes, resets or reads the overlay still passes with its bytes unchanged; the banner specs, H, X, J, K and Q still hold; `npm test` no fewer than the baseline (935) plus the new, 0 fail; `tsc`, lint, build and `check:layout` clean; the flag-off build identical (L11); the scorer check passed; the locked files byte for byte as locked. A miss means the iteration FAILS; no tuning; a post-run change is a labelled iteration.

## 7. Decided in advance (mine)
- The keyboard scroll is part of the fix because the brief lists it and the probe shows it missing; the arrow keys stay the nudge.
- The scroll position is kept for a REPLAY only; opening a document, a view switch and a rotate start at the top (the screen has a different size).
- A page's own scrolling element is followed by listening for `scroll` in the capture phase on the preview document (scroll events do not bubble); the wheel over the pointer layer still scrolls the window or the host, not an inner element (not changed here, said in the report).

## 8. Amendments
None yet (`amendments-scrollfix.json`).
