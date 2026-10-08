// The Sun's direction for any moment, in the same inertial frame the globe
// already uses for satellites (satellite.js's TEME-style frame, z toward the
// north pole). Reusable for day/night shading now and, later, a satellite's
// eclipse state or "visible tonight" (observer in darkness, satellite sunlit).
//
// The position is satellite.js's `sunPos`: David Vallado's low-precision
// solar formula, 0.01 degrees for 1950-2050, far better than the 0.1 degrees
// day/night shading needs. Checked against an independent ephemeris
// (astronomy-engine, test-only) in tests/sun.test.ts.

import { gstime, jday, sunPos } from 'satellite.js'

export type Vec3 = [number, number, number]

const DEG = 180 / Math.PI

/** Unit vector from the Earth's centre to the Sun, inertial frame (x, y, z). */
export function sunDirectionEci(date: Date): Vec3 {
  const { rsun } = sunPos(jday(date))
  const r = Math.hypot(rsun.x, rsun.y, rsun.z)
  return [rsun.x / r, rsun.y / r, rsun.z / r]
}

/**
 * The same direction in the globe scene's axes (three.js is y-up, so inertial
 * z maps to scene y), matching writeInertial in frames.ts.
 */
export function sunDirectionScene(date: Date): Vec3 {
  const [x, y, z] = sunDirectionEci(date)
  return [x, z, -y]
}

/**
 * The subsolar point: where the Sun is straight overhead. Latitude is the
 * Sun's declination; longitude is its right ascension less the Greenwich
 * sidereal angle, wrapped to -180..180 (spherical Earth).
 */
export function subsolarPoint(date: Date): { latDeg: number; lonDeg: number } {
  const [x, y, z] = sunDirectionEci(date)
  const ra = Math.atan2(y, x)
  const lon = ((((ra - gstime(date)) * DEG + 540) % 360) + 360) % 360 - 180
  return { latDeg: Math.asin(z) * DEG, lonDeg: lon }
}

/**
 * The Sun's elevation above the horizon, in degrees, at a point on a
 * spherical Earth (geocentric, no refraction): the angle between the local
 * vertical and the Sun is 90 degrees minus this. Good to a few tenths of a
 * degree, plenty for shading and twilight phases.
 */
export function sunElevationDeg(latDeg: number, lonDeg: number, date: Date): number {
  const sub = subsolarPoint(date)
  const lat = latDeg / DEG
  const slat = sub.latDeg / DEG
  const dlon = (lonDeg - sub.lonDeg) / DEG
  const cosZenith = Math.sin(lat) * Math.sin(slat) + Math.cos(lat) * Math.cos(slat) * Math.cos(dlon)
  return Math.asin(Math.max(-1, Math.min(1, cosZenith))) * DEG
}
