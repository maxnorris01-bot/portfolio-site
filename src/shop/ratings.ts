import type { Rating, RatingEntry } from './types.ts'

export const RATING_ORDER: readonly Rating[] = ['love', 'like', 'dislike']
export const RATING_LABELS: Record<Rating, string> = { love: 'Love', like: 'Like', dislike: 'Dislike' }
/** The contract's limit on a comment. */
export const COMMENT_MAX = 200

export type SaveState = 'idle' | 'saving' | 'saved' | 'failed'

export type ItemRating = {
  rating: Rating | null
  comment: string
  /** The comment as last saved on the server, to tell whether a blur has anything to save. */
  savedComment: string
  save: SaveState
  error: string | null
  /** When the rating last changed on this page (ms), for newest-first in Saved; 0 for restored ones. */
  touched: number
}

export type RatingsState = Record<string, ItemRating>

export type RatingAction =
  | { type: 'choose'; id: string; rating: Rating | null; at?: number }
  | { type: 'comment'; id: string; text: string }
  | { type: 'saving'; id: string }
  | { type: 'saved'; id: string; rating: Rating | null; comment: string }
  | { type: 'failed'; id: string; message: string }

const blank: ItemRating = { rating: null, comment: '', savedComment: '', save: 'idle', error: null, touched: 0 }

/** The ratings a session payload carries (GET /session or a finished job). */
export function ratingsFromView(saved: Record<string, RatingEntry> | undefined): RatingsState {
  const out: RatingsState = {}
  for (const [id, e] of Object.entries(saved ?? {})) {
    if (e.rating || e.comment) out[id] = { rating: e.rating, comment: e.comment ?? '', savedComment: e.comment ?? '', save: 'idle', error: null, touched: 0 }
  }
  return out
}

export function ratingsReducer(state: RatingsState, a: RatingAction): RatingsState {
  const cur = state[a.id] ?? blank
  switch (a.type) {
    case 'choose':
      return { ...state, [a.id]: { ...cur, rating: a.rating, save: 'saving', error: null, touched: a.at ?? cur.touched } }
    case 'comment':
      return { ...state, [a.id]: { ...cur, comment: a.text.slice(0, COMMENT_MAX), save: cur.save === 'saved' ? 'idle' : cur.save } }
    case 'saving':
      return { ...state, [a.id]: { ...cur, save: 'saving', error: null } }
    case 'saved':
      // The comment the server holds; what is typed since stays as typed.
      return { ...state, [a.id]: { ...cur, savedComment: a.comment, save: 'saved', error: null } }
    case 'failed':
      return { ...state, [a.id]: { ...cur, save: 'failed', error: a.message } }
  }
}

/** The body for POST /rate: a rating change sends the rating alone; a comment edit sends the comment alone. */
export const ratingBody = (sessionId: string, resultId: string, part: { rating: Rating | null } | { comment: string }) => ({
  session_id: sessionId,
  result_id: resultId,
  ...part,
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

/** Why Shop Again is off, or null when it is on. */
export function shopAgainBlock(args: { running: boolean; saving: boolean; rated: number; used?: number; cap?: number; limited?: string | null }): string | null {
  if (args.running) return 'A search is running.'
  if (args.limited) return args.limited
  if (args.cap !== undefined && args.used !== undefined && args.used >= args.cap) return 'You have used every Shop Again for this visit.'
  if (args.saving) return 'Saving your ratings…'
  if (args.rated === 0) return 'Rate at least one result first.'
  return null
}
