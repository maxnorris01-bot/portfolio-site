// What the ribbon's menus hold and the small pure rules behind them (round 6): the page colours of a document, the standard colours, the hex box's rule, the outline weights
// and dashes, and (Part B) the shadow, line spacing and gradient values. No DOM and no engine calls, so it runs under node (tests/uieditorround6.test.ts).

/** The eight fixed colours of every colour menu, in PowerPoint's order. */
export const STANDARD_COLOURS = ['#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050', '#00b050', '#0070c0', '#7030a0'] as const

/** Up to this many page colours are listed. */
export const PAGE_COLOURS_MAX = 16

/** A colour literal as six-digit lower-case hex: #rgb, #rrggbb, #rrggbbaa, rgb(), rgba(), hsl() or hsla(); null for anything else. */
export function toHex(text: string): string | null {
  const c = text.trim().toLowerCase()
  let m: RegExpExecArray | null
  if ((m = /^#([0-9a-f]{3})$/.exec(c))) return `#${[...m[1]].map((x) => x + x).join('')}`
  if ((m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(c))) return `#${m[1]}`
  if ((m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/.exec(c))) return `#${[m[1], m[2], m[3]].map((x) => Math.round(Number(x)).toString(16).padStart(2, '0')).join('')}`
  if ((m = /^hsla?\(\s*([\d.]+)(?:deg)?[ ,]+([\d.]+)%[ ,]+([\d.]+)%/.exec(c))) {
    const h = Number(m[1]) / 360, s = Number(m[2]) / 100, l = Number(m[3]) / 100
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q
    const f = (t0: number) => {
      const t = (t0 + 1) % 1
      return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p
    }
    return `#${[f(h + 1 / 3), f(h), f(h - 1 / 3)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('')}`
  }
  return null
}

const COLOUR_LITERAL = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g

/** The page colours: every colour literal of every file of the original document (primary file first), in order of first use, as six-digit hex, no duplicates, up to 16. */
export function pageColours(files: string[]): string[] {
  const out: string[] = []
  for (const text of files) {
    for (const m of text.matchAll(COLOUR_LITERAL)) {
      const hex = toHex(m[0])
      if (hex && !out.includes(hex)) out.push(hex)
    }
  }
  return out.slice(0, PAGE_COLOURS_MAX)
}

/** The hex box takes `#rgb` or `#rrggbb` only (anything else is no edit). Returns the colour as typed, in lower case, or null. */
export function hexTyped(text: string): string | null {
  const t = text.trim()
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(t) ? t.toLowerCase() : null
}

/** A computed colour ("rgb(1, 2, 3)") as hex, or null when it is transparent or not a colour. */
export function opaqueHex(computed: string): string | null {
  const m = /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)$/.exec(computed.trim())
  if (!m || (m[4] !== undefined && parseFloat(m[4]) < 1)) return null
  return toHex(computed)
}

/** The outline weights of the menu, in px, and the dash styles with the CSS style each writes. */
export const OUTLINE_WEIGHTS = [1, 2, 3, 4, 6, 8] as const
export const DASHES = [
  { label: 'Solid', value: 'solid' },
  { label: 'Dotted', value: 'dotted' },
  { label: 'Dashed', value: 'dashed' },
  { label: 'Double', value: 'double' },
] as const

/** A double line needs at least this many px to show as two lines. */
export const DOUBLE_MIN = 3

/** The font size presets of the arrow beside the font size box. */
export const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 36, 44, 48, 60, 72] as const

/** Part B1: the shadow choices, the CSS each writes and how Chromium reads it back (the menu marks the one that is current). */
export const EFFECTS = [
  { label: 'None', css: 'none', computed: 'none' },
  { label: 'Subtle', css: '0 1px 3px rgba(0,0,0,.2)', computed: 'rgba(0, 0, 0, 0.2) 0px 1px 3px 0px' },
  { label: 'Medium', css: '0 4px 12px rgba(0,0,0,.25)', computed: 'rgba(0, 0, 0, 0.25) 0px 4px 12px 0px' },
  { label: 'Strong', css: '0 10px 24px rgba(0,0,0,.3)', computed: 'rgba(0, 0, 0, 0.3) 0px 10px 24px 0px' },
] as const

/** Part B3: the line spacings (a unitless line-height). */
export const LINE_SPACINGS = [
  { label: '1.0', css: '1' },
  { label: '1.15', css: '1.15' },
  { label: '1.5', css: '1.5' },
  { label: '2.0', css: '2' },
] as const

/** Part B4: the gradient directions. */
export const DIRECTIONS = [
  { label: 'To right', css: 'to right' },
  { label: 'To bottom', css: 'to bottom' },
  { label: 'To bottom right', css: 'to bottom right' },
  { label: 'To top', css: 'to top' },
] as const
export type Direction = (typeof DIRECTIONS)[number]['css']

export interface Gradient {
  dir: Direction
  from: string
  to: string
}

/** The value written for a gradient: `linear-gradient(to bottom right, #ffffff, #1c2b29)`. */
export const gradientCss = (g: Gradient): string => `linear-gradient(${g.dir}, ${g.from}, ${g.to})`

/**
 * The gradient of a computed `background-image`, or null when there is none. Chromium omits the default direction (`to bottom`) and writes `to bottom right` as
 * `to right bottom`; both are read back as the menu names them. Only a two-colour linear gradient is understood.
 */
export function readGradient(computed: string): Gradient | null {
  const m = /^linear-gradient\((?:(to [a-z ]+),\s*)?(rgba?\([^)]*\)),\s*(rgba?\([^)]*\))\)$/.exec(computed.trim())
  if (!m) return null
  const raw = m[1] ?? 'to bottom'
  const dir = raw === 'to right bottom' ? 'to bottom right' : raw
  if (!DIRECTIONS.some((d) => d.css === dir)) return null
  const from = toHex(m[2]), to = toHex(m[3])
  return from && to ? { dir: dir as Direction, from, to } : null
}


// ---- Round 7b: the colour grid and the recent colours (docs/ui-editor-gate-rules-round7b.md) ----

/** The grey row of the grid: HSL lightness, saturation 0. */
export const GRID_GREYS = [100, 95, 85, 75, 50, 35, 25, 15, 5, 0] as const
/** The ten hues of the grid (red, orange, yellow, lime, green, teal, blue, indigo, purple, pink), as HSL angles. */
export const GRID_HUES = [0, 28, 50, 90, 140, 175, 215, 245, 280, 330] as const
/** The five shades of every hue, dark to light, at saturation 70. */
export const GRID_LIGHTS = [30, 45, 60, 75, 88] as const
export const GRID_COLUMNS = 10

/** The 60 colours of the grid, row by row: the greys, then the five shades of the ten hues; six-digit lower-case hex. */
export function colourGrid(): string[] {
  const out: string[] = GRID_GREYS.map((l) => toHex(`hsl(0, 0%, ${l}%)`) as string)
  for (const l of GRID_LIGHTS) for (const h of GRID_HUES) out.push(toHex(`hsl(${h}, 70%, ${l}%)`) as string)
  return out
}

/** How many recent colours are kept. */
export const RECENT_MAX = 8

/** The recent colours after one more was applied: newest first, six-digit lower-case hex, no duplicates, at most eight. Anything that is not a colour changes nothing. */
export function pushRecent(list: readonly string[], colour: string): string[] {
  const hex = toHex(colour)
  if (!hex) return [...list]
  return [hex, ...list.filter((c) => c !== hex)].slice(0, RECENT_MAX)
}
