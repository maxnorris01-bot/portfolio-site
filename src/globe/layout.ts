// Where the side column sits on a phone in the Sky view. It docks along the
// bottom of the stage; when the selected object's ring would be under it, it
// moves up to sit just below the legend instead, so the ring stays visible.

/** The stage inset of the side column (0.75rem). */
const EDGE_PX = 12
/** The gap between the legend and a top-docked side column. */
const GAP_PX = 8
/** Clearance kept around the ring's centre (the ring is 26 px across, plus its label). */
const CLEAR_PX = 24
/** Extra clearance before a top-docked column returns to the bottom, so it doesn't flicker. */
const HYSTERESIS_PX = 16

export interface SideDockInput {
  /** The ring's centre, px from the stage top; null when it isn't on screen. */
  ringY: number | null
  stageHeight: number
  sideHeight: number
  /** The legend's bottom edge, px from the stage top. */
  legendBottom: number
  /** Where the column is now: a top offset in px, or null when docked at the bottom. */
  current: number | null
}

/**
 * The side column's top offset in px when it should sit under the legend, or
 * null to keep it docked along the bottom. It only moves up when that
 * actually uncovers the ring; if neither place clears it (a very tall,
 * expanded panel), it stays at the bottom.
 */
export function phoneSideDock({
  ringY,
  stageHeight,
  sideHeight,
  legendBottom,
  current,
}: SideDockInput): number | null {
  if (ringY === null) return null
  const bottomTop = stageHeight - EDGE_PX - sideHeight
  const margin = current === null ? 0 : HYSTERESIS_PX
  const coveredAtBottom = ringY + CLEAR_PX > bottomTop - margin
  const top = Math.round(legendBottom + GAP_PX)
  const clearAtTop = ringY - CLEAR_PX > top + sideHeight
  return coveredAtBottom && clearAtTop ? top : null
}
