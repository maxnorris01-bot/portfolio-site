// Curated name filters for the globe (Phase 1c, satellite-conjunction-
// screening working notes 2026-10-03). Deterministic name-prefix rules over
// the catalog, checked against the live catalog when scoped: no free-text
// search, no fuzzy matching.

export interface NameGroup {
  key: string
  label: string
  match: (name: string) => boolean
}

const starts = (prefix: string) => (name: string) => name.startsWith(prefix)

// Order matters: the first match wins, so the specific debris groups come
// before their broader prefixes (IRIDIUM 33 DEB before IRIDIUM). Included:
// the active constellations of roughly 150+ objects, the two historical
// debris events, and NAVSTAR (GPS, small but recognisable).
export const NAME_GROUPS: NameGroup[] = [
  { key: 'starlink', label: 'Starlink', match: starts('STARLINK') },
  { key: 'oneweb', label: 'OneWeb', match: starts('ONEWEB') },
  { key: 'kuiper', label: 'Kuiper', match: starts('KUIPER') },
  { key: 'qianfan', label: 'Qianfan', match: starts('QIANFAN') },
  { key: 'hulianwang', label: 'Hulianwang', match: starts('HULIANWANG') },
  { key: 'yaogan', label: 'Yaogan', match: starts('YAOGAN') },
  { key: 'navstar', label: 'NAVSTAR (GPS)', match: starts('NAVSTAR') },
  { key: 'iridium33deb', label: 'Iridium 33 debris', match: starts('IRIDIUM 33 DEB') },
  { key: 'iridium', label: 'Iridium', match: starts('IRIDIUM') },
  { key: 'cosmos2251deb', label: 'Cosmos 2251 debris', match: starts('COSMOS 2251 DEB') },
  { key: 'fengyun1cdeb', label: 'Fengyun-1C debris', match: starts('FENGYUN 1C DEB') },
]

export const OTHER_GROUP = 'other'
export const OTHER_LABEL = 'Everything else'

export function groupOf(name: string): string {
  for (const g of NAME_GROUPS) if (g.match(name)) return g.key
  return OTHER_GROUP
}

// Space stations are several tracked pieces each (modules and attached
// vehicles with their own catalog entries); selecting one selects them all.
export interface Station {
  key: string
  label: string
  fullName: string
  match: (name: string) => boolean
}

export const STATIONS: Station[] = [
  { key: 'iss', label: 'ISS', fullName: 'International Space Station', match: starts('ISS (') },
  { key: 'css', label: 'Tiangong', fullName: 'Tiangong (China Space Station)', match: starts('CSS (') },
]
