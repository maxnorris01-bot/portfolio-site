import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { EXAMPLE_REQUESTS, LIMITATIONS_NOTICE, NO_RESULTS_MESSAGE, SHOP_TITLE } from './copy.ts'
import { requestChips } from './chips.ts'
import { COMMENT_MAX, RATING_LABELS, RATING_ORDER, nextRatingForKey, ratedCount, shopAgainBlock, type ItemRating } from './ratings.ts'
import { alsoAtLine, formatPrice, noticesFor, ratingLine, resetText, safeHref, stepSummary, type ShopState } from './state.ts'
import type { ShopViewProps } from './viewprops.ts'
import type { Rating, ShopItem } from './types.ts'

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

export function ProductCard({ item, entry, handlers }: { item: ShopItem; entry?: ItemRating; handlers?: RateHandlers }) {
  const price = formatPrice(item.price, item.currency)
  const rating = ratingLine(item)
  const also = alsoAtLine(item)
  const href = item.link_kind === 'none' ? null : safeHref(item.link)
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
        {href && (
          <a className="btn btn-secondary shop-open" href={href} target="_blank" rel="noopener noreferrer">
            Open<span className="visually-hidden"> {item.title} (opens in a new tab)</span> ↗
          </a>
        )}
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
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!running && value.trim()) onSubmit()
  }

  return (
    <main className="page container shop">
      <p className="eyebrow">Project · Personal shopping assistant</p>
      <h1 className="shop-title">{SHOP_TITLE}</h1>
      <p className="shop-lede">Describe what you want to buy in plain words. It searches Google Shopping, ranks the matches and shows them here.</p>

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
          <button type="submit" className="btn btn-primary shop-submit" disabled={running || !value.trim()}>
            {running ? 'Searching…' : 'Search'}
          </button>
        </div>
        <ul className="chip-list shop-examples" aria-label="Example requests">
          {EXAMPLE_REQUESTS.map((text) => (
            <li key={text}>
              <button type="button" className="chip shop-chip" disabled={running} onClick={() => onExample(text)}>
                {text}
              </button>
            </li>
          ))}
        </ul>
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
            <p>{state.message}</p>
            {state.retryAfterS !== null && <p className="shop-card-meta">You can try again in about {state.retryAfterS} s.</p>}
            {state.request && (
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
    </main>
  )
}

function Banner({ banner }: { banner: NonNullable<Extract<ShopState, { status: 'done' }>['banner']> }) {
  const reset = resetText(banner.resetsAt)
  return (
    <div className="shop-banner" role="alert">
      <p>{banner.message}</p>
      {reset && <p className="shop-card-meta">Your allowance comes back at {reset}.</p>}
      {!reset && banner.retryAfterS !== null && <p className="shop-card-meta">You can try again in about {banner.retryAfterS} s.</p>}
    </div>
  )
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

function Results({ state, props }: { state: Extract<ShopState, { status: 'done' }>; props: ShopViewProps }) {
  const search = state.view.search
  const items = search?.results ?? []
  const notices = noticesFor(search)
  const top = useRef<HTMLDivElement>(null)
  // A new batch from Shop Again scrolls to its top (not after a page refresh).
  useEffect(() => {
    if (!state.fresh || state.batch < 2) return
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    top.current?.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' })
  }, [state.fresh, state.batch, state.view])
  const handlers = { onRate: props.onRate, onComment: props.onComment, onCommentBlur: props.onCommentBlur, onRetryRating: props.onRetryRating }
  return (
    <div className="shop-results" ref={top}>
      {state.banner && <Banner banner={state.banner} />}
      <p className="shop-count" role="status" aria-live="polite">
        {items.length === 0 ? '0 results' : `${items.length} result${items.length === 1 ? '' : 's'} for “${state.request}”`}
        {items.length > 0 && <span className="shop-batch"> · Batch {state.batch}</span>}
      </p>
      {search?.headline && items.length > 0 && <p className="shop-headline">{search.headline}</p>}
      {notices.length > 0 && (
        <ul className="shop-notices">
          {notices.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <Chips state={state} props={props} />
      {items.length === 0 ? (
        <p className="shop-empty">{search?.note || search?.headline || NO_RESULTS_MESSAGE}</p>
      ) : (
        <>
          <ul className="shop-grid">
            {items.map((item) => (
              <ProductCard key={item.id} item={item} entry={state.ratings[item.id]} handlers={handlers} />
            ))}
          </ul>
          <AgainBar state={state} props={props} />
        </>
      )}
    </div>
  )
}
