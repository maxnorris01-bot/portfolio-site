// The recent colours (round 7b): the last eight colours applied through the colour menus, kept in memory for the page's life and never stored anywhere (no localStorage,
// no cookie), so a reload empties them. One list for all three menus. A small store so every menu button draws the same list.
import { pushRecent } from './menus.ts'

let recents: string[] = []
const listeners = new Set<() => void>()

export const getRecents = (): readonly string[] => recents
export const subscribeRecents = (fn: () => void): (() => void) => {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}
/** A colour was applied by a swatch, a grid cell, a recent, the hex box or the picker (not by No fill, No outline or Undo). */
export function recordRecent(colour: string): void {
  const next = pushRecent(recents, colour)
  if (next.join('|') === recents.join('|')) return
  recents = next
  listeners.forEach((fn) => fn())
}
