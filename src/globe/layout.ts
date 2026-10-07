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

// Elevation labels in the Sky view ("30°", "60°") sit where their rings cross
// the north and south meridians. Seen from latitude φ, the geostationary belt
// peaks on the equator-facing meridian at an elevation that depends only on
// φ, and it runs level there, so near one latitude band it lies right along a
// ring and its row of points hides that ring's label (60° near 25°, 30° near
// 51°). The label then moves to the far side of its ring.

/** Earth's equatorial radius over the geostationary orbit radius. */
const GEO_RATIO = 6378.137 / 42164.17

/**
 * The geostationary belt's elevation, in degrees, where it crosses the
 * equator-facing meridian (south from the northern hemisphere, north from the
 * southern), or null when the belt is below the horizon (beyond about 81°).
 */
export function geoBeltElevation(latDeg: number): number | null {
  const lat = (Math.abs(latDeg) * Math.PI) / 180
  const up = Math.cos(lat) - GEO_RATIO
  if (up <= 0) return null
  return (Math.atan2(up, Math.sin(lat)) * 180) / Math.PI
}

/** The azimuth of the meridian the geostationary belt crosses. */
export function geoBeltAzimuth(latDeg: number): 0 | 180 {
  return latDeg >= 0 ? 180 : 0
}

/**
 * The elevation to draw a ring's label at. Normally the ring's own; when the
 * belt is within `clearanceDeg` of the label, the label moves to the far side
 * of its ring, `clearanceDeg` from the belt. A belt exactly on the ring sends
 * the label below it.
 */
export function ringLabelElevation(
  ringDeg: number,
  beltDeg: number | null,
  clearanceDeg: number,
): number {
  if (beltDeg === null || Math.abs(beltDeg - ringDeg) >= clearanceDeg) return ringDeg
  return beltDeg >= ringDeg ? beltDeg - clearanceDeg : beltDeg + clearanceDeg
}
