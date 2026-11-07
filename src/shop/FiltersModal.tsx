import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { FILTERS_CLEAR_ALL, FILTERS_CLOSE, FILTERS_INTRO, FILTERS_SEARCH, FILTERS_TITLE } from './copy.ts'
import { trapTab, unknownLine, type Selection } from './filters.ts'
import { hasIcon, iconUrl } from './icons/index.ts'
import type { Facet, FacetOption } from './types.ts'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** The option's picture: swatch circles, or the shipped drawing for its icon key, or nothing (the tile is then label-only, same height). */
function TileVisual({ option }: { option: FacetOption }) {
  const [failed, setFailed] = useState(false)
  if (option.swatches?.length) {
    return (
      <span className="filter-pic is-swatch" aria-hidden="true">
        {option.swatches.map((c) => (
          <span key={c} className="filter-swatch" style={{ background: c }} />
        ))}
      </span>
    )
  }
  const url = option.icon && hasIcon(option.icon) ? iconUrl(option.icon) : null
  if (url && !failed) {
    return (
      <span className="filter-pic is-icon" aria-hidden="true">
        <img src={url} alt="" decoding="async" onError={() => setFailed(true)} />
      </span>
    )
  }
  return <span className="filter-pic is-none" aria-hidden="true" />
}

export function FilterTile({ option, on, onToggle }: { option: FacetOption; on: boolean; onToggle: () => void }) {
  return (
    <button type="button" className={`filter-tile${on ? ' is-on' : ''}`} aria-pressed={on} onClick={onToggle}>
      <TileVisual option={option} />
      <span className="filter-label">
        {option.label} <span className="filter-count">({option.count})</span>
      </span>
    </button>
  )
}

export type FiltersModalProps = {
  facets: Facet[]
  unknown?: Record<string, number>
  selection: Selection
  /** "N of the current results match" (null with nothing chosen: no line). */
  matchText: string | null
  onToggle: (dimension: string, value: string) => void
  onClear: () => void
  onClose: () => void
  /** Search again with the choices; `block` says why it is off (Shop Again's own reasons), null when on. */
  onSearch: () => void
  block: string | null
  /** Where focus returns when the dialog closes. */
  returnFocus: RefObject<HTMLElement | null>
}

/** The dialog's markup (the modal below adds the portal, focus and keys): sections from the facets, toggle tiles, a fixed footer with Search again. */
export function FiltersDialog({ p, titleId, dialogRef, onKeyDown }: { p: FiltersModalProps; titleId: string; dialogRef?: RefObject<HTMLDivElement | null>; onKeyDown?: (e: KeyboardEvent) => void }) {
  return (
    <div className="filters-backdrop" onMouseDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <div ref={dialogRef} className="filters-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown}>
        <header className="filters-head">
          <h2 id={titleId} className="filters-title">
            {FILTERS_TITLE}
          </h2>
          <p className="filters-intro">{FILTERS_INTRO}</p>
        </header>
        <div className="filters-body">
          {p.facets.map((f) => {
            const note = unknownLine(f, p.unknown)
            return (
              <section key={f.dimension} className="filters-section" aria-label={f.title}>
                <h3 className="filters-section-title">{f.title}</h3>
                <div className="filters-tiles">
                  {f.options.map((o) => (
                    <FilterTile key={o.value} option={o} on={(p.selection[f.dimension] ?? []).includes(o.value)} onToggle={() => p.onToggle(f.dimension, o.value)} />
                  ))}
                </div>
                {note && <p className="filters-unknown">{note}</p>}
              </section>
            )
          })}
        </div>
        <footer className="filters-foot">
          {p.matchText && (
            <p className="filters-match" role="status">
              {p.matchText}
            </p>
          )}
          {p.block && <p className="filters-why">{p.block}</p>}
          <div className="filters-actions">
            <button type="button" className="btn btn-secondary" onClick={p.onClear} disabled={Object.keys(p.selection).length === 0}>
              {FILTERS_CLEAR_ALL}
            </button>
            <button type="button" className="btn btn-secondary" onClick={p.onClose}>
              {FILTERS_CLOSE}
            </button>
            <button type="button" className="btn btn-primary filters-show" disabled={p.block !== null} onClick={p.onSearch}>
              {FILTERS_SEARCH}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

/**
 * The Filters dialog: focus moves in on open, Tab is trapped, Esc closes, focus goes back to the button. Rendered in the body, outside the
 * page's scaled container, so its fixed position is the window's.
 */
export default function FiltersModal(p: FiltersModalProps) {
  const titleId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const { returnFocus, onClose } = p

  useEffect(() => {
    const back = returnFocus.current
    rootRef.current?.focus()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
      back?.focus()
    }
  }, [returnFocus])

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key !== 'Tab') return
    const items = [...(rootRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
    const to = trapTab(items.indexOf(document.activeElement as HTMLElement), items.length, e.shiftKey)
    if (to === null) return
    e.preventDefault()
    items[to]?.focus()
  }

  return createPortal(<FiltersDialog p={p} titleId={titleId} dialogRef={rootRef} onKeyDown={onKey} />, document.body)
}
