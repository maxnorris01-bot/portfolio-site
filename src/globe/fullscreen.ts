// The globe's full-screen map mode: pure state logic, shared by the
// component and the tests.
//
// iPhone Safari has no Fullscreen API for ordinary elements, so full screen is
// first of all a CSS full-viewport mode (the map fixed over the whole page,
// page scroll locked). Where the Fullscreen API exists (desktop, Android
// Chrome) it's also requested, for a true full screen. Three ways out besides
// our Exit button must keep this state in sync:
// - the browser leaving native full screen on its own (Esc, a system
//   gesture): a `fullscreenchange` with no full-screen element;
// - the browser's back button: entering pushes one history entry, so Back
//   pops it and exits full screen instead of leaving the page;
// - Esc in the CSS-only mode (no native full screen to catch it).

export interface FullscreenState {
  /** In full-screen map mode. */
  on: boolean
  /** The browser is in native full screen for us. */
  native: boolean
  /** A history entry was pushed for full screen and is still current. */
  historyEntry: boolean
}

export const FULLSCREEN_OFF: FullscreenState = { on: false, native: false, historyEntry: false }

export type FullscreenEvent =
  /** The Full screen button. */
  | { type: 'enter'; nativeAvailable: boolean }
  /** The browser confirmed native full screen. */
  | { type: 'nativeEntered' }
  /** The Exit button, or Esc in the CSS-only mode. */
  | { type: 'exit' }
  /** The browser left native full screen by itself (Esc, a gesture). */
  | { type: 'nativeLeft' }
  /** The browser's back button popped our history entry. */
  | { type: 'back' }

export interface FullscreenEffects {
  requestNative?: boolean
  exitNative?: boolean
  pushHistory?: boolean
  /** history.back(), to drop our entry when leaving by other means. */
  popHistory?: boolean
  lockScroll?: boolean
  /** Unlock and restore the page's scroll position and focus. */
  unlockScroll?: boolean
}

/** The next state and what to do, for one event. */
export function fullscreenStep(
  s: FullscreenState,
  e: FullscreenEvent,
): { state: FullscreenState; effects: FullscreenEffects } {
  const none = { state: s, effects: {} }
  switch (e.type) {
    case 'enter':
      if (s.on) return none
      return {
        state: { on: true, native: false, historyEntry: true },
        effects: { pushHistory: true, lockScroll: true, requestNative: e.nativeAvailable },
      }
    case 'nativeEntered':
      return s.on ? { state: { ...s, native: true }, effects: {} } : none
    case 'exit':
    case 'nativeLeft': {
      if (!s.on) return none
      return {
        state: FULLSCREEN_OFF,
        effects: {
          unlockScroll: true,
          // Our Exit button leaves native full screen too; when the browser
          // already left it, there's nothing to exit.
          exitNative: e.type === 'exit' && s.native,
          popHistory: s.historyEntry,
        },
      }
    }
    case 'back':
      // Back while not full screen is the page's ordinary history.
      if (!s.on) return none
      return { state: FULLSCREEN_OFF, effects: { unlockScroll: true, exitNative: s.native } }
  }
}

/**
 * Phones get the clean embedded map and the full-screen design: a narrow
 * viewport, or a short one (a phone in landscape). The CSS uses the same
 * thresholds: (max-width: 640px), (max-height: 500px).
 */
export const PHONE_MAX_WIDTH = 640
export const PHONE_MAX_HEIGHT = 500
export const isPhoneSize = (width: number, height: number) => width <= PHONE_MAX_WIDTH || height <= PHONE_MAX_HEIGHT

/**
 * On a phone, outside full screen, the map is shown clean: no filter or info
 * panels over it, just a small box for a selection that points to full
 * screen for the details. Desktop always keeps its panels.
 */
export const showsPanels = (width: number, height: number, fullscreen: boolean) =>
  fullscreen || !isPhoneSize(width, height)
