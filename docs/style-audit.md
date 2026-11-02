# Site style audit and shared type scale

Measured in headless Chromium (software WebGL) with computed styles at 1440x900, 1920x1080 and 390x844. Sizes are CSS px, shown as
`size/weight`. "Home (before)" is Home as it was on PR #50 (v3), before the shared scale.

## Phase 1: what the pages use

| Page | Window | h1 | h2 | h3 | body | card text | lead | small | card label | button | card padding (v h) | container | chars/line |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 404 | 1440x900 | 30.24/700 | - | - | - | - | - | - | - | 15.2/600 | - | 1377 | - |
| 404 | 1920x1080 | 32/700 | - | - | - | - | - | - | - | 15.2/600 | - | 1836 | - |
| 404 | 390x844 | 22.4/700 | - | - | - | - | - | - | - | 15.2/600 | - | 358 | - |
| Home (before) | 1440x900 | 30.36/700 | 31.2/600 | - | 24/400 | 20.1/400 | 24/400 | 20.1/700 | 26.1/600 | 15.2/600 | 12 20 | 1377 | 40-67 |
| Home (before) | 1920x1080 | 40/700 | 31.2/600 | - | 24/400 | 24/400 | 24/400 | 24/700 | 31.2/600 | 15.2/600 | 12 20 | 1836 | 40-67 |
| Home (before) | 390x844 | 24/700 | 20.8/600 | - | 16/400 | 16/400 | 16/400 | 16/700 | 20.8/600 | 15.2/600 | 12 24 | 358 | 26-40 |
| Résumé | 1440x900 | 32/700 | 24/600 | 18.4/600 | 17/400 | 17/400 | 17/400 | 13.6/500 | 18.4/600 | 15.2/600 | 24 24 | 1377 | 55 |
| Résumé | 1920x1080 | 32/700 | 24/600 | 18.4/600 | 17/400 | 17/400 | 17/400 | 13.6/500 | 18.4/600 | 15.2/600 | 24 24 | 1836 | 55 |
| Résumé | 390x844 | 32/700 | 24/600 | 18.4/600 | 17/400 | 17/400 | 17/400 | 13.6/500 | 18.4/600 | 15.2/600 | 24 24 | 358 | 28 |
| SatPOV (default) | 1440x900 | 30.24/700 | 16.8/600 | 12.48/600 | 15.68/400 | - | 15.68/400 | - | 16.8/600 | 13.6/600 | - | 1377 | 83 |
| SatPOV (default) | 1920x1080 | 32/700 | 16.8/600 | 12.48/600 | 15.68/400 | 10.88/400 | 15.68/400 | 10.88/400 | 16.8/600 | 13.6/600 | 8.8 12.8 | 1836 | 38-110 |
| SatPOV (default) | 390x844 | 22.4/700 | 16.8/600 | 12.48/600 | 14.4/400 | 10.88/400 | 14.4/400 | 10.88/400 | 16.8/600 | 13.6/600 | 8.8 12.8 | 358 | 38-47 |
| SatPOV (Data and credits) | 1440x900 | 30.24/700 | 24/600 | 18.4/600 | 12.8/400 | 14.72/400 | 17/400 | 12.8/400 | 16.8/600 | 13.6/400 | 17.6 20 | 1377 | 82-91 |
| SatPOV (Data and credits) | 1920x1080 | 32/700 | 24/600 | 18.4/600 | 12.8/400 | 14.72/400 | 17/400 | 12.8/400 | 16.8/600 | 13.6/400 | 17.6 20 | 1836 | 82-91 |
| SatPOV (Data and credits) | 390x844 | 22.4/700 | 24/600 | 18.4/600 | 12.8/400 | 14.72/400 | 17/400 | 12.8/400 | 16.8/600 | 13.6/400 | 17.6 20 | 358 | 39-53 |
| ShopAI (idle) | 1440x900 | 30.24/700 | - | - | 15.68/400 | 12.8/400 | 15.68/400 | 12.8/400 | 17/600 | 15.2/600 | - | 1377 | 57-94 |
| ShopAI (idle) | 1920x1080 | 32/700 | - | - | 15.68/400 | 12.8/400 | 15.68/400 | 12.8/400 | 17/600 | 15.2/600 | - | 1836 | 57-94 |
| ShopAI (idle) | 390x844 | 22.4/700 | - | - | 14.4/400 | 12.8/400 | 14.4/400 | 12.8/400 | 17/600 | 15.2/600 | - | 358 | 38-59 |
| ShopAI (results) | 1440x900 | 30.24/700 | 20.8/600 | 15.68/600 | 15.68/400 | 13.6/400 | 15.68/400 | 13.6/400 | 15.68/600 | 13.6/600 | 0 0 | 1377 | 26-57 |
| ShopAI (results) | 1920x1080 | 32/700 | 20.8/600 | 15.68/600 | 15.68/400 | 13.6/400 | 15.68/400 | 13.6/400 | 15.68/600 | 13.6/600 | 0 0 | 1836 | 26-57 |
| ShopAI (results) | 390x844 | 22.4/700 | 20.8/600 | 15.68/600 | 14.4/400 | 13.6/400 | 14.4/400 | 13.6/400 | 15.68/600 | 13.6/600 | 0 0 | 358 | 26-38 |

Common to every page: radius 6px, 1px border `#deddd6`, page padding above the content 28.8px at 1440 / 32px at 1920 / 20px at 390
(`clamp(1.25rem, 2vw, 2rem)`), one container (1377px of content at 1440, 1836px at 1920, 358px at 390). Card background is white
except the Résumé (`#f6f6f3`). Gap between stacked blocks: Home 22px, ShopAI 16px, Résumé 40px.

### Top 10 inconsistencies

1. **Body text is a different size on every page** (Home 16-24 before, Résumé 17, SatPOV 15.68, ShopAI 15.68; 12.8 in the SatPOV credits).
2. **Home text followed the card's height** (20-24px, up to 26px labels), far above every other page (cqh-driven sizes with a 24px cap).
3. **Page titles differ**: Home 30-40px, Résumé a fixed 32px (also at 390), the others 22.4-32px by `vw`.
4. **Card padding is unrelated from page to page**: Home 12/20, Résumé 24/24, SatPOV 8.8/12.8 and 17.6/20, ShopAI results 0.
5. **Small text spans 10.88-14.72px** (SatPOV 10.88, ShopAI 12.8-13.6, Résumé 13.6, credits 14.72), and the Résumé's small text is monospace at weight 500.
6. **Card labels (h2/h3) go from 12.48 to 31.2px**; weights are mostly 600 but Home's inline label was 700.
7. **Line spacing**: body text is 1.6 on the Résumé, nav and buttons, headings 1.15; Home used 1.55 (now the `--leading` token).
8. **Line length**: 83-110 chars on SatPOV and 94 on ShopAI against 55 on the Résumé; Home was 40-67 (target 45-80).
9. **Buttons**: 13.6px (SatPOV), 15.2px (nav, ShopAI, Résumé, 404): two sizes for the same control.
10. **Spacing between blocks** is 16, 22 and 40px with no common scale.

## Phase 2: the shared tokens (`src/styles/tokens.css`)

| Token | Value | Role |
|---|---|---|
| `--text-body` | 16px | running text on a page |
| `--text-card` | 17px (18px from 1920px, never above) | text inside a card, and a lead paragraph |
| `--text-small` | 14px | captions, buttons, notes |
| `--text-label` | 18px, weight `--label-weight` 600 | card headings and row labels |
| `--text-title` | `clamp(1.75rem, 2cqw, 2.25rem)`, weight 700 | the page title (cqw: 1% of the content width) |
| `--text-stat` | `clamp(1.75rem, 2.4cqw, 2.75rem)` | the big numerals of a stat tile (mono): SatPOV's Latest run tiles |
| `--leading` | 1.55 | line height for text |
| `--space-1`...`--space-6` | 4, 8, 16, 24, 32, 48px | spacing scale |
| `--card-pad` | `clamp(20px, 2.2cqw, 32px)` | card padding, all sides |

They are applied on **Home only**. The other pages keep their own styles (see Follow-ups).

## Phase 3: Home v3.1

Same structure as v3 (49% / 2% / 49% columns, title over the left column only, system at the top of the right column with its top on the
title's, planet card under it with the name left and the Open pill right; stacked below 1280px as title, system, planet card, Background,
About). All Home text is on the tokens: no `cqh` or fill-driven sizes and no 24px cap. Content fills the space instead of the type:

- Background and About are label | text rows with hairlines (Experience, Focus, Education; Purpose, Backend, What it shows, Stack). Spare
  height becomes equal padding above and below each row.
- Both columns stretch to one height. If the left is taller, the system grows (to 0.32 Wc at most).
- Under 880px of window height (from 1280px wide) a compact cut of the copy shows and the Stack row is hidden, at the same type size, so
  1280x720 and 1366x768 do not scroll.
- `--home-card-est` was re-measured: 13.4rem.

Measured by `npm run check:layout` (see the script header for the method and the PR for the full table):

| Window | page / window | Background fill (h, v) | About fill (h, v) | Planet card fill (h, v) | chars/line | system (Wc) | row padding |
|---|---|---|---|---|---|---|---|
| 1280x720 | 720 / 720 | 0.93, 0.97 | 0.95, 0.97 | 1.00, 0.98 | 46-71 | 0.401 | 5.8px |
| 1366x768 | 768 / 768 | 0.96, 0.94 | 0.98, 0.95 | 1.00, 0.98 | 45-74 | 0.423 | 11.7px |
| 1440x900 | 900 / 900 | 0.97, 0.97 | 1.00, 0.98 | 1.00, 0.99 | 49-79 | 0.490 | 6.7px |
| 1920x1080 | 1080 / 1080 | 0.96, 0.93 | 0.98, 0.95 | 1.00, 0.98 | 68-79 | 0.490 | **17.8px** |

Home body 16px against the other pages' body text: Résumé 17, SatPOV 15.68, ShopAI 15.68 (all within 1px).

### Not met

- **1920x1080 row padding is 17.8px, over the 16px the brief allows.** The system is already at its 0.32 Wc maximum and the cards are
  taller than their text needs at the 18px card size. It is listed in `scripts/check-layout.expected.json` and reported, not hidden.

## Rolled out to the other pages (PRs #52, #53 and the SatPOV PR)

Résumé, 404, ShopAI and SatPOV are now on the tokens; `npm run check:layout` (style mode) asserts it at 1280x720, 1440x900, 1920x1080 and 390x844. The Phase 1 tables above are the "before". Final values, as measured:

| Page | h1 | body | smallest text | card padding | chars/line (desktop) |
|---|---|---|---|---|---|
| Home | 28-36 / 700 | 16 body, 17-18 card | 14 | 26.9-32 | 46-79 |
| Résumé | 28-36 / 700 | 17-18 (card token) | 14 | 26.9-32 | 49-60 |
| ShopAI idle / results | 28-36 / 700 | 16 | 14 | 26.9-32 (results) | 55-74 |
| SatPOV | 28-36 / 700 | 16 | 12 (listed below), the rest 14 | 8.8/12.8 header cards (listed below) | 69-76 |
| SatPOV Data and credits | 28-36 / 700 | 17-18 | 12 (credits line under the map) | 26.9-32 | 59-74 (41-53 at 1440) |
| 404 | 28-36 / 700 | - | 15.2 | - | - |

What changed per page is in each PR. Shared pieces: `.page-title` and `.page-lede` (16px, 34em) in `PageHeader.css`; the eyebrow is 14px; `.page-container.is-scaled` makes a page's container a size container so the `cqw` tokens work (SatPOV puts it on the header and on the credits container, not on the container that holds the map, because a size container would hold the full-screen map's `position: fixed`). The Résumé card background stays `#f6f6f3` on purpose.

### Exceptions (all in `scripts/check-layout.expected.json`, with reasons)

- **Home 1920x1080 row padding** 17.8px (limit 16): the system is at its maximum height.
- **SatPOV text under 14px:** the 12px floor (`--sat-dense`) is used for the header's Latest run / Risk breakdown notes (`.sat-note`) and the one-line credits under the map (`.globe-credits`); at 14px they push the clock bar below the fold at 1440x900. Labels drawn over the Sky view (rings, bodies, constellations, selected) also keep 12px so they do not collide; they are only on screen in the Sky view. Every other control and readout, including buttons (13.6 -> 14), is 14px.
- **SatPOV header cards** (Latest run tiles, Risk breakdown) keep their compact padding: at `--card-pad` (30px) the header grows about 50px and the controls bar and clock fall below the fold at 1440x900, where the map is already at its 420px floor.
- **SatPOV credits at 1440x900:** one ragged line of 41 characters in a three-column list (the columns average 55).
- **SatPOV at 1280x720** already did not fit the window (the map is at its 420px floor); it is about 55px taller now (credits line bottom 940 vs 882).
- Not checkable here: the Satellite (POV) view and anything that needs the live run data; the run data does not load in the headless check, so those panels were converted by the same rule (14px, no change to the viewer) but not measured.

### Left for later

- SatPOV's tool panel could drop the 12px floor if the header were made shorter (for example the Latest run notes moved into a tooltip); that is a layout change, so it was not done.
- The `h2` section headings (Résumé 24px, ShopAI Saved 18px, SatPOV 18px) are not a token; the scale has no `h2` role.

## Fixes after the rollout (SatPOV header, ShopAI grid)

- **New token `--text-stat`** = `clamp(1.75rem, 2.4cqw, 2.75rem)`. The first value tried, `2.2cqw`, gave only 1.40x the old numerals at 1440 wide (the brief wanted 1.5x), so it is `2.4cqw` (33px at 1440, 29px at 1280, 44px from about 1900).
- **SatPOV header** (from 1100px): the title block is as wide as its content (up to 46% of the header, 44% under 1300px), and the stats panel starts one gap (`clamp(24px, 2.2cqw, 48px)`) after it and takes the rest. The panel is as tall as the title block (the stat tiles stretch), so the header is the same height as before at 1280, 1366 and 1440 and the clock bar did not move at 1440x900. Risk breakdown is 40% of the panel. The title row is now a column (title, then the chips) so the block has one width at every size. Tile padding is slightly tighter and the numerals' letter-spacing is -0.065em so "0.02 km" stays on one line at 1366-1440; at 1280 the same text wraps at the space only if it must.
- **ShopAI** (from 1100px): Home's grid, two 49% columns with 2% between. Left: title block, form (input fills the column), chips, usage and status lines. Right: a white About card (`--card-pad`, heading in `--text-label`, label | text rows with hairlines in `--text-card`, text at most 36em) whose top is the title's top. The words are the old notice split in four (`ABOUT_ROWS` in `src/shop/copy.ts`; `LIMITATIONS_NOTICE` is built from them and unchanged). With results, the grid runs the full width below. The shop starts at 1100px, not 1280 like Home, as the brief asked; its left column holds only the form, so it is not squeezed.
- **Other windows**: the style check now also runs at 1366x768, 2000x1100 and 2560x1440. That showed lines over 80 characters on Home's cards at 2000 and 2560 (rows now stop at 36em) and in the SatPOV credits (now two columns up to 1700px wide, three beyond, capped so a column is about 75 characters).
- **Exceptions** are the ones listed above, now at the extra sizes. The 1440x900 credits exception is gone.
- **Globe "Couldn't load the latest run" on a preview**: not a code bug. The globe fetches the objects file straight from the public bucket (`https://satellite-conjunction-screening.fly.storage.tigris.dev/objects/current.json`, `src/globe/data.ts`), a cross-origin request, and the bucket answers `Access-Control-Allow-Origin` only for the allowed origins (`http://localhost:5173` yes; a `*.vercel.app` preview origin and `https://example.com` get none), so the browser blocks it. The stat tiles use the same-origin `/api/satellite/summary` function, which fetches on the server, so they load. Same cause in the headless checks: `http://127.0.0.1:<port>` fails, `http://localhost:5173` loads the globe.
