import type { CatalogObject } from './types.ts'

export type ColorMode = 'type' | 'owner' | 'flat'

export interface Category {
  key: string
  label: string
  color: string
  count: number
}

export interface Coloring {
  categories: Category[]
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
  objects.forEach((o, i) => {
    const c = classify(o)
    counts[c]++
    rgb.set(rgbs[c], i * 3)
  })
  return {
    categories: defs
      .map((d, i) => ({ ...d, count: counts[i] }))
      .filter((c) => c.count > 0),
    rgb,
  }
}
