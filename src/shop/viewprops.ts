import type { ShopMeta } from './controller.ts'
import type { RatingsState } from './ratings.ts'
import type { ShopState } from './state.ts'
import type { Selection } from './filters.ts'
import type { PriceBody, PriceRange } from './price.ts'
import type { ContextKind, FilterChoice, Rating } from './types.ts'

export type ShopViewProps = {
  state: ShopState
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onExample: (text: string) => void
  onRetry: () => void
  /** The refine box (sent with Shop Again). */
  refineText: string
  onRefineChange: (value: string) => void
  /** `filters`: the choices to send (a list replaces the stored ones, [] clears them); absent leaves them as they are. */
  onShopAgain: () => void
  onRate: (id: string, rating: Rating | null) => void
  onRetryRating: (id: string) => void
  onRemoveRefine: (id: string) => void
  onRemoveContext: (kind: ContextKind, value: string) => void
  /** The visit's limits and which buttons a refusal turned off. */
  meta: ShopMeta
  /** The Saved row: whether the full list below it is expanded ("Show all"), and which tab. */
  savedOpen: boolean
  onToggleSaved: () => void
  savedTab: 'love' | 'like'
  onSavedTab: (tab: 'love' | 'like') => void
  /** Stage Q2: choose (or clear, with null) an option for a clarifying question; press Show results; retry a failed post. */
  onAnswer: (questionId: string, value: string | null) => void
  onSubmitAnswers: () => void
  onRetryAnswers: () => void
  /** The visitor's first interaction with the questions (reported once). */
  onTouch?: () => void
  /** Overrides the window-width test for the two-column questions panel (from 1280px): the progress steps inside it or above it. Tests only. */
  wide?: boolean
  /** Refine search: Shop Again with the chosen options as `filters`. */
  onSearchFilters: (filters: FilterChoice[] | undefined, price?: PriceBody) => void
  /** Save the choices (POST /refine) when the dialog closes. */
  onSaveFilters: (filters: FilterChoice[] | undefined, price?: PriceBody) => void
  /** Tests and development fixtures only: a local selection to start with (when the service has no filter chips). */
  initialFilters?: Selection
  /** Tests and development fixtures only: the Min and Max typed into the dialog to start with (when the service has no price chip). */
  initialPrice?: PriceRange
  /** Look up a result's store link (for Open). */
  onResolve: (id: string) => Promise<string | null>
}

export type RatingsProps = { ratings: RatingsState }
