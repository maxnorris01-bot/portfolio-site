// EOX Sentinel-2 cloudless, 2016 edition: the satellite view's base Earth
// surface. One seamless, cloud-free global mosaic at about 10 m per pixel.
//
// LICENCE: only the 2016 edition (WMTS layer `s2cloudless`) is CC BY 4.0.
// The 2017 and later editions (`s2cloudless-2018` ... `s2cloudless-2025`)
// are CC BY-NC-SA 4.0 and must never be used here; `eoxTileUrl` refuses any
// other layer. See satellite-conjunction-screening
// docs/research/2026-10-close-up-imagery.md.
//
// The grid is EOX's `WGS84` tile matrix set (EPSG:4326, from its
// GetCapabilities): 256 px tiles, origin (-180, 90), 2x1 tiles at level 0
// and the span halving at each level, so a level-z tile spans 180 / 2^z
// degrees and the matrix is exactly 2^(z+1) x 2^z (no partial edge tiles,
// unlike GIBS's). Geographic, not Mercator: the same lat/lon mapping as the
// globe mesh, so tiles meet the poles and the 180th meridian exactly.
// Level 13 is about 9.6 m per pixel, the imagery's native ~10 m; deeper
// levels the service offers are only upsampled.

import type { TileGrid, TileKey } from './gibs.ts'

export const EOX_BASE = 'https://tiles.maps.eox.at/wmts/1.0.0'
/** The 2016 edition, CC BY 4.0. Never a later edition (non-commercial licence). */
export const EOX_LAYER = 's2cloudless'
export const EOX_MATRIX_SET = 'WGS84'
export const EOX_TILE_PX = 256
export const EOX_MAX_LEVEL = 13

export const EOX_GRID: TileGrid = {
  tilePx: EOX_TILE_PX,
  maxLevel: EOX_MAX_LEVEL,
  spanDeg: (z) => 180 / 2 ** z,
}

/** Ground size of one image pixel at level z, km (at the equator). */
export const EOX_LEVEL_KM = (z: number) => (EOX_GRID.spanDeg(z) / EOX_TILE_PX) * 111.32

/** The attribution EOX requires wherever its imagery is shown. */
export const EOX_ATTRIBUTION =
  'Sentinel-2 cloudless - https://s2maps.eu by EOX IT Services GmbH ' +
  '(Contains modified Copernicus Sentinel data 2016)'

/** The tile's URL in the 2016 layer. */
export function eoxTileUrl(t: TileKey, layer: string = EOX_LAYER): string {
  if (layer !== EOX_LAYER) throw new Error(`EOX layer ${layer} is not the CC BY 2016 edition`)
  return `${EOX_BASE}/${layer}/default/${EOX_MATRIX_SET}/${t.z}/${t.row}/${t.col}.jpg`
}

/**
 * EOX's rendering is far more contrasty than the bundled 2K texture the
 * day/night shading was tuned on: deserts are about 2.4 times brighter
 * (Sahara mean linear luminance 0.81 against 0.34; GIBS 0.40) while typical
 * land is a little darker (median 0.079 against 0.092), so under the lit
 * side's 1.6x gain its deserts clip to white. A curve k * L^gamma (linear
 * light, per channel), fitted to keep the land median at the 2K texture's
 * and bring the Sahara to GIBS's level, calibrates it before shading; the
 * shading itself is unchanged.
 */
export const EOX_TONE: readonly [number, number] = [0.455, 0.63]

/** The tone curve on one linear value (the shader does the same per channel). */
export const toneMap = (linear: number, [k, gamma]: readonly [number, number] = EOX_TONE) =>
  k * Math.pow(Math.max(0, linear), gamma)
