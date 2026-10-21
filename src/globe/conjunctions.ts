// The "Show conjunctions" list: the closest approaches of the run, closest
// first, with a relative time for each. Pure, so it is tested.

import type { NearMiss, SatelliteSummary } from '../../api/satellite/summary.ts'

/** How many rows the dropdown lists. */
export const CONJUNCTION_ROWS = 10

/** Smallest miss distance first (ties: the earlier closest approach first); a copy, the input is left alone. */
export function rankClosest(list: readonly NearMiss[], count = CONJUNCTION_ROWS): NearMiss[] {
  return [...list]
    .sort((a, b) => a.miss_distance_km - b.miss_distance_km || a.tca_utc.localeCompare(b.tca_utc))
    .slice(0, count)
}

/**
 * The rows to list for a summary: the server's own closest list (taken over
 * every conjunction), or, from an older response without it, the near misses
 * it did send, re-ranked.
 */
export function closestRows(summary: Pick<SatelliteSummary, 'near_misses'> & Partial<Pick<SatelliteSummary, 'closest_approaches'>>, count = CONJUNCTION_ROWS): NearMiss[] {
  return rankClosest(summary.closest_approaches?.length ? summary.closest_approaches : summary.near_misses, count)
}

/** "in 3 h 20 min" / "42 min ago" / "now", for a time `deltaMs` after (positive) or before the present. */
export function relativeTime(deltaMs: number): string {
  const min = Math.round(Math.abs(deltaMs) / 60000)
  if (min < 1) return 'now'
  const h = Math.floor(min / 60)
  const m = min % 60
  const span = h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`
  return deltaMs > 0 ? `in ${span}` : `${span} ago`
}
