// Shapes of the Shop Mode API (docs/api-contract.md in room-redesign-agent).
// Only the fields this page reads are typed; the service sends more.

export type ShopErrorCode =
  | 'session_required'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'cap_reached'
  | 'maintenance'
  | 'bad_request'
  | 'server_error'
  | 'network'
  | 'timeout'

export type AlsoAt = { seller: string; price: number | null }

export type ShopItem = {
  id: string
  title: string
  price: number | null
  currency?: string
  seller: string
  /** An https image on the provider's CDN, or "". */
  thumbnail_url: string
  /** A Google product link until resolved. */
  link: string
  link_kind?: 'google_panel' | 'retailer' | 'none'
  size_hint?: string | null
  rating: number | null
  rating_count: number | null
  also_at?: AlsoAt[]
}

export type ShopSearch = {
  request: string
  /** The one sentence above the grid. */
  headline?: string
  topic_notice?: string | null
  note?: string | null
  warnings?: string[]
  results: ShopItem[]
}

/** The body of GET /session, and the `result` of a finished job. */
export type SessionView = {
  session_id: string | null
  search: ShopSearch | null
}

export type StepState = 'pending' | 'active' | 'done' | 'skipped'

export type JobStep = {
  id: string
  label: string
  state: StepState
  done_count: number | null
  total: number | null
}

export type JobRunning = { state: 'running' | 'queued' | 'pending'; phase?: string; steps?: JobStep[] }
export type JobDone = { state: 'done'; phase?: string; steps?: JobStep[]; elapsed_s?: number; result: SessionView }
export type JobFailed = { state: 'error'; status?: number; error: string }
export type JobStatus = JobRunning | JobDone | JobFailed

export type AuthSession = { authenticated: boolean; contact_email?: string | null }
