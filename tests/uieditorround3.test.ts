import test from 'node:test'
import assert from 'node:assert/strict'
import { changeOrder, fileMark, fileToShow, offsetOfFile, stepChange } from '../src/ui-editor/diff.ts'

// ---- the code view over several files (round 3, the bug: a font size edit is written to the stylesheet, the page file was showing, and nothing was marked) ----

test('the File selector marks a changed file with its number of changes, and leaves an unchanged file bare', () => {
  assert.equal(fileMark('landing.css', 1), 'landing.css (1)')
  assert.equal(fileMark('landing.css', 12), 'landing.css (12)')
  assert.equal(fileMark('landing.html', 0), 'landing.html')
})

test('every change of every file is one walk: files in selector order, changes in line order', () => {
  const order = ['landing.html', 'landing.css']
  const walk = changeOrder(order, { 'landing.html': 2, 'landing.css': 1 })
  assert.deepEqual(walk, [
    { file: 'landing.html', index: 1 },
    { file: 'landing.html', index: 2 },
    { file: 'landing.css', index: 1 },
  ])
  assert.deepEqual(changeOrder(order, { 'landing.html': 0, 'landing.css': 3 }).map((c) => `${c.file}:${c.index}`), ['landing.css:1', 'landing.css:2', 'landing.css:3'])
  assert.deepEqual(changeOrder(order, {}), [])
})

test('the counter walks all the files and wraps: Next after the last change is the first, Previous before the first is the last', () => {
  const n = changeOrder(['a.html', 'a.css'], { 'a.html': 1, 'a.css': 2 }).length
  assert.equal(n, 3)
  const seen: number[] = []
  let k = 0
  for (let i = 0; i < 4; i++) {
    k = stepChange(k, n, 1)
    seen.push(k)
  }
  assert.deepEqual(seen, [1, 2, 3, 1])
  assert.equal(stepChange(1, n, -1), 3)
})

test('a file\'s own changes are numbered after the changes of the files before it', () => {
  const order = ['landing.html', 'landing.css']
  const counts = { 'landing.html': 2, 'landing.css': 1 }
  assert.equal(offsetOfFile(order, counts, 'landing.html'), 0)
  assert.equal(offsetOfFile(order, counts, 'landing.css'), 2)
})

test('after an edit the view moves to the first changed file only when the shown file has no changes, and never after a file was chosen by hand', () => {
  const order = ['landing.html', 'landing.css']
  // The reported bug: landing.html shows, the edit went to landing.css.
  assert.equal(fileToShow('landing.html', order, { 'landing.html': 0, 'landing.css': 1 }, false), 'landing.css')
  // A shown file that has changes of its own stays, even when an earlier or later file has some too.
  assert.equal(fileToShow('landing.css', order, { 'landing.html': 2, 'landing.css': 1 }, false), 'landing.css')
  assert.equal(fileToShow('landing.html', order, { 'landing.html': 2, 'landing.css': 1 }, false), 'landing.html')
  // A hand-picked file stays even with no changes of its own.
  assert.equal(fileToShow('landing.css', order, { 'landing.html': 2, 'landing.css': 0 }, true), 'landing.css')
  // Nothing changed anywhere: nothing moves.
  assert.equal(fileToShow('landing.html', order, { 'landing.html': 0, 'landing.css': 0 }, false), 'landing.html')
})

// ---- the quick bar's look does not depend on the view (round 3, item 3) ----
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
const root = new URL('..', import.meta.url).pathname
const read = (p: string) => readFileSync(join(root, p), 'utf8')

test('the tool\'s buttons have no colour fade, so a view button that has just become selected is never caught half way (grey), in Tablet or anywhere', () => {
  const css = read('src/ui-editor/UiEditorTool.css')
  assert.match(css, /\.ue-tool \.btn \{[^}]*transition: none/)
  assert.match(css, /\.ue-tool \.btn\.ue-icon\[aria-pressed='true'\] \{[^}]*background: var\(--color-navy\)/)
})

test('Samples, the view buttons, Copy code, Download and the File select are never disabled by the view or by a rebuild', () => {
  const tool = read('src/ui-editor/UiEditorTool.tsx')
  const bar = tool.slice(tool.indexOf('<div className="ue-bar"'), tool.indexOf('{confirm && ('))
  for (const part of ['labels.samplesButton', 'icon={v.icon}', 'labels.copy}', 'labels.download}', 'id="ue-file"']) assert.ok(bar.includes(part), part)
  const around = (token: string) => bar.slice(bar.lastIndexOf('<', bar.indexOf(token)), bar.indexOf('>', bar.indexOf(token) + 60) + 40)
  for (const token of ['labels.copy}', 'labels.download}', 'icon={v.icon}']) assert.doesNotMatch(around(token), /disabled/, token)
  assert.doesNotMatch(bar.slice(bar.indexOf('id="ue-file"'), bar.indexOf('id="ue-file"') + 120), /disabled/)
})

// ---- the grid and snap (round 3, item 4) ----
import { DEFAULT_SPACING, gridLines, nearestLine, snapBox, snapMove, snaps } from '../src/ui-editor/snap.ts'

test('the grid starts at 8 px, off and not remembered: the page keeps no storage for it', () => {
  assert.equal(DEFAULT_SPACING, 8)
  const tool = read('src/ui-editor/UiEditorTool.tsx')
  assert.match(tool, /useState\(false\)/)
  assert.doesNotMatch(tool + read('src/ui-editor/Ribbon.tsx') + read('src/ui-editor/Stage.tsx'), /localStorage|sessionStorage|indexedDB/)
})

test('snap rounds to the NEAREST grid line, not down, and a tie goes up', () => {
  assert.equal(nearestLine(127, 8), 128)
  assert.equal(nearestLine(123, 8), 120)
  assert.equal(nearestLine(124, 8), 128)
  assert.equal(nearestLine(110.3, 8), 112)
  assert.equal(nearestLine(0, 4), 0)
  assert.equal(nearestLine(1000, 32), 992)
  assert.equal(nearestLine(1010, 32), 1024)
})

test('a drag-move of 37 px from (90, 73.3) puts the top-left on (128, 112), reached exactly with a fractional offset', () => {
  const m = snapMove({ left: 90, top: 73.296875, dx: 37, dy: 37, spacing: 8 })
  assert.equal(m.dx, 38)
  assert.equal(m.dy, 38.7031)
  assert.ok(Math.abs(73.296875 + m.dy - 112) < 1e-3)
  // Moving back (negative) and at every spacing
  assert.equal(snapMove({ left: 128, top: 112, dx: -37, dy: -37, spacing: 8 }).dx, -40)
  for (const s of [4, 8, 16, 32]) {
    const r = snapMove({ left: 13.4, top: 29.9, dx: 21, dy: 17, spacing: s })
    assert.ok(Math.abs(((13.4 + r.dx) % s) + s) % s < 1e-3 || Math.abs((((13.4 + r.dx) % s) + s) % s - s) < 1e-3, `left on a ${s} px line`)
  }
})

test('a resize puts the dragged edges on grid lines and leaves the others where they are', () => {
  const box = { left: 910, top: 64, width: 322.4, height: 180 }
  assert.deepEqual(snapBox(box, 'e', 8), { left: 910, top: 64, width: 322, height: 180 }) // 1232.4 -> 1232
  const se = snapBox({ left: 90, top: 191.6875, width: 230, height: 45 }, 'se', 8)
  assert.equal(se.left + se.width, 320)
  assert.equal(se.top + se.height, 240)
  assert.equal(se.left, 90)
  const w = snapBox({ left: 93, top: 10, width: 100, height: 20 }, 'w', 8) // the west edge 93 -> 96, the east edge stays at 193
  assert.equal(w.left, 96)
  assert.equal(w.left + w.width, 193)
  assert.equal(snapBox({ left: 10, top: 10, width: 0.2, height: 5 }, 'e', 8).width >= 1, true)
})

test('Alt held during a drag, an SVG element or Snap off each turn snapping off', () => {
  assert.equal(snaps({ snapOn: true, html: true, alt: false }), true)
  assert.equal(snaps({ snapOn: true, html: true, alt: true }), false)
  assert.equal(snaps({ snapOn: true, html: false, alt: false }), false)
  assert.equal(snaps({ snapOn: false, html: true, alt: false }), false)
})

test('the grid lines are every spacing from 0 and cover the extent', () => {
  assert.deepEqual(gridLines(32, 8), [0, 8, 16, 24, 32])
  assert.equal(gridLines(1280, 16).length, 81)
  assert.equal(gridLines(100, 32).at(-1), 96)
  assert.deepEqual(gridLines(10, 0), [])
})

test('the grid is drawn by the page above the preview (a host element), never inside the previewed document', () => {
  const stage = read('src/ui-editor/Stage.tsx')
  assert.match(stage, /data-grid-overlay/)
  assert.doesNotMatch(stage, /createElement|appendChild|insertAdjacent|innerHTML/, 'nothing is added to the previewed document')
  const css = read('src/ui-editor/UiEditorTool.css')
  assert.match(css, /\.ue-grid \{[^}]*pointer-events: none/)
  assert.match(css, /\.ue-grid \{[^}]*position: absolute/)
})

// ---- the Limits sentence about unscaled values (round 3, item 5) ----
import { limits } from '../src/data/uiEditor.ts'

test('the Limits sentence about values left as written no longer promises a note: the engine gives none for min and max sizes, aspect-ratio or a percentage width it leaves alone', () => {
  const s = limits.items.find((i) => /aspect-ratio/.test(i)) ?? ''
  assert.doesNotMatch(s, /with a note when/)
  assert.match(s, /does not always say so/)
  for (const part of ['min-width', 'max-width', 'min-height', 'max-height', 'aspect-ratio', 'percentages', 'viewport units', 'left as the page wrote them']) assert.ok(s.toLowerCase().includes(part), part)
})
