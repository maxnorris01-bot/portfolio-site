// UI Editor views round 1 (docs/ui-editor-gate-rules-views1.md): three environments, Tablet portrait editable, no Link, no dots, no Review unlinked, the copy of the new model.
// Pure checks of the page's own code and words; the gate (scripts/ui-editor-gate, specs-views1.json) measures the behaviour in a browser.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { how, labels, limits, messages, panel, paragraphs } from '../src/data/uiEditor.ts'
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

test('Link, the unlinked dots and Review unlinked are gone: no checkbox, no dot, no button, no label, no style', () => {
  const ribbon = read('src/ui-editor/Ribbon.tsx'), tool = read('src/ui-editor/UiEditorTool.tsx'), icons = read('src/ui-editor/icons.tsx'), menu = read('src/ui-editor/Menu.tsx')
  assert.doesNotMatch(ribbon, /ue-link|ue-dot|data-dot|rowOfPin|dotRows|pinEnv|unlinkedDot|UnlinkedItem|onLink|P\.linkTo|P\.linkHint/)
  assert.doesNotMatch(tool, /listUnlinked|reviewOpen|setReviewOpen|setLink|icon="review"|ue-review|jump\(/)
  assert.doesNotMatch(icons, /review|badge|expanded/)
  assert.doesNotMatch(menu, /dot/)
  assert.equal(Object.keys(labels).filter((k) => /^(review|link)/i.test(k)).length, 0)
  assert.equal(Object.keys(panel).filter((k) => /^(link|svgLink|dot)/i.test(k)).length, 0)
  const css = read('src/ui-editor/UiEditorTool.css')
  assert.doesNotMatch(css, /\.ue-dot|\.ue-review|\.ue-linkrow|\.ue-badge/)
})

test('a Desktop edit carries no Link state: the scope is the environment alone (none for an SVG), and the Arrange group has no data-field of its own', () => {
  const tool = read('src/ui-editor/UiEditorTool.tsx')
  assert.match(tool, /const scope = \(\) => \(svgDoc \? \{\} : \{ environment \}\)/)
  assert.doesNotMatch(read('src/ui-editor/Ribbon.tsx'), /<Group id="position"[^>]*field=/)
})

test('How it works says what the three views do, and the limits say what is editable; nothing about Link or Review unlinked is left', () => {
  const adapt = how.steps.find((s) => s.name === 'Adapt')?.detail ?? ''
  assert.match(adapt, /Phone and Tablet start as your Desktop setup scaled in proportion/)
  assert.match(adapt, /sizes in proportion, colours, fonts, order and text as they are, except what you customised in Phone or Tablet/)
  assert.match(adapt, /A change made in Phone or Tablet applies to that view only, and a later Desktop change does not override it/)
  assert.doesNotMatch(adapt, /Link|Review|unlinked|other way round/i)
  assert.match(adapt, /Reset to Desktop view/, 'views stage 2: the way back exists, and Adapt says so')
  const everything = [adapt, ...how.measured, ...limits.items, ...Object.values(labels).filter((v): v is string => typeof v === 'string'), ...Object.values(panel).filter((v): v is string => typeof v === 'string')].join('\n')
  assert.doesNotMatch(everything, /Review unlinked|Link to |Link on|Link off|Tablet is view-only|one size only|always unlinked/)
  assert.ok(limits.items.includes('Desktop, Tablet and Phone upright are editable; turned sideways they are view-only.'))
  assert.ok(limits.items.includes('A Tablet change on a page whose Phone breakpoint is 768 px is refused: make it in Phone.'))
  assert.ok(limits.items.includes('Dragging an element to move it applies to the view you drag in; Desktop covers every width above Phone.'))
  for (const p of paragraphs(limits.items, limits.groups)) assert.ok(p.split(/\s+/).length <= 50, `${p.split(/\s+/).length} words: ${p.slice(0, 40)}`)
})

test('the measured claims about the three views are the engine gate\'s own numbers (45 scripted edits over 17 test pages, one run)', () => {
  const m = how.measured.join(' ')
  assert.match(m, /45 scripted edits over 17 test pages: 44 gave the right value in a real browser and one was refused with a true reason/)
  assert.match(m, /That was one scored run\. Treat it as less proven than single edits\./)
  assert.doesNotMatch(m, /linking/)
})

test('a nudge is the same kind of edit as a drag, and one that shows nothing is not kept', () => {
  const tool = read('src/ui-editor/UiEditorTool.tsx')
  const nudge = tool.slice(tool.indexOf('const onNudge = '), tool.indexOf('const onResize = '))
  assert.match(nudge, /moveEdit\(t, dx, dy, 'nudged'\)/, 'the arrow keys and a drag build the edit in one place')
  assert.match(nudge, /sessionRef\.current\?\.preview\.elements\[t\]/, 'the element that must move is watched, read from the live session')
  assert.doesNotMatch(nudge, /scope\(\)/)
  const run = tool.slice(tool.indexOf('const run = '), tool.indexOf('const target = '))
  assert.match(run, /messages\.nudgeNoEffect/)
  assert.match(run, /startBusy\(\)\n\s+replayBehind\.current = true\n\s+setReplay/, 'the preview is built again from the list')
  assert.match(messages.nudgeNoEffect, /^Not applied: that element does not move/)
})

test('a replay of the same document is built behind the old preview and swapped in one step', () => {
  const tool = read('src/ui-editor/UiEditorTool.tsx')
  assert.match(tool, /replayBehind\.current = true/, 'merged moves, Undo, Redo and Reset all ask for it')
  const effect = tool.slice(tool.indexOf('const replayBehind'), tool.indexOf('// Leaving the page takes the preview away.'))
  assert.match(effect, /data-preview-buffer/)
  assert.equal((effect.match(/closeSession\(s\.old\)/g) ?? []).length, 1, 'the old session is closed in one place, the swap')
  assert.match(effect, /useLayoutEffect/)
  assert.doesNotMatch(tool.slice(tool.indexOf('const stepList'), tool.indexOf('const onUndo')), /setSession\(null\)/)
})
