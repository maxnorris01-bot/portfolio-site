import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { limits, paragraphs, panel } from '../src/data/uiEditor.ts'
import { htmlFields, svgFields, type Computed } from '../src/ui-editor/panelfields.ts'
import { FAMILIES, alignButtons, familyChoices, familyOptions, firstFamily, showColourWord } from '../src/ui-editor/ribbonfields.ts'

const root = new URL('..', import.meta.url).pathname
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const specs = JSON.parse(read('scripts/ui-editor-gate/specs-round4.json')) as { limitsSentence: string; specs: { id: string; steps: Record<string, unknown>[] }[] }

// ---- formatting round 4: one ribbon, labels on everything, spread to fill the width ----

test('the font select shows the first family name of the stack ("Georgia"), the page\'s own family first, then the twelve by name', () => {
  assert.equal(firstFamily('Georgia, "Times New Roman", serif'), 'Georgia')
  assert.equal(firstFamily('"Helvetica Neue", Arial, sans-serif'), 'Helvetica Neue')
  assert.equal(firstFamily("'Segoe UI', sans-serif"), 'Segoe UI')
  assert.equal(firstFamily('monospace'), 'monospace')
  assert.equal(firstFamily(''), '')
  const o = familyChoices('Georgia, "Times New Roman", serif')
  assert.equal(o.length, 1 + FAMILIES.length, 'round 7a: the page\'s own family, the twelve and the 29 system fonts')
  assert.deepEqual(o.slice(1, 13).map((f) => f.label), ['Georgia', 'Times New Roman', 'Arial', 'Helvetica', 'Verdana', 'Trebuchet MS', 'Tahoma', 'Courier New', 'system-ui', 'serif', 'sans-serif', 'monospace'], 'the twelve are still first, in order')
  assert.equal(o[0].label, 'Georgia')
  assert.equal(o[0].value, 'Georgia, "Times New Roman", serif', 'choosing the page\'s own family writes what it already is')
  assert.deepEqual(o.slice(1).map((f) => f.label), FAMILIES.map((f) => f.label))
  assert.ok(o.every((f) => !f.label.includes(',')), 'options show their name only')
  assert.equal(familyOptions('Georgia, serif')[0].label, 'Georgia, serif', 'the older whole-stack reading is kept for its own tests')
})

test('the transparent colour is spelled out in full in a colour field; every other colour is shown as read', () => {
  assert.equal(showColourWord('transparent'), 'Transparent')
  assert.equal(showColourWord('#1d3557'), '#1d3557')
  assert.equal(showColourWord('rgb(1, 2, 3)'), 'rgb(1, 2, 3)')
})

const computed = { fontFamily: 'Georgia, serif', fontSize: '16px', fontWeight: '400', color: 'rgb(0, 0, 0)', textAlign: 'start', width: '10px', height: '10px', padding: '0px', margin: '0px', backgroundColor: 'rgba(0, 0, 0, 0)', borderTopColor: 'rgb(0, 0, 0)', borderTopWidth: '0px', borderTopStyle: 'none', borderRadius: '0px', fill: 'rgb(0, 0, 0)', stroke: 'none', strokeWidth: '1px', textAnchor: 'start' } as Computed

test('every field of the ribbon has a visible label in plain words: no abbreviation, no single letter, one to three words, and the table follows the brief', () => {
  const fields = [...htmlFields(computed), ...svgFields({ localName: 'rect' }, true, computed), ...svgFields({ localName: 'text' }, true, computed)]
  const names = [...new Set(fields.map((f) => f.label))].filter((n) => n !== panel.alignment)
  for (const n of names) {
    const label = panel.ctl[n]
    assert.ok(label, `${n} has a visible label`)
    assert.ok(label.length > 1 && label.split(/\s+/).length <= 3, label)
    assert.match(label, /^\p{Lu}/u, 'sentence case')
  }
  assert.deepEqual(
    [panel.ctl['Font family'], panel.ctl['Font size'], panel.ctl['Font weight'], panel.ctl['Text colour'], panel.ctl.Width, panel.ctl.Height, panel.ctl.Background, panel.ctl['Border colour'], panel.ctl['Border width'], panel.ctl['Border radius'], panel.ctl.Padding, panel.ctl.Margin, panel.ctl['Nudge X'], panel.ctl['Nudge Y']],
    ['Font family', 'Font size', 'Weight', 'Text colour', 'Width', 'Height', 'Fill colour', 'Line colour', 'Line thickness', 'Corner rounding', 'Padding', 'Margin', 'Nudge X', 'Nudge Y'],
  )
  assert.equal(panel.unitLabel, 'Unit')
  const forbidden = new Set(['w', 'h', 'thick', 'round', 'fill', 'line', 'pad', 'mar', 'size', 'text', 'x', 'y'])
  for (const label of [...Object.values(panel.ctl), ...Object.values(panel.alignCaptions), panel.unitLabel]) assert.ok(!forbidden.has(label.toLowerCase()), `${label} is not an abbreviation`)
})

test('the four alignment buttons are captioned Left, Centre, Right and Justify; an SVG\'s three Start, Middle and End', () => {
  assert.deepEqual(alignButtons(false).map((b) => panel.alignCaptions[b.label]), ['Left', 'Centre', 'Right', 'Justify'])
  assert.deepEqual(alignButtons(true).map((b) => panel.alignCaptions[b.label]), ['Start', 'Middle', 'End'])
})

const VERBS = (specs.specs.find((s) => s.id === 'U03')!.steps.find((s) => s.k === 'tooltips') as { verbs: string[] }).verbs
const verbFirst = (tip: string) => VERBS.includes(tip.trim().split(/\s+/)[0].replace(/[^\p{L}]/gu, ''))

test('every ribbon tooltip is a short verb-first sentence that is not just the control\'s name', () => {
  const tips: [string, string][] = [
    ['family', panel.fontTip('Georgia, "Times New Roman", serif')],
    ['weight', panel.weightTip],
    ['colour', panel.colourTip],
    ['px', panel.unitTip('px')],
    ['%', panel.unitTip('%')],
    ['move up', panel.moveUpTip],
    ['move down', panel.moveDownTip],
    ['grid', panel.gridTip],
    ['snap', panel.snapTip],
    ['spacing', panel.gridSpacingTip],
    ['sides', panel.sidesTip('Padding')],
    ['step', panel.stepTip(panel.decrease('Font size'), 1, 'px')],
    ['type', panel.typeTip('Font size')],
    ['nudge', panel.typeTip('Nudge X')],
  ]
  for (const b of [...alignButtons(false), ...alignButtons(true)]) tips.push([b.label, panel.alignTip(b.label)])
  for (const f of [...htmlFields(computed)]) tips.push([`pick ${f.label}`, panel.pickTip(f.label)])
  for (const [what, tip] of tips) {
    assert.ok(verbFirst(tip), `${what}: "${tip}" starts with a verb`)
    assert.ok(tip.split(/\s+/).length >= 3, `${what}: "${tip}" is a sentence`)
  }
  assert.equal(panel.moveUpTip, 'Move this element earlier in the page order.')
  assert.ok(panel.fontTip('Georgia, "Times New Roman", serif').includes('Times New Roman'), 'the whole stack is in the font control\'s tooltip')
})

test('the Limits list has the verified snapping sentence once, and still shows at most six paragraphs of at most 50 words', () => {
  assert.equal(specs.limitsSentence, 'With Snap on, a dragged edge lands on a grid line only when that edge can move; an element fixed to the right of its row keeps its right edge.')
  assert.equal(limits.items.filter((i) => i.includes(specs.limitsSentence)).length, 1)
  const shown = paragraphs(limits.items, limits.groups)
  assert.ok(shown.length >= 3 && shown.length <= 6, `${shown.length} paragraphs`)
  for (const p of shown) assert.ok(p.split(/\s+/).length <= 50, `${p.split(/\s+/).length} words: ${p.slice(0, 40)}`)
})

test('one ribbon, no tab bar: a strip, one panel, seven groups in the order Font, Paragraph, Size, Shape, Spacing, Arrange, Grid', () => {
  const src = read('src/ui-editor/Ribbon.tsx')
  assert.doesNotMatch(src, /role="tab(list|panel)?"|TABS|tabRefs|onTabKey|pickTab|aria-selected/, 'no tab bar')
  assert.equal((src.match(/data-ribbon-panel/g) ?? []).length, 1, 'one panel')
  assert.equal((src.match(/data-ribbon-strip/g) ?? []).length, 1, 'one strip')
  assert.deepEqual([...src.matchAll(/<Group id="(\w+)"/g)].map((m) => m[1]), ['font', 'paragraph', 'size', 'shape', 'spacing', 'position', 'grid'])
  assert.deepEqual([panel.groups.font, panel.groups.paragraph, panel.groups.size, panel.groups.shape, panel.groups.spacing, panel.groups.arrange, panel.groups.grid], ['Font', 'Paragraph', 'Size', 'Shape', 'Spacing', 'Arrange', 'Grid'])
  assert.ok(src.indexOf('data-ribbon-strip') < src.indexOf('data-ribbon-panel'), 'the strip is above the groups')
  // Round 5: no break element; the groups are grid items placed by the stylesheet (tests/uieditorround5.test.ts).
  assert.doesNotMatch(src, /ue-brk/)
  // The strip holds the element label, the view name and the one plain note.
  const strip = src.slice(src.indexOf('data-ribbon-strip'), src.indexOf('data-ribbon-panel'))
  for (const part of ['P.strip', 'data-selected-label', 'data-env', 'data-ribbon-note']) assert.ok(strip.includes(part), part)
})

test('Grid, Snap and Grid spacing are the view aids: enabled whenever a document is open (Snap off for SVG); the other controls need a selection', () => {
  const src = read('src/ui-editor/Ribbon.tsx')
  const grid = src.slice(src.indexOf('<Group id="grid"'))
  assert.match(grid, /icon="grid"[^>]*disabled=\{false\}/)
  assert.match(grid, /icon="snap"[^>]*disabled=\{svgDoc\}/)
  assert.doesNotMatch(grid.slice(grid.indexOf('id="ue-spacing"'), grid.indexOf('</select>')), /disabled/)
  assert.match(src, /const live = !!el && editable/)
})

test('every control has its word: the label is a data-ctl-label span (aria-hidden, so names are not doubled), the caption of an icon button is under it', () => {
  const src = read('src/ui-editor/Ribbon.tsx')
  assert.match(src, /<span className="ue-cl" data-ctl-label aria-hidden="true">/)
  // ROUND 6 (assertion updated, see docs/ui-editor-gate-log.md #41): the alignment buttons are icon-only like PowerPoint's (name and tooltip unchanged) and the px/% toggle sits in the
  // Width row, so their two captions are no longer drawn; a number box has its word beside it (a data-row-label span, the words in P.rowLabels).
  assert.match(src, /<RowLabel text=\{P\.rowLabels\[f\.label\] \?\? f\.label\}/)
  assert.match(src, /data-row-label/)
  assert.doesNotMatch(src, /P\.caps|<Cap /, 'the old abbreviations are gone')
})

test('the status line is one slim line under the ribbon, with its height reserved while a document is open', () => {
  const tool = read('src/ui-editor/UiEditorTool.tsx')
  const css = read('src/ui-editor/UiEditorTool.css')
  const region = tool.slice(tool.indexOf('const resultText'), tool.indexOf('return (\n    <section ref={rootRef}'))
  assert.doesNotMatch(region, /<ul>|<li|ue-notes-lead/, 'one line, not a card with a list')
  assert.match(region, /role="status" aria-label=\{labels\.result\}/)
  assert.ok(tool.indexOf('<Ribbon') < tool.indexOf('{result}') && tool.indexOf('{result}') < tool.indexOf('<div className="ue-work">'), 'directly under the ribbon, above the stage')
  const reserved = /\.ue-result\.is-reserved \{[^}]*height: (\d+)px/.exec(css)
  assert.ok(reserved && Number(reserved[1]) <= 40, 'at most 40 px')
  assert.match(css, /\.ue-result-line \{[^}]*white-space: nowrap/)
  assert.match(css, /\.ue-result-line \{[^}]*text-overflow: ellipsis/)
})

test('the ribbon keeps its container, its small controls and its 44 px narrow rule (round 5 replaced the flex spread by a column grid; round 6 made the controls 28 px high)', () => {
  const css = read('src/ui-editor/UiEditorTool.css')
  assert.match(css, /\.ue-tool \.ue-ribbon \{[^}]*container: ue-ribbon \/ inline-size/)
  assert.match(css, /\.ue-cl \{[^}]*font-size: 12px/)
  // ROUND 6 (assertion updated, log #41): the brief makes every control 28 px high (it was 26), in one rule shared by the buttons, the selects and the number boxes.
  assert.match(css, /\.ue-tool \.ue-ribbon \.ue-rbtn,[^{]*\{[^}]*height: 28px/s)
  const narrow = css.slice(css.indexOf('@container ue-ribbon (max-width: 999px)'))
  assert.match(narrow, /\.ue-tool \.ue-ribbon \.ue-rbtn,[\s\S]*?min-width: 44px;[\s\S]*?height: 44px/)
  assert.doesNotMatch(css.slice(css.indexOf('/* ---- the card and the ribbon (round 6)'), css.indexOf('/* The status line (round 4)')), /#[0-9a-fA-F]{3,6}\b/, 'tokens only')
})

test('the quick bar shows the words of Reset all; Undo and Redo stay icon-only', () => {
  const tool = read('src/ui-editor/UiEditorTool.tsx')
  const bar = tool.slice(tool.indexOf('<div className="ue-bar"'), tool.indexOf('{confirm && ('))
  assert.match(bar, /icon="reset" label=\{labels\.resetAll\} showLabel/)
  const undo = bar.slice(bar.indexOf('icon="undo"'), bar.indexOf('icon="redo"') + 120)
  assert.doesNotMatch(undo, /showLabel|words=|text=/)
})
