import { useEffect, useId, useReducer, useRef } from 'react'
import { popoverStep, POPOVER_CLOSED, type PopoverEvent, type PopoverState } from './popover.ts'
import { USAGE_CHIP_LABEL, USAGE_POPOVER_TITLE } from './copy.ts'

export type UsageFigures = { searches: number; again: number; maxSearches: number; maxShopAgains: number; reset: string | null }

/** A gauge: a half circle dial with a needle (18px, currentColor). */
function GaugeIcon() {
  return (
    <svg className="usage-chip-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M4 18a8 8 0 1 1 16 0" />
      <path d="M12 18l4-5" />
    </svg>
  )
}

/**
 * "X of Y" (searches used of the visit's cap) as a small pill that never wraps. It is a button: hover or focus shows, and a click or tap pins,
 * a popover with today's limits; Esc or a click outside closes it. `limited` gives it the limit styling (a cap or maintenance was hit).
 */
export default function UsageChip({ figures, limited, initial }: { figures: UsageFigures; limited: boolean; initial?: PopoverState }) {
  const popId = useId()
  const wrap = useRef<HTMLSpanElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const [state, send] = useReducer(popoverStep, initial ?? POPOVER_CLOSED) as [PopoverState, (e: PopoverEvent) => void]
  useEffect(() => {
    if (!state.open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      send('escape')
      if (wrap.current?.contains(document.activeElement)) button.current?.focus()
    }
    const onDown = (e: Event) => {
      if (e.target instanceof Node && !wrap.current?.contains(e.target)) send('outside')
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [state.open])
  return (
    <span className="usage" ref={wrap} onMouseEnter={() => send('enter')} onMouseLeave={() => send('leave')}>
      <button
        ref={button}
        type="button"
        className={`usage-chip${limited ? ' is-limit' : ''}`}
        aria-expanded={state.open}
        aria-controls={popId}
        aria-haspopup="dialog"
        aria-label={`${USAGE_CHIP_LABEL}: ${figures.searches} of ${figures.maxSearches} searches`}
        onFocus={(e) => e.currentTarget.matches(':focus-visible') && send('focus')}
        onBlur={(e) => !wrap.current?.contains(e.relatedTarget as Node | null) && send('blur')}
        onClick={() => send('click')}
      >
        <GaugeIcon />
        <span className="usage-chip-text">
          {figures.searches} of {figures.maxSearches}
        </span>
      </button>
      <div id={popId} className="usage-pop" role="dialog" aria-label={USAGE_POPOVER_TITLE} hidden={!state.open}>
        <p className="usage-pop-title">{USAGE_POPOVER_TITLE}</p>
        <p>
          Searches: {figures.searches} of {figures.maxSearches}
        </p>
        <p>
          Shop Agains: {figures.again} of {figures.maxShopAgains}
        </p>
        {figures.reset && <p>Daily limit resets at {figures.reset}</p>}
      </div>
    </span>
  )
}
