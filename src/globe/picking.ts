// Click-to-inspect: find the visible point nearest a click, within a fixed
// number of screen pixels. A screen-space threshold behaves the same at every
// zoom; a world-space one would get easy to hit zoomed in and nearly
// impossible zoomed out.

export interface PickView {
  /** Column-major view-projection matrix (camera.projectionMatrix x matrixWorldInverse). */
  viewProj: ArrayLike<number>
  /** Camera position in scene units (Earth radii). */
  camera: [number, number, number]
  /** Canvas size in CSS pixels. */
  width: number
  height: number
}

// True if the straight line from the camera to p passes through the Earth
// (a unit sphere), i.e. the point is on the far side.
function occluded(cx: number, cy: number, cz: number, px: number, py: number, pz: number) {
  const dx = px - cx
  const dy = py - cy
  const dz = pz - cz
  const a = dx * dx + dy * dy + dz * dz
  const b = 2 * (cx * dx + cy * dy + cz * dz)
  const c = cx * cx + cy * cy + cz * cz - 1
  const disc = b * b - 4 * a * c
  if (disc <= 0) return false
  const t = (-b - Math.sqrt(disc)) / (2 * a)
  return t > 0 && t < 1
}

/**
 * Index of the nearest point to (x, y) in CSS pixels, or null if none is
 * within `thresholdPx`. Skips points that are hidden (`visible[i] === 0`),
 * behind the camera, or behind the Earth.
 */
export function pickNearest(
  positions: Float32Array,
  visible: (i: number) => boolean,
  view: PickView,
  x: number,
  y: number,
  thresholdPx: number,
): number | null {
  const m = view.viewProj
  const [cx, cy, cz] = view.camera
  let best: number | null = null
  let bestD2 = thresholdPx * thresholdPx
  const n = positions.length / 3
  for (let i = 0; i < n; i++) {
    if (!visible(i)) continue
    const px = positions[i * 3]
    const py = positions[i * 3 + 1]
    const pz = positions[i * 3 + 2]
    const w = m[3] * px + m[7] * py + m[11] * pz + m[15]
    if (w <= 0) continue // behind the camera
    const sx = ((m[0] * px + m[4] * py + m[8] * pz + m[12]) / w + 1) * 0.5 * view.width
    const sy = (1 - (m[1] * px + m[5] * py + m[9] * pz + m[13]) / w) * 0.5 * view.height
    const d2 = (sx - x) ** 2 + (sy - y) ** 2
    if (d2 >= bestD2) continue
    if (occluded(cx, cy, cz, px, py, pz)) continue
    best = i
    bestD2 = d2
  }
  return best
}
