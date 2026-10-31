import type { ShopState } from './state.ts'

export type ShopViewProps = {
  state: ShopState
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onExample: (text: string) => void
  onRetry: () => void
}
