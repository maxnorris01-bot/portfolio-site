import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

const root = new URL('..', import.meta.url).pathname
const read = (p: string) => readFileSync(join(root, p), 'utf8')

/** The drawing of each icon in icons.tsx: the text between its key and the next key (JSX is not run under node, so the source is read). */
function iconDrawings(): Record<string, string> {
  const src = read('src/ui-editor/icons.tsx')
  const body = src.slice(src.indexOf('const PATHS'), src.indexOf('export function Icon('))
  const keys = [...body.matchAll(/^ {2}(\w+): /gm)]
  const out: Record<string, string> = {}
  keys.forEach((m, i) => {
    const end = i + 1 < keys.length ? keys[i + 1].index : body.length
    out[m[1]] = body.slice(m.index + m[0].length, end).replace(/\/\/.*$/gm, '').replace(/\s+/g, ' ').trim()
  })
  return out
}

test('no two toolbar icons share a drawing, and Reset all, Undo, Redo and Rotate are four different shapes', () => {
  const d = iconDrawings()
  assert.ok(Object.keys(d).length >= 10, Object.keys(d).join())
  const seen = new Map<string, string>()
  for (const [k, v] of Object.entries(d)) {
    assert.ok(v.length > 10, `${k} has a drawing`)
    assert.ok(!seen.has(v), `${k} draws the same as ${seen.get(v)}`)
    seen.set(v, k)
  }
  const paths = (k: string) => [...d[k].matchAll(/ d="([^"]+)"/g)].map((m) => m[1]).join('|')
  assert.equal(new Set(['undo', 'redo', 'reset', 'rotate'].map(paths)).size, 4)
})

test('Rotate is drawn as a device outline with a curved arrow, and is the one icon button that shows its word', () => {
  const d = iconDrawings()
  assert.match(d.rotate, /<rect /, 'a device outline')
  assert.match(d.rotate, /<path /, 'and an arrow')
  const tool = read('src/ui-editor/UiEditorTool.tsx')
  assert.match(tool, /icon="rotate" label=\{labels\.rotate\} text=\{labels\.rotate\}/)
  const bar = tool.slice(tool.indexOf('<div className="ue-bar"'), tool.indexOf('{confirm && ('))
  assert.equal((bar.match(/ text=\{/g) ?? []).length, 1, 'only Rotate has a visible label')
})

test('the Samples button closes the paste area: with it open, Samples shows the gallery again, and the paste area takes the gallery\'s place while it is open', () => {
  const tool = read('src/ui-editor/UiEditorTool.tsx')
  const fn = tool.slice(tool.indexOf('const onSamples = () => {'), tool.indexOf('const onFiles'))
  assert.match(fn, /if \(pasteOpen\) \{\s*setPasteOpen\(false\)\s*setGalleryOpen\(true\)/)
  assert.match(tool, /const galleryShown = showGallery && !pasteOpen/)
})

test('the gallery has a fourth card, "Your own code", with a blank-page miniature and the Paste and Upload actions; the bar has neither button', async () => {
  const { labels } = await import('../src/data/uiEditor.ts')
  assert.equal(labels.ownCode, 'Your own code')
  const g = read('src/ui-editor/Gallery.tsx')
  assert.match(g, /data-sample-card="own"/)
  assert.match(g, /data-blank-page/)
  assert.match(g, /onClick=\{onPaste\}[\s\S]*labels\.paste/)
  assert.match(g, /onClick=\{onUpload\}[\s\S]*labels\.upload/)
  const tool = read('src/ui-editor/UiEditorTool.tsx')
  const bar = tool.slice(tool.indexOf('<div className="ue-bar"'), tool.indexOf('{confirm && ('))
  assert.doesNotMatch(bar, /labels\.paste|labels\.upload/, 'Paste and Upload are not toolbar buttons')
  assert.match(bar, /type="file" accept="\.html,\.htm,\.svg,\.css" multiple hidden/, 'the same accepted types')
  // Every route that replaces an open document still asks first.
  assert.equal((tool.match(/replaceDocument\(/g) ?? []).length, 3, 'a sample, an upload and a paste')
})

test('the bar puts Samples at the left edge and the icon groups together at the right edge', () => {
  const tool = read('src/ui-editor/UiEditorTool.tsx')
  assert.match(tool, /<div className="ue-bar-tools">/)
  const css = read('src/ui-editor/UiEditorTool.css')
  assert.match(css, /\.ue-bar-tools \{[^}]*margin-left: auto/)
  assert.match(css, /\.ue-bar-tools \{[^}]*justify-content: flex-end/)
  // Samples is before the tools, and the tools hold View, history, Review and File.
  const bar = tool.slice(tool.indexOf('<div className="ue-bar"'), tool.indexOf('{confirm && ('))
  assert.ok(bar.indexOf('labels.samplesButton') < bar.indexOf('ue-bar-tools'))
  for (const part of ['labels.view', 'labels.undo', 'labels.redo', 'labels.resetAll', 'labels.review(', 'labels.file', 'labels.copy', 'labels.download']) assert.ok(bar.indexOf('ue-bar-tools') < bar.indexOf(part), part)
})

// ---- the ribbon's pure helpers ----
import { HOLD_DELAY, HOLD_EVERY, MIN, PERCENT_STEP, SHIFT_TIMES, STEP, stepAmount, stepped } from '../src/ui-editor/steps.ts'
import { fullWidthFits, percentOf, pxOfPercent, showWidth, snapsToParent, SNAP_PX, typedWidth, widthToWrite } from '../src/ui-editor/units.ts'
import { SIDES, allSidesBy, expandSides, isMixed, showUniform, sidesText, withSide } from '../src/ui-editor/sides.ts'
import { FAMILIES, STEP_OF, alignButtons, familyOptions, kindOf, pressedAlign } from '../src/ui-editor/ribbonfields.ts'

test('each stepper has the step the brief gives: font size 1, width, height, padding and margin 4, border width 1, radius 2, nudges 1; Shift is ten times', () => {
  assert.deepEqual({ ...STEP }, { fontSize: 1, width: 4, height: 4, padding: 4, margin: 4, borderWidth: 1, borderRadius: 2, nudge: 1 })
  assert.equal(SHIFT_TIMES, 10)
  assert.equal(stepAmount('fontSize', false), 1)
  assert.equal(stepAmount('fontSize', true), 10)
  assert.equal(stepAmount('width', false), 4)
  assert.equal(stepAmount('width', true), 40)
  assert.equal(stepAmount('borderRadius', true), 20)
  assert.equal(PERCENT_STEP, 1)
  assert.equal(stepAmount('width', false, '%'), 1, 'a percent width steps by one point')
  assert.equal(stepAmount('width', true, '%'), 10)
  assert.equal(stepAmount('height', false, '%'), 4, 'only the width has a percent unit')
})

test('holding a stepper repeats after about 400 ms and then every 80 ms', () => {
  assert.equal(HOLD_DELAY, 400)
  assert.equal(HOLD_EVERY, 80)
})

test('a click is one step; three clicks are three steps; the number never goes under its minimum, and a margin or nudge may go negative', () => {
  let v = 44
  for (let i = 0; i < 3; i++) v = stepped(v, 1, stepAmount('fontSize', false), MIN.fontSize)
  assert.equal(v, 47)
  assert.equal(stepped(47, 1, stepAmount('fontSize', true), MIN.fontSize), 57)
  assert.equal(stepped(47, -1, 1, MIN.fontSize), 46)
  assert.equal(stepped(1, -1, 1, MIN.fontSize), 1, 'a font size stays at 1 px at least')
  assert.equal(stepped(2, -1, 4, MIN.padding), 0, 'padding stops at 0')
  assert.equal(stepped(0, -1, 4, MIN.margin), -4)
  assert.equal(stepped(0, -1, 1, MIN.nudge), -1)
  assert.equal(stepped(10.005, 1, 4, 0), 14.01, 'rounded to two decimals')
})

test('the width unit: a percent of the parent\'s content width, the number a % rule resolves against', () => {
  assert.equal(percentOf(280, 1100), 25.45)
  assert.equal(percentOf(550, 1100), 50)
  assert.equal(percentOf(5, 0), 0)
  assert.equal(pxOfPercent(25, 780), 195)
  assert.equal(showWidth(280, 1100, 'px'), '280px')
  assert.equal(showWidth(280, 1100, '%'), '25.45%')
  assert.equal(typedWidth('30', '%'), '30%')
  assert.equal(typedWidth('30', 'px'), '30')
  assert.equal(typedWidth('30%', '%'), '30%')
  assert.equal(typedWidth('  ', '%'), null)
  assert.equal(widthToWrite({ unit: 'px', cssPx: 273.4, parentPx: 780, snapped: false }), '273.4px')
  assert.equal(widthToWrite({ unit: '%', cssPx: 195, parentPx: 780, snapped: false }), '25%')
  assert.equal(widthToWrite({ unit: 'px', cssPx: 779, parentPx: 780, snapped: true }), '100%', 'a snap writes 100% in either unit')
  assert.equal(widthToWrite({ unit: '%', cssPx: 779, parentPx: 780, snapped: true }), '100%')
})

test('the snap: within 2 CSS px of the parent\'s content width, and not a pixel further; an element whose 100% would overflow is not snapped', () => {
  assert.equal(SNAP_PX, 2)
  assert.equal(snapsToParent(780, 780), true)
  assert.equal(snapsToParent(778, 780), true)
  assert.equal(snapsToParent(782, 780), true)
  assert.equal(snapsToParent(777.9, 780), false)
  assert.equal(snapsToParent(774, 780), false, '6 px short does not snap')
  assert.equal(snapsToParent(5, 0), false, 'no parent width, no snap')
  assert.equal(fullWidthFits({ sizing: 'border-box', paddingX: 48, borderX: 2 }), true)
  assert.equal(fullWidthFits({ sizing: 'content-box', paddingX: 0, borderX: 0 }), true)
  assert.equal(fullWidthFits({ sizing: 'content-box', paddingX: 24, borderX: 0 }), false)
})

test('padding and margin as four sides: one value, or mixed; every write is the whole shorthand', () => {
  assert.deepEqual(expandSides('28px'), [28, 28, 28, 28])
  assert.deepEqual(expandSides('8px 16px'), [8, 16, 8, 16])
  assert.deepEqual(expandSides('1px 2px 3px'), [1, 2, 3, 2])
  assert.deepEqual(expandSides('1px 2px 3px 4px'), [1, 2, 3, 4])
  assert.equal(expandSides('auto'), null)
  assert.equal(expandSides('1em'), null)
  assert.equal(isMixed([4, 4, 4, 4]), false)
  assert.equal(isMixed([4, 4, 4, 8]), true)
  assert.equal(showUniform([24, 24, 24, 24]), '24px')
  assert.equal(showUniform([24, 12, 24, 24]), 'mixed')
  assert.deepEqual(SIDES, ['top', 'right', 'bottom', 'left'])
  assert.deepEqual(withSide([4, 4, 4, 4], 'top', 8), [8, 4, 4, 4])
  assert.equal(sidesText([8, 4, 4, 4]), '8px 4px 4px 4px')
  assert.deepEqual(allSidesBy([24, 24, 24, 24], 4, 0), [28, 28, 28, 28])
  assert.deepEqual(allSidesBy([24, 12, 0, 8], -10, 0), [14, 2, 0, 0], 'differences kept, none below the minimum')
  assert.deepEqual(allSidesBy([0, 0, 0, 0], -4, null), [-4, -4, -4, -4])
})

test('the font select: the page\'s own family first, then Georgia, Times New Roman, Arial, Helvetica, Verdana, Trebuchet MS, Tahoma, Courier New, system-ui, serif, sans-serif, monospace; nothing typed', () => {
  assert.deepEqual(FAMILIES.map((f) => f.label), ['Georgia', 'Times New Roman', 'Arial', 'Helvetica', 'Verdana', 'Trebuchet MS', 'Tahoma', 'Courier New', 'system-ui', 'serif', 'sans-serif', 'monospace'])
  const o = familyOptions('Georgia, "Times New Roman", serif')
  assert.equal(o.length, 13)
  assert.equal(o[0].label, 'Georgia, "Times New Roman", serif')
  assert.equal(o[0].value, o[0].label, 'choosing the page\'s own family writes what it already is')
  assert.equal(FAMILIES.find((f) => f.label === 'Arial')?.value, 'Arial, sans-serif')
  assert.ok(FAMILIES.filter((f) => /\s/.test(f.label)).every((f) => f.value.startsWith('"')), 'a name with spaces is quoted')
  const src = read('src/ui-editor/Ribbon.tsx')
  const family = src.slice(src.indexOf("kind === 'family'"), src.indexOf("kind === 'weight'"))
  assert.match(family, /<select/)
  assert.doesNotMatch(family, /type="text"|<input/, 'no free-text entry for the font family')
})

test('alignment is a group of icon buttons with names: left, centre, right, justify for HTML; start, middle, end for SVG; start and end light left and right', () => {
  assert.deepEqual(alignButtons(false).map((b) => b.label), ['Align left', 'Align centre', 'Align right', 'Justify'])
  assert.deepEqual(alignButtons(false).map((b) => b.value), ['left', 'center', 'right', 'justify'])
  assert.deepEqual(alignButtons(true).map((b) => b.label), ['Anchor start', 'Anchor middle', 'Anchor end'])
  assert.equal(pressedAlign('start', false), 'left')
  assert.equal(pressedAlign('end', false), 'right')
  assert.equal(pressedAlign('center', false), 'center')
  assert.equal(pressedAlign('middle', true), 'middle')
})

test('each field gets its control: select, colour with a swatch, segmented alignment, width with a unit, sides, or a stepper', () => {
  assert.equal(kindOf('font-family', false), 'family')
  assert.equal(kindOf('font-weight', true), 'weight')
  assert.equal(kindOf('color', false), 'colour')
  assert.equal(kindOf('stroke', true), 'colour')
  assert.equal(kindOf('text-anchor', true), 'align')
  assert.equal(kindOf('width', false), 'width')
  assert.equal(kindOf('width', true), 'stepper', 'an SVG width is px only')
  assert.equal(kindOf('height', false), 'stepper', 'height stays px only')
  assert.equal(kindOf('padding', false), 'sides')
  assert.equal(kindOf('font-size', false), 'stepper')
  assert.equal(STEP_OF['border-width'], 'borderWidth')
  assert.equal(STEP_OF.rx, 'borderRadius')
})

// ---- the code view's diff ----
import { changeOfLine, counterText, diffHunks, firstLine, linesOf, stepChange, tickShare } from '../src/ui-editor/diff.ts'

test('the line diff: a changed line is one change; consecutive added lines are one change; a removal is shown between lines and counts as a change', () => {
  assert.deepEqual(diffHunks('a\nb\nc\n', 'a\nb\nc\n'), [])
  assert.deepEqual(diffHunks('a\nb\nc\n', 'a\nB\nc\n'), [{ removed: 1, added: 1, after: 1 }])
  assert.deepEqual(diffHunks('a\nb\nc\n', 'a\nb\nx\ny\nz\nc\n'), [{ removed: 0, added: 3, after: 2 }])
  assert.deepEqual(diffHunks('a\nb\nc\n', 'a\nc\n'), [{ removed: 1, added: 0, after: 1 }])
  assert.deepEqual(diffHunks('a\nb\nc\nd\ne\n', 'A\nb\nc\nd\nE\n'), [{ removed: 1, added: 1, after: 0 }, { removed: 1, added: 1, after: 4 }])
  // consecutive changed lines are ONE change
  assert.deepEqual(diffHunks('a\nb\nc\nd\n', 'a\nX\nY\nd\n'), [{ removed: 2, added: 2, after: 1 }])
  // a line added at the very top and at the very end
  assert.deepEqual(diffHunks('b\n', 'a\nb\nc\n'), [{ removed: 0, added: 1, after: 0 }, { removed: 0, added: 1, after: 2 }])
})

test('a moved line is a removal where it was and an added line where it is; ties remove the original line first', () => {
  // [one, two, three] -> [two, one, three]: the first original line goes, and comes back after the second.
  assert.deepEqual(diffHunks('one\ntwo\nthree\n', 'two\none\nthree\n'), [{ removed: 1, added: 0, after: 0 }, { removed: 0, added: 1, after: 1 }])
})

test('a final newline is not a line; an empty original makes everything one added change', () => {
  assert.deepEqual(linesOf('a\nb\n'), ['a', 'b'])
  assert.deepEqual(linesOf('a\nb'), ['a', 'b'])
  assert.deepEqual(linesOf(''), [''])
  assert.deepEqual(diffHunks('a\nb', 'a\nb\n'), [], 'a missing final newline is not a change')
  // an empty original is one empty line, which is replaced by the two new ones
  assert.deepEqual(diffHunks('', 'a\nb\n'), [{ removed: 1, added: 2, after: 0 }])
})

test('every line of the updated file is accounted for: the lines of the changes plus the unchanged lines are all the lines', () => {
  const a = 'h1\nh2\nh3\nh4\nh5\nh6\nh7\n'
  const b = 'h1\nX\nh3\nh4\nY\nZ\nh7\nW\n'
  const hunks = diffHunks(a, b)
  const total = linesOf(b).length
  const changed = hunks.reduce((n, h) => n + h.added, 0)
  const marked = linesOf(b).filter((_, i) => changeOfLine(hunks, i + 1) !== null).length
  assert.equal(marked, changed)
  assert.ok(changed < total)
  assert.equal(changeOfLine(hunks, 2), 1)
  assert.equal(changeOfLine(hunks, 1), null)
  assert.equal(changeOfLine(hunks, 5), 2)
  assert.equal(changeOfLine(hunks, 6), 2)
  assert.equal(changeOfLine(hunks, 8), 3)
  assert.equal(firstLine(hunks[1]), 5)
})

test('Previous and Next walk the changes and wrap round; the counter says "k of n" or "No changes yet"', () => {
  assert.equal(stepChange(0, 4, 1), 1)
  assert.equal(stepChange(1, 4, 1), 2)
  assert.equal(stepChange(4, 4, 1), 1, 'Next from the last goes to the first')
  assert.equal(stepChange(1, 4, -1), 4, 'Previous from the first goes to the last')
  assert.equal(stepChange(0, 4, -1), 4)
  assert.equal(stepChange(3, 4, -1), 2)
  assert.equal(stepChange(0, 0, 1), 0)
  assert.equal(counterText(0, 0), 'No changes yet')
  assert.equal(counterText(3, 7), '3 of 7')
  assert.equal(counterText(0, 4), '0 of 4')
  assert.equal(counterText(9, 4), '4 of 4', 'never past the count')
})

test('a change\'s tick is placed in proportion to its line number', () => {
  assert.equal(tickShare({ removed: 0, added: 1, after: 0 }, 50), 0)
  assert.equal(tickShare({ removed: 0, added: 1, after: 25 }, 50), 0.5)
  assert.equal(tickShare({ removed: 1, added: 0, after: 49 }, 50), 0.98)
  assert.equal(tickShare({ removed: 1, added: 0, after: 3 }, 0), 0)
})

test('the code view shows the whole file line by line, marks changed lines with text in the margin (not colour alone), keeps Copy and Download plain, and has Previous and Next change and a change map', () => {
  const v = read('src/ui-editor/CodeView.tsx')
  assert.match(v, /data-line=\{n\}/)
  assert.match(v, /data-margin-marker/)
  assert.match(v, /\{k !== null \? '\+' : ''\}/, 'a "+" in the margin')
  assert.match(v, /data-removed-after=\{after\}/)
  assert.match(v, /data-change-counter/)
  assert.match(v, /data-change-map/)
  assert.match(v, /data-code-view/)
  assert.match(v, /data-code-text/)
  assert.doesNotMatch(v, /only changes/i, 'no "Show only changes" toggle')
  const css = read('src/ui-editor/UiEditorTool.css')
  assert.match(css, /\.ue-gut \{[^}]*user-select: none/)
  assert.match(css, /\.ue-mk \{[^}]*user-select: none/)
  assert.match(css, /\.ue-tick \{[^}]*height: 3px/, 'thin ticks, so neighbouring changes\' buttons do not overlap')
  // Copy and Download act on the exported text, never on the view's lines.
  const tool = read('src/ui-editor/UiEditorTool.tsx')
  assert.match(tool, /navigator\.clipboard\.writeText\(text\)/)
  assert.match(tool, /new Blob\(\[text\]/)
  assert.match(tool, /<CodeView key=\{file\}/)
})
