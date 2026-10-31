import type { JobStatus, JobStep, SessionView, ShopItem } from './types.ts'

export type ShopState =
  | { status: 'idle'; restoring: boolean }
  | { status: 'running'; request: string; steps: JobStep[]; phase: string; startedAt: number; slow: boolean }
  | { status: 'done'; request: string; view: SessionView }
  | { status: 'error'; request: string; message: string; retryAfterS: number | null }

export type ShopAction =
  | { type: 'restoring' }
  | { type: 'restored'; view: SessionView | null }
  | { type: 'submit'; request: string; now: number }
  | { type: 'progress'; job: JobStatus }
  | { type: 'slow' }
  | { type: 'done'; view: SessionView }
  | { type: 'fail'; message: string; retryAfterS: number | null }

export const initialState: ShopState = { status: 'idle', restoring: false }

export function shopReducer(state: ShopState, action: ShopAction): ShopState {
  switch (action.type) {
    case 'restoring':
      return state.status === 'idle' ? { status: 'idle', restoring: true } : state
    case 'restored':
      // A search started while the old one was loading wins.
      if (state.status !== 'idle') return state
      return action.view?.search
        ? { status: 'done', request: action.view.search.request, view: action.view }
        : { status: 'idle', restoring: false }
    case 'submit':
      return { status: 'running', request: action.request, steps: [], phase: '', startedAt: action.now, slow: false }
    case 'progress':
      if (state.status !== 'running') return state
      return { ...state, steps: action.job.state === 'done' || action.job.state === 'error' ? state.steps : (action.job.steps ?? state.steps), phase: ('phase' in action.job && action.job.phase) || state.phase }
    case 'slow':
      return state.status === 'running' ? { ...state, slow: true } : state
    case 'done': {
      const request = action.view.search?.request ?? (state.status === 'running' ? state.request : '')
      return { status: 'done', request, view: action.view }
    }
    case 'fail':
      return { status: 'error', request: 'request' in state ? state.request : '', message: action.message, retryAfterS: action.retryAfterS }
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
export function readSavedSession(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}
export function saveSession(id: string | null) {
  try {
    if (id) sessionStorage.setItem(KEY, id)
    else sessionStorage.removeItem(KEY)
  } catch {
    // Storage blocked: the page just doesn't restore after a refresh.
  }
}
