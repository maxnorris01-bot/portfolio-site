// The side panel's fields: what each one shows (read from a computed style), what it accepts, and the CSS (or SVG attribute) it writes as one
// `set` edit. HTML and SVG have their own mapping: an SVG shape's "background" is its fill, its "border" is its stroke. Pure, so it runs under
// node with a stand-in for the computed style (tests/uieditorvalues.test.ts).
import { panel } from '../data/uiEditor.ts'
import { parseColour, parseFamily, parseLength, parseSides, parseWeight, showColour, showFamily, showLength, showSides } from './values.ts'

export type Group = 'text' | 'box' | 'colours'
export type Control = 'text' | 'colour' | 'select'

/** The part of getComputedStyle that the fields read. */
export type Computed = Pick<CSSStyleDeclaration, 'fontFamily' | 'fontSize' | 'fontWeight' | 'color' | 'textAlign' | 'width' | 'height' | 'padding' | 'margin' | 'backgroundColor' | 'borderTopColor' | 'borderTopWidth' | 'borderTopStyle' | 'borderRadius' | 'fill' | 'stroke' | 'strokeWidth' | 'textAnchor'> & { rx?: string }

export interface Field {
  /** The panel row's `data-field` and what the Review list calls the property. */
  prop: string
  label: string
  group: Group
  control: Control
  options?: string[]
  /** The text the field shows for this element. */
  read(cs: Computed): string
  /** The edit's properties for the text typed, or null when it is not a value the field can take. */
  write(text: string, cs: Computed): Record<string, string> | null
}

const SVG_TEXT = new Set(['text', 'tspan', 'textpath'])
const unitless = (v: string): string => v.replace(/px$/i, '')
const withCurrent = (options: string[], current: string) => (options.includes(current) || !current ? options : [current, ...options])

const WEIGHTS = ['100', '200', '300', '400', '500', '600', '700', '800', '900']

/** The fields of the three groups for an HTML element. */
export function htmlFields(cs: Computed): Field[] {
  return [
    { prop: 'font-family', label: panel.fonts, group: 'text', control: 'text', read: (c) => showFamily(c.fontFamily), write: (t) => { const v = parseFamily(t); return v ? { 'font-family': v } : null } },
    { prop: 'font-size', label: panel.fontSize, group: 'text', control: 'text', read: (c) => showLength(c.fontSize), write: (t) => { const v = parseLength(t); return v ? { 'font-size': v } : null } },
    { prop: 'font-weight', label: panel.fontWeight, group: 'text', control: 'select', options: withCurrent(WEIGHTS, cs.fontWeight), read: (c) => c.fontWeight, write: (t) => { const v = parseWeight(t); return v ? { 'font-weight': v } : null } },
    { prop: 'color', label: panel.textColour, group: 'text', control: 'colour', read: (c) => showColour(c.color), write: (t) => { const v = parseColour(t); return v ? { color: v } : null } },
    { prop: 'text-align', label: panel.alignment, group: 'text', control: 'select', options: withCurrent(panel.aligns, cs.textAlign), read: (c) => c.textAlign, write: (t) => (panel.aligns.includes(t) ? { 'text-align': t } : null) },
    { prop: 'width', label: panel.width, group: 'box', control: 'text', read: (c) => showLength(c.width), write: (t) => { const v = parseLength(t, { auto: true }); return v ? { width: v } : null } },
    { prop: 'height', label: panel.height, group: 'box', control: 'text', read: (c) => showLength(c.height), write: (t) => { const v = parseLength(t, { auto: true }); return v ? { height: v } : null } },
    { prop: 'padding', label: panel.padding, group: 'box', control: 'text', read: (c) => showSides(c.padding), write: (t) => { const v = parseSides(t); return v ? { padding: v } : null } },
    { prop: 'margin', label: panel.margin, group: 'box', control: 'text', read: (c) => showSides(c.margin), write: (t) => { const v = parseSides(t, { auto: true, negative: true }); return v ? { margin: v } : null } },
    { prop: 'background-color', label: panel.background, group: 'colours', control: 'colour', read: (c) => showColour(c.backgroundColor), write: (t) => { const v = parseColour(t); return v ? { 'background-color': v } : null } },
    { prop: 'border-color', label: panel.borderColour, group: 'colours', control: 'colour', read: (c) => showColour(c.borderTopColor), write: (t) => { const v = parseColour(t); return v ? { 'border-color': v } : null } },
    {
      prop: 'border-width', label: panel.borderWidth, group: 'colours', control: 'text', read: (c) => showLength(c.borderTopWidth),
      // A border width shows nothing while the border style is none: asking for a width gives the border a solid style too.
      write: (t, c) => { const v = parseSides(t); return v ? { 'border-width': v, ...(c.borderTopStyle === 'none' && parseFloat(v) > 0 ? { 'border-style': 'solid' } : {}) } : null },
    },
    { prop: 'border-radius', label: panel.borderRadius, group: 'colours', control: 'text', read: (c) => showSides(c.borderRadius), write: (t) => { const v = parseSides(t); return v ? { 'border-radius': v } : null } },
  ]
}

/** The fields of an SVG element: shapes have a fill and a stroke, text has a fill as its colour, and only some elements have a size of their own. */
export function svgFields(el: { localName: string }, sizeable: boolean, cs: Computed): Field[] {
  const tag = el.localName.toLowerCase()
  const isText = SVG_TEXT.has(tag)
  const out: Field[] = [
    { prop: 'font-family', label: panel.fonts, group: 'text', control: 'text', read: (c) => showFamily(c.fontFamily), write: (t) => { const v = parseFamily(t); return v ? { 'font-family': v } : null } },
    { prop: 'font-size', label: panel.fontSize, group: 'text', control: 'text', read: (c) => showLength(c.fontSize), write: (t) => { const v = parseLength(t); return v ? { 'font-size': unitless(v) } : null } },
    { prop: 'font-weight', label: panel.fontWeight, group: 'text', control: 'select', options: withCurrent(WEIGHTS, cs.fontWeight), read: (c) => c.fontWeight, write: (t) => { const v = parseWeight(t); return v ? { 'font-weight': v } : null } },
  ]
  if (isText) out.push({ prop: 'fill', label: panel.textColour, group: 'text', control: 'colour', read: (c) => showColour(c.fill), write: (t) => { const v = parseColour(t); return v ? { fill: v } : null } })
  out.push({ prop: 'text-anchor', label: panel.alignment, group: 'text', control: 'select', options: withCurrent(panel.svgAligns, cs.textAnchor), read: (c) => c.textAnchor, write: (t) => (panel.svgAligns.includes(t) ? { 'text-anchor': t } : null) })
  if (sizeable) {
    out.push({ prop: 'width', label: panel.width, group: 'box', control: 'text', read: (c) => showLength(c.width), write: (t) => { const v = parseLength(t); return v ? { width: unitless(v) } : null } })
    out.push({ prop: 'height', label: panel.height, group: 'box', control: 'text', read: (c) => showLength(c.height), write: (t) => { const v = parseLength(t); return v ? { height: unitless(v) } : null } })
  }
  if (!isText) out.push({ prop: 'fill', label: panel.background, group: 'colours', control: 'colour', read: (c) => showColour(c.fill), write: (t) => { const v = parseColour(t); return v ? { fill: v } : null } })
  out.push({ prop: 'stroke', label: panel.borderColour, group: 'colours', control: 'colour', read: (c) => showColour(c.stroke), write: (t) => { const v = parseColour(t); return v ? { stroke: v } : null } })
  out.push({ prop: 'stroke-width', label: panel.borderWidth, group: 'colours', control: 'text', read: (c) => showLength(c.strokeWidth), write: (t) => { const v = parseLength(t); return v ? { 'stroke-width': unitless(v) } : null } })
  if (tag === 'rect') out.push({ prop: 'rx', label: panel.borderRadius, group: 'colours', control: 'text', read: (c) => showLength(c.rx ?? '0px'), write: (t) => { const v = parseLength(t); return v ? { rx: unitless(v) } : null } })
  return out
}

/** The panel row a pinned property belongs to: padding-top is the Padding row, transform and order are the Position row. */
export function rowOfPin(property: string, props: string[]): string | null {
  if (property === 'transform' || property === 'order') return 'position'
  const exact = props.find((p) => p === property)
  if (exact) return exact
  return props.find((p) => property.startsWith(`${p}-`) || (p === 'background-color' && property === 'background') || (p === 'border-color' && property.startsWith('border') && property.endsWith('color'))) ?? null
}
