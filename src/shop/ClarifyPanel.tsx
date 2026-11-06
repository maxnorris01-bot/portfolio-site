import { useEffect, useId, useRef, useState, type KeyboardEvent, type MutableRefObject } from 'react'
import { prefersReducedMotion } from './autoscroll.ts'
import { ADVANCE_MS, choiceOutcome, chosen, clampStep, expectsPicture, firstUnanswered, NO_PREFERENCE, panelLocked, roveTo, shouldAutoScroll, type ClarifyUi } from './clarify.ts'
import {
  CLARIFY_BACK,
  CLARIFY_CLOSED,
  CLARIFY_FAILED,
  CLARIFY_LIMIT,
  CLARIFY_NO_PREFERENCE,
  CLARIFY_RETRY,
  CLARIFY_SUB,
  CLARIFY_SUBMIT,
  CLARIFY_SUBMITTED,
  CLARIFY_TITLE,
  clarifyAnnounce,
  clarifyQuestionOf,
} from './copy.ts'
import type { ClarifyQuestion } from './types.ts'

export type ClarifyHandlers = {
  onAnswer: (questionId: string, value: string | null) => void
  onSubmit: () => void
  onRetry: () => void
}

/**
 * The option's picture area (4:3). A picture fades in when it arrives; while the server still checks pictures the area is a quiet tint;
 * a picture that fails to load leaves the area empty (no jump). The label is the button's name, so the area is hidden from readers.
 */
function OptionPicture({ url, label }: { url: string | null; label: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <span className={`clarify-pic${url ? '' : ' is-pending'}`} aria-hidden="true">
      {url && !failed && <img src={url} alt={label} decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />}
    </span>
  )
}

/**
 * The visible question: its text and its tile row as a radio group. Arrow keys move focus between the tiles; Space or Enter chooses
 * (choosing moves the panel on, so the arrows must not choose); choosing the chosen tile again clears it.
 */
function QuestionStep({ q, ui, locked, choose, titleRef }: { q: ClarifyQuestion; ui: ClarifyUi; locked: boolean; choose: (value: string) => void; titleRef: React.RefObject<HTMLHeadingElement | null> }) {
  const headingId = useId()
  const current = chosen(ui, q.id)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const n = q.options.length
  const chosenAt = q.options.findIndex((o) => o.value === current)
  const [focusAt, setFocusAt] = useState<number | null>(null)
  const tabStop = focusAt ?? (chosenAt >= 0 ? chosenAt : 0)
  const onKey = (e: KeyboardEvent) => {
    const next = roveTo(e.key, tabStop, n)
    if (next === null) return
    e.preventDefault()
    setFocusAt(next)
    refs.current[next]?.focus()
  }
  return (
    <div className="clarify-question">
      <h3 id={headingId} ref={titleRef} tabIndex={-1} className="clarify-q-title">
        {q.text}
      </h3>
      <div className="clarify-options" role="radiogroup" aria-labelledby={headingId} onKeyDown={onKey} style={{ '--clarify-n': n } as React.CSSProperties}>
        {q.options.map((o, i) => {
          const picture = expectsPicture(ui.server, o.picture_url)
          return (
            <button
              key={o.value}
              ref={(el) => {
                refs.current[i] = el
              }}
              type="button"
              role="radio"
              aria-checked={current === o.value}
              tabIndex={tabStop === i ? 0 : -1}
              disabled={locked}
              className={`clarify-tile${current === o.value ? ' is-on' : ''}`}
              onFocus={() => setFocusAt(i)}
              onClick={() => choose(o.value)}
            >
              {picture ? (
                <>
                  <OptionPicture url={o.picture_url} label={o.label} />
                  <span className="clarify-label">{o.label}</span>
                </>
              ) : (
                <span className="clarify-pic is-text">
                  <span className="clarify-label">{o.label}</span>
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const NOTES = { closed: CLARIFY_CLOSED, failed: CLARIFY_FAILED, limit: CLARIFY_LIMIT } as const

/**
 * The clarifying questions under the progress steps while the search keeps running, one question at a time. Shown only for a `ready`
 * clarify object (the page decides: `panelVisible`). Everything is optional: with no interaction the backend carries on by itself.
 * `scrolled` says whether the visitor scrolled since the search started; when they did not and the panel arrives below or across the bottom of the window it is scrolled into view once.
 */
export default function ClarifyPanel({ ui, scrolled, ...handlers }: { ui: ClarifyUi; scrolled?: MutableRefObject<boolean> } & ClarifyHandlers) {
  const titleId = useId()
  const rootRef = useRef<HTMLElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const moved = useRef(false)
  const qs = ui.server.questions
  const total = qs.length
  const [at, setAt] = useState(() => firstUnanswered(ui))
  const step = clampStep(at, total)
  const q = qs[step]
  const locked = panelLocked(ui)
  const note = ui.note ?? (ui.server.applied && !ui.submitted ? 'closed' : null)
  const current = chosen(ui, q.id)

  const goTo = (i: number) => {
    clearTimeout(timer.current)
    moved.current = true
    setAt(clampStep(i, total))
  }
  useEffect(() => {
    if (moved.current) titleRef.current?.focus()
    moved.current = false
  }, [step])
  useEffect(() => () => clearTimeout(timer.current), [])

  // Once per search (the panel mounts once per search): scroll it into view when it arrives below the fold and the visitor has not scrolled.
  useEffect(() => {
    const el = rootRef.current
    const r = el?.getBoundingClientRect()
    if (!el || !r || !shouldAutoScroll({ panelTop: r.top, panelBottom: r.bottom, viewportHeight: window.innerHeight, scrolled: scrolled?.current ?? true })) return
    el.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [scrolled])

  const choose = (value: string) => {
    const { answer, advanceTo: next } = choiceOutcome(ui, step, value)
    handlers.onAnswer(q.id, answer)
    clearTimeout(timer.current)
    if (next !== null) {
      const go = () => {
        moved.current = true
        setAt(next)
      }
      if (prefersReducedMotion()) go()
      else timer.current = setTimeout(go, ADVANCE_MS)
    }
  }

  return (
    <section ref={rootRef} className={`card clarify${locked ? ' is-locked' : ''}`} aria-labelledby={titleId}>
      <header className="clarify-head">
        <div className="clarify-head-text">
          <h2 id={titleId} className="clarify-title">
            {CLARIFY_TITLE}
          </h2>
          <p className="clarify-sub">{CLARIFY_SUB}</p>
        </div>
        <div className="clarify-progress">
          <span className="clarify-count">
            {step + 1} of {total}
          </span>
          <div className="clarify-dots" role="group" aria-label="Questions">
            {qs.map((x, i) => (
              <button
                key={x.id}
                type="button"
                className={`clarify-dot${i === step ? ' is-current' : chosen(ui, x.id) !== null ? ' is-answered' : ''}`}
                aria-label={clarifyQuestionOf(i + 1, total)}
                aria-current={i === step ? 'step' : undefined}
                onClick={() => goTo(i)}
              >
                <span aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      </header>
      <p className="visually-hidden" role="status" aria-live="polite">
        {clarifyAnnounce(step + 1, total, q.text)}
      </p>
      <QuestionStep key={q.id} q={q} ui={ui} locked={locked} choose={choose} titleRef={titleRef} />
      <div className="clarify-foot">
        <div className="clarify-foot-left">
          <button type="button" className={`clarify-back${step === 0 ? ' is-hidden' : ''}`} disabled={step === 0} aria-hidden={step === 0 ? true : undefined} tabIndex={step === 0 ? -1 : undefined} onClick={() => goTo(step - 1)}>
            {CLARIFY_BACK}
          </button>
          <button
            type="button"
            className={`chip clarify-nopref${current === NO_PREFERENCE ? ' is-on' : ''}`}
            aria-pressed={current === NO_PREFERENCE}
            disabled={locked}
            onClick={() => choose(NO_PREFERENCE)}
          >
            {CLARIFY_NO_PREFERENCE}
          </button>
        </div>
        <button type="button" className="btn btn-primary clarify-submit" disabled={locked} onClick={handlers.onSubmit}>
          {CLARIFY_SUBMIT}
        </button>
      </div>
      <p className="clarify-note" role="status" aria-live="polite">
        {ui.submitted && note === null ? (
          CLARIFY_SUBMITTED
        ) : note ? (
          <>
            {NOTES[note]}
            {note === 'failed' && (
              <>
                {' '}
                <button type="button" className="shop-link" onClick={handlers.onRetry}>
                  {CLARIFY_RETRY}
                </button>
              </>
            )}
          </>
        ) : null}
      </p>
    </section>
  )
}
