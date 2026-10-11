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
// `main` is the core module's NORAD ID: the piece the satellite view rides.
export interface Station {
  key: string
  label: string
  fullName: string
  match: (name: string) => boolean
  main: number
}

export const STATIONS: Station[] = [
  {
    key: 'iss',
    label: 'ISS',
    fullName: 'International Space Station',
    match: starts('ISS ('),
    main: 25544, // ISS (ZARYA)
  },
  {
    key: 'css',
    label: 'Tiangong',
    fullName: 'Tiangong (China Space Station)',
    match: starts('CSS ('),
    main: 48274, // CSS (TIANHE)
  },
]

/**
 * The catalog index the satellite view rides for a station: its core module,
 * or if that's missing from the snapshot, its oldest tracked piece (lowest
 * NORAD ID). The docked pieces share its orbit, so any of them gives the same
 * view; null when the station isn't in the snapshot at all.
 */
export function stationViewpoint(
  station: Station,
  objects: readonly { name: string; norad_id: number }[],
): number | null {
  let best: number | null = null
  for (let i = 0; i < objects.length; i++) {
    const o = objects[i]
    if (!station.match(o.name)) continue
    if (o.norad_id === station.main) return i
    if (best === null || o.norad_id < objects[best].norad_id) best = i
  }
  return best
}

/**
 * The satellite view's viewpoint for the current selection: the selected
 * satellite (a click, or a conjunction pair's chosen piece), else the selected
 * station's core module, else none (the view can't be entered).
 */
export function viewpointFor(
  selection: { satellite: number | null; station: Station | null },
  objects: readonly { name: string; norad_id: number }[] | null,
): number | null {
  if (selection.satellite !== null) return selection.satellite
  return selection.station && objects ? stationViewpoint(selection.station, objects) : null
}
