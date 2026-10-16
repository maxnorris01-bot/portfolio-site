// The info card of a streamed Gaia star: what the tile data carries (position,
// G magnitude, BP-RP colour), what its details file adds (source ID,
// parallax and its error), and, when SIMBAD answers, a name, type and spectral
// type. Pure, so it is tested. The distance row is the Hipparcos card's, so
// both say the same thing about the same parallax.

import { bvFromBpRp, vFromG } from './gaiacolour.ts'
import type { GaiaDetail } from './gaiatiles.ts'
import { colourName, distanceRow, formatRaDec, spectralGloss, type CardRow } from './stardetails.ts'
import type { SimbadState } from './simbad.ts'

export interface GaiaCardInput {
  /** Gaia G magnitude and BP-RP colour (null when the catalogue has none). */
  g: number
  bprp: number | null
  raDeg: number
  decDeg: number
  constellation: { name: string } | null
  /** From the tile's details file, once loaded. */
  detail: GaiaDetail | null
  detailLoading: boolean
  detailFailed: boolean
  simbad: SimbadState
}

/** The name the card and the on-sky label use: SIMBAD's when it has one, else the Gaia source. */
export function gaiaStarName(detail: GaiaDetail | null, simbad: SimbadState): string {
  if (simbad.kind === 'found') return simbad.result.name
  return detail ? `Gaia DR3 ${detail.sourceId}` : 'Gaia star'
}

/** The short name for the on-sky label: SIMBAD's, else the end of the Gaia source ID. */
export function gaiaStarLabel(detail: GaiaDetail | null, simbad: SimbadState): string {
  if (simbad.kind === 'found') return simbad.result.name
  return detail ? `Gaia …${detail.sourceId.slice(-6)}` : 'Gaia star'
}

export function gaiaCardRows(s: GaiaCardInput): CardRow[] {
  const rows: CardRow[] = []
  if (s.constellation) rows.push({ label: 'Constellation', value: s.constellation.name })
  const { ra, dec } = formatRaDec(s.raDeg, s.decDeg)
  rows.push({
    label: 'Position',
    value: `${ra}, ${dec}`,
    note: 'J2000 coordinates, moved to 2026 by the star\'s proper motion',
  })
  const v = vFromG(s.g, s.bprp ?? 0.9)
  rows.push({
    label: 'Magnitude',
    value: `G ${s.g.toFixed(2)} (Gaia's own band)`,
    note: `about V ${v.toFixed(1)} on the visual scale the sky is drawn in${s.bprp === null ? ' (no colour: a typical one assumed)' : ''}`,
  })
  if (s.bprp !== null) {
    rows.push({
      label: 'Colour',
      value: `BP-RP ${s.bprp >= 0 ? '+' : ''}${s.bprp.toFixed(2)}, ${colourName(bvFromBpRp(s.bprp))}`,
    })
  } else {
    rows.push({ label: 'Colour', value: 'not measured by Gaia (shown white-yellow)' })
  }

  const d = s.detail
  if (!d) {
    if (s.detailLoading) rows.push({ label: 'Distance', value: 'loading…' })
    else if (s.detailFailed) rows.push({ label: 'Distance', value: 'the details could not be loaded' })
  } else if (d.plxMas !== null && d.eplxMas === null) {
    // The file stores 255 for "no error, or 1.27 mas or more": either way no distance can be quoted.
    rows.push({
      label: 'Distance',
      value: 'uncertain: its parallax error is 1.27 milliarcseconds or more',
      estimate: true,
      note: `parallax ${d.plxMas.toFixed(2)} mas`,
    })
  } else {
    rows.push(distanceRow(d.plxMas, d.eplxMas))
  }
  const sm = s.simbad
  if (sm.kind === 'found') {
    const r = sm.result
    const sp = r.spType ? spectralGloss(r.spType) : null
    if (sp) rows.push({ label: 'Spectral type', value: `${sp.type}: ${sp.gloss}`, note: 'from SIMBAD' })
    else if (r.spType) rows.push({ label: 'Spectral type', value: r.spType, note: 'from SIMBAD' })
    if (r.otype) rows.push({ label: 'Object type', value: r.otypeGloss ? `${r.otypeGloss} (${r.otype})` : r.otype, note: 'from SIMBAD' })
  }
  if (d) rows.push({ label: 'Gaia source', value: `Gaia DR3 ${d.sourceId}` })
  // The lookup's own state, plainly.
  const simbadLine: Record<string, string> = {
    loading: 'looking up its name in SIMBAD…',
    notfound: 'not in SIMBAD (it has no name or type there)',
    error: 'SIMBAD could not be reached, so there is no name or spectral type',
    offline: 'you are offline, so SIMBAD was not asked',
  }
  if (sm.kind !== 'found' && sm.kind !== 'idle' && d) rows.push({ label: 'SIMBAD', value: simbadLine[sm.kind] })
  return rows
}
