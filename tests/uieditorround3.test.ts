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
