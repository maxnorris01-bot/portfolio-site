// Place search for the Sky view, via OpenStreetMap Nominatim: free, no key,
// CORS-enabled, and it resolves addresses as well as place names. Its usage
// policy (operations.osmfoundation.org/policies/nominatim) allows searches
// directly triggered by a user, at most one request per second, no
// autocomplete, results cached, OSM attribution shown. So: one request per
// submitted query, a client-side one-second spacing, and an in-memory cache
// (nothing persisted). The browser's Referer identifies the site.

const ENDPOINT = 'https://nominatim.openstreetmap.org/search'
const MIN_SPACING_MS = 1000

export interface Place {
  label: string
  latDeg: number
  lonDeg: number
}

const cache = new Map<string, Place | null>()
let lastRequestAt = 0

/** The best match for `query`, or null if nothing matched. Throws on network/HTTP errors. */
export async function geocodePlace(query: string): Promise<Place | null> {
  const q = query.trim()
  if (!q) return null
  const key = q.toLowerCase()
  if (cache.has(key)) return cache.get(key) ?? null
  const wait = lastRequestAt + MIN_SPACING_MS - Date.now()
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
  lastRequestAt = Date.now()
  const res = await fetch(`${ENDPOINT}?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`)
  if (!res.ok) throw new Error(`geocoder HTTP ${res.status}`)
  const results = (await res.json()) as { display_name: string; lat: string; lon: string }[]
  const first = results[0]
  const place = first
    ? { label: first.display_name, latDeg: Number(first.lat), lonDeg: Number(first.lon) }
    : null
  cache.set(key, place)
  return place
}
