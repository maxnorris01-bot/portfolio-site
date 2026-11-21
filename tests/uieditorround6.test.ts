import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DASHES, DIRECTIONS, DOUBLE_MIN, EFFECTS, FONT_SIZES, LINE_SPACINGS, OUTLINE_WEIGHTS, STANDARD_COLOURS, gradientCss, hexTyped, opaqueHex, pageColours, readGradient, toHex } from '../src/ui-editor/menus.ts'
import { RIBBON_COLUMNS } from '../src/ui-editor/ribbonfields.ts'
import { messages, panel } from '../src/data/uiEditor.ts'

const root = new URL('..', import.meta.url).pathname
const read = (p: string) => readFileSync(join(root, p), 'utf8')

// ---- formatting round 6: a PowerPoint-style ribbon (menus, number boxes, a fill rule) ----

test('a colour literal becomes six-digit lower-case hex: #rgb, #rrggbb, #rrggbbaa, rgb(), rgba(), hsl() and hsla()', () => {
  assert.equal(toHex('#ABC'), '#aabbcc')
  assert.equal(toHex('#1C2B29'), '#1c2b29')
  assert.equal(toHex('#1c2b2980'), '#1c2b29')
  assert.equal(toHex('rgb(192, 0, 0)'), '#c00000')
  assert.equal(toHex('rgba(0, 112, 192, 0.5)'), '#0070c0')
  assert.equal(toHex('hsl(0, 100%, 50%)'), '#ff0000')
  assert.equal(toHex('red'), null)
  assert.equal(toHex('#12'), null)
})

test('the page colours are the distinct colours of the original files in order of first use, up to 16', () => {
  assert.deepEqual(pageColours(['a { color: #1C2B29; background: #fff } b { border: 1px solid #ffffff; color: rgb(31, 92, 77) }', 'c { color: #1c2b29 }']), ['#1c2b29', '#ffffff', '#1f5c4d'])
  const many = Array.from({ length: 20 }, (_, i) => `#${(i + 1).toString(16).padStart(6, '0')}`).join(' ')
  assert.equal(pageColours([many]).length, 16)
  assert.deepEqual(pageColours(['no colours here']), [])
})

test('the hex box takes #rgb or #rrggbb only; anything else is no edit', () => {
  assert.equal(hexTyped('#C00000'), '#c00000')
  assert.equal(hexTyped(' #abc '), '#abc')
  for (const bad of ['red', '#12', '#12345', '#1234567', 'c00000', 'rgb(1,2,3)', '#gggggg', '']) assert.equal(hexTyped(bad), null, bad)
  assert.equal(opaqueHex('rgb(192, 0, 0)'), '#c00000')
  assert.equal(opaqueHex('rgba(0, 0, 0, 0)'), null)
})

test('the menus hold what the brief says: eight standard colours, six weights, four dashes, the font size presets', () => {
  assert.deepEqual([...STANDARD_COLOURS], ['#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050', '#00b050', '#0070c0', '#7030a0'])
  assert.deepEqual([...OUTLINE_WEIGHTS], [1, 2, 3, 4, 6, 8])
  assert.deepEqual(DASHES.map((d) => d.label), ['Solid', 'Dotted', 'Dashed', 'Double'])
  assert.equal(DOUBLE_MIN, 3)
  assert.deepEqual([...FONT_SIZES], [12, 14, 16, 18, 20, 24, 28, 32, 36, 44, 48, 60, 72])
  assert.match(messages.notAColour, /not a colour/)
  assert.match(messages.doubleNeedsThree, /3 px or more/)
})

test('Part B values: the shadows, the line spacings (unitless) and the gradient directions', () => {
  assert.deepEqual(EFFECTS.map((e) => [e.label, e.css]), [['None', 'none'], ['Subtle', '0 1px 3px rgba(0,0,0,.2)'], ['Medium', '0 4px 12px rgba(0,0,0,.25)'], ['Strong', '0 10px 24px rgba(0,0,0,.3)']])
  assert.deepEqual(LINE_SPACINGS.map((l) => [l.label, l.css]), [['1.0', '1'], ['1.15', '1.15'], ['1.5', '1.5'], ['2.0', '2']])
  assert.deepEqual(DIRECTIONS.map((d) => d.css), ['to right', 'to bottom', 'to bottom right', 'to top'])
  assert.equal(gradientCss({ dir: 'to bottom right', from: '#c00000', to: '#0070c0' }), 'linear-gradient(to bottom right, #c00000, #0070c0)')
})

test('a computed gradient is read back as the menu names it: Chromium omits `to bottom` and swaps `to bottom right`', () => {
  assert.deepEqual(readGradient('linear-gradient(to right, rgb(192, 0, 0), rgb(0, 112, 192))'), { dir: 'to right', from: '#c00000', to: '#0070c0' })
  assert.equal(readGradient('linear-gradient(to right bottom, rgb(192, 0, 0), rgb(0, 112, 192))')?.dir, 'to bottom right')
  assert.equal(readGradient('linear-gradient(rgb(192, 0, 0), rgb(0, 112, 192))')?.dir, 'to bottom')
  assert.equal(readGradient('linear-gradient(to top, rgb(192, 0, 0), rgb(0, 112, 192))')?.dir, 'to top')
  assert.equal(readGradient('none'), null)
  assert.equal(readGradient('linear-gradient(45deg, rgb(1, 2, 3), rgb(4, 5, 6))'), null)
})

test('the ribbon is seven groups in the brief\'s order, each with two rows, filled to the right edge', () => {
  const src = read('src/ui-editor/Ribbon.tsx')
  assert.deepEqual([...src.matchAll(/<Group id="(\w+)" name=\{P\.groups\.(\w+)\}/g)].map((m) => m[2]), ['font', 'paragraph', 'size', 'shapeStyles', 'spacing', 'arrange', 'grid'])
  assert.deepEqual([panel.groups.font, panel.groups.paragraph, panel.groups.size, panel.groups.shapeStyles, panel.groups.spacing, panel.groups.arrange, panel.groups.grid], ['Font', 'Paragraph', 'Size', 'Shape Styles', 'Spacing', 'Arrange', 'Grid'])
  assert.deepEqual(Object.keys(RIBBON_COLUMNS), ['Font', 'Paragraph', 'Size', 'Shape Styles', 'Spacing', 'Arrange', 'Grid'])
  for (const hook of ['data-ribbon-group', 'data-row', 'data-stretch', 'data-fixed-icon', 'data-row-label', 'data-numbox', 'data-group-label', 'data-spin']) assert.ok(src.includes(hook), hook)
  const css = read('src/ui-editor/UiEditorTool.css')
  assert.match(css, /\.ue-numbox \{[^}]*height: 28px/s)
  assert.match(css, /\[data-stretch\] \{[^}]*flex: 1 1 0/s)
  assert.match(css, /\.ue-tool \.ue-ribbon \[data-fixed-icon\] \{[^}]*width: 28px/s)
})

test('the menu primitive: aria-expanded on the button, role menu, items that are marked, Escape and an outside click close it and give the focus back', () => {
  const src = read('src/ui-editor/Menu.tsx')
  assert.match(src, /aria-haspopup="menu"/)
  assert.match(src, /aria-expanded=\{open\}/)
  assert.match(src, /role="menu"/)
  assert.match(src, /aria-checked=/)
  assert.match(src, /e\.key === 'Escape'/)
  assert.match(src, /e\.key === 'ArrowRight'/)
  assert.match(src, /e\.key === 'ArrowLeft'/)
  assert.match(src, /document\.addEventListener\('click', away, true\)/)
  assert.match(src, /createPortal\(/, 'drawn in <body>, outside the ribbon container')
})

test('a number box has spin arrows that are not tab stops, named for the screen reader, and a typed value commits each time', () => {
  const src = read('src/ui-editor/Ribbon.tsx')
  assert.match(src, /role="button" data-spin=\{dir\} data-for=\{name\}/)
  assert.doesNotMatch(src.slice(src.indexOf('function SpinArrow'), src.indexOf('function NumberInput')), /tabIndex/)
  // the typed-value commit flag is made new with the input (it was never reset in round 5, so a second typed value in the same box was ignored)
  assert.match(src, /<NumberInput key=\{stamp\} name=\{name\}/)
})
