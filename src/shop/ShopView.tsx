import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import PageHeader from '../components/PageHeader'
import { useWide } from './wide.ts'
import FiltersModal from './FiltersModal.tsx'
import WaitScreensaver from './WaitScreensaver.tsx'
import { activeCount, filterChips, filterChoices, matchCount, NO_FILTERS, sameSelection, serverSelection, toggleOption, viewFacets, type Selection } from './filters.ts'
import type { Pattern } from './screensaver.ts'
import { prefersReducedMotion } from './autoscroll.ts'
import {
  CHIPS_FEWER,
  CHIPS_LABEL,
  chipsMore,
  CLARIFY_SIDE_PROGRESS,
  EXAMPLE_REQUESTS,
  FILTERS_BUTTON,
  AGAIN_HINT,
  FILTERS_SEARCH_LINE,
  filtersMatchLine,
  filtersMatching,
  GUARDRAILS_LABEL,
  GUARDRAILS_NOTE,
  NO_RESULTS_MESSAGE,
  PIPELINE_LABEL,
  PIPELINE_NOTE,
  PIPELINE_STAGES,
  PIPELINE_TITLE,
  SHOP_CHIPS,
  SHOP_DESCRIPTION,
  SHOP_EYEBROW,
  SHOP_TITLE,
  WAIT_NOTE,
} from './copy.ts'
import { CHIP_LIMIT, mergeChips, requestChips, splitChips, type MergedChip } from './chips.ts'
import { defaultUsage, limitText, isLimit, localTime, usageLine } from './limits.ts'
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

/** The running search's progress: the status line with the timer, and the step list. `compact` is the panel's right-column version (a mono SEARCHING label instead of the sentence). */
function ProgressBlock({ state, compact = false }: { state: Extract<ShopState, { status: 'running' }>; compact?: boolean }) {
  return (
    <div className={compact ? 'clarify-progress-block' : 'shop-progress-block'}>
      <p className="shop-progress-head" role="status" aria-live="polite">
        <span className="shop-spinner" aria-hidden="true" />
        {compact && !state.slow ? (
          <span className="shop-caps">{state.kind === 'search' ? CLARIFY_SIDE_PROGRESS : `Finding batch ${state.batch}`}</span>
        ) : (
          <span>
            {state.slow
              ? 'Still working. This one is taking longer than usual…'
              : state.kind === 'shop_again'
                ? `Finding batch ${state.batch} for “${state.request}”…`
                : `Searching for “${state.request}”…`}
          </span>
        )}
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
  )
}

type RunningState = Extract<ShopState, { status: 'running' }>

/**
 * The wait panel: one card while a search runs. The screensaver on the left (above from under 1280px), the step list with the timer and a
 * note on the right. When the results arrive it fades out over 300 ms on top of where the results appear (not with reduced motion).
 */
function WaitPanel({ running, side, pattern }: { running: RunningState | null; side: boolean; pattern?: Pattern }) {
  const [last, setLast] = useState<RunningState | null>(running)
  if (running && running !== last) setLast(running)
  const leaving = !running && last !== null && !prefersReducedMotion()
  const shown = running ?? (leaving ? last : null)
  if (!shown) return null
  return (
    <section
      className={`card wait-panel${side ? ' has-side' : ''}${leaving ? ' is-leaving' : ''}`}
      aria-label="Search progress"
      aria-hidden={leaving ? true : undefined}
      onAnimationEnd={leaving ? () => setLast(null) : undefined}
    >
      <div className="wait-anim">
        <WaitScreensaver key={shown.startedAt} pattern={pattern} />
      </div>
      <div className="wait-side">
        <ProgressBlock state={shown} compact={side} />
        <p className="wait-note">{WAIT_NOTE}</p>
      </div>
    </section>
  )
}

export default function ShopView(props: ShopViewProps) {
  const { state, value, onChange, onSubmit, onExample, onRetry } = props
  const inputId = useId()
  const running = state.status === 'running'
  const blocked = props.meta.blocked.search
  const windowWide = useWide()
  // From 1280px the wait panel has two columns (the animation, then the steps); below it they stack.
  const side = props.wide ?? windowWide
  // Refine search: the chosen options are the NEXT search's. The backend's `filter` chips (refine list) are the source of truth; with none
  // (an older service, a fixture) the choice is local. They survive Shop Again, and reset when the server's chips change or the category does.
  const view = state.status === 'done' ? state.view : null
  const serverSel = serverSelection(view?.refine)
  const category = view?.search?.query?.category ?? null
  const syncKey = `${category ?? ''}|${JSON.stringify(serverSel)}`
  const [chosen, setChosen] = useState<{ key: string; category: string | null; sel: Selection }>({ key: syncKey, category, sel: serverSel ?? props.initialFilters ?? NO_FILTERS })
  if (chosen.key !== syncKey) setChosen({ key: syncKey, category, sel: serverSel ?? (chosen.category === null || chosen.category === category ? chosen.sel : NO_FILTERS) })
  const selection = chosen.sel
  const setSelection = (sel: Selection) => setChosen({ ...chosen, sel })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!running && !blocked && value.trim()) onSubmit()
  }
  const counts = state.status === 'done' ? state.view : state.status === 'running' ? state.prev?.view : null
  const usage = usageLine(props.meta.usage, counts ? { searchCount: counts.search_count, shopAgainsUsed: counts.shop_agains_used } : null)

  return (
    <main className="page">
      <div className="page-container is-scaled shop">
        <PageHeader
          className="has-chips"
          eyebrow={SHOP_EYEBROW}
          title={SHOP_TITLE}
          titleMeta={
            <ul className="chip-list page-chips" aria-label="Tech stack">
              {SHOP_CHIPS.map((c) => (
                <li key={c} className="chip">
                  {c}
                </li>
              ))}
            </ul>
          }
          lead={SHOP_DESCRIPTION}
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
          {state.status === 'idle' && (
            <ul className="chip-list shop-examples" aria-label="Example requests">
              {EXAMPLE_REQUESTS.map((text) => (
                <li key={text}>
                  <button type="button" className="chip shop-chip" disabled={running || blocked} onClick={() => onExample(text)}>
                    {text}
                  </button>
                </li>
              ))}
            </ul>
          )}
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

          <WaitPanel running={state.status === 'running' ? state : null} side={side} pattern={props.waitPattern} />

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

          {state.status === 'done' && <Results state={state} props={props} selection={selection} serverSel={serverSel} onSelection={setSelection} />}
        </section>

        <SearchPipeline usage={props.meta.usage} />
      </div>
    </main>
  )
}

/**
 * How a search works, as a row of stage tiles, then the guardrails (what the service reports for this visit: searches and Shop Agains
 * allowed, when the day's limit resets) beside the caveats. Never a dollar amount.
 */
function SearchPipeline({ usage }: { usage: ShopViewProps['meta']['usage'] }) {
  // The service's figures for this visit when it has reported them, otherwise its defaults (limits.ts): the card always has its rows.
  const u = usage ?? defaultUsage()
  const reset = localTime(u.resetsAt)
  const rows = [
    { label: 'Searches per visit', value: String(u.maxSearches) },
    { label: 'Shop Agains per visit', value: String(u.maxShopAgains) },
    ...(reset ? [{ label: 'Daily limit resets', value: reset }] : []),
  ]
  return (
    <section className="shop-pipeline" aria-labelledby="shop-pipeline-title">
      <h2 id="shop-pipeline-title" className="shop-pipeline-title">
        {PIPELINE_TITLE}
      </h2>
      <h3 className="shop-caps">{PIPELINE_LABEL}</h3>
      <ol className="shop-stages">
        {PIPELINE_STAGES.map((s, i) => (
          <li key={s.name} className="card shop-stage">
            <span className="shop-stage-num">{String(i + 1).padStart(2, '0')}</span>
            <h4>{s.name}</h4>
            <p>{s.caption}</p>
          </li>
        ))}
      </ol>
      <div className="shop-pipeline-foot">
        <div className="shop-guardrails">
          <h3 className="shop-caps">{GUARDRAILS_LABEL}</h3>
          <dl className="card shop-guard-card">
            {rows.map((r) => (
              <div key={r.label} className="shop-guard-row">
                <dt>{r.label}</dt>
                <dd>{r.value}</dd>
              </div>
            ))}
          </dl>
          <p className="shop-pipeline-note">{GUARDRAILS_NOTE}</p>
        </div>
        <p className="shop-pipeline-note">{PIPELINE_NOTE}</p>
      </div>
    </section>
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

function Chips({ state, props, extra, onRemoveFilter }: { state: Extract<ShopState, { status: 'done' }>; props: ShopViewProps; extra: MergedChip[]; onRemoveFilter: (dimension: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const listId = useId()
  const own = mergeChips(requestChips(state.view.search?.query), state.view.clarify_answers ?? [], state.view.refine ?? [])
  const chips = [...own, ...extra]
  if (chips.length === 0) return null
  const { shown, hidden } = splitChips(chips, expanded)
  return (
    <div className="shop-chips">
      <div>
        <p className="shop-chips-title">{CHIPS_LABEL}</p>
        <ul className="chip-list" id={listId} aria-label={CHIPS_LABEL}>
          {shown.map((c) => {
            const remove = c.remove
            return (
              <li key={c.key} className="chip shop-understood" title={c.title}>
                {c.label}
                {remove && (
                  <button
                    type="button"
                    className="shop-chip-x"
                    aria-label={c.title ? `Remove ${c.label} (${c.title})` : `Remove ${c.label}`}
                    onClick={() => (remove.type === 'filter' ? onRemoveFilter(remove.dimension) : remove.type === 'refine' ? props.onRemoveRefine(remove.id) : props.onRemoveContext(remove.kind, remove.value))}
                  >
                    ×
                  </button>
                )}
              </li>
            )
          })}
          {(hidden > 0 || (expanded && chips.length > CHIP_LIMIT)) && (
            <li>
              <button type="button" className="chip shop-chip shop-chip-more" aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded(!expanded)}>
                {expanded ? CHIPS_FEWER : chipsMore(hidden)}
              </button>
            </li>
          )}
        </ul>
      </div>
      {own.some((c) => c.remove) && <p className="shop-card-meta">Changes here apply the next time you press Shop Again.</p>}
    </div>
  )
}

/** Shop Again's own reasons for being off (running is handled by the wait panel: the page has no bar then). */
function againBlockFor(state: Extract<ShopState, { status: 'done' }>, props: ShopViewProps): string | null {
  const items = state.view.search?.results ?? []
  return shopAgainBlock({
    running: false,
    saving: Object.values(state.ratings).some((r) => r.save === 'saving'),
    rated: ratedCount(items.map((i) => i.id), state.ratings),
    used: state.view.shop_agains_used,
    cap: state.view.shop_agains_cap,
    limited: props.meta.blocked.again ? 'Shop Again is not available right now.' : null,
    canShopAgain: state.view.can_shop_again,
  })
}

function AgainBar({ block, props }: { block: string | null; props: ShopViewProps }) {
  const refineId = useId()
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
        {block ?? AGAIN_HINT}
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

function Results({ state, props, selection, serverSel, onSelection }: { state: Extract<ShopState, { status: 'done' }>; props: ShopViewProps; selection: Selection; serverSel: Selection | null; onSelection: (sel: Selection) => void }) {
  const search = state.view.search
  const all = search?.results ?? []
  const { facets, unknown: facetsUnknown } = viewFacets(state.view)
  const active = activeCount(selection)
  const short = shortfallLine(search)
  const match = search?.filters_match
  const top = useRef<HTMLDivElement>(null)
  const filtersButton = useRef<HTMLButtonElement>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  // A new batch from Shop Again scrolls to its top (not after a page refresh).
  useEffect(() => {
    if (!state.fresh || state.batch < 2) return
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    top.current?.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' })
  }, [state.fresh, state.batch, state.view])
  const handlers = { onRate: props.onRate, onComment: props.onComment, onCommentBlur: props.onCommentBlur, onRetryRating: props.onRetryRating }
  const open = { resolved: state.view.resolved, onResolve: props.onResolve }
  // The server's chips (in the refine list) show the choices; the local ones show only when the server has none.
  const chips: MergedChip[] = serverSel ? [] : filterChips(selection, facets).map((c) => ({ key: c.key, label: c.label, remove: { type: 'filter', dimension: c.dimension } }))
  const block = againBlockFor(state, props)
  // The choices are saved (POST /refine) when the dialog closes or Search again is pressed, when they differ from what the server holds.
  const closeModal = () => {
    setFiltersOpen(false)
    if (!sameSelection(selection, serverSel ?? {})) props.onSaveFilters(filterChoices(selection))
  }
  const searchAgain = () => props.onSearchFilters(filterChoices(selection))
  const clear = () => onSelection({})
  const matching = matchCount(all, selection)
  return (
    <div className="shop-results" ref={top}>
      {state.banner && <Banner banner={state.banner} />}
      <div className="shop-count-row">
        <p className="shop-count" role="status" aria-live="polite">
          {all.length === 0 ? '0 results' : `${all.length} result${all.length === 1 ? '' : 's'} for “${state.request}”`}
          {all.length > 0 && <span className="shop-batch"> · Batch {state.batch}</span>}
        </p>
        {facets.length > 0 && all.length > 0 && (
          <button ref={filtersButton} type="button" className="btn btn-secondary filters-button" aria-haspopup="dialog" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(true)}>
            {FILTERS_BUTTON}
            {active > 0 && (
              <span className="filters-badge">
                {active}
                <span className="visually-hidden"> chosen</span>
              </span>
            )}
          </button>
        )}
      </div>
      {match && all.length > 0 && <p className="shop-match">{filtersMatchLine(match.satisfied_all, match.shown)}</p>}
      {short && all.length > 0 && <p className="shop-short">{short}</p>}
      <Chips
        state={state}
        props={props}
        extra={chips}
        onRemoveFilter={(d) => {
          const { [d]: _gone, ...rest } = selection
          void _gone
          onSelection(rest)
        }}
      />
      {all.length === 0 ? (
        <p className="shop-empty">{emptyMessage(search)}</p>
      ) : (
        <>
          <ul className="shop-grid">
            {all.map((item) => (
              <ProductCard key={item.id} item={item} entry={state.ratings[item.id]} handlers={handlers} open={open} />
            ))}
          </ul>
          {active > 0 && (
            <p className="shop-few">
              <button type="button" className="shop-link" disabled={block !== null} onClick={searchAgain}>
                {FILTERS_SEARCH_LINE}
              </button>
              {block && <span className="filters-why"> ({block})</span>}
            </p>
          )}
          <AgainBar block={block} props={props} />
        </>
      )}
      <SavedPanel state={state} props={props} open={open} />
      {filtersOpen && (
        <FiltersModal
          facets={facets}
          unknown={facetsUnknown}
          selection={selection}
          matchText={active > 0 ? filtersMatching(matching) : null}
          onToggle={(d, v) => onSelection(toggleOption(selection, d, v))}
          onClear={clear}
          onClose={closeModal}
          onSearch={() => {
            setFiltersOpen(false)
            searchAgain()
          }}
          block={block}
          returnFocus={filtersButton}
        />
      )}
    </div>
  )
}
