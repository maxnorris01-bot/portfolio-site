// The selection path of the strip (round 5): the chain of elements from the child of <body> down to the selected one, as short labels ("div .hero-copy"),
// the deepest five of them, with a leading ellipsis when the chain is longer. Pure, so it runs under node (tests/uieditorround5.test.ts).

export const PATH_MAX = 5

/** "div .hero-copy", "a #cta", "p": the tag, then the id, else the first class. */
export const segmentLabel = (tag: string, id: string | null, firstClass: string | null): string => `${tag}${id ? ` #${id}` : firstClass ? ` .${firstClass}` : ''}`

/** The deepest `max` labels of a chain (outermost first), and whether the chain was longer than that. */
export function visiblePath(chain: string[], max = PATH_MAX): { labels: string[]; more: boolean } {
  return chain.length > max ? { labels: chain.slice(-max), more: true } : { labels: chain, more: false }
}

/** The elements from the page's root content down to `el`: html and body are not part of the path (a document without them, an SVG, starts at its root). */
export function chainOf<T extends { localName: string; parentElement: T | null }>(el: T): T[] {
  const out: T[] = []
  for (let e: T | null = el; e && e.localName !== 'body' && e.localName !== 'html'; e = e.parentElement) out.unshift(e)
  return out
}
