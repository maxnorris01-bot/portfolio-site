// Pure helpers for the ribbon's fields: reading a computed value for display, checking what a visitor typed, and the plain sentences for the
// engine's refusals and notes. No DOM, no engine calls, so they run under node (tests/uieditorvalues.test.ts).
import type { Refusal, ScaleNote } from './vendor/engine.js'

const NUM = '[-+]?(?:\\d+\\.?\\d*|\\.\\d+)'
const UNITS = 'px|em|rem|%|vw|vh|vmin|vmax|ch|pt|cm|mm|in'
const SIZE = new RegExp(`^(${NUM})(${UNITS})?$`, 'i')

const trim = (n: number) => String(Math.round(n * 100) / 100)

/** A size as the field shows it: "52px" from a computed "52.000001px"; anything that is not a plain length is shown as it is. */
export function showLength(computed: string): string {
  const m = /^(-?\d*\.?\d+)px$/.exec(computed.trim())
  return m ? `${trim(parseFloat(m[1]))}px` : computed.trim()
}

/** A one to four value shorthand (padding, margin, border width) as the field shows it. */
export const showSides = (computed: string): string => computed.trim().split(/\s+/).map(showLength).join(' ')

/** What was typed for one length: "52" is 52px, "3rem" stays, "auto" only where allowed. Null when it is not a length. */
export function parseLength(text: string, opts: { auto?: boolean; negative?: boolean } = {}): string | null {
  const t = text.trim().toLowerCase()
  if (t === 'auto') return opts.auto ? 'auto' : null
  const m = SIZE.exec(t)
  if (!m) return null
  const n = parseFloat(m[1])
  if (!Number.isFinite(n) || (n < 0 && !opts.negative)) return null
  return `${trim(n)}${m[2] ?? 'px'}`
}

/** One to four lengths separated by spaces (padding, margin, border width). */
export function parseSides(text: string, opts: { auto?: boolean; negative?: boolean } = {}): string | null {
  const parts = text.trim().split(/\s+/)
  if (parts.length < 1 || parts.length > 4 || parts[0] === '') return null
  const out = parts.map((p) => parseLength(p, opts))
  return out.every((p) => p !== null) ? out.join(' ') : null
}

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const FUNC = /^(?:rgb|rgba|hsl|hsla)\(\s*[-\d.%\s,/]+\)$/i
const NAMED = /^[a-z]+$/i

/** A colour as CSS accepts it: hex, rgb(), hsl() or a name (transparent, currentcolor and the named colours). Null when it is none of those. */
export function parseColour(text: string): string | null {
  const t = text.trim()
  if (HEX.test(t) || FUNC.test(t) || NAMED.test(t)) return t.toLowerCase().startsWith('#') ? t.toLowerCase() : t
  return null
}

/** A font-family list: anything that cannot break out of a declaration. */
export function parseFamily(text: string): string | null {
  const t = text.trim()
  return t !== '' && !/[;{}<>]/.test(t) ? t : null
}

export const parseWeight = (text: string): string | null => {
  const t = text.trim().toLowerCase()
  if (t === 'normal' || t === 'bold') return t
  const n = Number(t)
  return Number.isInteger(n) && n >= 1 && n <= 1000 ? String(n) : null
}

/** "rgb(11, 27, 51)" or "rgba(0, 0, 0, 0)" from getComputedStyle as the text a colour field shows (hex when opaque, as given when not). */
export function showColour(computed: string): string {
  const m = /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)$/.exec(computed.trim())
  if (!m) return computed.trim()
  if (m[4] !== undefined && parseFloat(m[4]) === 0) return 'transparent'
  if (m[4] !== undefined && parseFloat(m[4]) < 1) return computed.trim()
  return `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`
}

/** The six-digit hex a colour picker needs, or null when the colour is not an opaque hex. */
export const pickerValue = (shown: string): string | null => (/^#[0-9a-f]{6}$/i.test(shown) ? shown.toLowerCase() : null)

/** The first family of a computed font-family list, as the field shows the whole list. */
export const showFamily = (computed: string): string => computed.trim()

const upperFirst = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)
const endSentence = (s: string) => (/[.!?)]$/.test(s) ? (s.endsWith(')') ? `${s}.` : s) : `${s}.`)

/** The engine's reason for a refusal as one plain sentence, with a short lead so it is clear nothing changed. */
export function refusalSentence(lead: string, refusal: Refusal): string {
  return `${lead} ${endSentence(upperFirst(refusal.message.trim()))}`
}

const maxW = /\(max-width:\s*(\d+(?:\.\d+)?)px\)/i
const minW = /\(min-width:\s*(\d+(?:\.\d+)?)px\)/i

/** Which environment an engine condition names, in words: "@media (max-width: 640px)" is "phone sizes (up to 640px wide)". */
export function describeCondition(condition: string): { env: 'phone' | 'desktop' | 'page'; phrase: string } {
  const max = maxW.exec(condition), min = minW.exec(condition)
  if (max && !min) return { env: 'phone', phrase: `phone sizes (up to ${max[1]}px wide)` }
  if (min && !max) return { env: 'desktop', phrase: `desktop sizes (from ${min[1]}px wide)` }
  return { env: 'page', phrase: condition === '(base)' ? 'the base rules' : condition === '(all widths)' ? 'every width' : condition }
}

/** One engine note ("a value I left alone") as a plain sentence: "The phone width was left alone: 50% is not a fixed px, rem or em length." */
export function noteSentence(note: ScaleNote): string {
  const where = describeCondition(note.condition)
  const subject = where.env === 'page' ? `The ${note.property}` : `The ${where.env} ${note.property}`
  const reason = note.reason.replace(/@media \([^)]*\)/g, (c) => describeCondition(c).phrase)
  if (reason.startsWith('left alone:')) return `${subject} was left alone:${endSentence(reason.slice('left alone:'.length)).replace(/^(\s*)/, ' ')}`
  if (/could not be scaled/.test(reason)) return endSentence(upperFirst(reason))
  return `${subject} (${note.value}) was copied as the page wrote it: ${endSentence(reason)}`
}

/** A short plain description of what a `set` did, for the "Applied: ..." line. */
export const describeSet = (properties: Record<string, string>): string =>
  Object.entries(properties).map(([p, v]) => `${p.replace(/^-/, '')} ${v}`).join(', ')
