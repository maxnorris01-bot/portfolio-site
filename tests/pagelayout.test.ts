import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  COMPACT_STORAGE_KEY,
  STACK_BREAKPOINT_PX,
  gutterPx,
  isCompactKey,
  isTyping,
  loadCompact,
  saveCompact,
  sidebarWidthPx,
  stageHeightPx,
} from '../src/globe/pagelayout.ts'

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')
const memory = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init))
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}
const blocked = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('QuotaExceededError')
  },
}

test('the panel is clamp(300px, 24vw, 420px) and the gutter clamp(16px, 2.2vw, 48px)', () => {
  assert.equal(sidebarWidthPx(1000), 300)
  assert.ok(Math.abs(sidebarWidthPx(1440) - 345.6) < 1e-9)
  assert.equal(sidebarWidthPx(1920), 420)
  assert.equal(sidebarWidthPx(2560), 420)
  assert.equal(gutterPx(390), 16)
  assert.ok(Math.abs(gutterPx(1280) - 28.16) < 1e-9) // a laptop: 24-32
  assert.equal(gutterPx(2560), 48)
  // The same numbers are in the CSS.
  const css = src('components/SatelliteGlobe.css')
  assert.match(css, /--side-w: clamp\(300px, 24vw, 420px\)/)
  // The page, its header and the tool share one gutter and one cap (tokens.css).
  assert.match(src('styles/tokens.css'), /--wide-gutter: clamp\(16px, 2\.2vw, 48px\)/)
  assert.match(src('styles/tokens.css'), /--wide-width: 2500px/)
  // ...and so does every page: one container (index.css) with those two tokens.
  assert.match(src('index.css'), /\.page-container \{[^}]*max-width: var\(--wide-width\)[^}]*padding: 0 var\(--wide-gutter\)/s)
  assert.equal(STACK_BREAKPOINT_PX, 900)
  assert.match(css, /@media \(min-width: 641px\) and \(min-height: 501px\) and \(max-width: 900px\)/)
})

test('the map height: what is left of the window below the header, less the clock row, between a floor and a ceiling', () => {
  assert.equal(stageHeightPx(900, 180, 56, 420, 1500, 16), 648)
  assert.equal(stageHeightPx(1080, 180), 828)
  assert.equal(stageHeightPx(1440, 180), 1188)
  assert.equal(stageHeightPx(720, 220), 428) // a small laptop: just over the floor
  assert.equal(stageHeightPx(600, 220), 420) // shorter than that: the floor, and the page scrolls
  assert.equal(stageHeightPx(4000, 180), 1500) // a very tall window: the ceiling
  // The CSS sums the same terms from the measured top (dvh with a vh fallback).
  const css = src('components/SatelliteGlobe.css')
  assert.match(css, /clamp\(420px, calc\(100vh - var\(--globe-top, 15rem\) - var\(--clock-h\) - var\(--credits-h\) - 0\.6rem\), 1500px\)/)
  assert.match(css, /clamp\(420px, calc\(100dvh - var\(--globe-top, 15rem\)/)
})

test('the C key toggles the compact view; not while typing, not with a modifier, not held down', () => {
  const body = { tagName: 'BODY' }
  assert.equal(isCompactKey({ key: 'c', target: body }), true)
  assert.equal(isCompactKey({ key: 'C', target: body }), true)
  assert.equal(isCompactKey({ key: 'x', target: body }), false)
  assert.equal(isCompactKey({ key: 'c', ctrlKey: true, target: body }), false) // copy
  assert.equal(isCompactKey({ key: 'c', metaKey: true, target: body }), false)
  assert.equal(isCompactKey({ key: 'c', altKey: true, target: body }), false)
  assert.equal(isCompactKey({ key: 'c', repeat: true, target: body }), false)
  assert.equal(isCompactKey({ key: 'c', defaultPrevented: true, target: body }), false)
  // Typing in the Find a star box or the city box: left alone.
  assert.equal(isCompactKey({ key: 'c', target: { tagName: 'INPUT', type: 'search' } }), false)
  assert.equal(isCompactKey({ key: 'c', target: { tagName: 'INPUT', type: 'text' } }), false)
  assert.equal(isCompactKey({ key: 'c', target: { tagName: 'INPUT' } }), false)
  assert.equal(isCompactKey({ key: 'c', target: { tagName: 'TEXTAREA' } }), false)
  assert.equal(isCompactKey({ key: 'c', target: { tagName: 'SELECT' } }), false)
  assert.equal(isCompactKey({ key: 'c', target: { tagName: 'DIV', isContentEditable: true } }), false)
  // A slider, a checkbox or a button doesn't take text: C still toggles from there.
  assert.equal(isCompactKey({ key: 'c', target: { tagName: 'INPUT', type: 'range' } }), true)
  assert.equal(isCompactKey({ key: 'c', target: { tagName: 'INPUT', type: 'checkbox' } }), true)
  assert.equal(isCompactKey({ key: 'c', target: { tagName: 'BUTTON' } }), true)
  assert.equal(isTyping(null), false)
  assert.equal(isTyping(undefined), false)
})

test('the compact view is remembered for the session only, and storage that throws changes nothing', () => {
  const s = memory()
  assert.equal(loadCompact(s), false) // a new session starts with the controls
  saveCompact(true, s)
  assert.equal(s.m.get(COMPACT_STORAGE_KEY), '1')
  assert.equal(loadCompact(s), true)
  saveCompact(false, s)
  assert.equal(loadCompact(s), false)
  assert.equal(loadCompact(blocked), false)
  saveCompact(true, blocked) // no throw
  assert.equal(loadCompact(null), false)
  // sessionStorage, never localStorage: it must not outlive the tab.
  const comp = src('globe/pagelayout.ts')
  assert.match(comp, /sessionStorage/)
  assert.doesNotMatch(comp, /localStorage/)
})

test('the compact toggle: a pressed button with a label and the C shortcut, in and out of full screen, hiding only the column', () => {
  const tsx = src('components/SatelliteGlobe.tsx')
  assert.match(tsx, /className="globe-compact-btn"\s+aria-pressed=\{compact\}\s+aria-keyshortcuts="C"/)
  assert.match(tsx, /if \(isCompactKey\(e\)\) toggleCompact\(\)/)
  const css = src('components/SatelliteGlobe.css')
  assert.match(css, /\.globe\.is-compact \.globe-overlay,\s+\.globe\.is-compact \.globe-controls \{\s+display: none;/)
  // Neither the map's stage nor the clock row nor the credits line is hidden by it.
  assert.doesNotMatch(css, /\.is-compact [^{]*\.(globe-stage|globe-timebar|globe-credits)[^{]*\{\s+display: none/)
  // Reduced motion: the column's fade-in is only for people who haven't asked for less.
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\) \{\s+\.globe-controls,\s+\.globe-overlay \{\s+animation/)
})

test('the layout: one overlay panel over the map with its own scrolling; the stacked block above the map; the clock row attached', () => {
  const css = src('components/SatelliteGlobe.css')
  assert.match(css, /\.globe-overlay \{[^}]*position: absolute;[^}]*max-height: calc\(100% - 1\.5rem\);[^}]*overflow-y: auto;[^}]*backdrop-filter: blur\(10px\)/)
  assert.match(css, /\.globe-controls \{\s+display: none;[^}]*overflow-y: auto;/)
  assert.match(css, /\.globe-timebar \{\s+margin-top: 0;/)
  const tsx = src('components/SatelliteGlobe.tsx')
  // The panels are portalled into the overlay on the map (the block above it when stacked), except on a phone, where they stay over the map.
  assert.match(tsx, /const host = phone \? null : stacked \? sidebarEl : overlayEl/)
  // The mode switch and the compact button are in the row above the map; the overlay is inside the stage.
  assert.ok(tsx.indexOf('{modeSwitch}') < tsx.indexOf('className="globe-stage"'))
  assert.ok(tsx.indexOf('className="globe-stage"') < tsx.indexOf('className="globe-overlay"'))
  // Full screen is an icon on the map in the wide layout (its label stays for assistive tech).
  assert.match(tsx, /<span className="globe-fs-label">Full screen<\/span>/)
  // The Satellite panel's groups.
  for (const h of ['Imagery', 'View', 'Sky', 'Orientation', 'Readout']) assert.match(tsx, new RegExp(`<h3 className="globe-pov-heading">${h}</h3>`), h)
  assert.match(tsx, /Hide today&apos;s imagery/) // the checkbox stays outside the collapsible text
  assert.match(tsx, /<details className="globe-pov-about">[\s\S]*?<\/details>/)
})
