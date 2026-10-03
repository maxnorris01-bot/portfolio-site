// satellite.js returns positions in TEME, an Earth-centered inertial frame
// (z toward the north pole). Satellites stay in that frame; only the Earth
// mesh rotates, by GMST, so its texture lines up with real geography at the
// displayed moment (working notes, 2026-10-03 amendment).

export const EARTH_RADIUS_KM = 6378.135 // WGS72, the radius SGP4 uses

// Writes an inertial position (km) into a scene buffer at `i * 3`. Scene units
// are Earth radii, and three.js is y-up, so inertial z maps to scene y.
export function writeInertial(out: Float32Array, i: number, x: number, y: number, z: number) {
  out[i * 3] = x / EARTH_RADIUS_KM
  out[i * 3 + 1] = z / EARTH_RADIUS_KM
  out[i * 3 + 2] = -y / EARTH_RADIUS_KM
}

// three.js's SphereGeometry puts an equirectangular texture's longitude 0 on
// +x and 90°E on -z, the same place writeInertial puts Earth-fixed x and y.
// Rotating the mesh about scene y by GMST therefore carries Earth-fixed
// coordinates into the inertial frame, the same rotation SGP4 frames use.
export function earthRotationY(gmst: number): number {
  return gmst
}
