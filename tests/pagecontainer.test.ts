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

test('every page with a header uses PageHeader (one h1 each); the Resume keeps its masthead so printing is unchanged', () => {
  for (const f of ['App.tsx', 'pages/Home.tsx', 'pages/SatelliteTool.tsx', 'shop/ShopView.tsx']) assert.match(src(f), /<PageHeader/, f)
  assert.match(src('components/PageHeader.tsx'), /<h1 className="page-title">/)
  for (const f of pages) assert.equal((src(f).match(/<h1[ >]/g) ?? []).length <= 1, true, f)
  assert.match(src('pages/Resume.tsx'), /<h1 className="resume-name">Max Norris<\/h1>/)
})

test('the header is the SatPOV header: its type scale, spacing and two-column breakpoint', () => {
  const css = src('components/PageHeader.css')
  assert.match(css, /\.page-title \{[^}]*font-size: clamp\(1\.45rem, 2\.1vw, 2rem\)[^}]*font-weight: 700[^}]*letter-spacing: -0\.02em/s)
  assert.match(css, /\.page-lede \{[^}]*font-size: 0\.98rem[^}]*line-height: 1\.45/s)
  assert.match(css, /margin-bottom: clamp\(0\.6rem, 1vw, 0\.9rem\)/)
  assert.match(css, /@media \(min-width: 1100px\)/)
  assert.match(css, /clamp\(32rem, 50%, 58rem\)/)
  // Prose keeps a reading width: the lead is capped except where a page opts out.
  assert.match(css, /\.page-header:not\(\.is-lead-full\) \.page-lede \{\s*max-width: var\(--measure-lead\)/)
  assert.match(src('styles/tokens.css'), /--measure-lead: 70ch/)
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
