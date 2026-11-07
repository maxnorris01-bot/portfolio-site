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

export type Rating = 'love' | 'like' | 'dislike'
export type RatingEntry = { rating: Rating | null; comment: string }

/** What the server understood from the request (the parts this page shows). */
export type ParsedQuery = {
  search_text?: string
  category?: string | null
  price_min?: number | null
  price_max?: number | null
  style_terms?: string[]
  material_terms?: string[]
  color_terms?: string[]
  shape_terms?: string[]
  must_have?: string[]
  avoid?: string[]
  context?: string[]
}

/** A refine instruction the server understood ("no Walmart", "focus on cream"). */
export type RefineChip = { id: string; kind?: string; label: string; approximate?: boolean; text?: string }

/** Kinds POST /context/remove accepts. */
export type ContextKind = 'context' | 'suggested' | 'avoid' | 'color_term' | 'material' | 'shape_term'

export type ShopSearch = {
  request: string
  kind?: 'search' | 'shop_again'
  query?: ParsedQuery | null
  /** The one sentence above the grid. */
  headline?: string
  topic_notice?: string | null
  note?: string | null
  warnings?: string[]
  results: ShopItem[]
}

/** The body of GET /session, and the `result` of a finished job. */
/** A loved or liked result in the session's Saved list (an earlier topic's carries the request it came from). */
export type SavedRow = ShopItem & { topic_label?: string }

export type ResolvedLink = { status: 'resolved' | 'fallback'; link: string; link_kind?: string }

/** Stage Q1 (docs/api-contract.md in room-redesign-agent): the clarifying questions a search job may carry. Absent when the backend flag is off. */
export type ClarifyOption = { label: string; value: string; picture_url: string | null }
export type ClarifyQuestion = {
  id: string
  text: string
  kind: 'choice' | 'size_range'
  dimension: 'color' | 'material' | 'shape' | 'style' | 'size' | 'feature'
  options: ClarifyOption[]
}
export type ClarifyAnswer = { question_id: string; option_value: string }
export type Clarify = {
  state: 'pending' | 'ready' | 'skipped' | 'failed'
  /** [] unless state is "ready". */
  questions: ClarifyQuestion[]
  pictures_state: 'pending' | 'done'
  no_preference_value: 'no_preference'
  answers: ClarifyAnswer[]
  submitted: boolean
  applied: boolean
  deadline: { idle_grace_s: number; max_wait_s: number; waiting: boolean; seconds_left: number | null; shown_s_ago: number | null }
}

/** An answered question kept in the session (a chip after the results show). Delete with POST /refine/remove and this id. */
export type ClarifyAnswerChip = { id: string; question: string; label: string; dimension: string }

export type SessionView = {
  session_id: string | null
  search: ShopSearch | null
  /** Loved and liked results from every search in the session, newest first. */
  saved?: SavedRow[]
  /** Result id to its store link, once looked up. */
  resolved?: Record<string, ResolvedLink>
  /** Searches and Shop Agains recorded in the session. */
  search_count?: number
  /** Result id to its rating and comment. */
  ratings?: Record<string, RatingEntry>
  refine?: RefineChip[]
  /** Only with the backend flag on. */
  clarify_answers?: ClarifyAnswerChip[]
  can_shop_again?: boolean
  shop_agains_used?: number
  shop_agains_cap?: number
}

export type StepState = 'pending' | 'active' | 'done' | 'skipped'

export type JobStep = {
  id: string
  label: string
  state: StepState
  done_count: number | null
  total: number | null
}

export type JobRunning = { state: 'running' | 'queued' | 'pending'; phase?: string; steps?: JobStep[]; clarify?: Clarify }
export type JobDone = { state: 'done'; phase?: string; steps?: JobStep[]; elapsed_s?: number; result: SessionView; clarify?: Clarify }
export type JobFailed = { state: 'error'; status?: number; error: string; clarify?: Clarify }
export type JobStatus = JobRunning | JobDone | JobFailed

/** The part of GET /auth/session's usage block this page shows: per-visit limits and the daily reset. (Dollar figures are never shown.) */
export type UsageInfo = { maxSearches: number; maxShopAgains: number; resetsAt: string | null }

export type AuthSession = {
  authenticated: boolean
  contact_email?: string | null
  maintenance?: boolean
  usage?: { session?: { max_searches?: number; max_shop_agains?: number }; resets_at?: string }
}
