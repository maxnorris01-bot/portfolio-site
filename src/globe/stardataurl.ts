// Where the streamed Gaia star data lives: the public bucket, next to the
// objects files (BUCKET_URL), under a versioned prefix. A build can
// point elsewhere with VITE_STAR_DATA_URL, and the dev server takes
// `?stars=http://localhost:8788/stars-v1` so local files can be tried
// without a build. Pure, so it is tested.

import { BUCKET_URL } from './data.ts'

/** The data's version prefix: a new build is stars/v2/, never an overwrite. */
export const STAR_DATA_PATH = 'stars/v1'

export const DEFAULT_STAR_DATA_URL = `${BUCKET_URL}/${STAR_DATA_PATH}`

function clean(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return url.replace(/\/+$/, '')
  } catch {
    return null
  }
}

/**
 * The base URL of the star data: the `stars` query parameter in development
 * only (so a shared link can't redirect a production visitor's data), else
 * the build's VITE_STAR_DATA_URL, else the bucket.
 */
export function starDataUrl(opts: { env?: string; search?: string; dev?: boolean }): string {
  if (opts.dev) {
    const q = clean(new URLSearchParams(opts.search ?? '').get('stars'))
    if (q) return q
  }
  return clean(opts.env) ?? DEFAULT_STAR_DATA_URL
}
