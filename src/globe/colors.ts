import type { CatalogObject } from './types.ts'

export type ColorMode = 'type' | 'owner' | 'flat' | 'age'

export interface Category {
  key: string
  label: string
  color: string
  count: number
}

export interface Coloring {
  /** Categories with at least one object, in legend order. */
  categories: Category[]
  /** Per object: its category key, for hiding categories. */
  categoryOf: (i: number) => string
  rgb: Float32Array
  /** A short legend note for this mode, if it needs one (Age, while Unknown objects exist). */
  note?: string
}

// Three hues validated for an all-pairs scatter on the globe's dark
// background (dataviz validator, --pairs all, surface #05070d). A fourth hue
// fails the colour-blind and normal-vision separation checks, so everything
// else folds into a neutral "Other".
const SERIES = ['#3987e5', '#d95926', '#199e70'] as const
const OTHER = '#8b8f98'
const FLAT = '#f2c14e'

// Age: an ordered multi-hue ramp, blue -> green -> yellow-lime, where hue and
// lightness both change at each step (viridis-style), so the buckets read as a
// sequence and tell apart at a glance. A first one-hue teal ramp stepped in
// lightness only and its neighbours were too alike on the globe (OKLab 13.5
// worst pair under colour-blind simulation; this ramp is 19.1). Measured with
// the dataviz validator's model (Machado 2009 protan/deutan/tritan, OKLab x100):
// - buckets: at least 19.1 apart under every simulation, 22.9 under normal vision;
// - at least 3:1 on the sky #05070d and the Sky ground #26303c (darkest 3.06:1);
// - at least 11.2 from the orbit line #b0a8ff and 8.2 from the rings and
//   neighbour line (white, gold, orange-red, cyan) under every simulation.
// Unknown is a slightly warm grey: 15.4 from every bucket under normal vision
// (the validator's floor), at least 10.8 under simulation, 3.83:1 on the ground.
const AGE_RAMP = ['#5f75c1', '#05c992', '#d4f73e'] as const
const AGE_UNKNOWN = '#8f8978'

// "YYYY-NNNA": launch year, launch number of that year, piece letters. Exactly
// this form; anything else (two-digit years, padding, lower case) is Unknown.
const DESIGNATOR = /^(\d{4})-(\d{3})([A-Z]{1,3})$/
const FIRST_LAUNCH_YEAR = 1957

/**
 * The launch year from a COSPAR designator ("1998-067A" -> 1998), or null for
 * anything missing, null or not exactly in that form, including a year before
 * the first launch or launch number 000.
 */
export function launchYear(designator: unknown): number | null {
  if (typeof designator !== 'string') return null
  const m = DESIGNATOR.exec(designator)
  if (!m) return null
  const year = Number(m[1])
  if (year < FIRST_LAUNCH_YEAR || Number(m[2]) < 1) return null
  return year
}

export type AgeBucket = 'new' | 'mid' | 'old' | 'unknown'

/**
 * An object's age bucket: whole calendar years from its launch year to the
 * snapshot's year, so under 2 means 0-1, "2 to 10" is 2-10 inclusive, and over
 * 10 is 11 or more. Year-only precision: an object launched in December and a
 * snapshot in January of the year after next count as 2 years apart after 13
 * months, so an object can land one bucket off near the edges (a possible
 * one-year error). A launch year after the snapshot's is Unknown.
 */
export function ageBucket(launch: number | null, snapshotYear: number): AgeBucket {
  if (launch === null) return 'unknown'
  const age = snapshotYear - launch
  if (age < 0) return 'unknown'
  if (age < 2) return 'new'
  if (age <= 10) return 'mid'
  return 'old'
}

const AGE_INDEX: Record<AgeBucket, number> = { new: 0, mid: 1, old: 2, unknown: 3 }

// Owner colours follow the owner, not its rank, so they don't repaint when a
// different day's snapshot is loaded. These three are 89% of the catalog.
const OWNER_SLOTS: { code: string; label: string }[] = [
  { code: 'US', label: 'United States' },
  { code: 'PRC', label: 'China' },
  { code: 'CIS', label: 'CIS (former USSR)' },
]

type Classifier = (o: CatalogObject) => number

function typeOf(o: CatalogObject): number {
  if (o.object_type === 'PAY' && o.active_payload) return 0
  if (o.object_type === 'DEB') return 1
  if (o.object_type === 'R/B') return 2
  return 3
}

function ownerOf(o: CatalogObject): number {
  const slot = OWNER_SLOTS.findIndex((s) => s.code === o.satcat_owner?.code)
  return slot === -1 ? 3 : slot
}

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/**
 * Colours and legend categories for `mode`. Age is measured against
 * `snapshotUtc`, the displayed snapshot's run date (generated_at_utc), not the
 * playing clock or today: it's the date the snapshot describes, it keeps
 * colours steady while time plays, and the slider's retained days get their
 * own date.
 */
export function colorize(
  objects: CatalogObject[],
  mode: ColorMode,
  snapshotUtc?: string,
): Coloring {
  let note: string | undefined
  let defs: { key: string; label: string; color: string }[]
  let classify: Classifier
  if (mode === 'type') {
    defs = [
      { key: 'active', label: 'Active payload', color: SERIES[0] },
      { key: 'debris', label: 'Debris', color: SERIES[1] },
      { key: 'rocket', label: 'Rocket body', color: SERIES[2] },
      { key: 'other', label: 'Inactive or unknown', color: OTHER },
    ]
    classify = typeOf
  } else if (mode === 'owner') {
    defs = [
      ...OWNER_SLOTS.map((s, i) => ({ key: s.code, label: s.label, color: SERIES[i] })),
      { key: 'other', label: 'All other owners', color: OTHER },
    ]
    classify = ownerOf
  } else if (mode === 'age') {
    defs = [
      { key: 'new', label: 'Under 2 years', color: AGE_RAMP[0] },
      { key: 'mid', label: '2 to 10 years', color: AGE_RAMP[1] },
      { key: 'old', label: 'Over 10 years', color: AGE_RAMP[2] },
      { key: 'unknown', label: 'Unknown', color: AGE_UNKNOWN },
    ]
    const parsed = snapshotUtc ? Date.parse(snapshotUtc) : Number.NaN
    const year = Number.isFinite(parsed) ? new Date(parsed).getUTCFullYear() : null
    classify = (o) =>
      year === null
        ? AGE_INDEX.unknown
        : AGE_INDEX[ageBucket(launchYear(o.international_designator), year)]
    if (objects.some((o) => classify(o) === AGE_INDEX.unknown)) {
      note = objects.some((o) => 'international_designator' in o)
        ? 'Unknown: no valid launch designator.'
        : 'Older snapshots lack launch data.'
    }
  } else {
    defs = [{ key: 'all', label: 'All objects', color: FLAT }]
    classify = () => 0
  }

  const counts = defs.map(() => 0)
  const rgbs = defs.map((d) => hexToRgb(d.color))
  const rgb = new Float32Array(objects.length * 3)
  const index = new Uint8Array(objects.length)
  objects.forEach((o, i) => {
    const c = classify(o)
    counts[c]++
    index[i] = c
    rgb.set(rgbs[c], i * 3)
  })
  return {
    categories: defs
      .map((d, i) => ({ ...d, count: counts[i] }))
      // Age always lists its four buckets, so a snapshot's empty ones read as
      // zero rather than missing; the other modes hide empty categories.
      .filter((c) => c.count > 0 || mode === 'age'),
    categoryOf: (i) => defs[index[i]].key,
    rgb,
    note,
  }
}

/**
 * rgba per object for the engine: the coloring's rgb, with alpha 0 for
 * objects in a hidden category or hidden by `alsoHidden` (the name filters);
 * the point shader discards those.
 */
export function withVisibility(
  coloring: Coloring,
  hidden: ReadonlySet<string>,
  alsoHidden: (i: number) => boolean = () => false,
): Float32Array {
  const n = coloring.rgb.length / 3
  const rgba = new Float32Array(n * 4)
  for (let i = 0; i < n; i++) {
    rgba[i * 4] = coloring.rgb[i * 3]
    rgba[i * 4 + 1] = coloring.rgb[i * 3 + 1]
    rgba[i * 4 + 2] = coloring.rgb[i * 3 + 2]
    rgba[i * 4 + 3] = hidden.has(coloring.categoryOf(i)) || alsoHidden(i) ? 0 : 1
  }
  return rgba
}

/** Plain-language object type for the inspect panel. */
export function describeType(o: CatalogObject): string {
  switch (o.object_type) {
    case 'PAY':
      return o.active_payload ? 'Active payload' : 'Payload (inactive)'
    case 'DEB':
      return 'Debris'
    case 'R/B':
      return 'Rocket body'
    default:
      return 'Unknown type'
  }
}

/**
 * Writes `base` (the filter/colour rgba) into `out` with every point except
 * `keep` dimmed to `factor` of its alpha. Hidden points (alpha 0) stay 0 and
 * shown points never reach 0, so "dimmed" can't be mistaken for "hidden";
 * with an empty `keep` list and factor 1, `out` is an exact copy.
 */
export function dimExcept(
  base: Float32Array,
  out: Float32Array,
  keep: readonly number[],
  factor: number,
): void {
  out.set(base)
  if (factor === 1) return
  for (let i = 3; i < out.length; i += 4) out[i] = base[i] * factor
  for (const k of keep) if (k >= 0 && k * 4 + 3 < out.length) out[k * 4 + 3] = base[k * 4 + 3]
}
