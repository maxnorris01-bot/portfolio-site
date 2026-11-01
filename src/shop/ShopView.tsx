import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import PageHeader from '../components/PageHeader'
import { EXAMPLE_REQUESTS, LIMITATIONS_NOTICE, NO_RESULTS_MESSAGE, SHOP_TITLE } from './copy.ts'
import { requestChips } from './chips.ts'
import { limitText, isLimit, usageLine } from './limits.ts'
import { openResolved } from './open.ts'
import { openTarget, savedLists, type SavedItem } from './saved.ts'
import { COMMENT_MAX, RATING_LABELS, RATING_ORDER, nextRatingForKey, ratedCount, shopAgainBlock, type ItemRating } from './ratings.ts'
import { alsoAtLine, formatPrice, ratingLine, safeHref, shortfallLine, stepSummary, type ShopState } from './state.ts'
import type { ShopViewProps } from './viewprops.ts'
import type { Rating, ResolvedLink, ShopItem } from './types.ts'

export function ProductImageView({ src, alt, failed, onError }: { src: string; alt: string; failed: boolean; onError?: () => void }) {
  return (
    <div className="shop-thumb">
      {src && !failed ? (
        <img src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={onError} />
      ) : (
        <div className="shop-thumb-empty" role="img" aria-label={`No image for ${alt}`}>
          No image
        </div>
      )}
    </div>
  )
}

function ProductImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false)
  return <ProductImageView src={src} alt={alt} failed={failed} onError={() => setFailed(true)} />
}

type RateHandlers = {
  onRate: (id: string, rating: Rating | null) => void
  onComment: (id: string, text: string) => void
  onCommentBlur: (id: string) => void
  onRetryRating: (id: string) => void
}

/** Love / Like / Dislike as a radio group: arrow keys move and choose, Tab leaves the group. */
export function RatingGroup({ item, entry, onRate }: { item: ShopItem; entry: ItemRating | undefined; onRate: RateHandlers['onRate'] }) {
  const current = entry?.rating ?? null
  const refs = useRef<Partial<Record<Rating, HTMLButtonElement | null>>>({})
  const onKey = (e: KeyboardEvent) => {
    const next = nextRatingForKey(current, e.key)
    if (!next) return
    e.preventDefault()
    onRate(item.id, next)
    refs.current[next]?.focus()
  }
  return (
    <div className="shop-rate" role="radiogroup" aria-label={`Rate ${item.title}`} onKeyDown={onKey}>
      {RATING_ORDER.map((r) => (
        <button
          key={r}
          ref={(el) => {
            refs.current[r] = el
          }}
          type="button"
          role="radio"
          aria-checked={current === r}
          tabIndex={current === r || (current === null && r === RATING_ORDER[0]) ? 0 : -1}
          className={`shop-rate-btn is-${r}${current === r ? ' is-on' : ''}`}
          onClick={() => onRate(item.id, current === r ? null : r)}
        >
          {RATING_LABELS[r]}
        </button>
      ))}
    </div>
  )
}

function SaveStatus({ entry, onRetry }: { entry: ItemRating | undefined; onRetry: () => void }) {
  if (!entry || entry.save === 'idle') return null
  if (entry.save === 'failed') {
    return (
      <p className="shop-save is-failed" role="alert">
        <span>{entry.error ?? 'Could not save.'}</span>{' '}
        <button type="button" className="shop-link" onClick={onRetry}>
          Retry
        </button>
      </p>
    )
  }
  return (
    <p className={`shop-save is-${entry.save}`} role="status">
      {entry.save === 'saving' ? 'Saving…' : 'Saved'}
    </p>
  )
}

type OpenProps = { resolved?: Record<string, ResolvedLink>; onResolve: (id: string) => Promise<string | null> }

/** Open the store: the resolved store link when known, else the result's own link (looked up on click when it is Google's page). */
function OpenLink({ item, open }: { item: ShopItem; open?: OpenProps }) {
  const { href, needsResolve } = openTarget(item, open?.resolved, safeHref)
  if (!href) return null
  return (
    <a
      className="btn btn-secondary shop-open"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={needsResolve && open ? (e) => openResolved(e, item.link, () => open.onResolve(item.id)) : undefined}
    >
      Open<span className="visually-hidden"> {item.title} (opens in a new tab)</span> ↗
    </a>
  )
}

export function ProductCard({ item, entry, handlers, open }: { item: ShopItem; entry?: ItemRating; handlers?: RateHandlers; open?: OpenProps }) {
  const price = formatPrice(item.price, item.currency)
  const rating = ratingLine(item)
  const also = alsoAtLine(item)
  return (
    <li className="shop-card">
      <ProductImage src={item.thumbnail_url} alt={item.title} />
      <div className="shop-card-body">
        <h3 className="shop-card-title">{item.title}</h3>
        <p className="shop-card-price">{price ?? 'Price not listed'}</p>
        <p className="shop-card-meta">{item.seller}</p>
        {rating && <p className="shop-card-meta">{rating}</p>}
        {item.size_hint && <p className="shop-card-meta">{item.size_hint}</p>}
        {also && <p className="shop-card-meta shop-card-also">{also}</p>}
        <OpenLink item={item} open={open} />
        {handlers && (
          <div className="shop-rating">
            <RatingGroup item={item} entry={entry} onRate={handlers.onRate} />
            {entry?.rating && (
              <label className="shop-comment">
                <span className="visually-hidden">Comment on {item.title}</span>
                <input
                  type="text"
                  className="shop-comment-input"
                  value={entry.comment}
                  maxLength={COMMENT_MAX}
                  placeholder="Add a short comment (optional)"
                  onChange={(e) => handlers.onComment(item.id, e.target.value)}
                  onBlur={() => handlers.onCommentBlur(item.id)}
                />
              </label>
            )}
            <SaveStatus entry={entry} onRetry={() => handlers.onRetryRating(item.id)} />
          </div>
        )}
      </div>
    </li>
  )
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(since)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  return <span className="shop-timer">{Math.max(0, Math.floor((now - since) / 1000))} s</span>
}

export default function ShopView(props: ShopViewProps) {
  const { state, value, onChange, onSubmit, onExample, onRetry } = props
  const inputId = useId()
  const running = state.status === 'running'
  const blocked = props.meta.blocked.search
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!running && !blocked && value.trim()) onSubmit()
  }
  const counts = state.status === 'done' ? state.view : state.status === 'running' ? state.prev?.view : null
  const usage = usageLine(props.meta.usage, counts ? { searchCount: counts.search_count, shopAgainsUsed: counts.shop_agains_used } : null)

  return (
    <main className="page">
      <div className="page-container shop">
        <PageHeader
          eyebrow="Project · Personal shopping assistant"
          title={SHOP_TITLE}
          lead="Describe what you want to buy in plain words. It searches Google Shopping, ranks the matches and shows them here."
        />

        {props.meta.maintenance && (
          <div className="shop-banner" role="alert">
            <p>{limitText({ message: '', retryAfterS: null, resetsAt: null, code: 'maintenance', limit: null })}</p>
          </div>
        )}

        <form className="shop-form" onSubmit={submit}>
          <label className="shop-label" htmlFor={inputId}>
            What are you looking for?
          </label>
          <div className="shop-form-row">
            <input
              id={inputId}
              className="shop-input"
              type="text"
              value={value}
              maxLength={300}
              autoComplete="off"
              placeholder="modern couch under $1000"
              onChange={(e) => onChange(e.target.value)}
            />
            <button type="submit" className="btn btn-primary shop-submit" disabled={running || blocked || !value.trim()}>
              {running ? 'Searching…' : 'Search'}
            </button>
          </div>
          <ul className="chip-list shop-examples" aria-label="Example requests">
            {EXAMPLE_REQUESTS.map((text) => (
              <li key={text}>
                <button type="button" className="chip shop-chip" disabled={running || blocked} onClick={() => onExample(text)}>
                  {text}
                </button>
              </li>
            ))}
          </ul>
          {usage && (
            <p className="shop-usage" aria-label="Your usage this visit">
              {usage}
            </p>
          )}
        </form>

        <section className="shop-output" aria-label="Results">
          {state.status === 'idle' && (
            <p className="shop-empty" role="status">
              {state.restoring ? 'Restoring your last search…' : 'Type a request or pick an example to see results here.'}
            </p>
          )}

          {state.status === 'running' && (
            <div className="shop-progress">
              <p className="shop-progress-head" role="status" aria-live="polite">
                <span className="shop-spinner" aria-hidden="true" />
                <span>
                  {state.slow
                    ? 'Still working. This one is taking longer than usual…'
                    : state.kind === 'shop_again'
                      ? `Finding batch ${state.batch} for “${state.request}”…`
                      : `Searching for “${state.request}”…`}
                </span>
                <Elapsed since={state.startedAt} />
              </p>
              {state.steps.length > 0 && (
                <ol className="shop-steps">
                  {state.steps.map((step) => (
                    <li key={step.id} className={`shop-step is-${step.state}`} aria-current={step.state === 'active' ? 'step' : undefined}>
                      <span className="shop-step-mark" aria-hidden="true">
                        {step.state === 'done' ? '✓' : step.state === 'skipped' ? '–' : step.state === 'active' ? '●' : '○'}
                      </span>
                      <span>{stepSummary(step)}</span>
                      <span className="visually-hidden"> — {step.state}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          {state.status === 'error' && (
            <div className="shop-error" role="alert">
              <p>{limitText(state)}</p>
              {state.retryAfterS !== null && <p className="shop-card-meta">You can try again in about {state.retryAfterS} s.</p>}
              {state.request && !isLimit(state) && (
                <button type="button" className="btn btn-secondary" onClick={onRetry}>
                  Try again
                </button>
              )}
            </div>
          )}

          {state.status === 'done' && <Results state={state} props={props} />}
        </section>

        <aside className="shop-about" aria-label="About this tool">
          <p>{LIMITATIONS_NOTICE}</p>
        </aside>
      </div>
    </main>
  )
}

function Banner({ banner }: { banner: NonNullable<Extract<ShopState, { status: 'done' }>['banner']> }) {
  return (
    <div className="shop-banner" role="alert">
      <p>{limitText(banner)}</p>
      {banner.retryAfterS !== null && <p className="shop-card-meta">You can try again in about {banner.retryAfterS} s.</p>}
    </div>
  )
}

/** What to say when a batch has nothing in it: the server's own shopper-facing sentence (nothing new left, or nothing matched), else a plain one. */
function emptyMessage(search: Extract<ShopState, { status: 'done' }>['view']['search']): string {
  const ownWords = [search?.headline, ...(search?.warnings ?? [])].find((w) => typeof w === 'string' && /^(I ran out of new results|No results matched)/.test(w))
  return ownWords || search?.note || NO_RESULTS_MESSAGE
}

function Chips({ state, props }: { state: Extract<ShopState, { status: 'done' }>; props: ShopViewProps }) {
  const asked = requestChips(state.view.search?.query)
  const refine = state.view.refine ?? []
  if (asked.length === 0 && refine.length === 0) return null
  return (
    <div className="shop-chips">
      {asked.length > 0 && (
        <div>
          <p className="shop-chips-title">What I understood</p>
          <ul className="chip-list" aria-label="What I understood from your request">
            {asked.map((c) => (
              <li key={c.key} className="chip shop-understood">
                {c.label}
                {c.remove && (
                  <button type="button" className="shop-chip-x" aria-label={`Remove ${c.label}`} onClick={() => props.onRemoveContext(c.remove!.kind, c.remove!.value)}>
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {refine.length > 0 && (
        <div>
          <p className="shop-chips-title">Your refinements</p>
          <ul className="chip-list" aria-label="Your refinements">
            {refine.map((c) => (
              <li key={c.id} className="chip shop-understood">
                {c.approximate ? `${c.label} (approximate)` : c.label}
                <button type="button" className="shop-chip-x" aria-label={`Remove ${c.label}`} onClick={() => props.onRemoveRefine(c.id)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="shop-card-meta">Changes here apply the next time you press Shop Again.</p>
    </div>
  )
}

function AgainBar({ state, props }: { state: Extract<ShopState, { status: 'done' }>; props: ShopViewProps }) {
  const refineId = useId()
  const items = state.view.search?.results ?? []
  const saving = Object.values(state.ratings).some((r) => r.save === 'saving')
  const block = shopAgainBlock({
    running: false,
    saving,
    rated: ratedCount(items.map((i) => i.id), state.ratings),
    used: state.view.shop_agains_used,
    cap: state.view.shop_agains_cap,
    limited: props.meta.blocked.again ? 'Shop Again is not available right now.' : null,
  })
  return (
    <form
      className="shop-again"
      onSubmit={(e) => {
        e.preventDefault()
        if (!block) props.onShopAgain()
      }}
    >
      <label className="shop-label" htmlFor={refineId}>
        Refine your search
      </label>
      <div className="shop-form-row">
        <input
          id={refineId}
          className="shop-input"
          type="text"
          value={props.refineText}
          maxLength={200}
          autoComplete="off"
          placeholder="more wood, no glass"
          onChange={(e) => props.onRefineChange(e.target.value)}
        />
        <button type="submit" className="btn btn-primary shop-submit" disabled={block !== null} aria-describedby={block ? `${refineId}-why` : undefined}>
          Shop Again
        </button>
      </div>
      <p id={`${refineId}-why`} className="shop-card-meta">
        {block ?? 'Uses your ratings to find a new batch. Items you have seen are not repeated.'}
      </p>
    </form>
  )
}

function SavedCard({ item, open }: { item: SavedItem; open: OpenProps }) {
  const price = formatPrice(item.price, item.currency)
  return (
    <li className="shop-saved-card">
      <div className="shop-saved-thumb">
        <ProductImage src={item.thumbnail_url} alt={item.title} />
      </div>
      <div className="shop-saved-body">
        <h4 className="shop-saved-title">{item.title}</h4>
        <p className="shop-card-price">{price ?? 'Price not listed'}</p>
        <p className="shop-card-meta">{item.seller}</p>
        {item.topic_label && <p className="shop-card-meta">From “{item.topic_label}”</p>}
        <OpenLink item={item} open={open} />
      </div>
    </li>
  )
}

const SAVED_TABS = [
  { id: 'love', label: 'Loved', empty: 'Nothing loved yet. Choose Love on a result to keep it here.' },
  { id: 'like', label: 'Liked', empty: 'Nothing liked yet. Choose Like on a result to keep it here.' },
] as const

function SavedPanel({ state, props, open }: { state: Extract<ShopState, { status: 'done' }>; props: ShopViewProps; open: OpenProps }) {
  const id = useId()
  const lists = savedLists(state.view.saved, state.view.search?.results ?? [], state.ratings)
  const counts = { love: lists.loved.length, like: lists.liked.length }
  const shown = props.savedTab === 'like' ? lists.liked : lists.loved
  const tab = SAVED_TABS.find((t) => t.id === props.savedTab) ?? SAVED_TABS[0]
  const total = counts.love + counts.like
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    props.onSavedTab(props.savedTab === 'love' ? 'like' : 'love')
    document.getElementById(`${id}-tab-${props.savedTab === 'love' ? 'like' : 'love'}`)?.focus()
  }
  return (
    <section className="shop-saved" aria-labelledby={`${id}-title`}>
      <div className="shop-saved-head">
        <h2 id={`${id}-title`} className="shop-saved-heading">
          Saved <span className="shop-saved-total">({total})</span>
        </h2>
        <button type="button" className="shop-link" aria-expanded={props.savedOpen} aria-controls={`${id}-body`} onClick={props.onToggleSaved}>
          {props.savedOpen ? 'Hide' : 'Show'}
        </button>
      </div>
      <div id={`${id}-body`} hidden={!props.savedOpen}>
        <div className="shop-saved-tabs" role="tablist" aria-label="Saved results" onKeyDown={onKey}>
          {SAVED_TABS.map((t) => (
            <button
              key={t.id}
              id={`${id}-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={props.savedTab === t.id}
              aria-controls={`${id}-panel`}
              tabIndex={props.savedTab === t.id ? 0 : -1}
              className={`shop-saved-tab${props.savedTab === t.id ? ' is-on' : ''}`}
              onClick={() => props.onSavedTab(t.id)}
            >
              {t.label} ({counts[t.id]})
            </button>
          ))}
        </div>
        <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${tab.id}`}>
          {shown.length === 0 ? (
            <p className="shop-empty">{tab.empty}</p>
          ) : (
            <ul className="shop-saved-list">
              {shown.map((item) => (
                <SavedCard key={item.id} item={item} open={open} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}

function Results({ state, props }: { state: Extract<ShopState, { status: 'done' }>; props: ShopViewProps }) {
  const search = state.view.search
  const items = search?.results ?? []
  const short = shortfallLine(search)
  const top = useRef<HTMLDivElement>(null)
  // A new batch from Shop Again scrolls to its top (not after a page refresh).
  useEffect(() => {
    if (!state.fresh || state.batch < 2) return
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    top.current?.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' })
  }, [state.fresh, state.batch, state.view])
  const handlers = { onRate: props.onRate, onComment: props.onComment, onCommentBlur: props.onCommentBlur, onRetryRating: props.onRetryRating }
  const open = { resolved: state.view.resolved, onResolve: props.onResolve }
  return (
    <div className="shop-results" ref={top}>
      {state.banner && <Banner banner={state.banner} />}
      <p className="shop-count" role="status" aria-live="polite">
        {items.length === 0 ? '0 results' : `${items.length} result${items.length === 1 ? '' : 's'} for “${state.request}”`}
        {items.length > 0 && <span className="shop-batch"> · Batch {state.batch}</span>}
      </p>
      {short && items.length > 0 && <p className="shop-short">{short}</p>}
      <Chips state={state} props={props} />
      {items.length === 0 ? (
        <p className="shop-empty">{emptyMessage(search)}</p>
      ) : (
        <>
          <ul className="shop-grid">
            {items.map((item) => (
              <ProductCard key={item.id} item={item} entry={state.ratings[item.id]} handlers={handlers} open={open} />
            ))}
          </ul>
          <AgainBar state={state} props={props} />
        </>
      )}
      <SavedPanel state={state} props={props} open={open} />
    </div>
  )
}
