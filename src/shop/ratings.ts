import type { Rating, RatingEntry } from './types.ts'

export const RATING_ORDER: readonly Rating[] = ['love', 'like', 'dislike']
export const RATING_LABELS: Record<Rating, string> = { love: 'Love', like: 'Like', dislike: 'Dislike' }

export type SaveState = 'idle' | 'saving' | 'saved' | 'failed'

export type ItemRating = {
  rating: Rating | null
  save: SaveState
  error: string | null
  /** When the rating last changed on this page (ms), for newest-first in Saved; 0 for restored ones. */
  touched: number
}

export type RatingsState = Record<string, ItemRating>

export type RatingAction =
  | { type: 'choose'; id: string; rating: Rating | null; at?: number }
  | { type: 'saving'; id: string }
  | { type: 'saved'; id: string; rating: Rating | null }
  | { type: 'failed'; id: string; message: string }

const blank: ItemRating = { rating: null, save: 'idle', error: null, touched: 0 }

/** The ratings a session payload carries (GET /session or a finished job). An old session may carry a `comment`: it is ignored. */
export function ratingsFromView(saved: Record<string, RatingEntry> | undefined): RatingsState {
  const out: RatingsState = {}
  for (const [id, e] of Object.entries(saved ?? {})) {
    if (e.rating) out[id] = { rating: e.rating, save: 'idle', error: null, touched: 0 }
  }
  return out
}

export function ratingsReducer(state: RatingsState, a: RatingAction): RatingsState {
  const cur = state[a.id] ?? blank
  switch (a.type) {
    case 'choose':
      return { ...state, [a.id]: { ...cur, rating: a.rating, save: 'saving', error: null, touched: a.at ?? cur.touched } }
    case 'saving':
      return { ...state, [a.id]: { ...cur, save: 'saving', error: null } }
    case 'saved':
      return { ...state, [a.id]: { ...cur, save: 'saved', error: null } }
    case 'failed':
      return { ...state, [a.id]: { ...cur, save: 'failed', error: a.message } }
  }
}

/** The body for POST /rate: the rating alone (`null` clears it). */
export const ratingBody = (sessionId: string, resultId: string, rating: Rating | null) => ({
  session_id: sessionId,
  result_id: resultId,
  rating,
})

/** Radio-group keys: arrows move to the next or previous rating (and choose it), as native radios do. Other keys: null. */
export function nextRatingForKey(current: Rating | null, key: string): Rating | null {
  const i = current ? RATING_ORDER.indexOf(current) : -1
  const n = RATING_ORDER.length
  if (key === 'ArrowRight' || key === 'ArrowDown') return RATING_ORDER[(i + 1) % n]
  if (key === 'ArrowLeft' || key === 'ArrowUp') return RATING_ORDER[(i - 1 + n) % n]
  return null
}

export const ratedCount = (ids: string[], ratings: RatingsState) => ids.filter((id) => ratings[id]?.rating).length

/**
 * Why Shop Again is off, or null when it is on. Ratings are not needed. `canShopAgain` is the service's own word: absent or true is on;
 * false is believed unless nothing is rated and the cap is not reached (an older service said false for "no ratings" alone).
 */
export function shopAgainBlock(args: { running: boolean; saving: boolean; rated: number; used?: number; cap?: number; limited?: string | null; canShopAgain?: boolean }): string | null {
  if (args.running) return 'A search is running.'
  if (args.limited) return args.limited
  const underCap = args.cap !== undefined && args.used !== undefined && args.used < args.cap
  if (args.cap !== undefined && args.used !== undefined && !underCap) return 'You have used every Shop Again for this visit.'
  if (args.saving) return 'Saving your ratings…'
  if (args.canShopAgain === false && !(underCap && args.rated === 0)) return 'Shop Again is not available right now.'
  return null
}
