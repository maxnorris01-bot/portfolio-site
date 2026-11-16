// The preview's sizes: Desktop (no frame), and a plain, generic phone or tablet outline that can be turned sideways. Pure, so it runs under node
// (tests/uieditordevices.test.ts). The sizes are CSS px; the bezels are drawn with CSS only (no real device model or brand).
import { DEVICE_HEIGHTS, VIEW_WIDTHS } from '../data/uiEditor.ts'

export type ViewName = 'Desktop' | 'Tablet' | 'Phone'
export type Orientation = 'portrait' | 'landscape'

/** The preview's own size. Desktop has no fixed height: it grows to the page's height and the page scrolls. */
export interface Viewport {
  width: number
  height: number | null
}

export function viewport(view: ViewName, orientation: Orientation): Viewport {
  if (view === 'Desktop') return { width: VIEW_WIDTHS.Desktop, height: null }
  const w = VIEW_WIDTHS[view]
  const h = DEVICE_HEIGHTS[view]
  return orientation === 'portrait' ? { width: w, height: h } : { width: h, height: w }
}

/** Only Desktop (1280) and Phone in portrait (390) are editable: the page's own layouts are for those two sizes. The rest are view-only. */
export const isEditable = (view: ViewName, orientation: Orientation): boolean => view === 'Desktop' || (view === 'Phone' && orientation === 'portrait')

/** Desktop has no frame to turn. */
export const canRotate = (view: ViewName): boolean => view !== 'Desktop'

export interface Bezel {
  top: number
  right: number
  bottom: number
  left: number
}

const NONE: Bezel = { top: 0, right: 0, bottom: 0, left: 0 }
/** The bezel round the screen, in CSS px: a camera strip and a home-bar strip on the phone (they turn with it), an even rim on the tablet. */
export function bezel(view: ViewName, orientation: Orientation): Bezel {
  if (view === 'Desktop') return NONE
  if (view === 'Tablet') return { top: 12, right: 12, bottom: 12, left: 12 }
  return orientation === 'portrait' ? { top: 28, right: 12, bottom: 24, left: 12 } : { top: 12, right: 24, bottom: 12, left: 28 }
}

/** The whole framed device (screen plus bezel), in CSS px. `contentHeight` stands in for the screen's height when it has none (Desktop). */
export function frameSize(view: ViewName, orientation: Orientation, contentHeight: number): { width: number; height: number } {
  const v = viewport(view, orientation)
  const b = bezel(view, orientation)
  return { width: v.width + b.left + b.right, height: (v.height ?? contentHeight) + b.top + b.bottom }
}

/** The one plain sentence shown when the view cannot be edited: Tablet has its own wording (the one the page has always had). */
export function viewOnlyReason(view: ViewName, orientation: Orientation): 'tablet' | 'landscape' | null {
  if (isEditable(view, orientation)) return null
  return view === 'Tablet' ? 'tablet' : 'landscape'
}

/** Room taken off the window's height for the device (the page's own breathing space); the whole device should be in view. */
export const HEIGHT_MARGIN = 16

export interface FitInput {
  /** The whole device, bezel included, in CSS px. */
  frameWidth: number
  frameHeight: number
  /** The room the device is centred in: its width, and the window's height less the margin. */
  areaWidth: number
  availableHeight: number
  /** A framed device must show whole, so its height counts too; Desktop grows with the page and scrolls, so only its width counts. */
  framed: boolean
}

/**
 * The scale that makes the whole device fit: never above 1 (a device is never blown up), shrunk by the tighter of the width and (for a framed device)
 * the height. An area that has not been measured yet (zero or less) leaves the scale at 1.
 */
export function fitScale({ frameWidth, frameHeight, areaWidth, availableHeight, framed }: FitInput): number {
  let s = 1
  if (frameWidth > 0 && areaWidth > 0) s = Math.min(s, areaWidth / frameWidth)
  if (framed && frameHeight > 0 && availableHeight > 0) s = Math.min(s, availableHeight / frameHeight)
  return Number.isFinite(s) && s > 0 ? s : 1
}

/** A pointer distance in screen px as CSS px of the preview: the stage is drawn at `scale`, so a screen px is 1 / scale CSS px. */
export const toCss = (screenPx: number, scale: number): number => (scale > 0 ? screenPx / scale : screenPx)
