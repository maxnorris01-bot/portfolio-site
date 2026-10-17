// A maximum field of view for the perspective views. A camera's field of view
// is the vertical angle, so on a wide map the horizontal angle is far larger
// (100 degrees vertical on 16:9 is about 130 across), which stretches the
// edges (fish-eye). The cap limits the larger of the two angles. Pure, tested.

const DEG = Math.PI / 180

/** The default cap, degrees: the larger of the horizontal and vertical angles stays within it. */
export const MAX_FOV_DEFAULT = 90
/** The debug slider's range; above about 100 the edges visibly distort. */
export const MAX_FOV_SLIDER_MIN = 45
export const MAX_FOV_SLIDER_MAX = 140

/** The horizontal angle for a vertical `vDeg` on a `aspect` (width / height) view. */
export function horizontalFovDeg(vDeg: number, aspect: number): number {
  return (2 * Math.atan(Math.tan((vDeg * DEG) / 2) * aspect)) / DEG
}

/**
 * The largest vertical field of view (degrees) whose larger angle is within
 * `capDeg`. Landscape: the horizontal angle is the larger, so the vertical is
 * reduced by the aspect; portrait (a phone): the vertical is the larger and
 * the cap applies to it directly.
 */
export function maxVerticalFovDeg(capDeg: number, aspect: number): number {
  const a = aspect > 1 ? aspect : 1
  return (2 * Math.atan(Math.tan((capDeg * DEG) / 2) / a)) / DEG
}

/** A vertical field of view held to the cap (never raised). */
export function capVerticalFov(vDeg: number, capDeg: number, aspect: number): number {
  return Math.min(vDeg, maxVerticalFovDeg(capDeg, aspect))
}

/** The larger of the horizontal and vertical angles, degrees. */
export function widestAngleDeg(vDeg: number, aspect: number): number {
  return Math.max(vDeg, horizontalFovDeg(vDeg, aspect))
}
