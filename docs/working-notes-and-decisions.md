# Working notes and decisions

## 2026-11-08: the site header is frozen on every page
The header (`header.nav`, `src/components/NavBar.css`) is `position: sticky; top: 0; z-index: 40` on every route, SatPOV included, so the links and Contact stay reachable on long pages. It keeps its solid background and bottom line, and it stays in normal flow, so no page measurement moved (SatPOV's page height and map box are identical before and after). The z-index sits above page content (the Show conjunctions menu is 30, the usage popover 20) and below the modals (Refine and Contact, 100) and the satellite full-screen view (1000). The Contact modal is already rendered into `document.body` through a portal, so the header's stacking context does not trap it.

The header wraps on narrow windows, so its height varies: `NavBar` publishes it as `--site-header-height` (a ResizeObserver on the header). The two `block: 'start'` scroll-to targets (`.shop-results`, `.sat-tool`) use it as `scroll-margin-top`. The `block: 'center'` full-screen scroll and the clarify panel's `block: 'nearest'` were left alone. `tests/shopnav.test.ts` fails if the header stops being sticky.

## 2026-11-08: ShopAI has the "View on GitHub ↗" button
The ShopAI page has the same button as SatPOV, opening the backend repo `room-redesign-agent` in a new tab. The URL is `SHOP_REPO_URL` in `src/shop/copy.ts`. It is in the page header's `aside` slot, same size as SatPOV's (`.shop-github`). From 1100px it is taken out of the grid and sits top right, level with the title, so the title, chips and description wrap as before (the full-width description would otherwise have lost a column); below 1100px it sits under the title block. The idle `/shop` height is unchanged at 1440x900 (1117px, scrolls) and 1920x1080 (1080px, fits).

## 2026-11-08: Claim Verification Agent removed from the Résumé page
The Claim Verification Agent entry was removed from Applied AI Projects on the Résumé page because its repo is now private. The section lists ShopAI and the Satellite Point-of-View Tool. `public/Max_Norris_Resume.pdf` still lists it and is updated in a separate step.

## 2026-11-15: the UI Editor page (behind a flag, not released)
A visitor-facing editor at `/ui-editor`: paste or upload HTML or SVG (plus one optional `.css`) or load one of three samples, select an element in a sandboxed preview, change it from a side panel or with handles, and copy or download the UPDATED CODE (the only export). It runs in the browser; no LLM, server or paid service. Decisions by Max (2026-11-12 and 2026-11-15) were followed, not reopened.

**The flag.** `VITE_SHOW_UI_EDITOR` (build time; exactly `true` is ON). OFF: no route (NotFound shows), no nav button, no Home planet, the page's chunk never requested. The flag hides the page, **not the code**: merged code, including the vendored engine, is visible in this public repo. The page also has a `noindex` meta (`useNoIndex`, a hook of its own; `usePageMeta` is unchanged) and an `X-Robots-Tag: noindex` header rule for `/ui-editor` in `vercel.json`. Everything about it is in `src/data/uiEditor.ts` (names and copy) and `src/data/uiEditorFlag.ts` (the flag), so a rename is one line.

**How to release (with Max's go, never before).** Remove the `/ui-editor` header rule from `vercel.json`; remove `useNoIndex()` from `src/pages/UiEditor.tsx`; remove the flag (`uiEditorFlag.ts`, the gating in `App.tsx`, `NavBar.tsx` through `navtabs.ts`, `content/home.ts` and `components/solarmodel.ts`, so the route, nav button and fourth planet are always on) and update the flag tests; set `repoUrl` in `src/data/uiEditor.ts` once the engine repository is public (until then the GitHub button is not drawn); get Max's wording for the Home planet card (the two sentences are the author's draft). Then delete the `VITE_SHOW_UI_EDITOR` variable in Vercel.

**Engine.** Vendored as one built ES module (`src/ui-editor/vendor/engine.js`, from the private `ui-editor` repo at 27065d8, 273 KB, 77.6 KB gzip) with hand-written strict types and the licences of what it bundles (email addresses in those licence files are left out of the copy). Not a dependency. `src/ui-editor/vendor/README.md` says how to rebuild it without touching the engine repo.

**Product decisions made while building (mine; Max can change them).**
- *Desktop width.* The Desktop view is always 1280 px (the engine's desktop size). In a narrower window the preview scrolls sideways; it is never scaled, so pointer deltas are CSS px. Tablet is 768 px, Phone 390 px.
- *Tall pages.* The preview frame grows to the page's height (at least 800 px) and the page scrolls, because the pointer layer covers the frame and the frame could not scroll.
- *Drag-move is unlinked* (HTML): applies to the size you are in and is listed under Review unlinked. In an SVG there are no sizes, so a drag applies everywhere (the engine refuses unlinked SVG edits). Nudge fields, arrow keys, Move up/down and panel changes follow the Link checkbox.
- *Runs of moves are one edit.* Two moves of the same element in a row (drags, or arrow-key presses) are merged into one edit (the sum; a pair that cancels leaves none), because the engine adds a `translate()` per move and the visitor's code would pile up `translate(1px,0) translate(1px,0) ...`. One Undo takes the whole run back.
- *Border width* gets `border-style: solid` with it when the element had no border style, because a width shows nothing otherwise.
- *Downloads.* The page file is `<name>-edited.<ext>`; a companion stylesheet keeps its own name, so the page's `<link>` still finds it (the brief said only that it "downloads as its own file"). Copy and Download act on the file chosen in the File picker.
- *Selection after Undo.* If an Undo or Redo involves a reorder, the selection is cleared rather than guessed (a path names a different element after a reorder).
- *SVG panel.* "Background" is the fill and "Border" is the stroke; padding and margin are not shown; handles only on elements with a width and height of their own (`rect`, `image`, `svg`, `foreignObject`).
- *Empty state.* The top bar holds the only Paste, Upload and Sample controls; the empty-state text points to them.

**Known gaps.** Handles are for the pointer (and touch dragging is not gated, not tested on a device); keyboard users have the panel fields and arrow keys. Pins from the engine name elements by path, so Review unlinked can point at a different element after a reorder. With the flag OFF the build still emits the page's chunk (never requested); the main bundle is 0.8 kB larger than before because the flag's gating code and the planet's two sentences live in it. Chromium only.

**Tests and gate.** `docs/ui-editor-gate-rules.md` (locked before any page code), `docs/ui-editor-baseline.md` (baseline and scorer check), `docs/sessions/2026-11-15-ui-editor-page.md` (what was built and the verdict).
