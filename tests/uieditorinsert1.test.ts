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
  for (const tip of [labels.insertTip, labels.editTextTip, labels.deleteTip]) assert.match(tip, /^(Open|Edit|Use) /) // verbs of the locked U03 tooltips check (it has no Change, Remove or Delete)
  assert.match(labels.insertTipSvg, /SVG/)
  assert.match(labels.insertTipTablet, /Tablet/)
  assert.match(messages.placing('rectangle'), /Escape/)
})

test('the page: Insert is a menu button in the quick bar right after Redo; Edit text and Delete are in the selection strip; the line and the text box are in the overlay, not the preview', () => {
  const tool = read('src/ui-editor/UiEditorTool.tsx')
  const bar = tool.slice(tool.indexOf('<div className="ue-bar"'), tool.indexOf('{confirm && ('))
  assert.ok(bar.indexOf('icon="redo"') < bar.indexOf('name={labels.insert}') && bar.indexOf('name={labels.insert}') < bar.indexOf('aria-label={labels.view}'), 'Insert is after Redo and before the view group')
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

// ---- insert round 1, stage 2: Comment, pins, the Notes list, Include comments ----
import { HEADER_TEXT, kindOfFile, noteCount, noteRows, stripNotes } from '../src/ui-editor/notes.ts'
import * as engine from '../src/ui-editor/vendor/engine.js'

const PAGE = '<!DOCTYPE html>\n<html>\n<body>\n  <h1 id="a">Hello</h1>\n  <p id="b">Text</p>\n</body>\n</html>\n'

test('the header text is the engine\'s word for word, and the page writes none of its own', () => {
  assert.equal(HEADER_TEXT, 'Exported from UI Editor. Comments starting "NOTE FOR AI:" are the designer\'s instructions for the element that follows. Implement them.')
  assert.doesNotMatch(read('src/ui-editor/UiEditorTool.tsx'), /NOTE FOR AI/, 'the note comments are the engine\'s; the page does not write them')
})

test('stripNotes: a note and the header that own their lines go whole, with the line; a stylesheet is left alone', () => {
  const text = `<!DOCTYPE html>\n<!-- ${HEADER_TEXT} -->\n<html>\n<body>\n  <!-- NOTE FOR AI: shorter -->\n  <h1 id="a">Hello</h1>\n  <p id="b">Text</p>\n</body>\n</html>\n`
  assert.equal(stripNotes(text, 'html'), PAGE)
  assert.equal(stripNotes('/* NOTE FOR AI: x */ a { color: red }', 'css'), '/* NOTE FOR AI: x */ a { color: red }')
  assert.equal(stripNotes(PAGE, 'html'), PAGE, 'nothing to remove: the same bytes')
  assert.equal(stripNotes('<p>x</p> <!-- NOTE FOR AI: n --> <p>y</p>', 'html'), '<p>x</p>  <p>y</p>', 'a note that shares its line goes alone')
})

test('stripNotes leaves a hand-written comment and a comment that only looks like a note', () => {
  const text = `<!DOCTYPE html>\n<!-- keep me -->\n<!--NOTE FOR AI: no space-->\n<p>x</p>\n`
  assert.equal(stripNotes(text, 'html'), text.replace(/<!--NOTE[^\n]*\n/, '<!--NOTE FOR AI: no space-->\n'))
})

test('the file kind by name, the count of notes and the numbered rows', () => {
  assert.equal(kindOfFile('a.svg'), 'svg')
  assert.equal(kindOfFile('a.CSS'), 'css')
  assert.equal(kindOfFile('index.html'), 'html')
  assert.equal(noteCount({ page: null, notes: [] } as never), 0)
  assert.equal(noteCount({ page: { text: 'p' }, notes: [{ index: 2, text: 'a' }] } as never), 2)
  assert.deepEqual(noteRows({ page: null, notes: [{ index: 4, text: 'a' }, { index: 9, text: 'b' }] } as never), [{ n: 1, index: 4, text: 'a' }, { n: 2, index: 9, text: 'b' }])
  assert.ok(engine.listNotes)
})

test('the page: Comment follows Insert in the quick bar, Notes is in the strip, Include comments sits by Download; pins are in the overlay and the popovers in <body>', () => {
  const tool = read('src/ui-editor/UiEditorTool.tsx')
  const bar = tool.slice(tool.indexOf('<div className="ue-bar"'), tool.indexOf('{confirm && ('))
  assert.ok(bar.indexOf('name={labels.insert}') < bar.indexOf('label={labels.comment}') && bar.indexOf('label={labels.comment}') < bar.indexOf('aria-label={labels.view}'), 'Comment is after Insert and before the view group')
  assert.ok(bar.indexOf('labels.includeComments') < bar.indexOf('icon="download"'), 'Include comments is beside Download')
  assert.match(read('src/ui-editor/Ribbon.tsx'), /aria-label=\{labels\.notes\}/)
  const stage = read('src/ui-editor/Stage.tsx')
  assert.match(stage, /data-pin/)
  assert.doesNotMatch(stage, /preview\.doc\.[A-Za-z.]*(append|createElement)/, 'no pin is put into the preview document')
  const pop = read('src/ui-editor/Popovers.tsx')
  assert.match(pop, /createPortal\(/)
  assert.match(pop, /data-comment-popover/)
  assert.match(pop, /data-notes-list/)
})

test('a note is a content edit (no Link, no environment); what is copied, downloaded and shown is one text, the stripped one when Include comments is off', () => {
  const tool = read('src/ui-editor/UiEditorTool.tsx')
  assert.match(tool, /run\(\{ op: 'note', target, text \}, 'note'\)/)
  assert.match(tool, /const outFiles = useMemo/)
  assert.match(tool, /const text = outFiles\[f\]/, 'Download')
  assert.match(tool, /const text = outFiles\[file\]/, 'Copy')
  assert.match(tool, /text=\{outFiles\[file\] \?\? ''\}/, 'the Updated code view')
  assert.match(tool, /data-edit-list=\{editListJson\}/)
  assert.match(tool, /const editListJson = useMemo\(\(\) => JSON\.stringify\(list\.edits\), \[list\.edits\]\)/)
})

test('the stage 2 words: the names are exactly the brief\'s and Comment disabled says why', () => {
  assert.equal(labels.comment, 'Comment')
  assert.equal(labels.notes, 'Notes')
  assert.equal(labels.includeComments, 'Include comments')
  assert.equal(labels.noteField, 'Note for the AI')
  assert.equal(labels.addPageNote, 'Add a note for the whole page')
  assert.equal(labels.deletePageNote, 'Delete page note')
  assert.match(labels.commentTipNone, /Select an element/)
  assert.match(labels.commentTipViewOnly, /view-only/)
})

// ---- insert round 1, stage 3: keyboard focus and small screens ----
test('focus goes back to what opened a popover or the text box (Comment, a pin, Notes, Edit text), and Escape in the text box gives it back too', () => {
  const tool = read('src/ui-editor/UiEditorTool.tsx')
  assert.match(tool, /const textFromButton = useRef\(false\)/)
  assert.match(tool, /onTextCancel=\{\(\) => stopTextEdit\(true\)\}/)
  assert.match(tool, /onEditText=\{\(\) => startTextEdit\(undefined, true\)\}/)
  assert.match(tool, /The focus goes back to what opened the popover/)
  assert.match(read('src/ui-editor/Popovers.tsx'), /e\.key === 'Escape'/)
})

test('the text box is at least 16 px on the screen and, on a scaled device, at least 44 x 160 px; at full size it is exactly the element\'s box', () => {
  const css = read('src/ui-editor/UiEditorTool.css')
  const rule = css.slice(css.indexOf("input.ue-text-editor[type='text']"), css.indexOf('/* ---- the menus (round 6)'))
  assert.match(rule, /font-size: calc\(16px \* var\(--ue-inv, 1\)\)/)
  assert.match(rule, /min-height: calc\(44px \* var\(--ue-inv, 1\) \* var\(--ue-small, 0\)\)/)
  assert.match(rule, /min-width: calc\(160px \* var\(--ue-inv, 1\) \* var\(--ue-small, 0\)\)/)
  assert.match(read('src/ui-editor/Stage.tsx'), /\['--ue-small' as string\]: scale < 1 \? '1' : '0'/)
})
