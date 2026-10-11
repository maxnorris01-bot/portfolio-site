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
}

export interface ImageryStatus {
  /** EOX Sentinel-2 cloudless 2016, the base surface. */
  base: LayerStatus
  /** NASA GIBS's daily mosaic, or null while "Today's imagery" is off. */
  overlay: LayerStatus | null
}

/** "Today's imagery" starts off: the base layer alone is the default. */
export const TODAY_IMAGERY_DEFAULT = false

/** The note shown beside the "Today's imagery" switch. */
export const TODAY_IMAGERY_NOTE = 'Daily mosaic; swath edges are visible.'

/** The satellite view panel's imagery line. */
export function imageryLine({ base, overlay }: ImageryStatus): string {
  if (overlay) {
    if (overlay.state === 'offline') return "Imagery: today's imagery is unavailable right now."
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
  if (imagery.overlay) out.push(sentence(GIBS_ACKNOWLEDGMENT))
  return out
}
