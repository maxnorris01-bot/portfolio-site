// What the satellite view's star card says about a star, and how to find one:
// the details file reader, the IAU star names, search, and the derived values
// (distance, spectral type, temperature, luminosity), each with its method
// and uncertainty. Pure (no three.js, no ephemeris), so it's tested.
//
// Everything here is either read straight from the Hipparcos catalogue
// (ESA 1997: HIP number, V magnitude, B-V, parallax and its error, spectral
// type, variability) or an estimate computed from it and labelled as one.
// The details sit in their own lazy file (hipparcos-details.bin, written by
// scripts/build-hipparcos.mjs): it's only fetched when a star is selected or
// searched for.

const LY_PER_PC = 3.26156

export interface StarDetails {
  count: number
  hip: Uint32Array
  /** Parallax in mas; NaN where the catalogue has none. */
  plxMas: Float32Array
  /** Standard error of the parallax in mas; NaN where there's none. */
  eplxMas: Float32Array
  /** Index into `spectral`, 0 = none. */
  spIndex: Uint16Array
  spectral: string[]
  /** Variability flag (0 none, 1: < 0.06 mag, 2: 0.06-0.6, 3: > 0.6) and type code. */
  varFlag: Uint8Array
  varType: Uint8Array
}

const VAR_TYPES = ['', 'C', 'D', 'M', 'P', 'R', 'U']

/** Read hipparcos-details.bin ("HIPD" version 1), keeping the first `limit` stars. */
export function readStarDetails(buffer: ArrayBuffer, limit = Infinity): StarDetails {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])
  if (magic !== 'HIPD' || view.getUint16(4, true) !== 1) throw new Error('not a version 1 star details file')
  const total = view.getUint32(8, true)
  const dictLen = view.getUint32(12, true)
  if (bytes.length < 32 + total * 9 + dictLen) throw new Error('star details file is truncated')
  const n = Math.min(total, limit)
  const hipAt = 32
  const plxAt = hipAt + total * 3
  const eplxAt = plxAt + total * 2
  const spAt = eplxAt + total
  const varAt = spAt + total * 2
  const hip = new Uint32Array(n)
  const plx = new Float32Array(n)
  const eplx = new Float32Array(n)
  const spIndex = new Uint16Array(n)
  const varFlag = new Uint8Array(n)
  const varType = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    hip[i] = bytes[hipAt + i * 3] | (bytes[hipAt + i * 3 + 1] << 8) | (bytes[hipAt + i * 3 + 2] << 16)
    const p = view.getInt16(plxAt + i * 2, true)
    plx[i] = p === -32768 ? NaN : p / 20
    const e = bytes[eplxAt + i]
    eplx[i] = e === 255 ? NaN : e / 10
    spIndex[i] = view.getUint16(spAt + i * 2, true)
    const v = bytes[varAt + i]
    varFlag[i] = v & 3
    varType[i] = v >> 2
  }
  const dict = new TextDecoder('latin1').decode(bytes.subarray(32 + total * 9, 32 + total * 9 + dictLen))
  return { count: n, hip, plxMas: plx, eplxMas: eplx, spIndex, spectral: dict.split('\n'), varFlag, varType }
}

/** One star's catalogue details. */
export interface StarRecord {
  hip: number
  plxMas: number | null
  eplxMas: number | null
  spectral: string
  /** 0 none, 1 under 0.06 mag, 2 0.06-0.6, 3 over 0.6. */
  varFlag: number
  varType: string
}

export function recordAt(d: StarDetails, i: number): StarRecord {
  return {
    hip: d.hip[i],
    plxMas: Number.isNaN(d.plxMas[i]) ? null : d.plxMas[i],
    eplxMas: Number.isNaN(d.eplxMas[i]) ? null : d.eplxMas[i],
    spectral: d.spectral[d.spIndex[i]] ?? '',
    varFlag: d.varFlag[i],
    varType: VAR_TYPES[d.varType[i]] ?? '',
  }
}

/** Catalogue index by Hipparcos number. */
export function hipIndex(d: StarDetails): Map<number, number> {
  const m = new Map<number, number>()
  for (let i = 0; i < d.count; i++) m.set(d.hip[i], i)
  return m
}

// ---- IAU names ----

/** [name, HIP number, Bayer/Flamsteed designation, constellation abbreviation] */
export type IauName = readonly [string, number, string, string]

export interface NameTable {
  names: readonly IauName[]
  byHip: Map<number, IauName>
}

export function nameTable(rows: readonly IauName[]): NameTable {
  return { names: rows, byHip: new Map(rows.map((r) => [r[1], r])) }
}

/** The name shown for a star: its IAU name, or "HIP n". */
export function starName(hip: number, names: NameTable | null): string {
  return names?.byHip.get(hip)?.[0] ?? `HIP ${hip}`
}

/** Fold case and diacritics so "Sirius", "sirius" and "Šírius" all match. */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export interface StarMatch {
  name: string
  hip: number
  designation: string
  constellation: string
}

/**
 * Stars matching a search: IAU names by prefix (then by containing the text),
 * or a HIP number ("HIP 32349", "hip32349" or "32349"). At most `limit`.
 */
export function searchStars(
  query: string,
  names: NameTable,
  hasHip: (hip: number) => boolean,
  limit = 6,
): StarMatch[] {
  const q = fold(query.trim())
  if (!q) return []
  const out: StarMatch[] = []
  const add = (r: IauName) => out.push({ name: r[0], hip: r[1], designation: r[2], constellation: r[3] })
  const hipText = q.replace(/^hip\s*/, '')
  if (/^\d{1,6}$/.test(hipText)) {
    const hip = Number(hipText)
    const named = names.byHip.get(hip)
    if (named && hasHip(hip)) add(named)
    else if (hasHip(hip)) out.push({ name: `HIP ${hip}`, hip, designation: '', constellation: '' })
  }
  const pref: IauName[] = []
  const inside: IauName[] = []
  for (const r of names.names) {
    const n = fold(r[0])
    if (!hasHip(r[1])) continue
    if (n.startsWith(q)) pref.push(r)
    else if (q.length >= 2 && n.includes(q)) inside.push(r)
  }
  for (const r of [...pref, ...inside]) {
    if (out.length >= limit) break
    if (!out.some((m) => m.hip === r[1])) add(r)
  }
  return out.slice(0, limit)
}

/** Well-known stars offered before anything is typed. */
export const SUGGESTED_STARS = ['Sirius', 'Betelgeuse', 'Polaris', 'Vega', 'Rigel', 'Antares', 'Canopus', 'Arcturus'] as const

// ---- distance ----

export interface Distance {
  /** 'measured': a good parallax; 'range': a poor one, shown as a range;
   *  'lower': only a lower limit; 'none': no usable parallax. */
  kind: 'measured' | 'range' | 'lower' | 'none'
  ly?: number
  /** For 'range': nearest and farthest consistent with the error; for 'measured': +- (symmetric, ly). */
  minLy?: number
  maxLy?: number
  plusMinusLy?: number
}

/**
 * Distance from the catalogue's trigonometric parallax. A parallax measured
 * to better than 10% gives a distance with its +- error; between 10% and 30%
 * only a range (from parallax plus and minus one error); worse than that the
 * distance is too uncertain to quote and only a lower limit, if any, is
 * meaningful; with no parallax (or none above zero) there's nothing to say.
 */
export function distanceFromParallax(plxMas: number | null, eplxMas: number | null): Distance {
  if (plxMas === null || eplxMas === null || eplxMas <= 0) return { kind: 'none' }
  const ly = (1000 / plxMas) * LY_PER_PC
  const rel = eplxMas / plxMas
  if (plxMas > 0 && rel <= 0.1) {
    return { kind: 'measured', ly, plusMinusLy: ly * rel }
  }
  if (plxMas > 0 && rel <= 0.3) {
    return {
      kind: 'range',
      ly,
      minLy: (1000 / (plxMas + eplxMas)) * LY_PER_PC,
      maxLy: (1000 / (plxMas - eplxMas)) * LY_PER_PC,
    }
  }
  // Poor or non-positive parallax: at least the distance at plx + 1 sigma.
  const top = plxMas + eplxMas
  return top > 0 ? { kind: 'lower', minLy: (1000 / top) * LY_PER_PC } : { kind: 'none' }
}

// ---- spectral type ----

const CLASS_GLOSS: Record<string, string> = {
  O: 'blue',
  B: 'blue-white',
  A: 'white',
  F: 'yellow-white',
  G: 'yellow',
  K: 'orange',
  M: 'red',
  C: 'deep red (carbon star)',
  S: 'red-orange (S-type)',
  L: 'brown dwarf, infrared',
  T: 'brown dwarf, methane',
  N: 'deep red (carbon star)',
  W: 'blue (Wolf-Rayet)',
}

const LUM_GLOSS: [RegExp, string][] = [
  [/^(?:Ia\+|0)/, 'hypergiant'],
  [/^Iab?|^Ib|^I(?![IV])/, 'supergiant'],
  [/^II(?![I])/, 'bright giant'],
  [/^III/, 'giant'],
  [/^IV/, 'subgiant'],
  [/^V(?![IV])/, 'main-sequence star (dwarf)'],
  [/^VI/, 'subdwarf'],
  [/^VII/, 'white dwarf'],
]

export interface SpectralGloss {
  /** The catalogue's string as given. */
  type: string
  /** "K0III: orange giant" style text, or just the colour when there's no luminosity class. */
  gloss: string
}

/**
 * A plain-language reading of a Morgan-Keenan spectral type ("K0III" is an
 * orange giant). Handles the common forms: class letter, subtype, luminosity
 * class (the first of a range such as "IV-V"), prefixes "sd" and "d", white
 * dwarfs ("DA"), and peculiarity marks that are ignored. Returns null for an
 * empty or unreadable type.
 */
export function spectralGloss(type: string): SpectralGloss | null {
  const raw = type.trim()
  if (!raw) return null
  let t = raw.replace(/^[(:]+/, '')
  let prefix = ''
  const pm = /^(sd|d|g|esd)(?=[OBAFGKMCSLTNW])/.exec(t)
  if (pm) {
    prefix = pm[1]
    t = t.slice(pm[1].length)
  }
  if (/^D[A-Z]/.test(t)) return { type: raw, gloss: 'white dwarf (a collapsed, dying star)' }
  const m = /^([OBAFGKMCSLTNW])(\d(?:\.\d)?)?/.exec(t)
  if (!m) return null
  const colour = CLASS_GLOSS[m[1]]
  if (!colour) return null
  const rest = t.slice(m[0].length).replace(/^[:+\-/]*/, '')
  let lum: string | null = null
  for (const [re, label] of LUM_GLOSS) {
    const hit = re.exec(rest.replace(/^[^IV0]*/, ''))
    if (hit) {
      lum = label
      break
    }
  }
  if (prefix === 'sd') lum = 'subdwarf'
  else if (prefix === 'd' && !lum) lum = 'main-sequence star (dwarf)'
  else if (prefix === 'g' && !lum) lum = 'giant'
  const typeText = raw.length > 11 ? raw.slice(0, 11) : raw
  return { type: typeText, gloss: lum ? `${colour} ${lum}` : colour }
}

// ---- temperature and luminosity (estimates) ----

/**
 * Surface temperature (K) from the B-V colour index: Ballesteros (2012),
 * T = 4600 (1 / (0.92 B-V + 1.7) + 1 / (0.92 B-V + 0.62)), a blackbody fit.
 * It ignores dust reddening and the star's metallicity, and it's best
 * between B-V of about -0.3 and 1.7: accurate to a few percent for
 * ordinary stars, worse for very red or very blue ones. Null outside -0.4..2.
 */
export function temperatureFromBV(bv: number): number | null {
  if (!Number.isFinite(bv) || bv < -0.4 || bv > 2.0) return null
  return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62))
}

/** Bolometric correction from log10(T): the Flower (1996) polynomial in the Torres (2010) coefficients. */
export function bolometricCorrection(teff: number): number {
  const x = Math.log10(teff)
  const c =
    x < 3.7
      ? [-0.190537291496456e5, 0.155144866764412e5, -0.421278819301717e4, 0.381476328422343e3]
      : x < 3.9
        ? [-0.370510203809015e5, 0.385672629965804e5, -0.150651486316025e5, 0.261724637119416e4, -0.170623810323864e3]
        : [
            -0.118115450538963e6, 0.137145973583929e6, -0.636233812100225e5, 0.147412923562646e5,
            -0.170587278406872e4, 0.78873172180499e2,
          ]
  return c.reduce((s, k, i) => s + k * x ** i, 0)
}

/** Absolute visual magnitude from apparent magnitude and parallax (mas): M = V + 5 + 5 log10(parallax in arcsec). */
export const absoluteMagnitude = (vmag: number, plxMas: number) => vmag + 5 + 5 * Math.log10(plxMas / 1000)

export interface Luminosity {
  /** In solar luminosities. */
  lsun: number
  /** One-sigma fractional uncertainty from the parallax error and a 0.1 mag
   *  bolometric correction error (extinction is ignored). */
  fractionalError: number
  absMag: number
}

/**
 * Luminosity (solar units) from absolute magnitude and a bolometric
 * correction taken from the temperature estimated from B-V. Only offered when
 * the parallax is measured to better than 30% (a worse one makes the
 * luminosity meaningless), and always an estimate: it inherits the
 * temperature estimate's error (a red dwarf's B-V temperature can be off by
 * 10%, enough for a factor of 2 in luminosity), ignores interstellar
 * extinction, and treats a double star as one.
 */
export function luminosityEstimate(
  vmag: number,
  bv: number,
  plxMas: number | null,
  eplxMas: number | null,
): Luminosity | null {
  if (plxMas === null || eplxMas === null || plxMas <= 0 || eplxMas / plxMas > 0.3) return null
  const teff = temperatureFromBV(bv)
  if (teff === null) return null
  const M = absoluteMagnitude(vmag, plxMas)
  const mbol = M + bolometricCorrection(teff)
  const lsun = 10 ** (-0.4 * (mbol - 4.74))
  const sigmaM = Math.hypot((5 / Math.LN10) * (eplxMas / plxMas), 0.1)
  return { lsun, fractionalError: 0.4 * Math.LN10 * sigmaM, absMag: M }
}

// ---- coordinates ----

/** Right ascension and declination text from degrees (J2000): "06h 45m 08.9s", "-16° 42′ 58″". */
export function formatRaDec(raDeg: number, decDeg: number): { ra: string; dec: string } {
  // Round to the displayed unit first (0.1 s of time, 1 arcsecond), then split,
  // so 59.96 s becomes 00.0 s of the next minute and never "60.0s".
  const tenths = Math.round((((raDeg % 360) + 360) % 360) * 2400) % 864000
  const hh = Math.floor(tenths / 36000)
  const mm = Math.floor((tenths % 36000) / 600)
  const ss = (tenths % 600) / 10
  const arc = Math.round(Math.abs(decDeg) * 3600)
  const dd = Math.floor(arc / 3600)
  const dm = Math.floor((arc % 3600) / 60)
  const ds = arc % 60
  const two = (n: number) => String(n).padStart(2, '0')
  return {
    ra: `${two(hh)}h ${two(mm)}m ${ss.toFixed(1).padStart(4, '0')}s`,
    dec: `${decDeg < 0 && arc > 0 ? '-' : '+'}${two(dd)}° ${two(dm)}′ ${two(ds)}″`,
  }
}

// ---- the card ----

/** What the card needs about the selected star (the engine's starInfo()). */
export interface StarCardInput {
  vmag: number
  bv: number
  raDeg: number
  decDeg: number
  constellation: { name: string; symbol: string } | null
  record: StarRecord | null
  loading: boolean
  failed: boolean
}

export interface CardRow {
  label: string
  value: string
  /** The value is inferred, not catalogued: shown with its method. */
  estimate?: boolean
  note?: string
}

const nf = (n: number, digits = 0) => n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })

/** Round to two significant figures (for values only known that well). */
const sig2 = (n: number) => {
  if (n === 0) return 0
  const p = 10 ** (Math.floor(Math.log10(Math.abs(n))) - 1)
  return Math.round(n / p) * p
}

const lyText = (ly: number) => (ly < 20 ? nf(ly, 1) : ly < 1000 ? nf(Math.round(ly)) : nf(Math.round(ly / 10) * 10))

/** A colour in words from B-V (what the star would look like, roughly). */
export function colourName(bv: number): string {
  if (bv < -0.15) return 'blue'
  if (bv < 0.15) return 'blue-white'
  if (bv < 0.45) return 'white'
  if (bv < 0.8) return 'yellow-white'
  if (bv < 1.15) return 'orange'
  return 'orange-red'
}

// Hipparcos's coarse flag: a star it saw vary at all. A flag of 1 (under 0.06
// magnitudes) is within the noise for many stars, so only 2 and 3 are shown,
// worded as the catalogue's flag and not as a verdict (Sirius is flagged,
// by its companion's glare, though it isn't a variable star).
const VARIABILITY = [
  '',
  '',
  'flagged in the catalogue as varying by 0.06 to 0.6 magnitudes',
  'flagged in the catalogue as varying by more than 0.6 magnitudes',
]

/**
 * The card's rows for a star, in order. Only what is supportable is shown;
 * anything inferred carries `estimate: true`. Details not yet loaded (the
 * parallax, spectral type) show as "loading" and are absent if loading
 * failed.
 */
export function starCardRows(s: StarCardInput): CardRow[] {
  const rows: CardRow[] = []
  if (s.constellation) rows.push({ label: 'Constellation', value: s.constellation.name })
  const { ra, dec } = formatRaDec(s.raDeg, s.decDeg)
  rows.push({
    label: 'Position',
    value: `${ra}, ${dec}`,
    note: 'J2000 coordinates, moved to 2026 by the star\'s proper motion',
  })
  let mag = `${s.vmag.toFixed(2)} (visual)`
  if (s.record && VARIABILITY[s.record.varFlag]) mag += `, ${VARIABILITY[s.record.varFlag]}`
  rows.push({ label: 'Magnitude', value: mag })

  const r = s.record
  if (!r) {
    if (s.loading) rows.push({ label: 'Distance', value: 'loading…' })
  } else {
    const d = distanceFromParallax(r.plxMas, r.eplxMas)
    if (d.kind === 'measured') {
      const pm = d.plusMinusLy! < 0.05 ? '' : ` ± ${lyText(d.plusMinusLy!)}`
      rows.push({ label: 'Distance', value: `${lyText(d.ly!)}${pm} light-years`, note: 'from its parallax' })
    } else if (d.kind === 'range') {
      rows.push({
        label: 'Distance',
        value: `about ${lyText(sig2(d.ly!))} light-years (between ${lyText(d.minLy!)} and ${lyText(d.maxLy!)})`,
        estimate: true,
        note: 'its parallax is only measured to within 10-30%',
      })
    } else if (d.kind === 'lower') {
      rows.push({
        label: 'Distance',
        value: `uncertain: at least ${lyText(sig2(d.minLy!))} light-years`,
        estimate: true,
        note: 'its parallax is too small to measure well',
      })
    } else {
      rows.push({ label: 'Distance', value: 'no usable parallax measurement' })
    }
    const sp = spectralGloss(r.spectral)
    if (sp) rows.push({ label: 'Spectral type', value: `${sp.type}: ${sp.gloss}` })
  }

  rows.push({ label: 'Colour', value: `B-V ${s.bv >= 0 ? '+' : ''}${s.bv.toFixed(2)}, ${colourName(s.bv)}` })
  const teff = temperatureFromBV(s.bv)
  if (teff !== null) {
    rows.push({
      label: 'Temperature',
      value: `about ${nf(Math.round(teff / 50) * 50)} K`,
      estimate: true,
      note: 'estimated from B-V (Ballesteros 2012, a blackbody fit; ignores dust reddening)',
    })
  }
  if (r) {
    const lum = luminosityEstimate(s.vmag, s.bv, r.plxMas, r.eplxMas)
    if (lum) {
      const times = lum.lsun < 0.01 ? nf(sig2(lum.lsun), 4) : lum.lsun < 10 ? nf(sig2(lum.lsun), 2) : nf(sig2(lum.lsun))
      rows.push({
        label: 'Luminosity',
        value: `about ${times} × the Sun (±${Math.round(lum.fractionalError * 100)}% at least)`,
        estimate: true,
        note: 'from absolute magnitude and a bolometric correction; ignores extinction and treats a double star as one',
      })
    } else if (r.plxMas !== null) {
      rows.push({ label: 'Luminosity', value: 'not estimated: its distance is too uncertain' })
    }
  }
  return rows
}
