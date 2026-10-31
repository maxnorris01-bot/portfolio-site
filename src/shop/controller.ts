import { ShopError, isAbort, type ShopClient } from './api.ts'
import { JobPoller } from './poller.ts'
import { ratingBody } from './ratings.ts'
import { initialState, readSavedSession, saveSession, shopReducer, type JobKind, type ShopAction, type ShopState } from './state.ts'
import type { ContextKind, Rating } from './types.ts'

/**
 * The page's work outside React: search, Shop Again, ratings, chips, polling and
 * restore after a refresh. It holds the state (through shopReducer) and tells
 * subscribers when it changes, so tests can drive it with a fake fetch.
 */
export class ShopController {
  private client: ShopClient
  private poller: JobPoller
  private listeners = new Set<() => void>()
  private snapshot: ShopState = initialState
  private session: string | null = null
  private batch = 1
  private lastRequest = ''
  private starting: AbortController | null = null
  private restoring: AbortController | null = null
  // Per result: only the newest save may update its indicator.
  private saves = new Map<string, number>()

  constructor(client: ShopClient) {
    this.client = client
    this.poller = new JobPoller(client)
  }

  getState = () => this.snapshot

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => void this.listeners.delete(fn)
  }

  private dispatch(action: ShopAction) {
    const next = shopReducer(this.snapshot, action)
    if (next === this.snapshot) return
    this.snapshot = next
    this.listeners.forEach((l) => l())
  }

  private failWith(e: unknown, phase: 'start' | 'poll') {
    if (isAbort(e)) return
    const err = e instanceof ShopError ? e : new ShopError('server_error', 'Something went wrong. Please try again.')
    this.dispatch({ type: 'fail', message: err.message, retryAfterS: err.retryAfterS, resetsAt: err.resetsAt, phase })
  }

  private async begin(request: string, kind: JobKind, start: (signal: AbortSignal) => Promise<{ job_id: string }>) {
    this.poller.stop()
    this.starting?.abort()
    const controller = new AbortController()
    this.starting = controller
    const nextBatch = kind === 'search' ? 1 : this.batch + 1
    this.dispatch({ type: 'submit', request, kind, batch: nextBatch, now: Date.now() })
    try {
      const { job_id } = await start(controller.signal)
      this.poller.start(job_id, this.session, {
        onProgress: (job) => this.dispatch({ type: 'progress', job }),
        onSlow: () => this.dispatch({ type: 'slow' }),
        onDone: (view) => {
          this.session = view.session_id ?? this.session
          this.batch = nextBatch
          saveSession(this.session, this.batch)
          this.dispatch({ type: 'done', view })
        },
        onError: (e) => this.failWith(e, 'poll'),
      })
    } catch (e) {
      this.failWith(e, 'start')
    }
  }

  /** A new search. The session id is kept: the server tells a new topic from a follow-up (topic_notice). */
  search = (text: string) => {
    const request = text.trim()
    if (!request) return Promise.resolve()
    this.lastRequest = request
    return this.begin(request, 'search', (signal) => this.client.startSearch(this.session, request, signal))
  }

  retry = () => this.search(this.lastRequest)

  /** Shop Again, with the refine box's text if there is any. */
  shopAgain = (refineText: string) => {
    const id = this.session
    if (!id) return Promise.resolve()
    const text = refineText.trim()
    const request = this.snapshot.status === 'done' ? this.snapshot.request : this.lastRequest
    return this.begin(request, 'shop_again', (signal) => this.client.shopAgain(id, text === '' ? null : text, signal))
  }

  private async persist(id: string, part: { rating: Rating | null } | { comment: string }) {
    const sid = this.session
    if (!sid) return
    const n = (this.saves.get(id) ?? 0) + 1
    this.saves.set(id, n)
    this.dispatch({ type: 'ratings', action: { type: 'saving', id } })
    try {
      const out = await this.client.rate(ratingBody(sid, id, part))
      if (this.saves.get(id) === n) this.dispatch({ type: 'ratings', action: { type: 'saved', id, rating: out.rating, comment: out.comment } })
    } catch (e) {
      if (this.saves.get(id) !== n || isAbort(e)) return
      this.dispatch({ type: 'ratings', action: { type: 'failed', id, message: e instanceof ShopError ? e.message : 'Could not save.' } })
    }
  }

  /** Choosing a rating saves it at once (the rating alone is sent). */
  rate = (id: string, rating: Rating | null) => {
    this.dispatch({ type: 'ratings', action: { type: 'choose', id, rating } })
    return this.persist(id, { rating })
  }

  setComment = (id: string, text: string) => this.dispatch({ type: 'ratings', action: { type: 'comment', id, text } })

  /** The comment is saved when its field loses focus, and only if it changed (the comment alone is sent). */
  commentBlur = (id: string) => {
    const s = this.snapshot
    if (s.status !== 'done') return Promise.resolve()
    const r = s.ratings[id]
    return r && r.comment !== r.savedComment ? this.persist(id, { comment: r.comment }) : Promise.resolve()
  }

  /** After a failed save: send again what failed (an unsaved comment, else the rating). */
  retryRating = (id: string) => {
    const s = this.snapshot
    if (s.status !== 'done') return Promise.resolve()
    const r = s.ratings[id]
    if (!r) return Promise.resolve()
    return this.persist(id, r.comment !== r.savedComment ? { comment: r.comment } : { rating: r.rating })
  }

  private note(e: unknown) {
    if (isAbort(e)) return
    this.dispatch({ type: 'banner', banner: { message: e instanceof ShopError ? e.message : 'Could not remove that.', retryAfterS: null, resetsAt: null } })
  }

  removeRefine = async (chipId: string) => {
    if (!this.session) return
    try {
      this.dispatch({ type: 'patch', refine: (await this.client.removeRefine(this.session, chipId)).refine })
    } catch (e) {
      this.note(e)
    }
  }

  removeContext = async (kind: ContextKind, value: string) => {
    if (!this.session) return
    try {
      this.dispatch({ type: 'patch', query: (await this.client.removeContext(this.session, kind, value)).query })
    } catch (e) {
      this.note(e)
    }
  }

  /** Bring back the last results after a refresh. */
  restore = async () => {
    const saved = readSavedSession()
    if (!saved) return
    this.session = saved.id
    this.batch = saved.batch
    const controller = new AbortController()
    this.restoring = controller
    this.dispatch({ type: 'restoring' })
    try {
      this.dispatch({ type: 'restored', view: await this.client.loadSession(saved.id, controller.signal), batch: saved.batch })
    } catch (e) {
      if (isAbort(e)) return
      this.session = null
      saveSession(null)
      this.dispatch({ type: 'restored', view: null, batch: 1 })
    }
  }

  /** The page went away: stop polling and pending requests. */
  dispose = () => {
    this.restoring?.abort()
    this.starting?.abort()
    this.poller.stop()
    this.saves.clear()
  }
}
