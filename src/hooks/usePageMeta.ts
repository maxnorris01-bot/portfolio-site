import { useEffect } from 'react'

/**
 * Set the browser tab title and the meta description while a page is shown,
 * and put the site's own back when it goes (the site has one title for every
 * page, in index.html).
 */
export function usePageMeta(title: string, description: string) {
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const before = { title: document.title, description: meta?.content ?? null }
    document.title = title
    if (meta) meta.content = description
    return () => {
      document.title = before.title
      if (meta && before.description !== null) meta.content = before.description
    }
  }, [title, description])
}
