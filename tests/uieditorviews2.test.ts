import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { labels, messages } from '../src/data/uiEditor.ts'

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

test('the customised mark: in the name and the tooltip (not colour alone), only on Tablet and Phone, and it takes no room', () => {
  assert.equal(labels.viewNameCustom('Phone'), 'Phone, customised')
  assert.match(labels.viewTipCustom('Tablet'), /customised/)
  assert.match(labels.viewTipCustom('Tablet'), /^Show the Tablet size\./, 'a tooltip that starts with a verb')
  const tool = read('src/ui-editor/UiEditorTool.tsx')
  assert.match(tool, /const mark = v\.name !== 'Desktop' && customised\[v\.name\]/, 'Desktop never shows it')
  assert.match(tool, /customCount\(list\.edits, 'tablet'\) > 0/)
  assert.match(tool, /customCount\(list\.edits, 'phone'\) > 0/)
  const css = read('src/ui-editor/UiEditorTool.css')
  const rule = css.slice(css.indexOf('.ue-tool .ue-mark {'), css.indexOf('/* An icon button that also shows its word'))
  assert.match(rule, /position: absolute/)
  assert.doesNotMatch(rule, /margin|float|display: (block|flex|inline)/, 'out of the flow: the button keeps its size')
})

test('Reset to Desktop view: only in Tablet and Phone, enabled only with changes of the open view, and the dialog says what it does', () => {
  const tool = read('src/ui-editor/UiEditorTool.tsx')
  assert.match(tool, /\{small && \(\s*<IconButton\s+icon="resetView"/)
  assert.match(tool, /disabled=\{!customised\[view\] \|\| busy\}/)
  assert.match(tool, /stepList\(\{ type: 'resetView', environment \}, messages\.viewReset\(view\)\)/)
  assert.equal(labels.resetView, 'Reset to Desktop view')
  const text = labels.resetViewText('Phone')
  for (const part of ['Reset the Phone view', 'changes made in Phone only', 'Desktop and the other small view are untouched', 'text, inserted items and notes stay', 'Undo brings the changes back']) assert.ok(text.includes(part), part)
  assert.match(labels.resetViewTipNone('Tablet'), /no changes of its own/)
  assert.match(labels.resetViewTipSvg('Phone'), /an SVG has no separate Phone changes/)
  for (const tip of [labels.resetViewTip('Phone'), labels.resetViewTipNone('Phone'), labels.resetViewTipSvg('Phone')]) assert.match(tip, /^Reset the Phone view/, 'verb first, in every state')
  assert.equal(labels.resetViewYes('Tablet'), 'Reset Tablet view')
  assert.match(messages.viewReset('Phone'), /^Phone view reset to the Desktop setup\./)
  assert.match(messages.undoneViewReset('Phone'), /^Undid the reset/)
  assert.match(messages.redoneViewReset('Tablet'), /^Redid the reset/)
})

test('the dialog gives the focus back: to the Reset button when nothing was done, to the open view when it was', () => {
  const tool = read('src/ui-editor/UiEditorTool.tsx')
  assert.match(tool, /back: '\[data-reset-view\]'/)
  assert.match(tool, /after: '\[data-view-button\]\[aria-pressed="true"\]'/)
  assert.match(tool, /giveFocusTo\(c\.back\)/)
  assert.match(tool, /giveFocusTo\(c\.after\)/)
  const icons = read('src/ui-editor/icons.tsx')
  assert.match(icons, /data-reset-view=/)
  assert.match(icons, /data-view-button=/)
})
