// Pure geometry for the host overlay: how a drag on a resize handle changes a size, and the box a drag shows while it is in progress.
// Nothing is written to the engine until the pointer is released (src/ui-editor/UiEditorTool.tsx).

export type Handle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'
export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

/** The box while a handle is dragged by (dx, dy): the dragged edges move, the others stay, and a size never goes below 1 px. */
export function resizedBox(box: Box, handle: Handle, dx: number, dy: number): Box {
  let { left, top, width, height } = box
  if (handle.includes('e')) width = Math.max(1, box.width + dx)
  if (handle.includes('w')) {
    width = Math.max(1, box.width - dx)
    left = box.left + box.width - width
  }
  if (handle.includes('s')) height = Math.max(1, box.height + dy)
  if (handle.includes('n')) {
    height = Math.max(1, box.height - dy)
    top = box.top + box.height - height
  }
  return { left, top, width, height }
}

/** Which of width and height a handle changes. */
export const handleAxes = (handle: Handle): { width: boolean; height: boolean } => ({
  width: handle.includes('e') || handle.includes('w'),
  height: handle.includes('s') || handle.includes('n'),
})

export interface BoxModel {
  /** getComputedStyle's box-sizing. */
  sizing: string
  paddingX: number
  paddingY: number
  borderX: number
  borderY: number
}

/** The `width` and `height` values (CSS px, rounded) that give the element a border box of this size: content-box elements lose their padding and border. */
export function cssSizeFor(box: Box, m: BoxModel): { width: number; height: number } {
  const content = m.sizing === 'border-box'
  return {
    width: Math.max(0, Math.round(box.width - (content ? 0 : m.paddingX + m.borderX))),
    height: Math.max(0, Math.round(box.height - (content ? 0 : m.paddingY + m.borderY))),
  }
}

/** Pointer movement counts as a drag only after this many px, so a plain click never moves anything. */
export const DRAG_THRESHOLD = 3

export const movedFar = (dx: number, dy: number) => Math.hypot(dx, dy) >= DRAG_THRESHOLD

/** How far a key scrolls a screen of this height: a page for PageDown and Space (up with Shift), the whole page for End and Home. Null for any other key. */
export function scrollKeyDelta(key: string, shift: boolean, screenHeight: number): number | null {
  const page = screenHeight * 0.9
  if (key === 'PageDown') return page
  if (key === 'PageUp') return -page
  if (key === ' ') return shift ? -page : page
  if (key === 'End') return 1e6
  if (key === 'Home') return -1e6
  return null
}

/**
 * The part of an outline's box that may be drawn: the device's screen (0, 0, width, height in the box's own coordinates) with `allow` px round it for the outline's ring and the handles, as a `clip-path`
 * polygon in the BOX's coordinates. An element scrolled off the screen has an empty polygon (nothing is drawn); one that straddles an edge is cut at the edge.
 */
export function clipToScreen(box: Box, screenWidth: number, screenHeight: number, allow: number): string {
  const x0 = -allow - box.left, x1 = screenWidth + allow - box.left
  const y0 = -allow - box.top, y1 = screenHeight + allow - box.top
  if (x1 <= x0 || y1 <= y0) return 'polygon(0 0, 0 0, 0 0)'
  return `polygon(${x0}px ${y0}px, ${x1}px ${y0}px, ${x1}px ${y1}px, ${x0}px ${y1}px)`
}

/** Arrow keys: 1 px, or 10 px with Shift. Null for any other key. */
export function arrowNudge(key: string, shift: boolean): { dx: number; dy: number } | null {
  const step = shift ? 10 : 1
  return key === 'ArrowLeft' ? { dx: -step, dy: 0 } : key === 'ArrowRight' ? { dx: step, dy: 0 } : key === 'ArrowUp' ? { dx: 0, dy: -step } : key === 'ArrowDown' ? { dx: 0, dy: step } : null
}
