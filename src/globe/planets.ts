// The Sun, Moon and planets for the Sky view's observer, from astronomy-engine
// (arcsecond-level accuracy). This module is only ever loaded with a dynamic
// import() once the Sky view has an observer, so the ephemeris (about 25 kB
// gzipped) stays out of the globe's own chunk.
//
// Positions are topocentric: computed for the observer's place on the surface,
// not the Earth's centre. That matters for the Moon, whose parallax is about
// one degree. Elevations are geometric (no atmospheric refraction), the same
// as the satellites drawn on the dome.

import { Body, Equator, Horizon, Illumination, MoonPhase, Observer, Rotation_EQJ_EQD } from 'astronomy-engine'
import { KM_PER_AU, SKY_BODIES, type SkyBody } from './skybodies.ts'
import type { Mat3 } from './stars.ts'

const BODY: Record<string, Body> = {
  sun: Body.Sun,
  moon: Body.Moon,
  mercury: Body.Mercury,
  venus: Body.Venus,
  mars: Body.Mars,
  jupiter: Body.Jupiter,
  saturn: Body.Saturn,
  uranus: Body.Uranus,
  neptune: Body.Neptune,
}

/** Every body in SKY_BODIES, seen from (lat, lon) at `date`, above the horizon or not. */
export function computeSkyBodies(date: Date, latDeg: number, lonDeg: number): SkyBody[] {
  const observer = new Observer(latDeg, lonDeg, 0)
  return SKY_BODIES.map((def) => {
    const body = BODY[def.key]
    const eq = Equator(body, date, observer, true, true)
    const hor = Horizon(date, observer, eq.ra, eq.dec)
    const illum = Illumination(body, date)
    return {
      ...def,
      azDeg: hor.azimuth,
      elDeg: hor.altitude,
      mag: illum.mag,
      distAu: eq.dist,
      distKm: eq.dist * KM_PER_AU,
      illuminated: def.key === 'moon' ? illum.phase_fraction : undefined,
      // Ecliptic longitude Moon minus Sun: under 180 degrees, waxing.
      waxing: def.key === 'moon' ? MoonPhase(date) < 180 : undefined,
    }
  })
}

/**
 * The rotation from J2000 (ICRS) axes to the true equator and equinox of
 * `date` (precession and nutation), row-major: what the satellite view's
 * star field needs to line up with the satellites' frame. astronomy-engine
 * applies its matrix as x' = rot[0][0] x + rot[1][0] y + rot[2][0] z, so its
 * rows here are its columns.
 */
export function j2000ToDateMatrix(date: Date): Mat3 {
  const r = Rotation_EQJ_EQD(date).rot
  return [r[0][0], r[1][0], r[2][0], r[0][1], r[1][1], r[2][1], r[0][2], r[1][2], r[2][2]]
}
