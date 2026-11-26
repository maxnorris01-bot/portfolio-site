import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FAMILIES, ORIGINAL_FAMILIES, SYSTEM_FONTS, familyChoices } from '../src/ui-editor/ribbonfields.ts'
import { limits, paragraphs } from '../src/data/uiEditor.ts'

const root = new URL('..', import.meta.url).pathname
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const GENERIC = ['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui']
const tokens = (v: string) => v.split(',').map((t) => t.trim())

// ---- formatting round 7a: more fonts, and the Sides popover that fits ----

test('the twelve originals stay first and in order, then 29 system fonts in four groups; the list is the two together', () => {
  assert.equal(ORIGINAL_FAMILIES.length, 12)
  assert.deepEqual(ORIGINAL_FAMILIES.map((f) => f.label), ['Georgia', 'Times New Roman', 'Arial', 'Helvetica', 'Verdana', 'Trebuchet MS', 'Tahoma', 'Courier New', 'system-ui', 'serif', 'sans-serif', 'monospace'])
  assert.equal(SYSTEM_FONTS.length, 29)
  assert.deepEqual(FAMILIES.slice(0, 12), ORIGINAL_FAMILIES)
  assert.deepEqual(FAMILIES.slice(12).map((f) => f.label), SYSTEM_FONTS.map((f) => f.label))
  const order = SYSTEM_FONTS.map((f) => f.group)
  assert.deepEqual([...new Set(order)], ['serif', 'sans-serif', 'monospace', 'display'], 'the groups follow each other, in this order')
  assert.deepEqual(order, [...order].sort((a, b) => ['serif', 'sans-serif', 'monospace', 'display'].indexOf(a) - ['serif', 'sans-serif', 'monospace', 'display'].indexOf(b)))
})

test('every font the brief names is there, labels are unique and show a name only', () => {
  const names = SYSTEM_FONTS.map((f) => f.label)
  for (const n of ['Palatino Linotype', 'Garamond', 'Baskerville', 'Cambria', 'Constantia', 'Didot', 'Rockwell', 'Segoe UI', 'Calibri', 'Candara', 'Century Gothic', 'Gill Sans', 'Optima', 'Futura', 'Franklin Gothic Medium', 'Lucida Sans Unicode', 'Consolas', 'Menlo', 'Monaco', 'Lucida Console', 'Impact', 'Arial Black', 'Comic Sans MS', 'Brush Script MT', 'Copperplate']) assert.ok(names.includes(n), n)
  const all = FAMILIES.map((f) => f.label)
  assert.equal(new Set(all).size, all.length)
  assert.ok(all.every((l) => !/[,"']/.test(l)))
})

test('every stack ends in a generic family, a name with a space is double-quoted, the first name is the font itself, and nothing is a web font', () => {
  for (const f of SYSTEM_FONTS) {
    const t = tokens(f.value)
    assert.ok(GENERIC.includes(t[t.length - 1]), `${f.label}: ${f.value}`)
    for (const x of t) if (/\s/.test(x)) assert.match(x, /^".*"$/, `${f.label}: ${x}`)
    assert.equal(t[0].replace(/"/g, ''), f.label, `${f.label} is the first name of its stack`)
    assert.doesNotMatch(f.value, /url\(|@import|http/i)
  }
  assert.ok(FAMILIES.every((f) => GENERIC.includes(tokens(f.value).pop() ?? '')))
})

test('the select\'s options: the page\'s own family first (by its first name), then the whole list; no free text, no link, no @import', () => {
  const o = familyChoices('Georgia, "Times New Roman", serif')
  assert.equal(o.length, 1 + FAMILIES.length)
  assert.equal(o[0].label, 'Georgia')
  assert.equal(o[0].value, 'Georgia, "Times New Roman", serif')
  assert.deepEqual(o.slice(1), FAMILIES)
  const ribbon = read('src/ui-editor/Ribbon.tsx')
  const family = ribbon.slice(ribbon.indexOf("kind === 'family'"), ribbon.indexOf("kind === 'weight'"))
  assert.match(family, /<select/)
  assert.doesNotMatch(family, /<input|<datalist/)
  assert.doesNotMatch(read('src/ui-editor/ribbonfields.ts'), /@import|<link|fonts\.googleapis/)
})

test('the limits list says a font shows only if the computer has it, and its paragraphs stay six of at most 50 words', () => {
  assert.ok(limits.items.some((t) => /Fonts show only if your computer has them/.test(t)))
  const ps = paragraphs(limits.items, limits.groups)
  assert.ok(ps.length <= 6)
  for (const p of ps) assert.ok(p.split(/\s+/).length <= 50, p.slice(0, 40))
  assert.equal(ps.join(' '), limits.items.join(' '))
})

test('the Sides popover is as wide as its steppers, never wider than the window, and is moved left when it would leave it; Escape and the hooks are kept', () => {
  const css = read('src/ui-editor/UiEditorTool.css')
  const rule = css.slice(css.indexOf('.ue-popover {'), css.indexOf('.ue-sidec {'))
  assert.match(rule, /width: max-content;/)
  assert.match(rule, /max-width: calc\(100vw - 16px\);/)
  assert.doesNotMatch(rule, /max-width: 100%/)
  const ribbon = read('src/ui-editor/Ribbon.tsx')
  assert.match(ribbon, /useLayoutEffect\(\(\) => \{\s*const p = popover\.current/)
  assert.match(ribbon, /window\.innerWidth - 8/)
  for (const keep of ['className="ue-popover"', 'role="dialog"', 'data-sides-popover', "e.key === 'Escape'", 'closeSides(true)', 'className="ue-sidec"']) assert.ok(ribbon.includes(keep), keep)
})
