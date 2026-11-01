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

## Follow-ups (not changed in this PR)

Résumé, SatPOV and ShopAI were not touched. To bring them onto the scale:

- **Résumé**: body 17 -> `--text-card`/`--text-body`; h1 fixed 32px -> `--text-title`; small 13.6 mono -> `--text-small`; card padding 24 -> `--card-pad`; block gap 40px -> `--space-5`.
- **SatPOV**: body 15.68 -> `--text-body`; tool-panel text 10.88-12.8px -> `--text-small` (14px is the floor); buttons 13.6 -> 14; credits body 12.8 -> `--text-card`; card padding 8.8/12.8 and 17.6/20 -> `--card-pad`; cut the 83-110 chars/line to 80 or fewer.
- **ShopAI**: body 15.68 -> `--text-body`; small 12.8-13.6 -> `--text-small`; result card labels 15.68 -> `--text-label`; title -> `--text-title`; block gap 16px -> `--space-3`.
- **404**: title -> `--text-title`.
- Use `container-type: inline-size` on `.page-container` for each page that adopts `--text-title` and `--card-pad`, because both use `cqw`.
