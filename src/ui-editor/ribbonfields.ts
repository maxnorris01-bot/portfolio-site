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

/** The families offered after the page's own, with the stack each one writes (a generic fallback after a named font). */
export const FAMILIES: { label: string; value: string }[] = [
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

/** The font select's options: the page's own current family first (as the browser computes it), then the twelve. No free text. */
export function familyOptions(current: string): { label: string; value: string }[] {
  return [{ label: current, value: current }, ...FAMILIES]
}

/** The first family name of a computed stack, without quotes: `Georgia, "Times New Roman", serif` is `Georgia`. */
export function firstFamily(stack: string): string {
  return (stack.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '')
}

/**
 * The font select's options in round 4: each shows its NAME only. The page's own family comes first, shown by its first name ("Georgia"), and choosing it
 * writes what it already is (the whole stack, which is also in the select's tooltip); then the twelve. `familyOptions` above is the older reading (the whole
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
