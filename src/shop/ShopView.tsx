import { useEffect, useId, useState, type FormEvent } from 'react'
import { EXAMPLE_REQUESTS, LIMITATIONS_NOTICE, NO_RESULTS_MESSAGE, SHOP_TITLE } from './copy.ts'
import { alsoAtLine, formatPrice, noticesFor, ratingLine, safeHref, stepSummary, type ShopState } from './state.ts'
import type { ShopViewProps } from './viewprops.ts'
import type { ShopItem } from './types.ts'

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

export function ProductCard({ item }: { item: ShopItem }) {
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

export default function ShopView({ state, value, onChange, onSubmit, onExample, onRetry }: ShopViewProps) {
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
                {state.slow ? 'Still working. This one is taking longer than usual…' : `Searching for “${state.request}”…`}
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

        {state.status === 'done' && <Results state={state} />}
      </section>

      <aside className="shop-about" aria-label="About this tool">
        <p>{LIMITATIONS_NOTICE}</p>
      </aside>
    </main>
  )
}

function Results({ state }: { state: Extract<ShopState, { status: 'done' }> }) {
  const search = state.view.search
  const items = search?.results ?? []
  const notices = noticesFor(search)
  return (
    <div className="shop-results">
      <p className="shop-count" role="status" aria-live="polite">
        {items.length === 0 ? '0 results' : `${items.length} result${items.length === 1 ? '' : 's'} for “${state.request}”`}
      </p>
      {search?.headline && items.length > 0 && <p className="shop-headline">{search.headline}</p>}
      {notices.length > 0 && (
        <ul className="shop-notices">
          {notices.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {items.length === 0 ? (
        <p className="shop-empty">{search?.note || search?.headline || NO_RESULTS_MESSAGE}</p>
      ) : (
        <ul className="shop-grid">
          {items.map((item) => (
            <ProductCard key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  )
}
