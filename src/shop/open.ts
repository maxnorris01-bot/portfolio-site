import type { MouseEvent } from 'react'
import { safeHref } from './state.ts'

/**
 * Open a result's store link. When the link is still Google's product page, a plain click opens the tab at once
 * (so pop-up blockers allow it), says it is working, looks the store link up, and falls back to Google's page.
 * Modified clicks (new window, download) keep the browser's own behaviour.
 */
export function openResolved(e: MouseEvent<HTMLAnchorElement>, itemLink: string, resolve: () => Promise<string | null>) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  e.preventDefault()
  const fallback = safeHref(itemLink)
  const tab = window.open('', '_blank')
  if (tab) {
    tab.opener = null
    tab.document.title = 'Opening…'
    tab.document.body.textContent = 'Opening the store…'
  }
  void resolve().then((link) => {
    const to = link ?? fallback
    if (tab) {
      if (to) tab.location.href = to
      else tab.close()
    } else if (to) {
      window.open(to, '_blank', 'noopener,noreferrer')
    }
  })
}
