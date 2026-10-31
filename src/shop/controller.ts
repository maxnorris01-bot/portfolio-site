import { ShopError, isAbort, type ShopClient } from './api.ts'
import { limitBlocks, noBlocks, usageFrom, type Blocked } from './limits.ts'
import { JobPoller } from './poller.ts'
import { ratingBody } from './ratings.ts'
import { initialState, readSavedSession, saveSession, shopReducer, type JobKind, type ShopAction, type ShopState } from './state.ts'
import { safeHref } from './state.ts'
import type { ContextKind, Rating, UsageInfo } from './types.ts'

/** What the page knows besides the results: the visit's limits, which buttons a refusal turned off. */
export type ShopMeta = { usage: UsageInfo | null; blocked: Blocked; maintenance: boolean }

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
  private meta: ShopMeta = { usage: null, blocked: noBlocks, maintenance: false }
  private resolving = new Map<string, Promise<string | null>>()
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

  getMeta = () => this.meta

  private setMeta(next: Partial<ShopMeta>) {
    this.meta = { ...this.meta, ...next }
    this.listeners.forEach((l) => l())
  }

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
    const info = { message: err.message, retryAfterS: err.retryAfterS, resetsAt: err.resetsAt, code: err.code, limit: err.limit }
    const hit = limitBlocks(info)
    if (hit.search || hit.again) this.setMeta({ blocked: { search: this.meta.blocked.search || hit.search, again: this.meta.blocked.again || hit.again }, maintenance: this.meta.maintenance || err.code === 'maintenance' })
    this.dispatch({ type: 'fail', ...info, phase })
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
          void this.loadUsage()
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
    this.dispatch({ type: 'ratings', action: { type: 'choose', id, rating, at: Date.now() } })
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
    this.dispatch({ type: 'banner', banner: { message: e instanceof ShopError ? e.message : 'Could not remove that.', retryAfterS: null, resetsAt: null, code: e instanceof ShopError ? e.code : null, limit: null } })
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

  /**
   * The visit's limits and reset time, for the usage line. Does not start a visit: a visitor with no visit yet
   * simply has no line until their first search.
   */
  loadUsage = async () => {
    try {
      const auth = await this.client.authSession()
      const maintenance = auth.maintenance === true
      this.setMeta({ usage: usageFrom(auth), maintenance, blocked: maintenance ? { search: true, again: true } : this.meta.blocked })
    } catch {
      // The line is a convenience: no line when the service cannot be reached.
    }
  }

  /**
   * The store link for a result (a lookup the server caches, and caps per session). Resolves to the link, or null
   * when there is none or the lookup failed, in which case the caller uses the result's own (Google) link.
   */
  resolveLink = (id: string): Promise<string | null> => {
    const sid = this.session
    if (!sid) return Promise.resolve(null)
    const known = this.snapshot.status === 'done' ? this.snapshot.view.resolved?.[id] : undefined
    const store = known?.status === 'resolved' ? safeHref(known.link) : null
    if (store) return Promise.resolve(store)
    const pending = this.resolving.get(id)
    if (pending) return pending
    const run = this.client
      .resolve(sid, id)
      .then((out) => {
        const link = out.resolved.status === 'resolved' ? safeHref(out.resolved.link) : null
        this.dispatch({ type: 'patch', resolved: { id, entry: { status: out.resolved.status, link: out.resolved.link, link_kind: out.resolved.link_kind } } })
        return link
      })
      .catch(() => null)
      .finally(() => this.resolving.delete(id))
    this.resolving.set(id, run)
    return run
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
