import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { anyPicture, chosen, expectsPicture, NO_PREFERENCE, panelLocked, type ClarifyUi } from './clarify.ts'
import {
  CLARIFY_CLOSED,
  CLARIFY_FAILED,
  CLARIFY_LIMIT,
  CLARIFY_NO_PREFERENCE,
  CLARIFY_RETRY,
  CLARIFY_SUB,
  CLARIFY_SUBMIT,
  CLARIFY_SUBMITTED,
  CLARIFY_TITLE,
} from './copy.ts'
import type { ClarifyQuestion } from './types.ts'

export type ClarifyHandlers = {
  onAnswer: (questionId: string, value: string | null) => void
  onSubmit: () => void
  onRetry: () => void
}

/** The option's picture, faded in when it arrives. A picture that fails to load leaves the reserved area empty (no jump). */
function OptionPicture({ url, label }: { url: string | null; label: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <span className="clarify-pic" aria-hidden={url ? undefined : true}>
      {url && !failed && <img src={url} alt={label} decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />}
    </span>
  )
}

/** One question as a radio group: arrow keys move and choose, Tab leaves the group; choosing the chosen option again clears it. */
export function QuestionCard({ q, ui, locked, handlers }: { q: ClarifyQuestion; ui: ClarifyUi; locked: boolean; handlers: ClarifyHandlers }) {
  const headingId = useId()
  const current = chosen(ui, q.id)
  const values = [...q.options.map((o) => o.value), NO_PREFERENCE]
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const focusable = current !== null && values.includes(current) ? values.indexOf(current) : 0
  const choose = (value: string) => handlers.onAnswer(q.id, current === value ? null : value)
  const onKey = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!step || locked) return
    e.preventDefault()
    const at = current !== null && values.includes(current) ? values.indexOf(current) : step > 0 ? -1 : 0
    const next = (at + step + values.length) % values.length
    handlers.onAnswer(q.id, values[next])
    refs.current[next]?.focus()
  }
  return (
    <li className="card clarify-q">
      <h3 id={headingId} className="clarify-q-title">
        {q.text}
      </h3>
      <div className="clarify-options" role="radiogroup" aria-labelledby={headingId} onKeyDown={onKey}>
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
              tabIndex={focusable === i ? 0 : -1}
              disabled={locked}
              className={`clarify-tile${current === o.value ? ' is-on' : ''}${picture ? ' has-pic' : ''}`}
              onClick={() => choose(o.value)}
            >
              {picture && <OptionPicture url={o.picture_url} label={o.label} />}
              <span className="clarify-label">{o.label}</span>
            </button>
          )
        })}
        <button
          ref={(el) => {
            refs.current[q.options.length] = el
          }}
          type="button"
          role="radio"
          aria-checked={current === NO_PREFERENCE}
          tabIndex={focusable === q.options.length ? 0 : -1}
          disabled={locked}
          className={`chip clarify-nopref${current === NO_PREFERENCE ? ' is-on' : ''}`}
          onClick={() => choose(NO_PREFERENCE)}
        >
          {CLARIFY_NO_PREFERENCE}
        </button>
      </div>
    </li>
  )
}

const NOTES = { closed: CLARIFY_CLOSED, failed: CLARIFY_FAILED, limit: CLARIFY_LIMIT } as const

/**
 * The clarifying questions under the search form while the search keeps running. Shown only for a `ready` clarify object; the page
 * decides that (`panelVisible`). Everything is optional: with no interaction the backend carries on by itself.
 */
export default function ClarifyPanel({ ui, ...handlers }: { ui: ClarifyUi } & ClarifyHandlers) {
  const titleId = useId()
  const locked = panelLocked(ui)
  const { server } = ui
  const note = ui.note ?? (server.applied && !ui.submitted ? 'closed' : null)
  const reserved = anyPicture(server)
  return (
    <section className={`clarify${reserved ? ' has-pictures' : ''}${locked ? ' is-locked' : ''}`} aria-labelledby={titleId}>
      <h2 id={titleId} className="clarify-title">
        {CLARIFY_TITLE}
      </h2>
      <p className="clarify-sub">{CLARIFY_SUB}</p>
      <ol className="clarify-grid">
        {server.questions.map((q) => (
          <QuestionCard key={q.id} q={q} ui={ui} locked={locked} handlers={handlers} />
        ))}
      </ol>
      <div className="clarify-foot">
        <button type="button" className="btn btn-primary clarify-submit" disabled={locked} onClick={handlers.onSubmit}>
          {CLARIFY_SUBMIT}
        </button>
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
      </div>
    </section>
  )
}
