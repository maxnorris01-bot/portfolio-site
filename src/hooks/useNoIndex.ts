import { useEffect } from 'react'

/** Adds <meta name="robots" content="noindex"> to the document's head and returns the function that takes it away again. */
export function applyNoIndex(doc: Document): () => void {
  const meta = doc.createElement('meta')
  meta.name = 'robots'
  meta.content = 'noindex'
  doc.head.appendChild(meta)
  return () => meta.remove()
}

/** Ask search engines not to index the page while it is shown (a small hook of its own; usePageMeta is unchanged). */
export function useNoIndex() {
  useEffect(() => applyNoIndex(document), [])
}
