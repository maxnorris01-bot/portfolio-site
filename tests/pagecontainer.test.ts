import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')

const pages = ['App.tsx', 'pages/Home.tsx', 'pages/Resume.tsx', 'pages/SatelliteTool.tsx', 'shop/ShopView.tsx', 'components/NavBar.tsx']

test('every page, the nav and the footer use the one page container; the old per-page containers are gone', () => {
  for (const f of pages) {
    const text = src(f)
    assert.match(text, /page-container/, f)
    assert.doesNotMatch(text, /className="container|'container |sat-wide|is-wide/, f)
  }
  assert.doesNotMatch(src('index.css'), /\n\.container \{/)
  assert.doesNotMatch(src('styles/tokens.css'), /--content-width|--gutter:/)
  assert.match(src('App.tsx'), /site-footer page-container/)
})

test('every page with a header uses PageHeader (one h1 each; Home has its own title block); the Resume keeps its masthead so printing is unchanged', () => {
  for (const f of ['App.tsx', 'shop/ShopView.tsx']) assert.match(src(f), /<PageHeader/, f)
  // SatPOV lays its title block out as the flat children of its left column, with the same title class.
  assert.match(src('pages/SatelliteTool.tsx'), /<h1 className="page-title">/)
  // Home keeps its own title block (one visible h1 over the left column), not PageHeader.
  assert.match(src('pages/Home.tsx'), /<h1 className="home-title">/)
  assert.match(src('components/PageHeader.tsx'), /<h1 className="page-title">/)
  for (const f of pages) assert.equal((src(f).match(/<h1[ >]/g) ?? []).length <= 1, true, f)
  assert.match(src('pages/Resume.tsx'), /<h1 className="resume-name">Max Norris<\/h1>/)
})

test('the header: the shared title token, its other type scale, spacing and two-column breakpoint', () => {
  const css = src('components/PageHeader.css')
  assert.match(css, /\.page-title \{[^}]*font-size: var\(--text-title\)[^}]*font-weight: var\(--title-weight\)[^}]*letter-spacing: -0\.02em/s)
  assert.match(css, /margin-bottom: clamp\(0\.6rem, 1vw, 0\.9rem\)/)
  assert.match(css, /@media \(min-width: 1100px\)/)
  assert.match(css, /clamp\(32rem, 50%, 58rem\)/)
  // Prose keeps a reading width: the lead is capped except where a page opts out.
  assert.match(css, /\.page-lede \{[^}]*font-size: var\(--text-body\)[^}]*line-height: var\(--leading\)/s)
  assert.match(css, /\.page-header \.page-lede \{\s*max-width: 34em/)
  assert.match(src('styles/tokens.css'), /--measure-text: 90ch/)
})

test('the page padding under the site header is the one the tool page had', () => {
  assert.match(src('index.css'), /\.page \{[^}]*padding: clamp\(1\.25rem, 2vw, 2rem\) 0 clamp\(2rem, 5vw, 4rem\)/s)
})

test('the Resume has no print-only rules to keep, and its masthead markup is as it was', () => {
  const css = src('pages/Resume.css')
  assert.doesNotMatch(css, /@media print/)
  assert.match(src('pages/Resume.tsx'), /<aside className="resume-rail">/)
})

test('printing keeps the old container width, gutters and page padding', () => {
  const css = src('index.css')
  const print = css.slice(css.indexOf('@media print'))
  assert.match(print, /\.page \{\s*padding: clamp\(2\.5rem, 6vw, 5rem\) 0/)
  assert.match(print, /\.page-container \{\s*max-width: 1120px;\s*padding-inline: clamp\(16px, 4vw, 40px\)/)
})

test('the Résumé and the 404 page are on the shared scale: tokens for the title, text, small text, card padding and block gaps; print keeps its own block', () => {
  const css = src('pages/Resume.css')
  assert.match(css, /\.resume-name \{\s*font-size: var\(--text-title\);\s*font-weight: var\(--title-weight\)/)
  assert.match(css, /\.resume \{\s*font-size: var\(--text-card\)/)
  assert.match(css, /\.resume-rail \{\s*padding: var\(--card-pad\)/)
  assert.match(css, /\.resume-main \{[^}]*gap: var\(--space-5\)[^}]*padding: var\(--card-pad\)/s)
  assert.match(css, /\.resume-job-dates \{[^}]*font-size: var\(--text-small\)/s)
  assert.doesNotMatch(css, /font-size: [\d.]+rem/)
  assert.match(src('pages/Resume.tsx'), /page-container is-scaled/)
  assert.match(src('App.tsx'), /page-container is-scaled/)
  assert.match(src('index.css'), /\.page-container\.is-scaled \{\s*container-type: inline-size/)
})

test('the shop page is on the shared scale: body and small text, card headings, card padding on the shell (the picture still bleeds), idle copy under 80 characters a line', () => {
  const css = src('pages/Shop.css')
  assert.match(css, /\.shop \{\s*font-size: var\(--text-body\)/)
  assert.match(css, /\.shop-card \{[^}]*padding: var\(--card-pad\)/s)
  assert.match(css, /\.shop-thumb \{\s*[^}]*margin: calc\(-1 \* var\(--card-pad\)\) calc\(-1 \* var\(--card-pad\)\) 0/s)
  assert.match(css, /\.shop-card-title \{[^}]*font-size: var\(--text-label\)/s)
  assert.match(css, /\.shop-grid \{[^}]*gap: var\(--space-3\)/s)
  // The pipeline: five stage tiles with arrows (two by two under 1100px, one on a phone), the guardrails card, and no About card or two-column grid.
  assert.match(css, /\.shop-stages \{[^}]*grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/s)
  assert.match(css, /\.shop-stage \{[^}]*padding: var\(--space-3\) var\(--card-pad\)/s)
  assert.match(css, /@media \(max-width: 1099px\) \{\s*\.shop-stages \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
  assert.doesNotMatch(css, /shop-about|grid-template-areas/)
  assert.doesNotMatch(css, /font-size: 0\.\d+rem/)
  assert.match(src('shop/ShopView.tsx'), /page-container is-scaled shop/)
})

test('SatPOV is on the shared scale: small text is the token (12px floor only for the listed dense readouts), credits in columns, the header and credits are size containers', () => {
  const tool = src('pages/SatelliteTool.css')
  const globe = src('components/SatelliteGlobe.css')
  for (const css of [tool, globe, src('components/ConjunctionsMenu.css')]) assert.doesNotMatch(css, /font-size: 0\.(?:[0-7]\d*|8[0-6]\d*)rem/, 'no sub-14px sizes written out')
  assert.match(tool, /--sat-dense: 12px/)
  assert.match(tool, /\.sat-credits-body \{[^}]*font-size: var\(--text-card\)[^}]*column-count: 3/s)
  // Two columns 36 | 3 | 61 from 1280px (32 | 3 | 65 from 1600px); the page layout is a size container only there (a size container holds a fixed child: the CSS full screen).
  assert.match(tool, /@media \(min-width: 1280px\) \{[^@]*\.sat-layout \{\s*display: grid;\s*grid-template-columns: minmax\(0, 36fr\) minmax\(0, 3fr\) minmax\(0, 61fr\);\s*grid-template-rows: minmax\(0, 1fr\) auto;\s*align-items: stretch;\s*container-type: inline-size/)
  // The left column is one flex column: gaps grow to 32px, the tiles to 1.8x, the Risk rows to 44px, then one flexible gap.
  assert.match(tool, /\.sat-gap \{\s*flex: 1000 1 0;\s*min-height: var\(--space-2\);\s*max-height: var\(--space-5\)/)
  assert.match(tool, /\.sat-left \.sat-stats \{\s*flex: 250 1 auto;\s*max-height: calc\(1\.8 \*/)
  assert.match(tool, /\.sat-left \.sat-risk-card \.sat-risk-row \{\s*flex: 1 1 auto;\s*max-height: 44px/)
  assert.match(tool, /grid-template-rows: minmax\(0, 1fr\) auto/)
  assert.match(tool, /@media \(min-width: 1600px\) \{\s*\.sat-layout \{\s*grid-template-columns: minmax\(0, 32fr\) minmax\(0, 3fr\) minmax\(0, 65fr\)/)
  assert.match(tool, /min-height: calc\(100svh - 74\.1px - clamp\(1\.25rem, 2vw, 2rem\)\)/)
  assert.match(tool, /\.sat-step \{[^}]*padding: var\(--card-pad\)/s)
  assert.match(globe, /\.globe-history-event \{[^}]*padding: var\(--card-pad\)/s)
  assert.match(src('pages/SatelliteTool.tsx'), /page-container is-scaled/)
  // Not on the page container that holds the map: a size container would hold the full-screen map's fixed position.
  assert.doesNotMatch(src('pages/SatelliteTool.tsx'), /page-container is-scaled">\s*<PageHeader/)
})
