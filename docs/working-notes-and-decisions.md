# Working notes and decisions

## 2026-11-08: the site header is frozen on every page
The header (`header.nav`, `src/components/NavBar.css`) is `position: sticky; top: 0; z-index: 40` on every route, SatPOV included, so the links and Contact stay reachable on long pages. It keeps its solid background and bottom line, and it stays in normal flow, so no page measurement moved (SatPOV's page height and map box are identical before and after). The z-index sits above page content (the Show conjunctions menu is 30, the usage popover 20) and below the modals (Refine and Contact, 100) and the satellite full-screen view (1000). The Contact modal is already rendered into `document.body` through a portal, so the header's stacking context does not trap it.

The header wraps on narrow windows, so its height varies: `NavBar` publishes it as `--site-header-height` (a ResizeObserver on the header). The two `block: 'start'` scroll-to targets (`.shop-results`, `.sat-tool`) use it as `scroll-margin-top`. The `block: 'center'` full-screen scroll and the clarify panel's `block: 'nearest'` were left alone. `tests/shopnav.test.ts` fails if the header stops being sticky.
