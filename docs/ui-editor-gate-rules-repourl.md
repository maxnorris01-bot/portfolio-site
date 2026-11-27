# UI Editor GitHub button (`repoUrl`): gate rules (LOCKED)

Locked in its own commit before the implementation and before any scored run. After it this file and `scripts/ui-editor-gate/specs-repourl.json` are never edited; a flaw found before a scored run is a numbered amendment in `scripts/ui-editor-gate/amendments-repourl.json`, and a change after a scored run is labelled post-run.

Question: **with `repoUrl` set, does the page header show a GitHub button that looks like SatPOV's and leaves the page exactly where it was?**

Base: `main` at `e56687c`. The engine repository `https://github.com/maxnorris01-bot/ui-editor` is public. The button already exists in `src/pages/UiEditor.tsx` (the `aside` of the header) and is drawn only when `uiEditor.repoUrl` is set.

## 1. What a first measurement showed (before this lock; exploration, not scored)
Setting `repoUrl` alone on `e56687c`: the page header becomes a two-column grid from 1100 px (`PageHeader` `is-aside-wide`, the aside is 50% wide), so the lead is two lines at 1280, 1366 and 1440 px (one on `main`), the tool starts 24.8 px lower at 1280 (the Q07 and B01 failure again), and the button is the plain `btn` size, 163 by 48 px, because `.ue-github` has no CSS (SatPOV's `.sat-github` is `padding: 0.35em 0.9em; font-size: var(--text-small)`). So the change is `repoUrl` plus the CSS ShopAI already uses for the same situation (`.shop-github`, `.shop .page-header...`): the button is `.ue-github` sized like `.sat-github`, and from 1100 px it sits at the top right, out of the grid, so the title and lead lay out as without it.

## 2. The change
1. `src/data/uiEditor.ts`: `repoUrl: 'https://github.com/maxnorris01-bot/ui-editor'`; the doc comment above the field no longer says private; `githubLabel` (`'View on GitHub ↗'`) is the label SatPOV's button has, and is not changed.
2. `src/pages/UiEditor.css`: `.ue-github` (same padding and font size as `.sat-github`) and, from 1100 px, the header's aside out of the grid at the top right, scoped to `.ue-page`, the pattern of `.shop-github`. No other CSS.
3. Tests, docs (section 5).

## 3. Pass line (the verdict is read by script, `scripts/ui-editor-gate/repourl.mjs`)
1. `npx tsc -b`, eslint, `vite build`: exit 0. `npm test`: **942 tests, 925 + 1 = 926 pass, 0 fail, 16 skipped** (baseline `e56687c`: 941 / 925 / 0 / 16; no test is added or removed except the one new in section 5).
2. **A** (built page, no variable, headless Chromium): the button is present; its `href` is exactly `https://github.com/maxnorris01-bot/ui-editor`; `target="_blank"`; `rel` contains `noreferrer`; it is reached by the Tab key; focused by keyboard it has a visible focus ring (a non-`none` outline or a box shadow in its `:focus-visible` style).
3. **B** (layout, with the button, at 1280x720, 1366x768, 1440x900, 1920x1080 and 390x844, against the build of `main` `e56687c`, `--baseline`): the lead has the same number of lines as `main`'s (one at the four desktop sizes, the 390 number as `main`'s); no horizontal overflow (`scrollWidth` not above the window width); the top of the tool (`.ue-tool`), and so the ribbon, is within 0.5 px of `main`'s at every size; the button lies inside the window at every size.
4. **C** (look): the button has the classes `btn btn-secondary`; at 1280 and at 390 its computed padding and font size equal those of SatPOV's `.sat-github` on `/satellite-conjunction-screening`, and its height is within 1 px of it.
5. Whole gate, one run on the implementation, the command of the latest gate-log entry (`run.mjs --url U --u06-distinct 15 --stage 3 --views1 --nudge --nudge2 --nonudge --views2 --views2banner --scrollfix --scrollfix2 --release --timing`): **only T10 FAILS**; Q07 and B01 PASS unchanged. Any other failure is reported, not masked.
6. Nothing else changes: no wording string (`githubLabel`, the credits text, the lead), no engine, no old spec, rule or baseline (`git diff --stat` shows only the files named in sections 2 and 5).

## 4. Scorer check (four injected faults in throwaway git worktrees, never committed; `repourl.mjs --root <worktree>`)
F1 `repoUrl` null (the button missing): A and C FAIL. F2 a wrong href (`.../ui-editor-x`): A FAILS. F3 `rel` left off: A FAILS. F4 the new CSS removed (the lead wraps, the button is the big size): B and C FAIL. The unfaulted worktree must PASS A, B and C (the control). A control that does not fail STOPS the round.

## 5. Tests and docs
Replaced (not silently edited):
| file | assertion | replaced by |
|---|---|---|
| `tests/uieditorrelease.test.ts` ("every name and string of the page ...") | `uiEditor.repoUrl === null` ("the engine repository is private") | `repoUrl` equals the URL above, and the page rendered on the server has the `<a>` with that `href`, `target="_blank"` and `rel="noreferrer"` |
| `tests/uieditorpage.test.ts` ("Data and credits says ... the GitHub button has no URL while the engine repository is private") | `uiEditor.repoUrl === null`; the test's title says "no URL while private" | `repoUrl` equals the URL above; title updated. (The `private repository` text of the credits is a page string and is not changed here: see the report.) |
New (1): `.ue-github` has the size of `.sat-github` and the header's aside is out of the grid from 1100 px (a source check of `UiEditor.css`).
Docs: `README.md` (says the button is not drawn), `src/ui-editor/vendor/README.md` (says the engine's source is private), `docs/working-notes-and-decisions.md` (one new entry). Old entries, old gate logs and rules, old session notes and the build banner inside `engine.js` are records and are not edited.

## 6. Not verified here
The live Vercel deploy; a real device; browsers other than headless Chromium.
