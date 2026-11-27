# UI Editor release (flag and noindex removed): gate rules (LOCKED)

Locked in its own commit before the implementation and before any scored run (`docs: lock the release rules and specs`). After it this file and `scripts/ui-editor-gate/specs-release.json` are never edited; a flaw found before anything is scored is a numbered amendment in `scripts/ui-editor-gate/amendments-release.json` (none yet), and any change after a scored run is labelled a post-run amendment. Failed runs stay on record.

Question: **after the build-time flag `VITE_SHOW_UI_EDITOR` and both noindex mechanisms are deleted, does a build with no environment variable at all behave exactly like today's flag-ON build, except that the page no longer says noindex?**

Base: `main` at `8916e84` (the flag-ON build of that commit is "the old ON build"). Out of scope and untouched: `repoUrl` stays `null`, all wording, `src/ui-editor/vendor/engine.js`, every layout and style rule.

## 1. The change (what the implementation commit does)
1. `src/data/uiEditorFlag.ts` is deleted; every conditional on it is removed and the ON behaviour kept: `App.tsx` (lazy route always), `NavBar.tsx` through `navtabs.ts` (`withUiEditor(tools)`, no boolean), `solarmodel.ts` (`bodiesFor` and its parameter removed; `BODIES` kept), `content/home.ts` (`homeInfo()` and `homePlanets()` lose the parameter; `HOME_INFO` and `HOME_PLANETS` kept; the Backend long copy always ends with ` UI Editor runs in your browser.`, the compact copy is unchanged).
2. noindex: the `/ui-editor` block of `vercel.json` (the `/api/shop` block and the rest byte for byte), `src/hooks/useNoIndex.ts` and its call in `src/pages/UiEditor.tsx`.
3. `tests/helpers/ssrflag.ts` (the helper that loaded modules under a flag value) is deleted; its only user is retired below.
4. `scripts/check-layout.mjs` measures the UI Editor planet and page always (it was gated on `VITE_SHOW_UI_EDITOR=true`).
5. README, one comment in `uiEditor.ts`, `docs/working-notes-and-decisions.md` (one new entry; old entries untouched), `scripts/ui-editor-gate/flags.mjs` rewritten for the new state.

## 2. Pass line (every item; the verdict is read by script, `scripts/ui-editor-gate/release.mjs`, from this list)
1. `npx tsc -b`, eslint and `vite build` with NO environment variable: exit 0.
2. `npm test` on the implementation commit: **942 tests, 926 pass, 0 fail, 16 skipped** (baseline at `8916e84`: 940 tests, 924 pass, 0 fail, 16 skipped; minus 3 whole tests retired, plus 5 new).
3. **R01** `flags.mjs`, a build with no variable: **12 of 12** checks (section 4).
4. **R02** byte comparison, old ON build against the new no-variable build: after the content hash in every asset name and the build commit are normalised, the only files that differ are `index-*.js` (the entry chunk), `UiEditor-*.js` (the page chunk) and `index.html`; every other file is byte for byte equal and the file lists are equal. Any other difference is a finding and FAILS the item. Each difference is then explained in the report.
5. **R03** `check-layout --home` (`CHECK_PAGES` filter; the full sweep crashes in its product-cards step on main and is not run) at 1280x720, 1366x768, 1440x900 and 1920x1080, all four planets, long and compact copy, no variable: exit 0 and **the same output, line for line (timing apart), as the old ON build of `8916e84` gives**.
6. **R04** the headless preview of the no-variable build: the nav has the UI Editor link last; Home lists four planets and the fourth card opens; `/ui-editor` loads; one real edit (the landing sample's headline nudged once on X) moves the element in the preview; the document has no `meta[name=robots]` on Home, while the page is mounted and after leaving it.
7. Whole gate, one run on the implementation commit with the command of the latest gate-log entry (`run.mjs --url U --u06-distinct 15 --stage 3 --views1 --nudge --nudge2 --nonudge --views2 --views2banner --scrollfix --scrollfix2 --release --timing`; `--off-baseline` is no longer used): **only T10 FAILS** (known); the six retired flag-OFF specs read RETIRED; every other spec PASSES or reads what it read in the whole gate of the gate-flakes round (RETIRED, NOT BUILT). L07 stays masked by amendment A1 (`amendments-gateflakes.json`) unless `--no-gateflakes` is given. Any other failure is reported, not masked.
8. Scorer check (section 5): every injected fault makes the item it targets FAIL; a control that does not FAIL STOPS the round.
9. No file of the old locked rules and specs, no `engine.js`, no CSS and no wording string changes (`git diff --stat` of the implementation commit shows none).
10. No `VITE_SHOW_UI_EDITOR`, `UI_EDITOR_ON`, `isUiEditorOn`, `uiEditorFlag`, `useNoIndex`, `applyNoIndex`, `X-Robots-Tag` or `noindex` string in `src/`, `public/`, `index.html`, `vercel.json` or `vite.config.*`; in `tests/` and `scripts/` only in the files that assert their absence, the locked old specs, rules and logs, and comments of the runner.

## 3. RETIRED (listed, not deleted; the runner prints RETIRED for the gate specs and never PASS)
### 3.1 Unit tests (`tests/uieditorflag.test.ts`, renamed `tests/uieditorrelease.test.ts`; `tests/uieditordevices.test.ts`; `tests/home.test.ts`)
Whole tests retired (3):
| file | test | reason | replaced by |
|---|---|---|---|
| uieditorflag | "the flag is ON only for the exact string "true"; unset, empty and anything else is OFF" | the flag no longer exists | N1, N2 |
| uieditorflag | "the flag is one small module that other code reads, and the page chunk is lazy" | the module is gone; the lazy chunk is asserted again without the flag | N1 |
| uieditorflag | "noindex: a robots meta is added while the page is mounted and removed again; the header rule is in vercel.json next to the old ones" | both mechanisms are removed | N3, N4 |

Tests kept with their OFF-state or flag assertions retired (the ON assertions stay and must pass; the retired lines are named):
| file | test | retired assertions |
|---|---|---|
| uieditorflag | the nav: the UI Editor is the third tool button ... when ON, and absent when OFF | `withUiEditor(base, false)` is `base` (there is no OFF) |
| uieditorflag | the rendered nav has the five labels with the flag OFF and a sixth button ... with it ON | the OFF render (five labels) and the `'false'` render |
| uieditorflag | Home planets: three with the flag OFF, a fourth ... with it ON | `homePlanets(false)` |
| uieditorflag | Home renders three planet buttons with the flag OFF and four with it ON | the three-button render |
| uieditorflag | four planets can be chosen with the flag ON | `chosenOf(bodiesFor(false))` and the "this build has the flag off" line |
| uieditorflag | with the flag OFF /ui-editor is the NotFound page ... with it ON it is not | the three OFF-state NotFound assertions and "nothing about it is visible with the flag off" |
| uieditordevices | flag OFF behaviour is unchanged: only exactly "true" turns the page on ... | the five `isUiEditorOn` assertions and the `UI_EDITOR_ON ? lazy` pattern (the isolation loop over `ui-editor/(devices|Gallery|Stage|icons|miniature)` stays) |
| home | the UI Editor sentence of the Backend row is there only with the flag on ... | `homeInfo(false)` and the flag-off JSON assertion (the sentence is now always there, the compact copy still has none) |

Helper retired: `tests/helpers/ssrflag.ts`.

### 3.2 Gate specs
| id | file | what it checked | reason |
|---|---|---|---|
| X32 | specs-views1.json | the flag-OFF build: flags.mjs 16 of 16 and byte equality with main's flag-OFF build | there is no OFF build |
| Q09 | specs-views1-nonudge.json | same | same |
| H14 | specs-views2.json | same | same |
| B10 | specs-views2-banner.json | same | same |
| L11 | specs-scrollfix.json | same | same |
| M09 | specs-scrollfix2.json | same | same |
Replaced by R01 and R02.

### 3.3 `flags.mjs` checks (16 before)
Retired: all eight OFF-state checks (no nav link, three planets, nothing about it on Home, no chunk request on Home, no noindex on Home, /ui-editor is the NotFound page, the chunk not requested, no noindex meta) and the two noindex checks of the ON build ("noindex meta while mounted", "noindex meta gone after leaving"). Kept: the ON checks for the nav, four planets, Home does not request the chunk, `/ui-editor` loads the page with its title. The ON build and the OFF build were two builds; there is now one.

## 4. New: R01, the 12 checks of `flags.mjs` (a build with NO variable)
1. the nav ends with UI Editor (six items); 2. Home has four planets, the fourth is UI Editor; 3. Home text has ` UI Editor runs in your browser.` in the Backend row; 4. Home does not request the page's chunk; 5. no `meta[name=robots]` on Home; 6. `/ui-editor` loads the page (chunk requested, title starts with "UI Editor"); 7. no `meta[name=robots]` while the page is mounted; 8. none after leaving it; 9. no `noindex` in any text file of `dist`; 10. `vercel.json` has no `X-Robots-Tag` anywhere and still has the `x-vercel-enable-rewrite-caching` header of `/api/shop/:path*`; 11. a build with `VITE_SHOW_UI_EDITOR=false` in the environment is byte for byte the no-variable build (the variable is now unused); 12. the built `index.html` has no robots meta.

## 5. Scorer check (at most five injected faults, applied in a throwaway git worktree of the implementation commit, never committed; `release.mjs --root <worktree>`)
F1 the `useNoIndex` call put back (checks 7, 8, 9 or R04 must FAIL); F2 the `/ui-editor` `X-Robots-Tag` block put back in `vercel.json` (check 10 must FAIL); F3 the UI Editor link left out of the nav (check 1 and R04 must FAIL); F4 the UI Editor sentence left out of the Backend copy (check 3 must FAIL); F5 one CSS declaration changed (R02 must FAIL, and R03 may). The unfaulted worktree must PASS everything (the control).

## 6. Not verified here
The live Vercel production deploy; search engines (how long a page already known as noindex takes to be reindexed); real Safari or a real device. Chromium headless only for the new checks.
