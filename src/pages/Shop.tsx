import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePageMeta } from '../hooks/usePageMeta'
import { SHOP_PAGE_DESCRIPTION, SHOP_PAGE_TITLE } from '../shop/copy'
import ShopView from '../shop/ShopView'
import type { ShopState } from '../shop/state'
import { useShopSearch } from '../shop/useShopSearch'
import './Shop.css'

/** Development only: /shop?fixture=results|running|slow|none|error|empty shows canned states, no network. */
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
  const { state, search, retry } = useShopSearch()
  const [value, setValue] = useState('')
  const fixture = useFixture()

  return (
    <ShopView
      state={fixture ?? state}
      value={value}
      onChange={setValue}
      onSubmit={() => void search(value)}
      onExample={(text) => {
        setValue(text)
        void search(text)
      }}
      onRetry={retry}
    />
  )
}
