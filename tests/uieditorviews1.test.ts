// UI Editor views round 1 (docs/ui-editor-gate-rules-views1.md): three environments, Tablet portrait editable, no Link, no dots, no Review unlinked, the copy of the new model.
// Pure checks of the page's own code and words; the gate (scripts/ui-editor-gate, specs-views1.json) measures the behaviour in a browser.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { labels, panel } from '../src/data/uiEditor.ts'
import { canRotate, isEditable, viewOnlyReason, type Orientation, type ViewName } from '../src/ui-editor/devices.ts'
import { describeCondition } from '../src/ui-editor/values.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

test('Desktop, Tablet portrait and Phone portrait are editable; every landscape is view-only', () => {
  const table: [ViewName, Orientation, boolean][] = [
    ['Desktop', 'portrait', true],
    ['Tablet', 'portrait', true],
    ['Phone', 'portrait', true],
    ['Tablet', 'landscape', false],
    ['Phone', 'landscape', false],
  ]
  for (const [v, o, want] of table) assert.equal(isEditable(v, o), want, `${v} ${o}`)
  assert.deepEqual((['Desktop', 'Tablet', 'Phone'] as const).map(canRotate), [false, true, true])
})

test('only a device turned sideways has a view-only reason, and Tablet keeps its own sentence', () => {
  assert.equal(viewOnlyReason('Desktop', 'portrait'), null)
  assert.equal(viewOnlyReason('Tablet', 'portrait'), null)
  assert.equal(viewOnlyReason('Phone', 'portrait'), null)
  assert.equal(viewOnlyReason('Tablet', 'landscape'), 'tablet')
  assert.equal(viewOnlyReason('Phone', 'landscape'), 'landscape')
  // Phone keeps its wording exactly; Tablet turned sideways says so and is no longer "a view-only width".
  assert.equal(panel.viewOnly, 'This size is view-only, so its settings and handles are switched off: turn the phone upright, or switch to Desktop, to edit.')
  assert.match(panel.tablet, /turned sideways is view-only/)
  assert.match(panel.tablet, /Turn it upright/)
  assert.doesNotMatch(panel.tablet, /view-only width/)
  for (const tip of [labels.insertTipTablet, labels.commentTipTablet]) assert.match(tip, /turned sideways is view-only: turn it upright/)
})

test('the environment follows the view, and a drag is custom to the view it is made in', () => {
  const tool = read('src/ui-editor/UiEditorTool.tsx')
  assert.match(tool, /const environment: Environment = view === 'Phone' \? 'phone' : view === 'Tablet' \? 'tablet' : 'desktop'/)
  const move = tool.slice(tool.indexOf('const onMove = '), tool.indexOf('// Keys that arrive while the preview is being rebuilt'))
  assert.match(move, /environment === 'desktop' \? \{ environment, link: false \} : \{ environment \}/, 'unlinked on Desktop, the environment alone in Tablet and Phone')
  assert.match(move, /svgDoc \? \{ link: true \}/, 'an SVG has no environments')
  assert.match(move, /tabletMin\(session\.breakpoint\) <= 768/, 'Desktop only when the page has no tablet band')
  assert.match(tool, /insertOff = svgDoc \? labels\.insertTipSvg : !editable \? \(view === 'Tablet' \? labels\.insertTipTablet : labels\.insertTipViewOnly\) : ''/, 'Insert is off only for an SVG or a device turned sideways')
})

test('a tablet condition is read in words (notes about values left alone)', () => {
  assert.deepEqual(describeCondition('@media (min-width: 641px) and (max-width: 1024px)'), { env: 'tablet', phrase: 'tablet sizes (641px to 1024px wide)' })
  assert.equal(describeCondition('@media (max-width: 640px)').env, 'phone')
  assert.equal(describeCondition('@media (min-width: 641px)').env, 'desktop')
})
