import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MAX_BYTES } from '../src/data/uiEditor.ts'
import { HANDLES, arrowNudge, cssSizeFor, handleAxes, movedFar, resizedBox } from '../src/ui-editor/geometry.ts'
import { downloadName, fromFiles, fromPaste, hasScript, kindOfText, stylesheetLinks } from '../src/ui-editor/intake.ts'
import { htmlFields, rowOfPin, svgFields, type Computed } from '../src/ui-editor/panelfields.ts'
import { noteSentence, parseColour, parseLength, parseSides, parseWeight, pickerValue, refusalSentence, showColour, showLength, showSides } from '../src/ui-editor/values.ts'

test('lengths: a bare number is px, units stay, auto only where allowed, junk and negatives are refused', () => {
  assert.equal(parseLength('52'), '52px')
  assert.equal(parseLength(' 3.5REM '), '3.5rem')
  assert.equal(parseLength('50%'), '50%')
  assert.equal(parseLength('auto'), null)
  assert.equal(parseLength('auto', { auto: true }), 'auto')
  assert.equal(parseLength('-4'), null)
  assert.equal(parseLength('-4', { negative: true }), '-4px')
  for (const bad of ['', 'abc', '5 px', '1e', '12foo']) assert.equal(parseLength(bad), null, bad)
  assert.equal(parseSides('8 12px'), '8px 12px')
  assert.equal(parseSides('1 2 3 4 5'), null)
  assert.equal(parseSides('8 x'), null)
})

test('colours, weights and the text a field shows from a computed style', () => {
  assert.equal(parseColour('#ABC'), '#abc')
  assert.equal(parseColour('rgb(1, 2, 3)'), 'rgb(1, 2, 3)')
  assert.equal(parseColour('tomato'), 'tomato')
  assert.equal(parseColour('red; x'), null)
  assert.equal(parseColour('#12'), null)
  assert.equal(parseWeight('700'), '700')
  assert.equal(parseWeight('bold'), 'bold')
  assert.equal(parseWeight('heavy'), null)
  assert.equal(showLength('52.000001px'), '52px')
  assert.equal(showLength('35.4545px'), '35.45px')
  assert.equal(showLength('auto'), 'auto')
  assert.equal(showSides('24px 28px'), '24px 28px')
  assert.equal(showColour('rgb(28, 43, 41)'), '#1c2b29')
  assert.equal(showColour('rgba(0, 0, 0, 0)'), 'transparent')
  assert.equal(pickerValue('#1c2b29'), '#1c2b29')
  assert.equal(pickerValue('transparent'), null)
})

test('a refusal is the engine\'s own reason as one plain sentence under a short lead; a note names the size it left alone', () => {
  const msg = 'the width of this flex item cannot be set exactly: its flex-grow is above 0 (setting flex-grow: 0 would also change how its siblings share the space)'
  assert.equal(refusalSentence('Not applied:', { code: 'flex-grow', message: msg }), `Not applied: The width of this flex item cannot be set exactly: its flex-grow is above 0 (setting flex-grow: 0 would also change how its siblings share the space).`)
  assert.equal(refusalSentence('Not applied:', { code: 'x', message: 'it is no good.' }), 'Not applied: It is no good.')
  const note = noteSentence({ property: 'width', condition: '@media (max-width: 640px)', value: '50%', reason: 'left alone: 50% is not a fixed px, rem or em length; the new width applies only inside @media (min-width: 641px)' })
  assert.equal(note, 'The phone width was left alone: 50% is not a fixed px, rem or em length; the new width applies only inside desktop sizes (from 641px wide).')
  assert.match(noteSentence({ property: 'padding', condition: '(base)', value: 'calc(1px + 2px)', reason: 'calc(1px + 2px) is not a plain length' }), /was copied as the page wrote it/)
})

test('pointer geometry: handles move the edges they sit on, a size never goes below 1 px, content-box elements lose padding and border', () => {
  const b = { left: 100, top: 50, width: 200, height: 80 }
  assert.deepEqual(resizedBox(b, 'e', -40, 99), { left: 100, top: 50, width: 160, height: 80 })
  assert.deepEqual(resizedBox(b, 's', 99, 30), { left: 100, top: 50, width: 200, height: 110 })
  assert.deepEqual(resizedBox(b, 'se', 40, 20), { left: 100, top: 50, width: 240, height: 100 })
  assert.deepEqual(resizedBox(b, 'nw', 10, 10), { left: 110, top: 60, width: 190, height: 70 })
  assert.equal(resizedBox(b, 'e', -999, 0).width, 1)
  assert.equal(HANDLES.length, 8)
  assert.deepEqual(handleAxes('e'), { width: true, height: false })
  assert.deepEqual(handleAxes('se'), { width: true, height: true })
  const m = { sizing: 'content-box', paddingX: 20, paddingY: 10, borderX: 2, borderY: 2 }
  assert.deepEqual(cssSizeFor({ left: 0, top: 0, width: 222, height: 92 }, m), { width: 200, height: 80 })
  assert.deepEqual(cssSizeFor({ left: 0, top: 0, width: 222, height: 92 }, { ...m, sizing: 'border-box' }), { width: 222, height: 92 })
  assert.equal(movedFar(1, 1), false)
  assert.equal(movedFar(3, 0), true)
  assert.deepEqual(arrowNudge('ArrowLeft', false), { dx: -1, dy: 0 })
  assert.deepEqual(arrowNudge('ArrowDown', true), { dx: 0, dy: 10 })
  assert.equal(arrowNudge('a', false), null)
})

const files = (...f: [string, string][]) => f.map(([name, text]) => ({ name, text, bytes: text.length }))

test('Upload: one HTML or SVG and at most one CSS, the CSS matched to the page\'s link by name, other types and over 1 MB refused, warnings for scripts and missing styles', () => {
  const html = '<link rel="stylesheet" href="css/site.css"><script>1</script><p>x</p>'
  const ok = fromFiles(files(['page.html', html], ['site.css', 'p{}']))
  assert.ok(ok.ok && ok.doc.companions['css/site.css'] === 'p{}' && ok.doc.kind === 'html')
  assert.ok(ok.ok && ok.warnings.length === 1 && /script/.test(ok.warnings[0]))
  const missing = fromFiles(files(['page.html', html]))
  assert.ok(missing.ok && missing.warnings.some((w) => w.includes('css/site.css') && /not supplied/.test(w)))
  const unused = fromFiles(files(['page.html', '<p>x</p>'], ['other.css', 'p{}']))
  assert.ok(unused.ok && unused.warnings.some((w) => /not linked/.test(w)))
  assert.ok(fromFiles(files(['a.svg', '<svg></svg>'])).ok)
  for (const bad of [files(['a.png', 'x']), files(['a.html', 'x'], ['b.html', 'y']), files(['a.css', 'x']), files(['a.html', 'x'], ['b.css', 'y'], ['c.css', 'z'])]) assert.equal(fromFiles(bad).ok, false)
  const big = fromFiles([{ name: 'a.html', text: '', bytes: MAX_BYTES + 1 }])
  assert.ok(!big.ok && /1 MB/.test(big.message))
})

test('Paste: SVG or HTML by its first tag, the pasted CSS used for the page\'s one stylesheet link, nothing pasted refused', () => {
  assert.equal(kindOfText('<?xml version="1.0"?>\n<!-- c -->\n<svg xmlns="x"></svg>'), 'svg')
  assert.equal(kindOfText('<!doctype html><svg></svg>'), 'html')
  const p = fromPaste('<link rel=stylesheet href=a.css><p>x</p>', 'p{}')
  assert.ok(p.ok && p.doc.companions['a.css'] === 'p{}' && p.doc.file === 'pasted.html')
  assert.ok(fromPaste('<svg></svg>', '').ok)
  assert.equal(fromPaste('   ', '').ok, false)
  assert.deepEqual(stylesheetLinks('<link href="a.css" rel="stylesheet"><link rel="icon" href="i.png">'), ['a.css'])
  assert.equal(hasScript('<SCRIPT src=x></SCRIPT>'), true)
  assert.equal(hasScript('<p>script</p>'), false)
})

test('download names: the page gets -edited before its extension; a companion stylesheet keeps its own name so the page\'s link still works', () => {
  assert.equal(downloadName('landing.html', true), 'landing-edited.html')
  assert.equal(downloadName('chart.svg', true), 'chart-edited.svg')
  assert.equal(downloadName('css/landing.css', false), 'landing.css')
  assert.equal(downloadName('README', true), 'README-edited')
})

const cs = { fontFamily: 'Georgia', fontSize: '44px', fontWeight: '700', color: 'rgb(0, 0, 0)', textAlign: 'start', width: '280px', height: '180px', padding: '0px', margin: '0px', backgroundColor: 'rgba(0, 0, 0, 0)', borderTopColor: 'rgb(0, 0, 0)', borderTopWidth: '0px', borderTopStyle: 'none', borderRadius: '0px', fill: 'rgb(1, 2, 3)', stroke: 'none', strokeWidth: '1px', textAnchor: 'start' } as Computed

test('the panel has all four groups\' fields for HTML, and an SVG maps background to fill and border to stroke', () => {
  const html = htmlFields(cs)
  assert.deepEqual(html.map((f) => f.label), ['Font family', 'Font size', 'Font weight', 'Text colour', 'Alignment', 'Width', 'Height', 'Padding', 'Margin', 'Background', 'Border colour', 'Border width', 'Border radius'])
  const by = (p: string) => html.find((f) => f.prop === p)!
  assert.deepEqual(by('font-size').write('52', cs), { 'font-size': '52px' })
  assert.equal(by('font-size').write('big', cs), null)
  assert.deepEqual(by('border-width').write('2', cs), { 'border-width': '2px', 'border-style': 'solid' }, 'a width needs a style to show')
  assert.deepEqual(by('border-width').write('2', { ...cs, borderTopStyle: 'dashed' } as Computed), { 'border-width': '2px' })
  assert.equal(by('background-color').read(cs), 'transparent')
  const rect = svgFields({ localName: 'rect' }, true, cs)
  assert.deepEqual(rect.find((f) => f.label === 'Background')?.write('#fff', cs), { fill: '#fff' })
  assert.deepEqual(rect.find((f) => f.label === 'Border colour')?.prop, 'stroke')
  assert.deepEqual(rect.find((f) => f.label === 'Width')?.write('60px', cs), { width: '60' }, 'SVG sizes are unitless')
  assert.equal(rect.some((f) => f.label === 'Padding' || f.label === 'Text colour'), false)
  const text = svgFields({ localName: 'text' }, false, cs)
  assert.equal(text.find((f) => f.label === 'Text colour')?.prop, 'fill')
  assert.equal(text.some((f) => f.label === 'Background' || f.label === 'Width'), false)
  assert.equal(rowOfPin('padding-top', html.map((f) => f.prop)), 'padding')
  assert.equal(rowOfPin('transform', []), 'position')
  assert.equal(rowOfPin('font-size', html.map((f) => f.prop)), 'font-size')
})
