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

// Sky body labels (Sun, Moon, planets): each tries a few spots around its
// marker, in priority order, and takes the first that stays on screen and
// clears every obstacle (grid and compass labels, markers, the selected
// satellite's label) and every label already placed. A label with no free
// spot is hidden, except a forced one (the selected body), which takes its
// first on-screen spot regardless.

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface LabelRequest {
  id: string
  /** Marker centre on screen, px. */
  x: number
  y: number
  /** Marker radius, px: labels sit just outside it. */
  r: number
  w: number
  h: number
  force?: boolean
}

const LABEL_GAP_PX = 4

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/** Candidate spots for a label, best first: below, right, above, left of its marker. */
export function labelSpots(q: LabelRequest): Rect[] {
  const d = q.r + LABEL_GAP_PX
  return [
    { x: q.x - q.w / 2, y: q.y + d, w: q.w, h: q.h },
    { x: q.x + d, y: q.y - q.h / 2, w: q.w, h: q.h },
    { x: q.x - q.w / 2, y: q.y - d - q.h, w: q.w, h: q.h },
    { x: q.x - d - q.w, y: q.y - q.h / 2, w: q.w, h: q.h },
  ]
}

/** Places labels in the given (priority) order; null means hidden. */
export function placeLabels(
  requests: readonly LabelRequest[],
  obstacles: readonly Rect[],
  bounds: { w: number; h: number },
  /** Extra test a spot must pass, e.g. "not below the horizon". */
  allowed: (r: Rect) => boolean = () => true,
): Map<string, Rect | null> {
  const placed: Rect[] = []
  const out = new Map<string, Rect | null>()
  const onScreen = (r: Rect) =>
    r.x >= 0 && r.y >= 0 && r.x + r.w <= bounds.w && r.y + r.h <= bounds.h && allowed(r)
  for (const q of requests) {
    const spots = labelSpots(q).filter(onScreen)
    const free = spots.find((s) => !obstacles.some((o) => overlaps(s, o)) && !placed.some((p) => overlaps(s, p)))
    const pick = free ?? (q.force ? spots[0] : undefined) ?? null
    if (pick) placed.push(pick)
    out.set(q.id, pick)
  }
  return out
}
