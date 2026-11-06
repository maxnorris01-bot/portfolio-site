import { useSyncExternalStore } from 'react'

/** From this window width the questions panel has two columns and the progress steps move into it (ClarifyPanel.css uses the same width). */
export const WIDE_PX = 1280
const QUERY = `(min-width: ${WIDE_PX}px)`

/** Whether the window is at least WIDE_PX wide. Rendered on the server (and before the first measure) as narrow. */
export function useWide(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const m = window.matchMedia(QUERY)
      m.addEventListener('change', notify)
      return () => m.removeEventListener('change', notify)
    },
    () => window.matchMedia(QUERY).matches,
    () => false,
  )
}
