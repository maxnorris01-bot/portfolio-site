import type { RatingsState } from './ratings.ts'
import type { ShopState } from './state.ts'
import type { ContextKind, Rating } from './types.ts'

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
  onShopAgain: () => void
  onRate: (id: string, rating: Rating | null) => void
  onComment: (id: string, text: string) => void
  onCommentBlur: (id: string) => void
  onRetryRating: (id: string) => void
  onRemoveRefine: (id: string) => void
  onRemoveContext: (kind: ContextKind, value: string) => void
}

export type RatingsProps = { ratings: RatingsState }
