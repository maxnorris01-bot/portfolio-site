import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CHIP_LIMIT, mergeChips, refineTerm, requestChips, splitChips } from '../src/shop/chips.ts'
import { CHIPS_FEWER, CHIPS_LABEL, chipsMore } from '../src/shop/copy.ts'
import type { ClarifyAnswerChip, ParsedQuery, RefineChip } from '../src/shop/types.ts'

const query: ParsedQuery = {
  category: 'sofa',
  price_max: 1000,
  style_terms: ['modern'],
  material_terms: ['boucle'],
  color_terms: ['oatmeal'],
  avoid: ['walmart'],
  must_have: ['3-seat'],
}
const answer = (dimension: string, label: string): ClarifyAnswerChip => ({ id: `answer:q_${dimension}`, question: `Q ${dimension}?`, label, dimension })
const labels = (q: ParsedQuery | null, a: ClarifyAnswerChip[], r: RefineChip[]) => mergeChips(requestChips(q), a, r).map((c) => c.label)

test('empty states: no answers and no refinements leave the parsed chips, plain facts first, then the removable ones', () => {
  assert.deepEqual(labels(query, [], []), ['sofa', 'Up to $1,000', 'modern', 'Must have: 3-seat', 'Material: boucle', 'Colour: oatmeal', 'Avoid: walmart'])
  assert.deepEqual(labels(null, [], []), [])
  assert.deepEqual(labels(null, [answer('color', 'Cream')], []), ['Cream'], 'answers alone')
  assert.deepEqual(labels(null, [], [{ id: 'rf-1', label: 'More wood' }]), ['More wood'], 'refinements alone')
})

test('an answer replaces the parsed chips of its dimension; with none to replace it is added', () => {
  const out = mergeChips(requestChips(query), [answer('color', 'Walnut or brown'), answer('shape', 'Curved'), answer('size', 'Under 70 in')], [])
  const l = out.map((c) => c.label)
  assert.ok(!l.includes('Colour: oatmeal'))
  assert.ok(l.includes('Material: boucle'), 'other dimensions stay')
  assert.deepEqual(l.slice(-3), ['Walnut or brown', 'Curved', 'Under 70 in'])
  assert.equal(l.filter((x) => /walnut/i.test(x)).length, 1, 'one chip per dimension')
  assert.deepEqual(labels({ material_terms: ['boucle', 'velvet'] }, [answer('material', 'Linen')], []), ['Linen'], 'every parsed chip of the dimension goes')
  assert.deepEqual(labels({ style_terms: ['modern'], must_have: ['3-seat'] }, [answer('style', 'Mid-century'), answer('feature', 'Storage')], []), ['Mid-century', 'Storage'], 'style and feature replace too')
})

test('an answer chip removes through POST /refine/remove with its id; a plain fact has no remove; a parsed term removes by context', () => {
  const out = mergeChips(requestChips(query), [answer('color', 'Cream')], [])
  const by = (label: string) => out.find((c) => c.label === label)
  assert.deepEqual(by('Cream')?.remove, { type: 'refine', id: 'answer:q_color' })
  assert.equal(by('Cream')?.title, 'Q color?')
  assert.equal(by('sofa')?.remove, null)
  assert.deepEqual(by('Material: boucle')?.remove, { type: 'context', kind: 'material', value: 'boucle' })
})

test('a refinement beats a parsed chip with the same term', () => {
  assert.equal(refineTerm({ id: 'r', label: 'No Walmart', text: 'no Walmart' }), 'walmart')
  assert.equal(refineTerm({ id: 'r', label: 'Focus on cream' }), 'cream')
  const l = labels(query, [], [{ id: 'rf-1', kind: 'avoid', label: 'No Walmart', text: 'no Walmart' }])
  assert.ok(!l.includes('Avoid: walmart') && l.includes('No Walmart'))
  const c = labels({ color_terms: ['cream'] }, [], [{ id: 'rf-2', label: 'Focus on cream', text: 'focus on cream', approximate: true }])
  assert.deepEqual(c, ['Focus on cream (approximate)'])
  assert.ok(labels(query, [], [{ id: 'rf-3', label: 'More wood', text: 'more wood' }]).includes('Avoid: walmart'), 'a different term keeps the parsed chip')
  const r = mergeChips([], [], [{ id: 'rf-1', label: 'No Walmart' }])
  assert.deepEqual(r[0].remove, { type: 'refine', id: 'rf-1' }, 'a refinement removes as before')
})

test('overflow: the first eight show, the rest sit behind "+N more"; expanded shows all; eight or fewer need no chip', () => {
  const nine = Array.from({ length: 9 }, (_, i) => i)
  assert.equal(CHIP_LIMIT, 8)
  assert.deepEqual(splitChips(nine, false), { shown: nine.slice(0, 8), hidden: 1 })
  assert.deepEqual(splitChips(nine, true), { shown: nine, hidden: 0 })
  assert.deepEqual(splitChips(nine.slice(0, 8), false), { shown: nine.slice(0, 8), hidden: 0 })
  assert.deepEqual(splitChips([], false), { shown: [], hidden: 0 })
})

test('copy (DRAFT): the row label and the more / fewer chips', () => {
  assert.equal(CHIPS_LABEL, "What I'm searching for")
  assert.equal(chipsMore(2), '+2 more')
  assert.equal(CHIPS_FEWER, 'Show fewer')
})
