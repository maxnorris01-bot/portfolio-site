import { useEffect, useId, useRef, useState } from 'react'
import type { NearMiss } from '../../api/satellite/summary'
import { relativeTime } from '../globe/conjunctions'
import './ConjunctionsMenu.css'

const km = (n: number) => `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} km`
const utc = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }) + ' UTC'

/**
 * "Show conjunctions": a button in the row above the map that opens a list
 * of the run's closest approaches right under it, over the map's top right.
 * Choosing a row selects the pair and moves the clock to its closest approach
 * (the page's replay); the list closes on that, on Escape and on a click
 * outside it.
 */
export default function ConjunctionsMenu({
  rows,
  failed,
  selectedKey,
  keyOf,
  onSelect,
}: {
  /** The closest approaches, closest first; null while they load. */
  rows: NearMiss[] | null
  failed: boolean
  selectedKey: string | null
  keyOf: (n: NearMiss) => string
  onSelect: (n: NearMiss) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listId = useId()
  // The relative times are against the present; read once per opening.
  const [now, setNow] = useState(0)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const close = (refocus: boolean) => {
    setOpen(false)
    if (refocus) buttonRef.current?.focus()
  }

  return (
    <div
      ref={rootRef}
      className="conj-menu"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          // Only the list closes: full screen and the satellite view keep their own Escape.
          e.preventDefault()
          e.stopPropagation()
          close(true)
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="conj-menu-btn"
        aria-expanded={open}
        aria-controls={listId}
        aria-pressed={open}
        onClick={() => {
          setNow(Date.now())
          setOpen((o) => !o)
        }}
      >
        Show conjunctions
        <span aria-hidden="true" className="conj-menu-caret">
          {open ? '▴' : '▾'}
        </span>
      </button>
      <div id={listId} className="conj-menu-pop" role="region" aria-label="Closest conjunctions" hidden={!open}>
        {open && (
          <>
            <p className="conj-menu-head">Closest approaches in the latest run</p>
            {rows === null ? (
              <p className="conj-menu-note" role={failed ? 'alert' : undefined}>
                {failed ? 'The conjunctions couldn’t be loaded right now.' : 'Loading conjunctions…'}
              </p>
            ) : rows.length === 0 ? (
              <p className="conj-menu-note">No conjunctions in this run.</p>
            ) : (
              <ol className="conj-menu-list">
                {rows.map((n) => {
                  const key = keyOf(n)
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        className="conj-menu-row"
                        aria-current={key === selectedKey || undefined}
                        onClick={() => {
                          onSelect(n)
                          close(false)
                        }}
                      >
                        <span className="conj-menu-pair">
                          <span>{n.object_a.name}</span>
                          <span>{n.object_b.name}</span>
                        </span>
                        <span className="conj-menu-miss">{km(n.miss_distance_km)}</span>
                        <span className="conj-menu-time">
                          {utc(n.tca_utc)}
                          <span className="conj-menu-rel"> · {relativeTime(Date.parse(n.tca_utc) - now)}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            )}
          </>
        )}
      </div>
    </div>
  )
}
