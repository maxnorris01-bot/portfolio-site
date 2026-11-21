import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

const css = readFileSync(join(new URL('..', import.meta.url).pathname, 'src/pages/UiEditor.css'), 'utf8')
const rule = (sel: string) => {
  const i = css.indexOf(`${sel} {`)
  assert.ok(i >= 0, sel)
  return css.slice(i, css.indexOf('}', i))
}

test('the lists under the tool flow in columns about 24 to 28rem wide, and no item is split between columns', () => {
  const list = rule('.ue-list')
  const m = /columns:\s*auto\s+([\d.]+)rem/.exec(list)
  assert.ok(m, 'columns: auto <width>rem')
  const width = Number(m[1])
  assert.ok(width >= 24 && width <= 28, `${width}rem`)
  assert.match(rule('.ue-list li'), /break-inside:\s*avoid/)
})

test('a window under 1400px has two columns and under 1000px one, and every item is at most a reading line (34em, about 70 characters) wide', () => {
  const two = css.slice(css.indexOf('@media (max-width: 1399px)'))
  assert.match(two.slice(0, two.indexOf('}\n}') + 3), /columns:\s*2;/)
  const one = css.slice(css.indexOf('@media (max-width: 999px)'))
  assert.match(one.slice(0, one.indexOf('}\n}') + 3), /columns:\s*1;/)
  assert.match(rule('.ue-list li'), /max-width:\s*34em/)
})

test('the five "How it works" step cards stay a grid of cards (the columns are for the lists only)', () => {
  assert.match(rule('.ue-pipeline'), /display:\s*grid/)
  assert.doesNotMatch(rule('.ue-pipeline'), /(^|[\s;{])columns:/)
})
