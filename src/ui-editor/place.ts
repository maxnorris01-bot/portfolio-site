// Placing a new element (insert round 1): which part of the hovered element the pointer is over, which `insert` edit that means, and where the insertion line is drawn. Pure, so it runs
// under node (tests/uieditorinsert1.test.ts). The flow is the page's own: no coordinates, the element lands before, after or inside what the pointer is over.
import type { InsertKind } from './vendor/engine.js'

/** The five things Insert offers, in the order of the menu: the name the visitor sees and the engine's kind. */
export const INSERT_ITEMS: { label: string; kind: InsertKind }[] = [
  { label: 'Text box', kind: 'text' },
  { label: 'Rectangle', kind: 'rect' },
  { label: 'Rounded rectangle', kind: 'rounded' },
  { label: 'Ellipse', kind: 'ellipse' },
  { label: 'Button', kind: 'button' },
]

export type Zone = 'before' | 'after' | 'inside'

/** The engine's placement for a zone: before and after the hovered element, or as its last child. */
export const PLACEMENT: Record<Zone, 'before' | 'after' | 'last-child'> = { before: 'before', after: 'after', inside: 'last-child' }

/**
 * The zone of a pointer over an element: the top third is `before`, the bottom third `after`, the middle `inside` (my choice of thirds, written in the rules). The page's `body` has no
 * sides to be next to, so over it (the empty page) a new element goes inside, at the end.
 */
export function zoneOf(relativeY: number, isBody: boolean): Zone {
  if (isBody) return 'inside'
  return relativeY < 1 / 3 ? 'before' : relativeY > 2 / 3 ? 'after' : 'inside'
}

/** The insert edit for a kind, the hovered element's index and a zone. */
export const insertEdit = (kind: InsertKind, anchor: number, zone: Zone) => ({ op: 'insert' as const, kind, anchor, placement: PLACEMENT[zone] })

export interface LineBox {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Where the insertion line is drawn, in the overlay's own px, for the hovered element's box: a bar across its top edge (before) or bottom edge (after), centred on the edge, or the
 * element's whole box (inside).
 */
export function lineBox(box: LineBox, zone: Zone, thickness = 3): LineBox {
  if (zone === 'inside') return { ...box }
  const edge = zone === 'before' ? box.top : box.top + box.height
  return { left: box.left, width: box.width, top: edge - thickness / 2, height: thickness }
}
