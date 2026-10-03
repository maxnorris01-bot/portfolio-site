import type { CatalogObject } from './types.ts'

export type ColorMode = 'type' | 'owner' | 'flat'

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
}

// Three hues validated for an all-pairs scatter on the globe's dark
// background (dataviz validator, --pairs all, surface #05070d). A fourth hue
// fails the colour-blind and normal-vision separation checks, so everything
// else folds into a neutral "Other".
const SERIES = ['#3987e5', '#d95926', '#199e70'] as const
const OTHER = '#8b8f98'
const FLAT = '#f2c14e'

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

export function colorize(objects: CatalogObject[], mode: ColorMode): Coloring {
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
      .filter((c) => c.count > 0),
    categoryOf: (i) => defs[index[i]].key,
    rgb,
  }
}

/**
 * rgba per object for the engine: the coloring's rgb, with alpha 0 for
 * objects in a hidden category (the point shader discards those).
 */
export function withVisibility(coloring: Coloring, hidden: ReadonlySet<string>): Float32Array {
  const n = coloring.rgb.length / 3
  const rgba = new Float32Array(n * 4)
  for (let i = 0; i < n; i++) {
    rgba[i * 4] = coloring.rgb[i * 3]
    rgba[i * 4 + 1] = coloring.rgb[i * 3 + 1]
    rgba[i * 4 + 2] = coloring.rgb[i * 3 + 2]
    rgba[i * 4 + 3] = hidden.has(coloring.categoryOf(i)) ? 0 : 1
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
