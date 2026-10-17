// Small pure helpers behind the tool's page layout: the compact view toggle
// (and its C key), what counts as typing, the remembered-for-the-session
// compact state, and the arithmetic the map's height follows. Tested.

/** The phone layout of the globe's CSS: narrow, or a phone on its side. Panels wait for full screen there. */
export const PHONE_LAYOUT_QUERY = '(max-width: 640px), (max-height: 500px)'

/** Below this width the left column stacks above the map instead of beside it (CSS: the same number). */
export const STACK_BREAKPOINT_PX = 900

/** The left column's width: clamp(300px, 24vw, 420px), as a number for a given window width. */
export function sidebarWidthPx(windowWidth: number): number {
  return Math.min(420, Math.max(300, windowWidth * 0.24))
}

/** The page gutter: clamp(16px, 2.2vw, 48px) (16 on a phone, about 24-32 on a laptop, up to 48 on a large monitor). */
export function gutterPx(windowWidth: number): number {
  return Math.min(48, Math.max(16, windowWidth * 0.022))
}

/**
 * The map's height: what is left of the window below the part of the page
 * above it (`topPx`), less the clock row (`clockPx`) and a small margin, never
 * under `min` (the page scrolls instead) or over `max`. The CSS clamp() does
 * the same sum with the measured top in a custom property.
 */
export function stageHeightPx(viewportHeight: number, topPx: number, clockPx = 56, min = 420, max = 1500, margin = 16): number {
  return Math.min(max, Math.max(min, viewportHeight - topPx - clockPx - margin))
}

/** A target that takes typed text: the C key (and the other shortcuts) must leave it alone. */
export function isTyping(target: unknown): boolean {
  const t = target as { tagName?: string; isContentEditable?: boolean; type?: string } | null
  if (!t || typeof t !== 'object') return false
  const tag = (t.tagName ?? '').toUpperCase()
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') {
    // Sliders, checkboxes and buttons don't take text; every other input does (search boxes, the city box).
    return !['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file', 'image'].includes((t.type ?? 'text').toLowerCase())
  }
  return !!t.isContentEditable
}

/** Is this key event the compact view's C key (plain, not while typing, not with a modifier)? */
export function isCompactKey(e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean; repeat?: boolean; target?: unknown; defaultPrevented?: boolean }): boolean {
  if (e.key !== 'c' && e.key !== 'C') return false
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || e.defaultPrevented) return false
  return !isTyping(e.target)
}

export const COMPACT_STORAGE_KEY = 'sat-compact-view'

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

/** sessionStorage, or null where it is blocked. */
export function sessionStore(): StorageLike | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

/** Was the compact view left on earlier in this session? (Session only: a new tab starts with the controls.) */
export function loadCompact(storage: StorageLike | null = sessionStore()): boolean {
  try {
    return storage?.getItem(COMPACT_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function saveCompact(on: boolean, storage: StorageLike | null = sessionStore()): void {
  try {
    storage?.setItem(COMPACT_STORAGE_KEY, on ? '1' : '0')
  } catch {
    /* blocked: it just isn't remembered */
  }
}
