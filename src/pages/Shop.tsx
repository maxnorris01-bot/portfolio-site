import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePageMeta } from '../hooks/usePageMeta'
import { SHOP_PAGE_DESCRIPTION, SHOP_PAGE_TITLE } from '../shop/copy'
import ShopView from '../shop/ShopView'
import { readSavedOpen, writeSavedOpen } from '../shop/saved'
import { useShopSearch } from '../shop/useShopSearch'
import type { FixtureBundle } from '../shop/fixtures'
import './Shop.css'

/** Development only: /shop?fixture=<name> shows canned states (see src/shop/fixtures.ts), no network. */
function useFixture(): FixtureBundle | null {
  const [params] = useSearchParams()
  const name = import.meta.env.DEV ? params.get('fixture') : null
  const [fixture, setFixture] = useState<FixtureBundle | null>(null)
  useEffect(() => {
    if (!import.meta.env.DEV || !name) return
    void import('../shop/fixtures').then((m) => setFixture(m.fixtureBundles[name] ?? null))
  }, [name])
  return name ? fixture : null
}

export default function Shop() {
  usePageMeta(SHOP_PAGE_TITLE, SHOP_PAGE_DESCRIPTION)
  const shop = useShopSearch()
  const [value, setValue] = useState('')
  const [refineText, setRefineText] = useState('')
  const [savedOpen, setSavedOpen] = useState(readSavedOpen)
  const [savedTab, setSavedTab] = useState<'love' | 'like'>('love')
  const fixture = useFixture()

  return (
    <ShopView
      state={fixture?.state ?? shop.state}
      meta={fixture?.meta ?? shop.meta}
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
      savedOpen={savedOpen}
      onToggleSaved={() => {
        writeSavedOpen(!savedOpen)
        setSavedOpen(!savedOpen)
      }}
      savedTab={fixture?.savedTab ?? savedTab}
      onSavedTab={setSavedTab}
      onResolve={shop.resolveLink}
    />
  )
}
