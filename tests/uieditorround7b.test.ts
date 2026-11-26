import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { GRID_COLUMNS, GRID_GREYS, GRID_HUES, GRID_LIGHTS, RECENT_MAX, STANDARD_COLOURS, colourGrid, pushRecent, toHex } from '../src/ui-editor/menus.ts'
import { getRecents, recordRecent, subscribeRecents } from '../src/ui-editor/recents.ts'

const root = new URL('..', import.meta.url).pathname
const read = (p: string) => readFileSync(join(root, p), 'utf8')

// ---- formatting round 7b: the colour grid, the recent colours and the picker ----

/** The 60 values of the locked table in docs/ui-editor-gate-rules-round7b.md section 2, row by row. */
const lockedGrid = (): string[] => {
  const md = read('docs/ui-editor-gate-rules-round7b.md')
  const rows = md.split('\n').filter((l) => /^\| (1 grey|[2-6] \(S 70)/.test(l))
  return rows.flatMap((l) => [...l.matchAll(/`(#[0-9a-f]{6})`/g)].map((m) => m[1]))
}

test('the grid generator gives exactly the 60 values of the locked table, in order', () => {
  const locked = lockedGrid()
  assert.equal(locked.length, 60)
  assert.deepEqual(colourGrid(), locked)
})

test('the grid: 10 columns by 6 rows, six-digit lower-case hex, all different; the grey row and the hue rows are as the brief says', () => {
  const g = colourGrid()
  assert.equal(GRID_COLUMNS, 10)
  assert.equal(g.length, 60)
  assert.ok(g.every((c) => /^#[0-9a-f]{6}$/.test(c)))
  assert.equal(new Set(g).size, 60)
  assert.deepEqual([...GRID_GREYS], [100, 95, 85, 75, 50, 35, 25, 15, 5, 0])
  assert.deepEqual([...GRID_HUES], [0, 28, 50, 90, 140, 175, 215, 245, 280, 330])
  assert.deepEqual([...GRID_LIGHTS], [30, 45, 60, 75, 88])
  assert.equal(g[0], '#ffffff')
  assert.equal(g[9], '#000000')
  assert.ok(g.slice(0, 10).every((c) => c[1] === c[3] && c[3] === c[5] && c[2] === c[4] && c[4] === c[6]), 'the first row is grey')
  // rows 2 to 6 get lighter: the sum of the channels grows down every column
  for (let col = 0; col < 10; col++) {
    const sum = (c: string) => parseInt(c.slice(1, 3), 16) + parseInt(c.slice(3, 5), 16) + parseInt(c.slice(5, 7), 16)
    for (let row = 1; row < 5; row++) assert.ok(sum(g[10 * row + col]) < sum(g[10 * (row + 1) + col]), `column ${col + 1}, row ${row + 1}`)
  }
  // the grid's own conversion agrees with the colour reader the page already had
  assert.equal(g[10], toHex('hsl(0, 70%, 30%)'))
})

test('the recent colours: newest first, no duplicates, six-digit lower-case hex, at most eight; a non-colour changes nothing', () => {
  assert.equal(RECENT_MAX, 8)
  assert.deepEqual(pushRecent([], '#FF0000'), ['#ff0000'])
  assert.deepEqual(pushRecent(['#ff0000'], '#abc'), ['#aabbcc', '#ff0000'])
  assert.deepEqual(pushRecent(['#aabbcc', '#ff0000'], '#ff0000'), ['#ff0000', '#aabbcc'], 'a repeat moves to the front without a duplicate')
  assert.deepEqual(pushRecent(['#ff0000'], 'transparent'), ['#ff0000'])
  assert.deepEqual(pushRecent(['#ff0000'], 'none'), ['#ff0000'])
  let l: string[] = []
  for (let i = 0; i < 9; i++) l = pushRecent(l, `#00000${i}`)
  assert.equal(l.length, 8)
  assert.equal(l[0], '#000008')
  assert.ok(!l.includes('#000000'), 'the oldest of nine is gone')
  const input = ['#111111']
  pushRecent(input, '#222222')
  assert.deepEqual(input, ['#111111'], 'the list given is not changed')
})

test('the recents store: one list, in memory only, listeners told once per change, no storage anywhere', () => {
  let n = 0
  const off = subscribeRecents(() => n++)
  const before = getRecents().length
  recordRecent('#123456')
  recordRecent('#123456')
  assert.equal(n, 1, 'a colour that is already first changes nothing')
  assert.equal(getRecents()[0], '#123456')
  assert.equal(getRecents().length, before + 1)
  off()
  recordRecent('#654321')
  assert.equal(n, 1)
  const src = read('src/ui-editor/recents.ts')
  assert.doesNotMatch(src.split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n'), /localStorage|sessionStorage|document\.cookie|indexedDB/)
})

test('the picker applies one edit, on `change`, never on `input`; its input lives in <body>, outside the ribbon and the menu, and the item closes the menu then opens it', () => {
  const menu = read('src/ui-editor/Menu.tsx')
  assert.match(menu, /addEventListener\('change', on\)/)
  assert.doesNotMatch(menu, /addEventListener\('input'/)
  assert.doesNotMatch(menu, /onInput=|onChange=\{[^}]*pick/)
  assert.match(menu, /type="color"/)
  assert.match(menu, /createPortal\(<input ref=\{pickInput\} type="color"/, 'in <body>, not in the ribbon whose controls the earlier checks count')
  assert.match(menu, /data-picker=\{name\}/)
  assert.match(menu, /el\.showPicker\(\)/)
  assert.match(menu, /el\.click\(\)/)
  const choose = menu.slice(menu.indexOf('const choose ='), menu.indexOf('const onButtonKey'))
  assert.ok(choose.indexOf('close(true)') < choose.indexOf('showPicker'), 'the menu is closed first')
  // the input is rendered by the button (outside the Panel that is removed with the menu)
  const panel = menu.slice(menu.indexOf('function Panel'))
  assert.doesNotMatch(panel, /type="color"/)
})

test('every colour menu gains the grid, the recents and Pick any colour…, in this order after Standard colours; the other menus and Gradient From and To do not', () => {
  const ribbon = read('src/ui-editor/Ribbon.tsx')
  const parts = ribbon.slice(ribbon.indexOf('const colourParts ='), ribbon.indexOf('const unlinkedDot'))
  const at = (s: string) => parts.indexOf(s)
  assert.ok(at('P.pageColours') < at('P.standardColours') && at('P.standardColours') < at('P.colourGrid') && at('P.colourGrid') < at('P.recentColours') && at('P.recentColours') < at('P.pickColour') && at('P.pickColour') < at('none.label') && at('none.label') < at('P.moreColours'))
  assert.match(parts, /recents\.length \?/, 'Recent colours only when there is one')
  assert.equal((ribbon.match(/picker=\{\{ current, onPick/g) ?? []).length, 3, 'Font colour, Shape Fill and Shape Outline')
  const gradient = ribbon.slice(ribbon.indexOf('const gradientItem'), ribbon.indexOf('/** Shape Fill: the bucket'))
  assert.doesNotMatch(gradient, /colourGrid|recents|pickColour/)
  // what is recorded: a swatch, a grid cell, a recent, the hex box and the picker; not "No fill" or "No outline"
  assert.match(ribbon, /const applyColour = \(f: Field, hex: string\) => \{\s*writeColour\(f, hex\)\s*recordRecent\(hex\)/)
  for (const label of ['label: P.noFill, run: () => writeColour(f, svg ? \'none\' : \'transparent\')', 'label: P.noOutline, run: () => (svg ? writeColour(f, \'none\') : onSet(']) assert.ok(ribbon.includes(label), label)
  assert.doesNotMatch(ribbon.slice(ribbon.indexOf('label: P.noFill'), ribbon.indexOf('label: P.noFill') + 90), /recordRecent|applyColour/, 'No fill writes without recording')
  assert.equal(STANDARD_COLOURS.length, 8)
})

test('the words and the sizes: Grid #rrggbb, Recent #rrggbb, Pick any colour…; 20 px cells ten to a row, 44 px cells that wrap where items are 44 px', () => {
  const data = read('src/data/uiEditor.ts')
  assert.match(data, /colourGrid: 'Colour grid'/)
  assert.match(data, /recentColours: 'Recent colours'/)
  assert.match(data, /pickColour: 'Pick any colour…'/)
  assert.match(data, /gridName: \(hex: string\) => `Grid \$\{hex\}`/)
  assert.match(data, /recentName: \(hex: string\) => `Recent \$\{hex\}`/)
  const css = read('src/ui-editor/UiEditorTool.css')
  assert.match(css, /\.ue-swatch-grid \{\s*max-width: 244px;/)
  assert.match(css, /@media \(max-width: 1047px\) \{\s*\.ue-swatch-grid \{\s*max-width: 388px;/)
  assert.match(css, /@media \(max-width: 999px\) \{\s*\.ue-swatch-grid \{\s*max-width: none;/)
  assert.match(css, /\.ue-picker \{[^}]*position: fixed;[^}]*opacity: 0;[^}]*pointer-events: none;/)
})

// ---- the thin outline around the Desktop preview ----
test('the Desktop preview has a one-pixel dark outline made of a box-shadow (no size added, no overflow clipping), kept one screen pixel under the scale; Phone and Tablet and bezel() are not touched', () => {
  const css = read('src/ui-editor/UiEditorTool.css')
  const rule = css.slice(css.indexOf('.ue-device.is-desktop:not([data-device-frame]) {'), css.indexOf('.ue-device.is-phone[data-device-frame] {'))
  assert.match(rule, /box-shadow: 0 0 0 calc\(1px \* var\(--ue-inv, 1\)\) #1b1d22;/)
  assert.match(rule, /border-radius: 4px;/)
  assert.doesNotMatch(rule, /overflow|border:|padding/)
})
