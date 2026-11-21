// Width in px or %, and the snap to a full-width element. Pure (tests/uieditorround2.test.ts). A percent is of the PARENT's content width (its width
// less its padding), the number a `width: N%` rule resolves against.

export type WidthUnit = 'px' | '%'

const round2 = (n: number) => Math.round(n * 100) / 100

/** A width as a percent of the parent's content width, to two decimals. 0 when there is no parent width to measure against. */
export const percentOf = (widthPx: number, parentPx: number): number => (parentPx > 0 ? round2((widthPx / parentPx) * 100) : 0)

/** A percent of the parent's content width as px. */
export const pxOfPercent = (percent: number, parentPx: number): number => round2((percent / 100) * parentPx)

/** How the field shows a width in each unit: "280px", "25.45%". */
export const showWidth = (px: number, parentPx: number, unit: WidthUnit): string => (unit === '%' ? `${percentOf(px, parentPx)}%` : `${round2(px)}px`)

/** A drag whose new width is this close (CSS px) to the parent's content width snaps to `width: 100%`. */
export const SNAP_PX = 2

/** Whether a width drag snaps: the new width is within SNAP_PX of the parent's content width (a parent that has none to give never snaps). */
export const snapsToParent = (newWidthPx: number, parentPx: number, tolerance = SNAP_PX): boolean => parentPx > 0 && Math.abs(newWidthPx - parentPx) <= tolerance

/**
 * Whether `width: 100%` gives the element a border box as wide as its parent's content: true for border-box, and for content-box only when there is no
 * padding or border (else 100% plus those would overflow the parent, so a drag near the edge is left as the px it was).
 */
export const fullWidthFits = (m: { sizing: string; paddingX: number; borderX: number }): boolean => m.sizing === 'border-box' || (m.paddingX === 0 && m.borderX === 0)

/** The `width` the page writes for a width drag or a typed width: 100% when it snapped, a percent of the parent in % mode, else px. */
export function widthToWrite(o: { unit: WidthUnit; cssPx: number; parentPx: number; snapped: boolean }): string {
  if (o.snapped) return '100%'
  return o.unit === '%' ? `${percentOf(o.cssPx, o.parentPx)}%` : `${round2(o.cssPx)}px`
}

/** Text typed into the width field: in % mode a bare number is a percent; in px mode it is px (the field's own parser adds the unit). Null for nothing. */
export function typedWidth(text: string, unit: WidthUnit): string | null {
  const t = text.trim()
  if (t === '') return null
  return unit === '%' && /^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(t) ? `${t}%` : t
}
