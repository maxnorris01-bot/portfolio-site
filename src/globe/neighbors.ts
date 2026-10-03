// Nearest neighbour for the inspect panel: one comparison of the selected
// object against every other object, all propagated fresh to the same moment
// (not the frame-sliced render positions, which can be ~9 frames stale).

/**
 * Index and distance (same units as `positions`) of the object nearest to
 * `index`. `positions` holds x, y, z per object; entries whose `valid(i)` is
 * false (failed propagation) are skipped. Null if there's no other object.
 */
export function nearestTo(
  positions: Float64Array,
  index: number,
  valid: (i: number) => boolean,
): { index: number; distance: number } | null {
  const x = positions[index * 3]
  const y = positions[index * 3 + 1]
  const z = positions[index * 3 + 2]
  let best = -1
  let bestD2 = Infinity
  const n = positions.length / 3
  for (let i = 0; i < n; i++) {
    if (i === index || !valid(i)) continue
    const d2 =
      (positions[i * 3] - x) ** 2 + (positions[i * 3 + 1] - y) ** 2 + (positions[i * 3 + 2] - z) ** 2
    if (d2 < bestD2) {
      bestD2 = d2
      best = i
    }
  }
  return best === -1 ? null : { index: best, distance: Math.sqrt(bestD2) }
}
