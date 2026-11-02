import type { AuthSession, ContextKind, JobStatus, ParsedQuery, Rating, RefineChip, ResolvedLink, SessionView, ShopErrorCode } from './types.ts'

const BASE = '/api/shop'

/** An API error: the server's own sentence is `message`, safe to show. */
export class ShopError extends Error {
  readonly code: ShopErrorCode
  readonly status: number
  /** Seconds to wait, from a Retry-After header. */
  readonly retryAfterS: number | null
  /** For cap_reached: when the allowance comes back (ISO time), or null. */
  readonly resetsAt: string | null
  /** For cap_reached: which limit (session, ip_day, global_day, searches, shop_agains). */
  readonly limit: string | null
  constructor(code: ShopErrorCode, message: string, status = 0, retryAfterS: number | null = null, resetsAt: string | null = null, limit: string | null = null) {
    super(message)
    this.name = 'ShopError'
    this.code = code
    this.status = status
    this.retryAfterS = retryAfterS
    this.resetsAt = resetsAt
    this.limit = limit
  }
}

export const isAbort = (e: unknown): boolean => e instanceof Error && e.name === 'AbortError'

const GENERIC: Record<number, [ShopErrorCode, string]> = {
  401: ['session_required', 'Your visit expired. Please try again.'],
  403: ['forbidden', 'That request was refused.'],
  404: ['not_found', 'That could not be found.'],
  429: ['rate_limited', 'Too many requests right now. Please wait a moment and try again.'],
  503: ['maintenance', 'ShopAI is paused for now. Please try again later.'],
}

const CODES: readonly string[] = [
  'session_required', 'forbidden', 'not_found', 'rate_limited', 'cap_reached', 'maintenance', 'bad_request', 'server_error',
]

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

export function parseRetryAfter(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value.trim())) return null
  return Number(value.trim())
}

/** Turn a failed response (and its already-parsed JSON body, if any) into a ShopError. */
export function errorFromResponse(status: number, body: unknown, retryAfter: string | null): ShopError {
  const retryAfterS = parseRetryAfter(retryAfter)
  const err = isRecord(body) && isRecord(body.error) ? body.error : null
  const message = err && typeof err.message === 'string' && err.message ? err.message : null
  const known = err && typeof err.code === 'string' && CODES.includes(err.code) ? (err.code as ShopErrorCode) : null
  const [fallbackCode, fallbackMessage] =
    GENERIC[status] ?? (status === 400 ? (['bad_request', 'That request could not be understood.'] as const) : (['server_error', 'Something went wrong on the server. Please try again.'] as const))
  const resetsAt = err && typeof err.resets_at === 'string' ? err.resets_at : null
  const limit = err && typeof err.limit === 'string' ? err.limit : null
  return new ShopError(known ?? fallbackCode, message ?? fallbackMessage, status, retryAfterS, resetsAt, limit)
}

type RequestOptions = {
  method?: 'GET' | 'POST'
  body?: unknown
  signal?: AbortSignal
  /** Start a visit and retry once on 401 session_required (default true). */
  autoStart?: boolean
}

/** POST /rate body: send `rating`, `comment` or both. */
export type RateBody = { session_id: string; result_id: string; rating?: Rating | null; comment?: string }

export function createShopClient(fetchImpl: typeof fetch = (...a) => fetch(...a)) {
  async function send<T>(path: string, o: RequestOptions): Promise<T> {
    let res: Response
    try {
      res = await fetchImpl(`${BASE}${path}`, {
        method: o.method ?? 'GET',
        credentials: 'same-origin',
        headers: o.body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: o.body === undefined ? undefined : JSON.stringify(o.body),
        signal: o.signal,
      })
    } catch (e) {
      if (isAbort(e) || o.signal?.aborted) throw e
      throw new ShopError('network', 'Could not reach ShopAI. Check your connection and try again.')
    }
    const json: unknown = await res.json().catch(() => null)
    if (!res.ok) throw errorFromResponse(res.status, json, res.headers.get('Retry-After'))
    return json as T
  }

  async function request<T>(path: string, o: RequestOptions = {}): Promise<T> {
    try {
      return await send<T>(path, o)
    } catch (e) {
      if (e instanceof ShopError && e.code === 'session_required' && o.autoStart !== false) {
        await send('/auth/start', { method: 'POST', signal: o.signal })
        return send<T>(path, o) // once; a second 401 is shown as it is
      }
      throw e
    }
  }

  return {
    authSession: (signal?: AbortSignal) => request<AuthSession>('/auth/session', { signal, autoStart: false }),
    startSearch: (sessionId: string | null, text: string, signal?: AbortSignal) =>
      request<{ job_id: string }>('/search', { method: 'POST', body: { session_id: sessionId, request: text }, signal }),
    pollJob: (jobId: string, sessionId: string | null, signal?: AbortSignal) =>
      request<JobStatus>(`/job/${encodeURIComponent(jobId)}?session=${encodeURIComponent(sessionId ?? '')}`, { signal }),
    /** Save a rating, a comment, or both (a missing field is left as it is; `rating: null` clears). */
    rate: (body: RateBody, signal?: AbortSignal) =>
      request<{ result_id: string; rating: Rating | null; comment: string }>('/rate', { method: 'POST', body, signal }),
    shopAgain: (sessionId: string, refineText: string | null, signal?: AbortSignal) =>
      request<{ job_id: string }>('/shop-again', { method: 'POST', body: { session_id: sessionId, refine_text: refineText }, signal }),
    removeRefine: (sessionId: string, id: string, signal?: AbortSignal) =>
      request<{ refine: RefineChip[] }>('/refine/remove', { method: 'POST', body: { session_id: sessionId, id }, signal }),
    removeContext: (sessionId: string, kind: ContextKind, value: string, signal?: AbortSignal) =>
      request<{ query: ParsedQuery; removed: string }>('/context/remove', { method: 'POST', body: { session_id: sessionId, kind, value }, signal }),
    /** Look up the store link for a result (cached on the server once found). */
    resolve: (sessionId: string, resultId: string, signal?: AbortSignal) =>
      request<{ resolved: ResolvedLink & { result_id: string }; lookups_used: number; lookups_cap: number }>('/resolve', {
        method: 'POST',
        body: { session_id: sessionId, result_id: resultId },
        signal,
      }),
    /** Reload a session; no visit is started for it (an old id just fails). */
    loadSession: (sessionId: string, signal?: AbortSignal) =>
      request<SessionView>(`/session?id=${encodeURIComponent(sessionId)}`, { signal, autoStart: false }),
  }
}

export type ShopClient = ReturnType<typeof createShopClient>
