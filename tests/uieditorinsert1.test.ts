import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { INSERT_ITEMS, PLACEMENT, insertEdit, lineBox, zoneOf } from '../src/ui-editor/place.ts'
import { labels, messages } from '../src/data/uiEditor.ts'

const root = new URL('..', import.meta.url).pathname
const read = (p: string) => readFileSync(join(root, p), 'utf8')

// ---- insert round 1, stage 1: Insert and placing, text editing, Delete ----

test('Insert offers the five things in the brief\'s order, each with the engine\'s kind', () => {
  assert.deepEqual(INSERT_ITEMS.map((i) => i.label), ['Text box', 'Rectangle', 'Rounded rectangle', 'Ellipse', 'Button'])
  assert.deepEqual(INSERT_ITEMS.map((i) => i.kind), ['text', 'rect', 'rounded', 'ellipse', 'button'])
})

test('the pointer\'s zone: the top third is before, the bottom third after, the middle inside; over the empty page it is inside the body', () => {
  assert.equal(zoneOf(0, false), 'before')
  assert.equal(zoneOf(0.08, false), 'before')
  assert.equal(zoneOf(0.5, false), 'inside')
  assert.equal(zoneOf(0.92, false), 'after')
  assert.equal(zoneOf(1, false), 'after')
  assert.equal(zoneOf(0.05, true), 'inside')
  assert.deepEqual(PLACEMENT, { before: 'before', after: 'after', inside: 'last-child' })
})

test('the insert edit is one `insert` with the kind, the anchor and the placement (no Link, no environment)', () => {
  assert.deepEqual(insertEdit('rect', 7, 'after'), { op: 'insert', kind: 'rect', anchor: 7, placement: 'after' })
  assert.deepEqual(insertEdit('text', 3, 'inside'), { op: 'insert', kind: 'text', anchor: 3, placement: 'last-child' })
})

test('the insertion line sits across the hovered element\'s top or bottom edge (centred on it), or is its whole box when inside', () => {
  const box = { left: 10, top: 100, width: 300, height: 80 }
  assert.deepEqual(lineBox(box, 'before'), { left: 10, width: 300, top: 98.5, height: 3 })
  assert.deepEqual(lineBox(box, 'after'), { left: 10, width: 300, top: 178.5, height: 3 })
  assert.deepEqual(lineBox(box, 'inside'), box)
})

test('the names are exactly the brief\'s, each tooltip starts with a verb, and a disabled Insert says why', () => {
  assert.equal(labels.insert, 'Insert')
  assert.equal(labels.editText, 'Edit text')
  assert.equal(labels.deleteElement, 'Delete')
  assert.equal(labels.elementText, 'Element text')
  for (const tip of [labels.insertTip, labels.editTextTip, labels.deleteTip]) assert.match(tip, /^(Open|Change|Remove) /)
  assert.match(labels.insertTipSvg, /SVG/)
  assert.match(labels.insertTipTablet, /Tablet/)
  assert.match(messages.placing('rectangle'), /Escape/)
})

test('the page: Insert is a menu button in the quick bar right after Redo; Edit text and Delete are in the selection strip; the line and the text box are in the overlay, not the preview', () => {
  const tool = read('src/ui-editor/UiEditorTool.tsx')
  const bar = tool.slice(tool.indexOf('<div className="ue-bar"'), tool.indexOf('{confirm && ('))
  assert.ok(bar.indexOf('icon="redo"') < bar.indexOf('name={labels.insert}') && bar.indexOf('name={labels.insert}') < bar.indexOf('icon="review"'), 'Insert is after Redo and before Review unlinked')
  const ribbon = read('src/ui-editor/Ribbon.tsx')
  const strip = ribbon.slice(ribbon.indexOf('data-ribbon-strip'), ribbon.indexOf('data-ribbon-panel'))
  for (const part of ['labels.editText', 'labels.deleteElement', 'disabled={!canDelete}']) assert.ok(strip.includes(part), part)
  const stage = read('src/ui-editor/Stage.tsx')
  for (const hook of ['data-insert-line', 'data-text-editor', 'data-placing', 'data-active', 'data-zone']) assert.ok(stage.includes(hook), hook)
  assert.doesNotMatch(stage, /preview\.doc\.(createElement|body\.append)/, 'nothing of the editor is put into the preview document')
})

test('an insert, a text edit and a Delete are content edits: they carry no Link and no environment, and the engine decides before anything is touched', () => {
  const tool = read('src/ui-editor/UiEditorTool.tsx')
  const region = tool.slice(tool.indexOf('// ---- insert, text and Delete'), tool.indexOf('const onMove = '))
  assert.match(region, /trialEdit\(s, \{ op: 'text'/)
  assert.match(region, /run\(\{ op: 'text', target: t, text \}/)
  assert.match(region, /run\(\{ op: 'remove', target: selIndex \}/)
  assert.doesNotMatch(region, /scope\(\)/, 'no Link or environment on the new kinds')
  const session = read('src/ui-editor/session.ts')
  assert.match(session, /export function trialEdit/)
  assert.match(session, /engine\.applyEdit\(s\.preview\.model, edit, s\.preview\.probe, s\.state\)/)
})

test('Escape cancels placing, F2 opens the text, and Delete is only the preview\'s key (the text box and the fields keep their own keys)', () => {
  const tool = read('src/ui-editor/UiEditorTool.tsx')
  assert.match(tool, /e\.key === 'Escape'\) latestKeys\.current\.cancelPlacing\(\)/)
  assert.match(tool, /e\.key === 'F2'/)
  const stage = read('src/ui-editor/Stage.tsx')
  assert.match(stage, /\(e\.key === 'Delete' \|\| e\.key === 'Backspace'\) && e\.target === e\.currentTarget/)
  assert.match(stage, /e\.stopPropagation\(\) \/\/ no nudge, no Delete of the element, while typing/)
})
