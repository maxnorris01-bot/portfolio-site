import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { deviceNote, panel, VIEW_WIDTHS } from '../src/data/uiEditor.ts'
import { isUiEditorOn } from '../src/data/uiEditorFlag.ts'
import { bezel, canRotate, frameSize, isEditable, viewOnlyReason, viewport, type Orientation, type ViewName } from '../src/ui-editor/devices.ts'

const root = new URL('..', import.meta.url).pathname
const read = (p: string) => readFileSync(join(root, p), 'utf8')

test('the device sizes: Phone 390 x 844 and Tablet 768 x 1024 upright, swapped when turned; Desktop is 1280 wide and grows with the page', () => {
  assert.deepEqual(viewport('Phone', 'portrait'), { width: 390, height: 844 })
  assert.deepEqual(viewport('Phone', 'landscape'), { width: 844, height: 390 })
  assert.deepEqual(viewport('Tablet', 'portrait'), { width: 768, height: 1024 })
  assert.deepEqual(viewport('Tablet', 'landscape'), { width: 1024, height: 768 })
  assert.deepEqual(viewport('Desktop', 'portrait'), { width: 1280, height: null })
  assert.deepEqual(viewport('Desktop', 'landscape'), { width: 1280, height: null })
  assert.deepEqual({ ...VIEW_WIDTHS }, { Desktop: 1280, Tablet: 768, Phone: 390 })
})

test('only Desktop and Phone upright are editable; landscape phone and both tablet orientations are view-only', () => {
  const table: [ViewName, Orientation, boolean][] = [
    ['Desktop', 'portrait', true],
    ['Phone', 'portrait', true],
    ['Phone', 'landscape', false],
    ['Tablet', 'portrait', false],
    ['Tablet', 'landscape', false],
  ]
  for (const [v, o, want] of table) assert.equal(isEditable(v, o), want, `${v} ${o}`)
})

test('only Phone and Tablet can be rotated; each view-only size has a reason, and Tablet keeps its own sentence', () => {
  assert.deepEqual((['Desktop', 'Tablet', 'Phone'] as const).map(canRotate), [false, true, true])
  assert.equal(viewOnlyReason('Desktop', 'portrait'), null)
  assert.equal(viewOnlyReason('Phone', 'portrait'), null)
  assert.equal(viewOnlyReason('Phone', 'landscape'), 'landscape')
  assert.equal(viewOnlyReason('Tablet', 'portrait'), 'tablet')
  assert.match(panel.tablet, /view-only/)
  assert.match(panel.viewOnly, /view-only/)
  assert.equal(panel.viewOnly.split('. ').length, 1, 'one plain sentence')
})

test('the frame is the screen plus a bezel that turns with the device; Desktop has none', () => {
  assert.deepEqual(bezel('Desktop', 'portrait'), { top: 0, right: 0, bottom: 0, left: 0 })
  assert.deepEqual(frameSize('Desktop', 'portrait', 1500), { width: 1280, height: 1500 })
  assert.deepEqual(frameSize('Phone', 'portrait', 0), { width: 390 + 24, height: 844 + 52 })
  assert.deepEqual(frameSize('Phone', 'landscape', 0), { width: 844 + 52, height: 390 + 24 })
  assert.deepEqual(frameSize('Tablet', 'portrait', 0), { width: 768 + 24, height: 1024 + 24 })
  assert.deepEqual(frameSize('Tablet', 'landscape', 0), { width: 1024 + 24, height: 768 + 24 })
})

test('the note under the stage is the sentence the brief gave, and the frames are CSS only (no image, no model or brand name)', () => {
  assert.equal(deviceNote, 'Previewed at a typical phone width (390 px). Other phones show the same code at their own width.')
  const css = read('src/ui-editor/UiEditorTool.css')
  const device = css.slice(css.indexOf('.ue-device {'), css.indexOf('.ue-stage {'))
  assert.doesNotMatch(device, /url\(|iphone|ipad|galaxy|pixel/i)
  assert.match(device, /border-radius: 38px/)
  const stage = read('src/ui-editor/Stage.tsx')
  assert.match(stage, /data-device-frame/)
  assert.match(stage, /data-device-scale/)
})

test('flag OFF behaviour is unchanged: only exactly "true" turns the page on, and nothing of this round is imported outside the page\'s own lazy chunk', () => {
  assert.equal(isUiEditorOn(undefined), false)
  assert.equal(isUiEditorOn(''), false)
  assert.equal(isUiEditorOn('TRUE'), false)
  assert.equal(isUiEditorOn('1'), false)
  assert.equal(isUiEditorOn('true'), true)
  const app = read('src/App.tsx')
  assert.match(app, /UI_EDITOR_ON \? lazy\(\(\) => import\('\.\/pages\/UiEditor'\)\) : null/)
  for (const f of ['src/App.tsx', 'src/components/NavBar.tsx', 'src/components/PageHeader.tsx', 'src/content/home.ts']) {
    assert.doesNotMatch(read(f), /ui-editor\/(devices|Gallery|Stage|icons|miniature)/, f)
  }
})
