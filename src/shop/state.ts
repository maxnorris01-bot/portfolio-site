import { ratingsFromView, ratingsReducer, type RatingAction, type RatingsState } from './ratings.ts'
import type { JobStatus, JobStep, RefineChip, ParsedQuery, SessionView, ShopItem } from './types.ts'

export type JobKind = 'search' | 'shop_again'

/** A refused or failed request shown above results that are still on screen. */
export type Banner = { message: string; retryAfterS: number | null; resetsAt: string | null }

type Previous = { view: SessionView; batch: number; ratings: RatingsState }

export type ShopState =
  | { status: 'idle'; restoring: boolean }
  | {
      status: 'running'
      request: string
      kind: JobKind
      batch: number
      steps: JobStep[]
      phase: string
      startedAt: number
      slow: boolean
      /** The results on screen when this started, put back if it fails. */
      prev: Previous | null
    }
  | { status: 'done'; request: string; view: SessionView; batch: number; ratings: RatingsState; banner: Banner | null; fresh: boolean }
  | { status: 'error'; request: string; message: string; retryAfterS: number | null; resetsAt: string | null }

export type FailInfo = { message: string; retryAfterS: number | null; resetsAt: string | null; phase: 'start' | 'poll' }

export type ShopAction =
  | { type: 'restoring' }
  | { type: 'restored'; view: SessionView | null; batch: number }
  | { type: 'submit'; request: string; kind: JobKind; batch: number; now: number }
  | { type: 'progress'; job: JobStatus }
  | { type: 'slow' }
  | { type: 'done'; view: SessionView }
  | ({ type: 'fail' } & FailInfo)
  | { type: 'ratings'; action: RatingAction }
  | { type: 'patch'; refine?: RefineChip[]; query?: ParsedQuery }
  | { type: 'banner'; banner: Banner | null }

export const initialState: ShopState = { status: 'idle', restoring: false }

export function shopReducer(state: ShopState, action: ShopAction): ShopState {
  switch (action.type) {
    case 'restoring':
      return state.status === 'idle' ? { status: 'idle', restoring: true } : state
    case 'restored':
      // A search started while the old one was loading wins.
      if (state.status !== 'idle') return state
      return action.view?.search
        ? { status: 'done', request: action.view.search.request, view: action.view, batch: action.batch, ratings: ratingsFromView(action.view.ratings), banner: null, fresh: false }
        : { status: 'idle', restoring: false }
    case 'submit': {
      const prev = state.status === 'done' ? { view: state.view, batch: state.batch, ratings: state.ratings } : state.status === 'running' ? state.prev : null
      return { status: 'running', request: action.request, kind: action.kind, batch: action.batch, steps: [], phase: '', startedAt: action.now, slow: false, prev }
    }
    case 'progress':
      if (state.status !== 'running') return state
      if (action.job.state === 'done' || action.job.state === 'error') return state
      return { ...state, steps: action.job.steps ?? state.steps, phase: action.job.phase || state.phase }
    case 'slow':
      return state.status === 'running' ? { ...state, slow: true } : state
    case 'done': {
      const running = state.status === 'running' ? state : null
      return {
        status: 'done',
        request: action.view.search?.request ?? running?.request ?? '',
        view: action.view,
        batch: running?.batch ?? 1,
        ratings: ratingsFromView(action.view.ratings),
        banner: null,
        fresh: true,
      }
    }
    case 'fail': {
      const request = 'request' in state ? state.request : ''
      const info = { message: action.message, retryAfterS: action.retryAfterS, resetsAt: action.resetsAt }
      // A refused start, or a failed Shop Again, leaves the earlier results in place with the reason above them.
      if (state.status === 'running' && state.prev && (action.phase === 'start' || state.kind === 'shop_again')) {
        return { status: 'done', request: state.prev.view.search?.request ?? request, view: state.prev.view, batch: state.prev.batch, ratings: state.prev.ratings, banner: info, fresh: false }
      }
      return { status: 'error', request, ...info }
    }
    case 'ratings':
      return state.status === 'done' ? { ...state, ratings: ratingsReducer(state.ratings, action.action) } : state
    case 'patch': {
      if (state.status !== 'done' || !state.view.search) return state
      const search = action.query ? { ...state.view.search, query: action.query } : state.view.search
      return { ...state, view: { ...state.view, search, refine: action.refine ?? state.view.refine } }
    }
    case 'banner':
      return state.status === 'done' ? { ...state, banner: action.banner } : state
  }
}

/** "$1,200" for a price and currency; null when there is no price. */
export function formatPrice(price: number | null, currency?: string): string | null {
  if (price === null || !Number.isFinite(price)) return null
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: price % 1 === 0 ? 0 : 2 }).format(price)
  } catch {
    return `$${price.toLocaleString('en-US')}`
  }
}

/** An http(s) URL to open in a new tab, or null (never a javascript: or data: link). */
export function safeHref(link: string | undefined | null): string | null {
  if (!link) return null
  try {
    const u = new URL(link)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null
  } catch {
    return null
  }
}

export function ratingLine(item: Pick<ShopItem, 'rating' | 'rating_count'>): string | null {
  if (item.rating === null || item.rating === undefined) return null
  const count = item.rating_count ? ` (${item.rating_count.toLocaleString('en-US')})` : ''
  return `★ ${item.rating.toFixed(1)}${count}`
}

export function alsoAtLine(item: Pick<ShopItem, 'also_at' | 'currency'>): string | null {
  const parts = (item.also_at ?? []).map((a) => {
    const p = formatPrice(a.price, item.currency)
    return p ? `${a.seller} ${p}` : a.seller
  })
  return parts.length ? `Also at: ${parts.join(', ')}` : null
}

/** The notices above the grid: the topic notice, the headline's warnings. Plain text. */
export function noticesFor(search: SessionView['search']): string[] {
  if (!search) return []
  return [search.topic_notice, ...(search.warnings ?? [])].filter((s): s is string => typeof s === 'string' && s.trim() !== '')
}

export function stepSummary(step: JobStep): string {
  const label = step.state === 'skipped' ? `${step.label} (skipped)` : step.label
  return step.total ? `${label} ${step.done_count ?? 0}/${step.total}` : label
}

const KEY = 'shop.session'
const BATCH_KEY = 'shop.batch'
export function readSavedSession(): { id: string; batch: number } | null {
  try {
    const id = sessionStorage.getItem(KEY)
    const batch = Number(sessionStorage.getItem(BATCH_KEY))
    return id ? { id, batch: Number.isInteger(batch) && batch >= 1 ? batch : 1 } : null
  } catch {
    return null
  }
}
export function saveSession(id: string | null, batch = 1) {
  try {
    if (id) {
      sessionStorage.setItem(KEY, id)
      sessionStorage.setItem(BATCH_KEY, String(batch))
    } else {
      sessionStorage.removeItem(KEY)
      sessionStorage.removeItem(BATCH_KEY)
    }
  } catch {
    // Storage blocked: the page just doesn't restore after a refresh.
  }
}

/** "Resets 5:00 PM UTC" style text for a cap's reset time (ISO), or null. */
export function resetText(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' })
}
