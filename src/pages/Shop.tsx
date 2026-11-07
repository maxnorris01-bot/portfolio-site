import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePageMeta } from '../hooks/usePageMeta'
import { clarifyReduce, type ClarifyUi } from '../shop/clarify'
import { SHOP_PAGE_DESCRIPTION, SHOP_PAGE_TITLE } from '../shop/copy'
import ShopView from '../shop/ShopView'
import { readSavedOpen, writeSavedOpen } from '../shop/saved'
import { useShopSearch } from '../shop/useShopSearch'
import type { FixtureBundle } from '../shop/fixtures'
import './Shop.css'
import '../shop/ClarifyPanel.css'
import '../shop/Filters.css'
import '../shop/WaitPanel.css'

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
  // Development fixtures with questions are interactive (choices, steps, Show results) without a service: the choices live here.
  const [fixtureUi, setFixtureUi] = useState<ClarifyUi | null>(null)
  const fixtureClarify = fixture?.state.status === 'running' ? (fixture.state.clarify ?? null) : null
  // Progressive fixtures: ?frame=N pins a later server object, ?play=1 steps through them every 2.5 s (development only).
  const [params] = useSearchParams()
  const frames = fixture?.frames
  const pinned = Number(params.get('frame'))
  const [played, setPlayed] = useState(0)
  useEffect(() => {
    if (!frames || params.get('play') !== '1') return
    const id = setInterval(() => setPlayed((n) => Math.min(n + 1, frames.length - 1)), 2500)
    return () => clearInterval(id)
  }, [frames, params])
  const frameAt = frames ? (params.get('play') === '1' ? played : params.has('frame') && pinned < frames.length ? pinned : null) : null
  const fixtureUiNow = fixtureUi && frames && frameAt !== null ? clarifyReduce(fixtureUi, { type: 'server', clarify: frames[frameAt] }) : fixtureUi
  const fixtureState =
    fixture && fixture.state.status === 'running' && fixtureClarify ? { ...fixture.state, clarify: (frames && frameAt !== null ? clarifyReduce(fixtureUiNow ?? fixtureClarify, { type: 'server', clarify: frames[frameAt] }) : fixtureUi) ?? fixtureClarify } : fixture?.state
  const answer = (id: string, choice: string | null) =>
    fixtureClarify ? setFixtureUi((u) => clarifyReduce(u ?? fixtureClarify, { type: 'select', id, value: choice })) : shop.selectAnswer(id, choice)

  return (
    <ShopView
      state={fixtureState ?? shop.state}
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
      onAnswer={answer}
      onSubmitAnswers={() => (fixtureClarify ? setFixtureUi((u) => clarifyReduce(u ?? fixtureClarify, { type: 'submitted', value: true })) : void shop.submitAnswers())}
      onTouch={fixtureClarify ? undefined : shop.touch}
      onRetryAnswers={() => void shop.retryAnswers()}
      onSearchFilters={(filters) => {
        void shop.searchAgain(refineText, filters)
        setRefineText('')
      }}
      onSaveFilters={(filters) => void shop.saveFilters(filters)}
      onResolve={shop.resolveLink}
    />
  )
}
