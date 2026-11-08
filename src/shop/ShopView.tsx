import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import PageHeader from '../components/PageHeader'
import { useWide } from './wide.ts'
import FiltersModal from './FiltersModal.tsx'
import ShareModal, { SHARE_BUTTON } from './ShareModal.tsx'
import WaitScreensaver from './WaitScreensaver.tsx'
import UsageChip from './UsageChip.tsx'
import { activeCount, filterChips, filterChoices, matchCount, NO_FILTERS, sameSelection, serverSelection, toggleOption, viewFacets, type Selection } from './filters.ts'
import { prefersReducedMotion } from './autoscroll.ts'
import {
  CHIPS_FEWER,
  CHIPS_LABEL,
  CHOICES_LABEL,
  CHOICES_LIST_LABEL,
  chipsMore,
  CLARIFY_SIDE_PROGRESS,
  EXAMPLE_REQUESTS,
  FILTERS_BUTTON,
  AGAIN_BUTTON,
  AGAIN_HINT,
  SAVED_EMPTY,
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
  SHOP_REPO_URL,
  SHOP_TITLE,
  WAIT_NOTE,
} from './copy.ts'
import { CHIP_LIMIT, mergeChips, refineTextChip, requestChips, splitChips, type MergedChip } from './chips.ts'
import { defaultUsage, limitText, isLimit, localTime, usageLine, usageNumbers } from './limits.ts'
import { openResolved } from './open.ts'
import { checkPrice, hasPrice, NO_PRICE, priceBody, priceInputText, priceLabel, priceNote, samePrice, serverPrice } from './price.ts'
import { openTarget, savedLists, type SavedItem } from './saved.ts'
import { RATING_LABELS, RATING_ORDER, nextRatingForKey, ratedCount, shopAgainBlock, type ItemRating } from './ratings.ts'
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

/**
 * One result card. Its children are the rows of a subgrid (see .shop-card in Shop.css), in a fixed order, so that within one row of cards
 * the same section starts at the same height: image, title, price, store, rating line, extra lines, Open, rating buttons.
 * Every row is always present (an empty cell takes no height unless another card in the row needs it). Rating a card opens nothing;
 * a rating that could not be saved shows its message and Retry under the buttons.
 */
export function ProductCard({ item, entry, handlers, open }: { item: ShopItem; entry?: ItemRating; handlers?: RateHandlers; open?: OpenProps }) {
  const price = formatPrice(item.price, item.currency)
  const rating = ratingLine(item)
  const also = alsoAtLine(item)
  return (
    <li className="shop-card">
      <ProductImage src={item.thumbnail_url} alt={item.title} />
      <h3 className="shop-card-title">{item.title}</h3>
      <p className="shop-card-price">{price ?? 'Price not listed'}</p>
      <div className="shop-cell">
        <p className="shop-card-meta">{item.seller}</p>
      </div>
      <div className="shop-cell">{rating && <p className="shop-card-meta">{rating}</p>}</div>
      <div className="shop-cell shop-extra">
        {item.size_hint && <p className="shop-card-meta">{item.size_hint}</p>}
        {also && <p className="shop-card-meta shop-card-also">{also}</p>}
      </div>
      <div className="shop-open-cell">
        <OpenLink item={item} open={open} />
      </div>
      <div className="shop-rate-cell">
        {handlers && <RatingGroup item={item} entry={entry} onRate={handlers.onRate} />}
        {handlers && entry?.save === 'failed' && (
          <p className="shop-save is-failed" role="alert" title={entry.error ?? undefined}>
            <span>Could not save.</span>{' '}
            <button type="button" className="shop-link" onClick={() => handlers.onRetryRating(item.id)}>
              Retry
            </button>
          </p>
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
function WaitPanel({ running, side }: { running: RunningState | null; side: boolean }) {
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
        <WaitScreensaver key={shown.startedAt} />
      </div>
      <div className="wait-side">
        <ProgressBlock state={shown} compact={side} />
        <p className="wait-note">{WAIT_NOTE}</p>
      </div>
    </section>
  )
}

/** Sliders: two horizontal lines with a knob each (18px, white on the navy button). */
function SlidersIcon() {
  return (
    <svg className="filters-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
      <path d="M3 8h18M3 16h18" />
      <circle cx="9" cy="8" r="2.6" fill="currentColor" />
      <circle cx="15" cy="16" r="2.6" fill="currentColor" />
    </svg>
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
          aside={
            <a href={SHOP_REPO_URL} className="btn btn-secondary shop-github" target="_blank" rel="noreferrer">
              View on GitHub ↗
            </a>
          }
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
          {usage && state.status !== 'done' && (
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

          <WaitPanel running={state.status === 'running' ? state : null} side={side} />

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

function Chips({ state, props, extra, onRemoveFilter, onClearPrice }: { state: Extract<ShopState, { status: 'done' }>; props: ShopViewProps; extra: MergedChip[]; onRemoveFilter: (dimension: string) => void; onClearPrice: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const listId = useId()
  const all = [...mergeChips(requestChips(state.view.search?.query), state.view.clarify_answers ?? [], state.view.refine ?? [], extra.some((c) => c.remove?.type === 'price')), ...extra]
  // The choices made in Refine search sit apart (after a divider) and are never folded into "+N more"; only the other chips overflow.
  const neutral = all.filter((c) => !c.choice)
  const choices = all.filter((c) => c.choice)
  if (all.length === 0) return null
  const { shown, hidden } = splitChips(neutral, expanded)
  const chip = (c: MergedChip, extraClass = '') => {
    const remove = c.remove
    return (
      <li key={c.key} className={`chip shop-understood${extraClass}`} title={c.title}>
        {c.label}
        {remove && (
          <button
            type="button"
            className="shop-chip-x"
            aria-label={c.title ? `Remove ${c.label} (${c.title})` : `Remove ${c.label}`}
            onClick={() => (remove.type === 'text' ? props.onRefineChange('') : remove.type === 'price' ? onClearPrice() : remove.type === 'filter' ? onRemoveFilter(remove.dimension) : remove.type === 'refine' ? props.onRemoveRefine(remove.id) : props.onRemoveContext(remove.kind, remove.value))}
          >
            ×
          </button>
        )}
      </li>
    )
  }
  return (
    <div className="shop-chips">
      {neutral.length > 0 && (
        <ul className="chip-list" id={listId} aria-label={CHIPS_LABEL}>
          {shown.map((c) => chip(c))}
          {(hidden > 0 || (expanded && neutral.length > CHIP_LIMIT)) && (
            <li>
              <button type="button" className="chip shop-chip shop-chip-more" aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded(!expanded)}>
                {expanded ? CHIPS_FEWER : chipsMore(hidden)}
              </button>
            </li>
          )}
        </ul>
      )}
      {choices.length > 0 && (
        <div className="shop-choices">
          <span className="shop-choices-divider" aria-hidden="true" />
          <span className="shop-choices-label">{CHOICES_LABEL}</span>
          <ul className="chip-list" aria-label={CHOICES_LIST_LABEL}>
            {choices.map((c) => chip(c, ' is-choice'))}
          </ul>
        </div>
      )}
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

/** One saved result in the row: a 40px picture, the title on one line, the price. A link that opens like SavedCard's Open (the store link, looked up on click when it is Google's page). */
function SavedMini({ item, open }: { item: SavedItem; open: OpenProps }) {
  const price = formatPrice(item.price, item.currency)
  const { href, needsResolve } = openTarget(item, open.resolved, safeHref)
  const inner = (
    <>
      <span className="shop-mini-thumb">
        <ProductImage src={item.thumbnail_url} alt="" />
      </span>
      <span className="shop-mini-text">
        <span className="shop-mini-title">{item.title}</span>
        <span className="shop-mini-price">{price ?? 'Price not listed'}</span>
      </span>
    </>
  )
  return (
    <li className="shop-mini">
      {href ? (
        <a
          className="shop-mini-link"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title={item.title}
          onClick={needsResolve ? (e) => openResolved(e, item.link, () => open.onResolve(item.id)) : undefined}
        >
          {inner}
          <span className="visually-hidden"> (opens in a new tab)</span>
        </a>
      ) : (
        <span className="shop-mini-link" title={item.title}>
          {inner}
        </span>
      )}
    </li>
  )
}

const SAVED_TABS = [
  { id: 'love', label: 'Loved' },
  { id: 'like', label: 'Liked' },
] as const

/**
 * The Saved row, a card under the results header: the heading, the Loved / Liked tabs, one scrolling row of compact items, and "Show all ›",
 * which opens the full list (cards) below the row. Always shown on the results page.
 */
function SavedRow({ state, props, open }: { state: Extract<ShopState, { status: 'done' }>; props: ShopViewProps; open: OpenProps }) {
  const id = useId()
  const lists = savedLists(state.view.saved, state.view.search?.results ?? [], state.ratings)
  const counts = { love: lists.loved.length, like: lists.liked.length }
  const shown = props.savedTab === 'like' ? lists.liked : lists.loved
  const tab = SAVED_TABS.find((t) => t.id === props.savedTab) ?? SAVED_TABS[0]
  const total = counts.love + counts.like
  const expanded = props.savedOpen && shown.length > 0
  const [shareOpen, setShareOpen] = useState(false)
  const shareButton = useRef<HTMLButtonElement>(null)
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const next = props.savedTab === 'love' ? 'like' : 'love'
    props.onSavedTab(next)
    document.getElementById(`${id}-tab-${next}`)?.focus()
  }
  return (
    <section className="card shop-saved" aria-labelledby={`${id}-title`}>
      <div className="shop-saved-row">
        <h2 id={`${id}-title`} className="shop-saved-heading">
          Saved <span className="shop-saved-total">({total})</span>
        </h2>
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
        <div id={`${id}-panel`} className="shop-saved-strip" role="tabpanel" aria-labelledby={`${id}-tab-${tab.id}`}>
          {shown.length === 0 ? (
            <p className="shop-saved-empty">{SAVED_EMPTY}</p>
          ) : (
            <ul className="shop-mini-list">
              {shown.map((item) => (
                <SavedMini key={item.id} item={item} open={open} />
              ))}
            </ul>
          )}
        </div>
        <div className="shop-saved-side">
          <button ref={shareButton} type="button" className="shop-saved-share" aria-haspopup="dialog" aria-expanded={shareOpen} onClick={() => setShareOpen(true)}>
            {SHARE_BUTTON(total)}
          </button>
          {shown.length > 0 && (
            <button type="button" className="shop-link shop-saved-toggle" aria-expanded={expanded} aria-controls={`${id}-all`} onClick={props.onToggleSaved}>
              {expanded ? 'Show fewer ‹' : 'Show all ›'}
            </button>
          )}
        </div>
      </div>
      <div id={`${id}-all`} className="shop-saved-all" hidden={!expanded}>
        <ul className="shop-saved-list">
          {shown.map((item) => (
            <SavedCard key={item.id} item={item} open={open} />
          ))}
        </ul>
      </div>
      {shareOpen && <ShareModal lists={lists} resolved={state.view.resolved} query={state.request} onClose={() => setShareOpen(false)} returnFocus={shareButton} />}
    </section>
  )
}

function Results({ state, props, selection, serverSel, onSelection }: { state: Extract<ShopState, { status: 'done' }>; props: ShopViewProps; selection: Selection; serverSel: Selection | null; onSelection: (sel: Selection) => void }) {
  const search = state.view.search
  const all = search?.results ?? []
  const { facets, unknown: facetsUnknown } = viewFacets(state.view)
  // The refine text counts as one choice (it is shown as a chip and in the badge).
  const textChip = refineTextChip(props.refineText)
  // The price range typed in Refine search: local until Shop Again with these or closing the dialog, like the tiles. The server's `price` chip
  // is the source of truth and resets it when it changes.
  const heldPrice = serverPrice(state.view.refine)
  const priceKey = JSON.stringify(heldPrice)
  const [priceDraft, setPriceDraft] = useState(() => {
    const start = heldPrice ?? props.initialPrice ?? NO_PRICE
    return { key: priceKey, min: priceInputText(start.min), max: priceInputText(start.max) }
  })
  if (priceDraft.key !== priceKey) setPriceDraft({ key: priceKey, min: priceInputText(heldPrice?.min ?? null), max: priceInputText(heldPrice?.max ?? null) })
  const priceCheck = checkPrice(priceDraft.min, priceDraft.max)
  const priceValid = !priceCheck.errors.min && !priceCheck.errors.max
  // With a bad entry the range in force is the one the server holds.
  const price = priceValid ? priceCheck.range : (heldPrice ?? NO_PRICE)
  const priceChanged = priceValid && !samePrice(priceCheck.range, heldPrice ?? NO_PRICE)
  const active = activeCount(selection) + (textChip ? 1 : 0) + (hasPrice(price) ? 1 : 0)
  const short = shortfallLine(search)
  const limitedBy = priceNote(search?.price_filter)
  const match = search?.filters_match
  const top = useRef<HTMLDivElement>(null)
  const whyId = useId()
  const filtersButton = useRef<HTMLButtonElement>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  // A new batch from Shop Again scrolls to its top (not after a page refresh).
  useEffect(() => {
    if (!state.fresh || state.batch < 2) return
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    top.current?.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' })
  }, [state.fresh, state.batch, state.view])
  const handlers = {
    onRate: (id: string, rating: Rating | null) => props.onRate(id, rating),
    onRetryRating: props.onRetryRating,
  }
  const open = { resolved: state.view.resolved, onResolve: props.onResolve }
  // The server's chips (in the refine list) show the choices; the local ones show only when the server has none.
  const chips: MergedChip[] = [...(serverSel ? [] : filterChips(selection, facets).map((c): MergedChip => ({ key: c.key, label: c.label, choice: true, remove: { type: 'filter', dimension: c.dimension } }))), ...(textChip ? [textChip] : []), ...(!heldPrice && hasPrice(price) ? [{ key: 'price-local', label: priceLabel(price), choice: true, remove: { type: 'price' } } satisfies MergedChip] : [])]
  const block = againBlockFor(state, props)
  // The choices are saved (POST /refine) when the dialog closes or Shop Again with these is pressed, when they differ from what the server holds.
  const changed = !sameSelection(selection, serverSel ?? {})
  // Only what changed is sent: the filters when the tiles changed, the price when Min or Max did (`{}` clears it); an invalid price is never sent.
  const sendFilters = changed ? filterChoices(selection) : undefined
  const sendPrice = priceChanged ? priceBody(priceCheck.range) : undefined
  const closeModal = () => {
    setFiltersOpen(false)
    if (changed || priceChanged) props.onSaveFilters(sendFilters, sendPrice)
  }
  const shopAgainWithThese = () => (changed || priceChanged ? props.onSearchFilters(sendFilters, sendPrice) : props.onShopAgain())
  const clear = () => {
    onSelection({})
    props.onRefineChange('')
    setPriceDraft({ ...priceDraft, min: '', max: '' })
  }
  const matching = matchCount(all, selection, price)
  const usageFigures = usageNumbers(props.meta.usage, { searchCount: state.view.search_count, shopAgainsUsed: state.view.shop_agains_used })
  const limited = props.meta.blocked.search || props.meta.blocked.again || props.meta.maintenance || (usageFigures !== null && usageFigures.searches >= usageFigures.maxSearches)
  return (
    <div className="shop-results" ref={top}>
      {state.banner && <Banner banner={state.banner} />}
      <header className="shop-head">
        <div className="shop-head-top">
          <div className="shop-head-left">
            <p className="shop-count" role="status" aria-live="polite">
              {all.length === 0 ? '0 results' : `${all.length} result${all.length === 1 ? '' : 's'} for “${state.request}”`}
            </p>
            {all.length > 0 && <span className="shop-batch">Batch {state.batch}</span>}
            {match && all.length > 0 && <p className="shop-match">{filtersMatchLine(match.satisfied_all)}</p>}
          </div>
          <div className="shop-head-right">
            <div className="shop-head-cluster">
              {usageFigures && <UsageChip figures={usageFigures} limited={limited} />}
              {all.length > 0 && (
                <>
                  <button ref={filtersButton} type="button" className="filters-button" aria-haspopup="dialog" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(true)}>
                    <SlidersIcon />
                    {FILTERS_BUTTON}
                    {active > 0 && (
                      <span className="filters-badge">
                        {active}
                        <span className="visually-hidden"> chosen</span>
                      </span>
                    )}
                  </button>
                  <button type="button" className="btn btn-primary shop-again-button" title={AGAIN_HINT} disabled={block !== null} aria-describedby={block ? whyId : undefined} onClick={props.onShopAgain}>
                    {AGAIN_BUTTON}
                  </button>
                </>
              )}
            </div>
            {block && all.length > 0 && (
              <p id={whyId} className="shop-head-why">
                {block}
              </p>
            )}
          </div>
        </div>
        {short && all.length > 0 && <p className="shop-short">{short}</p>}
        {limitedBy && all.length > 0 && <p className="shop-price-note">{limitedBy}</p>}
        <Chips
          state={state}
          props={props}
          extra={chips}
          onRemoveFilter={(d) => {
            const { [d]: _gone, ...rest } = selection
            void _gone
            onSelection(rest)
          }}
          onClearPrice={() => setPriceDraft({ ...priceDraft, min: '', max: '' })}
        />
      </header>
      <SavedRow state={state} props={props} open={open} />
      {all.length === 0 ? (
        <p className="shop-empty">{emptyMessage(search)}</p>
      ) : (
        <ul className="shop-grid">
          {all.map((item) => (
            <ProductCard key={item.id} item={item} entry={state.ratings[item.id]} handlers={handlers} open={open} />
          ))}
        </ul>
      )}
      {filtersOpen && (
        <FiltersModal
          facets={facets}
          unknown={facetsUnknown}
          selection={selection}
          refineText={props.refineText}
          onRefineChange={props.onRefineChange}
          priceMin={priceDraft.min}
          priceMax={priceDraft.max}
          onPriceChange={(field, value) => setPriceDraft({ ...priceDraft, [field]: value })}
          priceErrors={priceCheck.errors}
          matchText={activeCount(selection) > 0 || hasPrice(price) ? filtersMatching(matching) : null}
          onToggle={(d, v) => onSelection(toggleOption(selection, d, v))}
          onClear={clear}
          onClose={closeModal}
          onSearch={() => {
            setFiltersOpen(false)
            shopAgainWithThese()
          }}
          block={block}
          returnFocus={filtersButton}
        />
      )}
    </div>
  )
}
