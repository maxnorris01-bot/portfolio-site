import type { DatasetKey, ObjectsFile } from './types'

// The public bucket (ADR 0009). Its CORS rule allows GET from the site's
// Vercel origin and localhost, and every objects file is served with
// Content-Encoding: gzip, which fetch decompresses transparently.
export const BUCKET_URL = 'https://satellite-conjunction-screening.fly.storage.tigris.dev'

export function objectsUrl(key: DatasetKey): string {
  return key === 'current'
    ? `${BUCKET_URL}/objects/current.json`
    : `${BUCKET_URL}/objects/${key}.json.gz`
}

const cache = new Map<DatasetKey, Promise<ObjectsFile>>()

export function loadObjects(key: DatasetKey): Promise<ObjectsFile> {
  let p = cache.get(key)
  if (!p) {
    p = fetch(objectsUrl(key)).then((res) => {
      if (!res.ok) throw new Error(`objects ${key}: HTTP ${res.status}`)
      return res.json() as Promise<ObjectsFile>
    })
    // Don't keep a failure, so a retry fetches again.
    p.catch(() => cache.delete(key))
    cache.set(key, p)
  }
  return p
}

interface HistoryIndex {
  dates: { date: string; objects_key: string; report_key: string }[]
}

// Dates with a retained objects + report snapshot (ADR 0011). A missing index
// (before the first retention run) or any failure means no backward range.
export async function loadHistoryDates(): Promise<string[]> {
  try {
    const res = await fetch(`${BUCKET_URL}/history/index.json`, { cache: 'no-cache' })
    if (!res.ok) return []
    const index = (await res.json()) as HistoryIndex
    return index.dates.map((d) => d.date)
  } catch {
    return []
  }
}
