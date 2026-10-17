// The map's credits. Two levels: a short line that is always on screen with
// the map (the main imagery and star data credits, and a link to the page's
// "Data and credits" section), and the full attribution and licence texts in
// that section: the footnote that used to sit under the map, word for word,
// and every credit the sky and imagery layers can show. Pure, so it is tested.

import { EOX_ATTRIBUTION } from './eox.ts'
import { GIBS_ACKNOWLEDGMENT } from './gibs.ts'
import {
  CONSTELLATION_BOUNDARIES_CREDIT,
  CONSTELLATION_FIGURES_CREDIT,
  GAIA_CREDIT,
  IAU_NAMES_CREDIT,
  SIMBAD_CREDIT,
  STARS_CREDIT,
} from './imagery.ts'

/** The id of the page's "Data and credits" section (the short line links to it). */
export const CREDITS_ID = 'sat-credits'

/** The bundled Earth textures' credit: always part of the footnote. */
export const BUNDLED_EARTH_CREDIT =
  'Earth imagery: NASA Visible Earth (Blue Marble); city lights: NASA Earth Observatory (Black Marble 2016, Suomi NPP VIIRS).'

/**
 * The short, always-visible credits: the imagery and star data providers that
 * need crediting wherever their data is shown (EOX Sentinel-2 cloudless, NASA
 * GIBS and Black Marble, ESA Hipparcos and Gaia, d3-celestial).
 */
export const SHORT_CREDITS: readonly string[] = [
  'Earth: NASA Visible Earth and Black Marble, EOX Sentinel-2 cloudless (contains modified Copernicus Sentinel data 2016), NASA GIBS',
  'Stars: ESA Hipparcos, ESA Gaia DPAC (CC BY-NC 3.0 IGO)',
  'Constellation figures: d3-celestial',
]

/** The short line as one string. */
export const shortCreditsLine = () => SHORT_CREDITS.join(' · ')

/** Every full credit the imagery and sky layers can show (the satellite view lists the ones on screen). */
export function allCreditTexts(): string[] {
  const sentence = (t: string) => (t.endsWith('.') ? t : `${t}.`)
  return [
    sentence(EOX_ATTRIBUTION),
    sentence(GIBS_ACKNOWLEDGMENT),
    sentence(STARS_CREDIT),
    sentence(GAIA_CREDIT),
    sentence(IAU_NAMES_CREDIT),
    sentence(SIMBAD_CREDIT),
    sentence(CONSTELLATION_FIGURES_CREDIT),
    sentence(CONSTELLATION_BOUNDARIES_CREDIT),
  ]
}

/**
 * The footnote that sat under the map, unchanged: how many objects and from
 * which snapshot, a note until daily snapshots accumulate, the bundled Earth
 * textures' credit, and (in the satellite view) the credits of what is drawn.
 */
export function footnoteText(opts: {
  objects?: { count: number; snapshot: string }
  historyEmpty: boolean
  satelliteCredits: readonly string[]
}): string {
  const n = (x: number) => x.toLocaleString('en-US')
  return (
    (opts.objects ? `${n(opts.objects.count)} objects from the ${opts.objects.snapshot}. ` : '') +
    (opts.historyEmpty ? 'Earlier days appear on the slider as daily snapshots accumulate. ' : '') +
    BUNDLED_EARTH_CREDIT +
    (opts.satelliteCredits.length > 0 ? ` Satellite view: ${opts.satelliteCredits.join('. ')}.` : '')
  )
}
