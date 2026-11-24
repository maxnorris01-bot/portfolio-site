import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { copyName, nameList, sectionHeader } from '../src/ui-editor/sections.ts'
import { PATH_MAX, chainOf, segmentLabel, visiblePath } from '../src/ui-editor/path.ts'
import { compensated, trialOk, type Edges, type Trial } from '../src/ui-editor/resizeedge.ts'
import { messages } from '../src/data/uiEditor.ts'
import { RIBBON_COLUMNS } from '../src/ui-editor/ribbonfields.ts'

const root = new URL('..', import.meta.url).pathname
const read = (p: string) => readFileSync(join(root, p), 'utf8')

// ---- formatting round 5: a laid-out ribbon, one Download, west and north resize, the selection path ----

test('a code section header says the file and its changes, and just the name when nothing changed', () => {
  assert.equal(sectionHeader('landing.css', 1), 'landing.css: 1 change')
  assert.equal(sectionHeader('landing.html', 2), 'landing.html: 2 changes')
  assert.equal(sectionHeader('landing.html', 0), 'landing.html')
})

test('the Copy button is `Copy code` for one file and `Copy <file>` for several', () => {
  assert.equal(copyName(['email.html'], 'email.html'), 'Copy code')
  assert.equal(copyName(['landing.html', 'landing.css'], 'landing.css'), 'Copy landing.css')
})

test('the saved files are listed in plain words', () => {
  assert.equal(nameList(['a.html']), 'a.html')
  assert.equal(nameList(['landing-edited.html', 'landing.css']), 'landing-edited.html and landing.css')
  assert.equal(nameList(['a', 'b', 'c']), 'a, b and c')
  assert.equal(messages.downloaded(nameList(['landing-edited.html', 'landing.css'])), 'Saved landing-edited.html and landing.css.')
})

test('the selection path: labels, the deepest five, an ellipsis when longer', () => {
  assert.equal(segmentLabel('div', null, 'hero-copy'), 'div .hero-copy')
  assert.equal(segmentLabel('a', 'cta', 'cta'), 'a #cta')
  assert.equal(segmentLabel('p', null, null), 'p')
  assert.equal(PATH_MAX, 5)
  assert.deepEqual(visiblePath(['a', 'b', 'c']), { labels: ['a', 'b', 'c'], more: false })
  assert.deepEqual(visiblePath(['a', 'b', 'c', 'd', 'e']), { labels: ['a', 'b', 'c', 'd', 'e'], more: false })
  assert.deepEqual(visiblePath(['a', 'b', 'c', 'd', 'e', 'f', 'g']), { labels: ['c', 'd', 'e', 'f', 'g'], more: true })
})

test('the chain stops below body: html and body are not part of the path', () => {
  type N = { localName: string; parentElement: N | null }
  const html: N = { localName: 'html', parentElement: null }
  const body: N = { localName: 'body', parentElement: html }
  const header: N = { localName: 'header', parentElement: body }
  const h1: N = { localName: 'h1', parentElement: header }
  assert.deepEqual(chainOf(h1).map((n) => n.localName), ['header', 'h1'])
  assert.deepEqual(chainOf(body), [])
  const svg: N = { localName: 'svg', parentElement: null }
  const rect: N = { localName: 'rect', parentElement: svg }
  assert.deepEqual(chainOf(rect).map((n) => n.localName), ['svg', 'rect'], 'an SVG starts at its root')
})

test('west and north: the new size and a margin that keeps the margin box the same size', () => {
  const now = { width: 195.34, height: 43, marginLeft: 0, marginTop: 0 }
  assert.deepEqual(compensated('w', now, { width: 235, height: 43 }), { width: '235px', 'margin-left': '-39.66px' })
  assert.deepEqual(compensated('n', { ...now, height: 180 }, { width: 195, height: 220 }), { height: '220px', 'margin-top': '-40px' })
  assert.deepEqual(Object.keys(compensated('nw', now, { width: 200, height: 50 })).sort(), ['height', 'margin-left', 'margin-top', 'width'])
  assert.deepEqual(compensated('e', now, { width: 200, height: 50 }), {}, 'east and south are not changed')
  assert.equal(compensated('w', { ...now, marginLeft: 10 }, { width: 185.34, height: 43 })['margin-left'], '20px', 'a shrink gives the margin back')
  assert.equal(compensated('w', { ...now, marginLeft: NaN }, { width: 205.34, height: 43 })['margin-left'], '-10px', 'an auto margin counts as 0')
})

test('a west or north trial is kept only when the dragged edge landed, the opposite edge stayed and nothing else moved', () => {
  const before: Edges[] = [[0, 0, 1000, 600], [100, 50, 300, 90], [400, 50, 600, 90], [110, 55, 150, 70]]
  const trial = (after: Edges[], over: Partial<Trial> = {}): Trial => ({ before, after, target: 1, inside: [false, false, false, true], handle: 'w', dLeft: -40, dTop: 0, ...over })
  const good: Edges[] = [[0, 0, 1000, 600], [60, 50, 300, 90], [400, 50, 600, 90], [70, 55, 110, 70]]
  assert.equal(trialOk(trial(good)), true, 'descendants may move with their element')
  assert.equal(trialOk(trial([[0, 0, 1000, 600], [100, 50, 340, 90], [400, 50, 600, 90], [110, 55, 150, 70]])), false, 'the left edge did not follow')
  assert.equal(trialOk(trial([[0, 0, 1000, 600], [60, 50, 340, 90], [400, 50, 600, 90], [70, 55, 110, 70]])), false, 'the right edge moved')
  assert.equal(trialOk(trial([[0, 0, 1000, 600], [60, 50, 300, 90], [440, 50, 640, 90], [70, 55, 110, 70]])), false, 'a neighbour was pushed')
  assert.equal(trialOk(trial([[0, 0, 1000, 600], [100, 40, 300, 90], [400, 50, 600, 90], [110, 45, 150, 60]], { handle: 'n', dLeft: 0, dTop: -40 })), false, 'the top edge moved 10, not 40')
  assert.equal(trialOk(trial([[0, 0, 1000, 600], [100, 10, 300, 90], [400, 50, 600, 90], [110, 15, 150, 30]], { handle: 'n', dLeft: 0, dTop: -40 })), true)
})

test('the column weights of the grid are the measured group widths and are written once, in the stylesheet (round 6 replaced the round 5 weights: groups of two 28 px rows with 8 px of padding)', () => {
  // ROUND 6 (assertion updated, docs/ui-editor-gate-log.md #41): round 5 measured each group's natural width plus 28 px (290, 200, ...) for groups with 14 px padding and 72 px
  // large buttons; round 6 retires that (V01, V02, V04) and measures each group at its smallest (RIBBON_COLUMNS in ribbonfields.ts).
  const w = RIBBON_COLUMNS
  const order = [w.Font, w.Paragraph, w.Size, w['Shape Styles'], w.Spacing, w.Arrange, w.Grid]
  const css = read('src/ui-editor/UiEditorTool.css')
  const track = (n: number) => `minmax(${n}px, ${n}fr)`
  assert.ok(css.includes(`grid-template-columns: ${order.map(track).join(' ')};`), 'seven columns')
  const medium = /@container ue-ribbon \(max-width: (\d+)px\) \{\s*\.ue-rpanel \{\s*grid-template-columns: ([^;]+);/.exec(css)
  assert.ok(medium, 'a medium rule')
  assert.equal(medium[2], order.slice(0, 4).map(track).join(' '), 'two bands on the first four columns')
  assert.equal(Number(medium[1]) + 1, order.reduce((a, b) => a + b, 0) + 4, 'one band from the sum of the weights (and a few px)')
  assert.match(css, /\.ue-rgroup:nth-child\(6\) \{\s*grid-column: 2 \/ span 2/)
  assert.match(css, /\.ue-rgroup \{[^}]*padding: 8px;/)
  assert.match(css, /\.ue-row \{[^}]*height: 28px/)
  assert.match(css, /\.ue-rows \{[^}]*gap: 5px/)
})

test('one card: the bar, the ribbon and the status line are inside one bordered container, the status line without a side border', () => {
  const tool = read('src/ui-editor/UiEditorTool.tsx')
  const css = read('src/ui-editor/UiEditorTool.css')
  const card = tool.slice(tool.indexOf('className="ue-sheet" data-card'), tool.indexOf('{confirm && ('))
  for (const part of ['className="ue-bar"', '<Ribbon', '{result}']) assert.ok(card.includes(part), part)
  assert.match(css, /\.ue-sheet \{[^}]*border: 1px solid var\(--color-border\)/)
  assert.match(css, /\.ue-sheet > \.ue-result\.is-reserved \{[^}]*border: 0;\s*border-top: 1px solid/)
  assert.match(css, /\.ue-result\.is-refusal \{[^}]*box-shadow: inset 4px 0 0/)
})

test('one Download saves every file and there is no File selector; each code section has its own Copy; the walk spans the sections', () => {
  const tool = read('src/ui-editor/UiEditorTool.tsx')
  assert.doesNotMatch(tool, /ue-file|setFileName|fileToShow|handPicked/)
  assert.match(tool, /for \(const f of files\) \{\s*const text = outFiles\[f\]/)
  assert.match(tool, /new Blob\(\[text\]/)
  assert.match(tool, /files\.map\(\(file\) => \(\s*<CodeView key=\{file\}/)
  assert.match(tool, /copyName=\{copyName\(files, file\)\}/)
  assert.match(tool, /target=\{targetFor\(file\)\}/)
  const view = read('src/ui-editor/CodeView.tsx')
  assert.match(view, /data-code-section data-file=\{file\}/)
  assert.match(view, /data-section-header/)
  assert.doesNotMatch(view, /data-change-counter/)
})

test('west and north resize is tried on a scratch preview and falls back to the old behaviour with one plain line; Alt+Up selects the parent and is not a nudge', () => {
  const tool = read('src/ui-editor/UiEditorTool.tsx')
  assert.match(tool, /trialEdges\(session, listRef\.current\.edits, compEdit/)
  assert.match(tool, /run\(plain, what, undefined, line\)/)
  assert.match(messages.edgeFallback.west, /could not follow the pointer/)
  assert.match(messages.edgeFallback.north, /could not follow the pointer/)
  const stage = read('src/ui-editor/Stage.tsx')
  assert.match(stage, /if \(e\.altKey\) return/)
  assert.match(tool, /e\.altKey \|\| e\.key !== 'ArrowUp'|!e\.altKey \|\| e\.key !== 'ArrowUp'/)
  const ribbon = read('src/ui-editor/Ribbon.tsx')
  assert.match(ribbon, /data-path aria-label=\{P\.pathLabel\}/)
  assert.match(ribbon, /aria-label=\{P\.selectParent\}/)
})
