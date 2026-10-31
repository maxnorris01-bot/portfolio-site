import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePageMeta } from '../hooks/usePageMeta'
import { SHOP_PAGE_DESCRIPTION, SHOP_PAGE_TITLE } from '../shop/copy'
import ShopView from '../shop/ShopView'
import type { ShopState } from '../shop/state'
import { useShopSearch } from '../shop/useShopSearch'
import './Shop.css'

/** Development only: /shop?fixture=empty|running|slow|results|none|error|rated|again|batch2|cap shows canned states, no network. */
function useFixture(): ShopState | null {
  const [params] = useSearchParams()
  const name = import.meta.env.DEV ? params.get('fixture') : null
  const [fixture, setFixture] = useState<ShopState | null>(null)
  useEffect(() => {
    if (!import.meta.env.DEV || !name) return
    void import('../shop/fixtures').then((m) => setFixture(m.fixtureStates[name] ?? null))
  }, [name])
  return name ? fixture : null
}

export default function Shop() {
  usePageMeta(SHOP_PAGE_TITLE, SHOP_PAGE_DESCRIPTION)
  const shop = useShopSearch()
  const [value, setValue] = useState('')
  const [refineText, setRefineText] = useState('')
  const fixture = useFixture()

  return (
    <ShopView
      state={fixture ?? shop.state}
      value={value}
      onChange={setValue}
      onSubmit={() => void shop.search(value)}
      onExample={(text) => {
        setValue(text)
        void shop.search(text)
      }}
      onRetry={shop.retry}
      refineText={refineText}
      onRefineChange={setRefineText}
      onShopAgain={() => {
        void shop.shopAgain(refineText)
        setRefineText('')
      }}
      onRate={shop.rate}
      onComment={shop.setComment}
      onCommentBlur={shop.commentBlur}
      onRetryRating={shop.retryRating}
      onRemoveRefine={(id) => void shop.removeRefine(id)}
      onRemoveContext={(kind, v) => void shop.removeContext(kind, v)}
    />
  )
}
