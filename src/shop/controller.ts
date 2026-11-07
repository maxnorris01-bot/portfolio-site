import { ShopError, isAbort, type ShopClient } from './api.ts'
import { answersToPost, panelLocked, panelVisible, type ClarifyNote, type ClarifyUi } from './clarify.ts'
import { limitBlocks, noBlocks, usageFrom, type Blocked } from './limits.ts'
import { JobPoller } from './poller.ts'
import { ratingBody } from './ratings.ts'
import { initialState, readSavedSession, saveSession, shopReducer, type JobKind, type ShopAction, type ShopState } from './state.ts'
import { safeHref } from './state.ts'
import type { ContextKind, Rating, UsageInfo } from './types.ts'

/** Rapid clicks on answer tiles are sent together after this long (the last choice wins). */
export const ANSWER_DEBOUNCE_MS = 250

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
  // Stage Q2: the clarifying questions of the running search job. Answers are posted whole (idempotent), one request at a time.
  private jobId: string | null = null
  private posted = new Set<string>()
  private answerTimer: ReturnType<typeof setTimeout> | null = null
  private answerBusy = false
  private answerDirty = false
  private submitWanted = false
  private answersStopped = false
  private answerAbort: AbortController | null = null

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

  private touchedSent = false

  /** First interaction inside the question panel: tell the service once (no answers). Failures are ignored. */
  touch = () => {
    if (this.touchedSent || !this.jobId || !this.ui()) return
    this.touchedSent = true
    void this.client.postTouched(this.jobId, this.session).catch(() => undefined)
  }

  private resetAnswers() {
    if (this.answerTimer !== null) clearTimeout(this.answerTimer)
    this.answerTimer = null
    this.answerAbort?.abort()
    this.answerAbort = null
    this.jobId = null
    this.posted = new Set()
    this.touchedSent = false
    this.answerBusy = this.answerDirty = this.submitWanted = this.answersStopped = false
  }

  private ui(): ClarifyUi | null {
    const s = this.snapshot
    return s.status === 'running' || s.status === 'done' ? (s.clarify ?? null) : null
  }

  private async begin(request: string, kind: JobKind, start: (signal: AbortSignal) => Promise<{ job_id: string }>) {
    this.poller.stop()
    this.resetAnswers()
    this.starting?.abort()
    const controller = new AbortController()
    this.starting = controller
    const nextBatch = kind === 'search' ? 1 : this.batch + 1
    this.dispatch({ type: 'submit', request, kind, batch: nextBatch, now: Date.now() })
    try {
      const { job_id } = await start(controller.signal)
      if (kind === 'search') this.jobId = job_id
      this.poller.start(job_id, this.session, {
        onProgress: (job) => this.dispatch({ type: 'progress', job }),
        onClarify: (clarify) => this.dispatch({ type: 'clarify', action: { type: 'server', clarify } }),
        onSlow: () => this.dispatch({ type: 'slow' }),
        onDone: (view) => {
          const keep = this.ui() !== null && panelVisible(this.ui()!) && !panelLocked(this.ui()!)
          if (!keep) this.resetAnswers()
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

  /** Choose an option for a question (or clear it with null). The post is debounced; the last choice wins. */
  selectAnswer = (id: string, value: string | null) => {
    const ui = this.ui()
    if (!ui || panelLocked(ui)) return
    this.dispatch({ type: 'clarify', action: { type: 'select', id, value } })
    if (this.answersStopped) return
    if (this.answerTimer !== null) clearTimeout(this.answerTimer)
    this.answerTimer = setTimeout(() => void this.flushAnswers(false), ANSWER_DEBOUNCE_MS)
  }

  /** "Show results": send the answers with submit, now. */
  submitAnswers = () => {
    const ui = this.ui()
    if (!ui || panelLocked(ui)) return Promise.resolve()
    if (this.answerTimer !== null) clearTimeout(this.answerTimer)
    this.answerTimer = null
    this.dispatch({ type: 'clarify', action: { type: 'submitted', value: true } })
    return this.flushAnswers(true)
  }

  /** After the quiet "could not save" note: send the answers again. */
  retryAnswers = () => {
    const ui = this.ui()
    if (!ui) return Promise.resolve()
    this.dispatch({ type: 'clarify', action: { type: 'note', note: null } })
    return this.flushAnswers(ui.submitted)
  }

  private async flushAnswers(submit: boolean): Promise<void> {
    if (this.answerBusy) {
      this.answerDirty = true
      this.submitWanted = this.submitWanted || submit
      return
    }
    const ui = this.ui()
    const jobId = this.jobId
    if (!ui || !jobId || (this.answersStopped && !submit)) return
    const answers = answersToPost(ui, this.posted)
    if (answers.length === 0 && !submit) return
    this.answerBusy = true
    const controller = new AbortController()
    this.answerAbort = controller
    const note = (n: ClarifyNote) => this.dispatch({ type: 'clarify', action: { type: 'note', note: n } })
    try {
      const out = await this.client.postAnswers(jobId, answers, submit, this.session, controller.signal)
      for (const a of answers) this.posted.add(a.question_id)
      this.dispatch({ type: 'clarify', action: { type: 'server', clarify: out.clarify } })
      if (this.ui()?.note === 'failed') note(null)
    } catch (e) {
      if (isAbort(e)) return
      // None of this may disturb the search: a quiet note, and the visitor can retry or ignore it.
      const status = e instanceof ShopError ? e.status : 0
      if (submit) this.dispatch({ type: 'clarify', action: { type: 'submitted', value: false } })
      if (status === 404 || status === 409) note('closed')
      else if (status === 429) {
        this.answersStopped = true
        note('limit')
      } else {
        if (status === 400) console.warn('ShopAI: the answers were refused as malformed')
        note('failed')
      }
    } finally {
      this.answerBusy = false
      if (this.answerAbort === controller) this.answerAbort = null
      if ((this.answerDirty || this.submitWanted) && this.jobId === jobId && this.ui()?.note !== 'closed') {
        const again = this.submitWanted
        this.answerDirty = this.submitWanted = false
        void this.flushAnswers(again)
      }
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
      const out = await this.client.removeRefine(this.session, chipId)
      this.dispatch({ type: 'patch', refine: out.refine, clarifyAnswers: out.clarify_answers })
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
    this.resetAnswers()
    this.saves.clear()
  }
}
