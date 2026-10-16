// What the satellite view says about its imagery: the panel's one line and
// the credits the footnote must carry. Pure, so the attribution rules are
// tested: EOX's credit whenever its tiles are on screen, NASA GIBS's only
// while "Today's imagery" draws GIBS over it.

import { EOX_ATTRIBUTION } from './eox.ts'
import { GIBS_ACKNOWLEDGMENT } from './gibs.ts'

export interface LayerStatus {
  /** The imagery date (dated layers only). */
  date: string | null
  state: 'starting' | 'ok' | 'offline'
  /** Tiles drawn this frame. */
  drawn: number
  /** The overlay's fade (1 visible, 0 faded out up close); absent for the base. */
  fade?: number
}

export interface ImageryStatus {
  /** NASA Black Marble night lights, streamed over the dark side (null until started). */
  night?: LayerStatus | null
  /** EOX Sentinel-2 cloudless 2016, the base surface. */
  base: LayerStatus
  /** NASA GIBS's daily mosaic, or null while "Today's imagery" is off. */
  overlay: LayerStatus | null
}

/** "Today's imagery" starts off: the base layer alone is the default. */
export const TODAY_IMAGERY_DEFAULT = false

/** The plain-language explanation beside the "Base map | Today's imagery" control. */
export const IMAGERY_EXPLAINER =
  'The base map is a cloud-free 2016 composite: sharp and seamless, but it does not show current ' +
  "weather. Today's imagery shows real clouds and storms for the date on the slider, with visible " +
  'seams between satellite passes.'

/** Shown while Today's imagery is on. */
export const TODAY_FADE_NOTE = "Zoom in close and Today's imagery fades to the sharper base map"

/** The satellite view panel's imagery line. */
export function imageryLine({ base, overlay }: ImageryStatus): string {
  if (overlay) {
    if (overlay.state === 'offline') return "Imagery: today's imagery is unavailable right now."
    if ((overlay.fade ?? 1) <= 0) return "Imagery: Sentinel-2 cloudless, 2016 composite (today's imagery fades out this close)"
    return overlay.date ? `Imagery: ${overlay.date} (NASA GIBS)` : 'Imagery: loading…'
  }
  if (base.state === 'offline') return 'Imagery unavailable right now: showing the built-in Earth texture.'
  return 'Imagery: Sentinel-2 cloudless, 2016 composite'
}

/**
 * The imagery credits the footnote shows: EOX's while its tiles are visible
 * (the satellite view, with tiles drawn), NASA GIBS's while the overlay is on
 * in the satellite view. None outside it (the Globe and Sky views use only
 * the bundled textures, credited separately).
 */
export function imageryCredits(viewMode: string, imagery: ImageryStatus | null): string[] {
  // Each credit is a sentence without its final full stop, so they join cleanly.
  const sentence = (t: string) => t.replace(/\.$/, '')
  if (viewMode !== 'pov' || !imagery) return []
  const out: string[] = []
  if (imagery.base.drawn > 0) out.push(sentence(EOX_ATTRIBUTION))
  // Both of NASA's layers come from GIBS: its acknowledgment shows while
  // either is visible (the daily overlay, or the streamed night lights).
  const overlayShown = !!imagery.overlay && (imagery.overlay.fade ?? 1) > 0
  const nightShown = !!imagery.night && imagery.night.drawn > 0
  if (overlayShown || nightShown) out.push(sentence(GIBS_ACKNOWLEDGMENT))
  return out
}

/**
 * Today's imagery is coarser than the base map, so it fades out as the user
 * zooms in: fully shown while one of its pixels (`texelKm`, its finest
 * level) covers at most one screen pixel, gone once it would cover two, with
 * a smooth ramp between. `groundKmPerPx` is the ground size of a screen
 * pixel at the centre of the view.
 */
export function overlayFade(groundKmPerPx: number, texelKm: number): number {
  const t = Math.max(0, Math.min(1, (groundKmPerPx - texelKm / 2) / (texelKm / 2)))
  return t * t * (3 - 2 * t)
}

/**
 * The camera heights (looking straight down) between which the overlay
 * fades: fully shown above `fullKm`, gone below `goneKm`.
 */
export function overlayFadeAltitudesKm(texelKm: number, fovDeg: number, screenPx: number): { fullKm: number; goneKm: number } {
  const kmPerPxAt = (altKm: number) => (2 * altKm * Math.tan((fovDeg * Math.PI) / 360)) / screenPx
  const perKm = kmPerPxAt(1)
  return { fullKm: texelKm / perKm, goneKm: texelKm / 2 / perKm }
}

/** The star catalogue's credit, as ESA's licence asks ("Credit: ESA"), with its licence. */
export const STARS_CREDIT =
  'Stars: the Hipparcos Catalogue (ESA, 1997, The Hipparcos and Tycho Catalogues, ESA SP-1200). ' +
  'Credit: ESA. Licence: CC BY-NC 3.0 IGO; this site is non-commercial'

/**
 * The Gaia data's credit, as ESA's archive terms specify ("ESA, Gaia DPAC"),
 * with its licence, a note that it was adapted, and the site's non-commercial
 * use. Shown while streamed stars or the glow built from them are on screen.
 */
export const GAIA_CREDIT =
  'Stars: Gaia DR3 (Gaia Collaboration, 2022). Credit: ESA, Gaia DPAC. ' +
  'Licence: CC BY-NC 3.0 IGO (creativecommons.org/licenses/by-nc/3.0/igo), adapted (stars selected, moved to 2026, packed); ' +
  'this site is non-commercial'

/** What the satellite view's sky is showing, for its credits. */
export interface SkyStatus {
  /** Stars drawn (0 until the catalogue loads). */
  stars: number
  /** The Milky Way band is shown. */
  milkyWay?: boolean
  /** The IAU star names have been loaded (a star was selected or searched for). */
  names?: boolean
  /** A star is selected, so its IAU name or card is on screen. */
  starSelected?: boolean
  /** Streamed Gaia stars are drawn (a count), or the glow built from Gaia is shown. */
  gaia?: { drawn: number }
  glow?: boolean
  /** Constellation figures, and the IAU boundaries, are on screen. */
  constellations?: { lines: boolean; boundaries: boolean }
}

/** The constellation figures' source (BSD-3-Clause: the notice is kept in the data folder), shown while they are drawn. */
export const CONSTELLATION_FIGURES_CREDIT = 'Constellation figures: d3-celestial (Olaf Frohn, BSD-3-Clause)'

/** The boundaries: the IAU's, from Delporte's 1930 table. */
export const CONSTELLATION_BOUNDARIES_CREDIT = 'Constellation boundaries: IAU (Delporte, 1930)'

/** The IAU's catalogue of star names (public domain / CC Attribution), shown while a name is on screen. */
export const IAU_NAMES_CREDIT = 'Star names: IAU Catalog of Star Names (IAU Working Group on Star Names)'

/** NASA SVS's requested credit for the Deep Star Maps (public domain; the credit is requested, not required). */
export const MILKY_WAY_CREDIT =
  'Milky Way: NASA/Goddard Space Flight Center Scientific Visualization Studio, Deep Star Maps 2020; Gaia DR2: ESA/Gaia/DPAC'

/** The sky's credits: the star catalogue while its stars are on screen in the satellite view. */
export function skyCredits(viewMode: string, sky: SkyStatus | null): string[] {
  if (viewMode !== 'pov' || !sky) return []
  const out: string[] = []
  if (sky.stars > 0) out.push(STARS_CREDIT)
  if (sky.milkyWay) out.push(MILKY_WAY_CREDIT)
  if ((sky.gaia?.drawn ?? 0) > 0 || sky.glow) out.push(GAIA_CREDIT)
  if (sky.names && sky.starSelected) out.push(IAU_NAMES_CREDIT)
  if (sky.constellations?.lines) out.push(CONSTELLATION_FIGURES_CREDIT)
  if (sky.constellations?.boundaries) out.push(CONSTELLATION_BOUNDARIES_CREDIT)
  return out
}
