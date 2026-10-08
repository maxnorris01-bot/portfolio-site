// The selected object's orbit as one closed loop. In the scene's inertial
// (ECI) frame an orbit is very nearly a fixed ellipse, so it's sampled once
// from the object's own SGP4 elements and only recomputed when the displayed
// time moves far from the moment it was sampled around.

import { propagate, type SatRec } from 'satellite.js'
import { writeInertial } from './frames.ts'

/** Points per loop: smooth even at a Molniya orbit's fast perigee pass. */
export const ORBIT_SAMPLES = 360

const MINUTE_MS = 60_000

/**
 * One orbital period in ms, from the elements' mean motion (`no`, radians per
 * minute), or null if it's missing or not positive.
 */
export function orbitPeriodMs(rec: Pick<SatRec, 'no'>): number | null {
  const n = rec.no
  if (!Number.isFinite(n) || n <= 0) return null
  return ((2 * Math.PI) / n) * MINUTE_MS
}

/**
 * Scene positions (Earth radii, inertial frame) for one period centred on
 * `centreMs`: from half a period before to just under half a period after, so
 * drawn as a closed loop the object sits mid-way along the samples and the
 * small closing chord (SGP4's perturbations keep the start and end from
 * meeting exactly) is on the far side of the orbit. Null when the period is
 * unknown or more than a tenth of the samples fail to propagate (a decaying
 * object); otherwise failed samples are skipped.
 */
export function sampleOrbit(
  rec: SatRec,
  centreMs: number,
  samples = ORBIT_SAMPLES,
): Float32Array | null {
  const period = orbitPeriodMs(rec)
  if (period === null) return null
  const out = new Float32Array(samples * 3)
  let n = 0
  for (let k = 0; k < samples; k++) {
    const pv = propagate(rec, new Date(centreMs - period / 2 + (k * period) / samples))
    const p = pv?.position
    if (!p || !Number.isFinite(p.x)) continue
    writeInertial(out, n++, p.x, p.y, p.z)
  }
  if (n < samples * 0.9) return null
  return n === samples ? out : out.slice(0, n * 3)
}

/**
 * Whether a loop sampled around `centreMs` should be recomputed for the
 * displayed time `simMs`. The samples are the object's own SGP4 track over
 * the half period either side of `centreMs`, so anywhere in that span the
 * object is exactly on its line. Past it the object is on its next
 * revolution, which perturbations (mainly J2 precession, about 0.3 degrees of
 * node per orbit in low Earth orbit) have shifted: by up to about 30 km for
 * the ISS. So the loop is resampled as soon as the displayed time leaves the
 * span, whether by normal play or a slider jump. Sampling costs 360
 * propagations, under a millisecond, so even an ISS orbit at 50x (a resample
 * every ~56 s of real time) costs nothing measurable.
 */
export function orbitNeedsRefresh(centreMs: number, simMs: number, periodMs: number): boolean {
  return Math.abs(simMs - centreMs) > periodMs / 2
}

/** The most orbit lines shown at once: the two objects of a near-miss pair. */
export const MAX_ORBITS = 2

/**
 * Which objects get an orbit line, one selection at a time: the inspected
 * object (not its live neighbour); both objects of a near-miss pair; or a
 * station's first piece, the station itself (its other pieces are docked to it
 * and share its orbit). Empty when nothing is selected.
 */
export function orbitTargets(selection: {
  inspect: number | null
  pair: readonly [number, number] | null
  group: readonly number[] | null
}): number[] {
  const { inspect, pair, group } = selection
  if (inspect !== null) return [inspect]
  if (pair) return pair[0] === pair[1] ? [pair[0]] : [pair[0], pair[1]]
  if (group?.length) return [group[0]]
  return []
}
