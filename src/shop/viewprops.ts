import type { ShopMeta } from './controller.ts'
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
  /** The visit's limits and which buttons a refusal turned off. */
  meta: ShopMeta
  /** The Saved panel: shown or hidden, and which tab. */
  savedOpen: boolean
  onToggleSaved: () => void
  savedTab: 'love' | 'like'
  onSavedTab: (tab: 'love' | 'like') => void
  /** Look up a result's store link (for Open). */
  onResolve: (id: string) => Promise<string | null>
}

export type RatingsProps = { ratings: RatingsState }
