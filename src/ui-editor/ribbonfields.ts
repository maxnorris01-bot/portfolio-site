// What the ribbon's controls are made of: which control each field gets, the font list, the alignment buttons and which stepper each field uses. Pure
// (tests/uieditorround2.test.ts); the fields themselves (labels, reading, writing) are in panelfields.ts.
import { panel } from '../data/uiEditor.ts'
import type { StepKey } from './steps.ts'

export type RibbonKind = 'family' | 'weight' | 'colour' | 'align' | 'width' | 'sides' | 'stepper'

/** The control a field is drawn as. `width` is the HTML width (px or %); an SVG width is a plain stepper. */
export function kindOf(prop: string, svg: boolean): RibbonKind {
  if (prop === 'font-family') return 'family'
  if (prop === 'font-weight') return 'weight'
  if (['color', 'background-color', 'border-color', 'fill', 'stroke'].includes(prop)) return 'colour'
  if (prop === 'text-align' || prop === 'text-anchor') return 'align'
  if (prop === 'width' && !svg) return 'width'
  if (prop === 'padding' || prop === 'margin') return 'sides'
  return 'stepper'
}

/** The step each stepper field uses. */
export const STEP_OF: Record<string, StepKey> = {
  'font-size': 'fontSize',
  width: 'width',
  height: 'height',
  padding: 'padding',
  margin: 'margin',
  'border-width': 'borderWidth',
  'stroke-width': 'borderWidth',
  'border-radius': 'borderRadius',
  rx: 'borderRadius',
}

/** The twelve families the select has had since round 2, with the stack each one writes (a generic fallback after a named font). They stay first and in this order. */
export const ORIGINAL_FAMILIES: { label: string; value: string }[] = [
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Trebuchet MS', value: '"Trebuchet MS", sans-serif' },
  { label: 'Tahoma', value: 'Tahoma, sans-serif' },
  { label: 'Courier New', value: '"Courier New", monospace' },
  { label: 'system-ui', value: 'system-ui' },
  { label: 'serif', value: 'serif' },
  { label: 'sans-serif', value: 'sans-serif' },
  { label: 'monospace', value: 'monospace' },
]

export type FontGroup = 'serif' | 'sans-serif' | 'monospace' | 'display'

/**
 * Round 7a: common system fonts, in four groups, each written as its name (quoted when it has a space) and fallbacks that end in a generic family. No web fonts: a font shows
 * only if the viewer's computer has it, and otherwise the next name of the stack does. The exact values are locked in docs/ui-editor-gate-rules-round7a.md section 3.
 */
export const SYSTEM_FONTS: { group: FontGroup; label: string; value: string }[] = [
  { group: 'serif', label: 'Palatino Linotype', value: '"Palatino Linotype", "Book Antiqua", Palatino, serif' },
  { group: 'serif', label: 'Book Antiqua', value: '"Book Antiqua", Palatino, "Palatino Linotype", serif' },
  { group: 'serif', label: 'Garamond', value: 'Garamond, "Times New Roman", serif' },
  { group: 'serif', label: 'Baskerville', value: 'Baskerville, "Baskerville Old Face", "Times New Roman", serif' },
  { group: 'serif', label: 'Cambria', value: 'Cambria, Georgia, serif' },
  { group: 'serif', label: 'Constantia', value: 'Constantia, Georgia, serif' },
  { group: 'serif', label: 'Didot', value: 'Didot, "Bodoni MT", "Times New Roman", serif' },
  { group: 'serif', label: 'Rockwell', value: 'Rockwell, "Courier Bold", Courier, serif' },
  { group: 'sans-serif', label: 'Segoe UI', value: '"Segoe UI", Tahoma, Geneva, sans-serif' },
  { group: 'sans-serif', label: 'Calibri', value: 'Calibri, Candara, "Segoe UI", sans-serif' },
  { group: 'sans-serif', label: 'Candara', value: 'Candara, Calibri, "Segoe UI", sans-serif' },
  { group: 'sans-serif', label: 'Corbel', value: 'Corbel, "Lucida Grande", "Segoe UI", sans-serif' },
  { group: 'sans-serif', label: 'Century Gothic', value: '"Century Gothic", CenturyGothic, "Apple Gothic", sans-serif' },
  { group: 'sans-serif', label: 'Gill Sans', value: '"Gill Sans", "Gill Sans MT", Calibri, sans-serif' },
  { group: 'sans-serif', label: 'Optima', value: 'Optima, Candara, "Segoe UI", sans-serif' },
  { group: 'sans-serif', label: 'Futura', value: 'Futura, "Trebuchet MS", Arial, sans-serif' },
  { group: 'sans-serif', label: 'Franklin Gothic Medium', value: '"Franklin Gothic Medium", "Arial Narrow", Arial, sans-serif' },
  { group: 'sans-serif', label: 'Lucida Sans Unicode', value: '"Lucida Sans Unicode", "Lucida Grande", sans-serif' },
  { group: 'sans-serif', label: 'Geneva', value: 'Geneva, Verdana, sans-serif' },
  { group: 'monospace', label: 'Consolas', value: 'Consolas, "Lucida Console", monospace' },
  { group: 'monospace', label: 'Menlo', value: 'Menlo, Monaco, Consolas, monospace' },
  { group: 'monospace', label: 'Monaco', value: 'Monaco, Menlo, Consolas, monospace' },
  { group: 'monospace', label: 'Lucida Console', value: '"Lucida Console", Monaco, monospace' },
  { group: 'monospace', label: 'Andale Mono', value: '"Andale Mono", "Courier New", monospace' },
  { group: 'display', label: 'Impact', value: 'Impact, "Arial Narrow Bold", Haettenschweiler, sans-serif' },
  { group: 'display', label: 'Arial Black', value: '"Arial Black", "Arial Bold", Gadget, sans-serif' },
  { group: 'display', label: 'Comic Sans MS', value: '"Comic Sans MS", "Comic Sans", cursive' },
  { group: 'display', label: 'Brush Script MT', value: '"Brush Script MT", "Brush Script Std", cursive' },
  { group: 'display', label: 'Copperplate', value: 'Copperplate, "Copperplate Gothic Light", fantasy' },
]

/** The families offered after the page's own: the twelve originals, then the system fonts. */
export const FAMILIES: { label: string; value: string }[] = [...ORIGINAL_FAMILIES, ...SYSTEM_FONTS.map(({ label, value }) => ({ label, value }))]

/** The font select's options: the page's own current family first (as the browser computes it), then the list. No free text. */
export function familyOptions(current: string): { label: string; value: string }[] {
  return [{ label: current, value: current }, ...FAMILIES]
}

/** The first family name of a computed stack, without quotes: `Georgia, "Times New Roman", serif` is `Georgia`. */
export function firstFamily(stack: string): string {
  return (stack.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '')
}

/**
 * The font select's options in round 4: each shows its NAME only. The page's own family comes first, shown by its first name ("Georgia"), and choosing it
 * writes what it already is (the whole stack, which is also in the select's tooltip); then the list. `familyOptions` above is the older reading (the whole
 * stack as the label) and is kept for its tests.
 */
export function familyChoices(current: string): { label: string; value: string }[] {
  return [{ label: firstFamily(current), value: current }, ...FAMILIES]
}

/** A colour field's text: the transparent colour is spelled out in full ("Transparent"), everything else as it is read. Typing either case is accepted. */
export const showColourWord = (shown: string): string => (shown === 'transparent' ? 'Transparent' : shown)

export interface AlignButton {
  value: string
  label: string
}

/** The alignment buttons: left, centre, right, justify for HTML; start, middle, end for SVG. Each has an accessible name. */
export const alignButtons = (svg: boolean): AlignButton[] =>
  svg
    ? panel.svgAligns.map((v) => ({ value: v, label: `Anchor ${v}` }))
    : [
        { value: 'left', label: 'Align left' },
        { value: 'center', label: 'Align centre' },
        { value: 'right', label: 'Align right' },
        { value: 'justify', label: 'Justify' },
      ]

/** The computed alignment as the button it lights: `start` and `end` are left and right in a left-to-right page. */
export function pressedAlign(computed: string, svg: boolean): string {
  if (svg) return computed
  return computed === 'start' ? 'left' : computed === 'end' ? 'right' : computed
}

/**
 * The ribbon's column weights (round 6): each group's measured width at its smallest (its two rows, 16 px of padding and the 1 px rule). The stylesheet's grid uses these
 * numbers as both the floor and the weight of each column; they add up to the width from which the seven groups sit in one band (a ribbon of 1352 px or more).
 */
export const RIBBON_COLUMNS = { Font: 225, Paragraph: 143, Size: 182, 'Shape Styles': 273, Spacing: 187, Arrange: 205, Grid: 133 } as const
