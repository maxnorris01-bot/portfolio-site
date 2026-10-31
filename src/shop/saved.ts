import type { RatingsState } from './ratings.ts'
import type { Rating, ResolvedLink, SavedRow, ShopItem } from './types.ts'

/** `mine` is the shopper's rating (a result's own `rating` is the product's star rating). */
export type SavedItem = SavedRow & { mine: Extract<Rating, 'love' | 'like'> }
export type SavedLists = { loved: SavedItem[]; liked: SavedItem[] }

/**
 * Loved and liked results from every search in the session. The server's `saved` rows cover earlier batches;
 * the shown batch covers what was rated since (so a change shows at once). The local ratings decide who is in.
 * Newest change first, then the server's order.
 */
export function savedLists(saved: SavedRow[] | undefined, batch: ShopItem[], ratings: RatingsState): SavedLists {
  const rows = new Map<string, SavedRow>()
  for (const r of saved ?? []) rows.set(r.id, r)
  for (const r of batch) rows.set(r.id, { ...rows.get(r.id), ...r })
  const picked: { item: SavedItem; touched: number; at: number }[] = []
  let at = 0
  for (const [id, row] of rows) {
    const rating = ratings[id]?.rating
    if (rating === 'love' || rating === 'like') picked.push({ item: { ...row, mine: rating }, touched: ratings[id]?.touched ?? 0, at: at++ })
  }
  picked.sort((a, b) => b.touched - a.touched || a.at - b.at)
  const items = picked.map((p) => p.item)
  return { loved: items.filter((i) => i.mine === 'love'), liked: items.filter((i) => i.mine === 'like') }
}

const KEY = 'shop.saved.open'
/** Whether the Saved panel is open; open unless the visitor hid it. Storage may be blocked. */
export function readSavedOpen(): boolean {
  try {
    return sessionStorage.getItem(KEY) !== '0'
  } catch {
    return true
  }
}
export function writeSavedOpen(open: boolean) {
  try {
    sessionStorage.setItem(KEY, open ? '1' : '0')
  } catch {
    // Storage blocked: the choice just does not outlast the page.
  }
}

/** What an Open link points at: the store link once resolved, else the item's own link; and whether a click should resolve first. */
export function openTarget(item: Pick<ShopItem, 'id' | 'link' | 'link_kind'>, resolved: Record<string, ResolvedLink> | undefined, safe: (l: string | null | undefined) => string | null) {
  if (item.link_kind === 'none') return { href: null, needsResolve: false }
  const known = resolved?.[item.id]
  const store = known?.status === 'resolved' ? safe(known.link) : null
  if (store) return { href: store, needsResolve: false }
  return { href: safe(item.link), needsResolve: item.link_kind === 'google_panel' }
}
