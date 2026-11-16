import { useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { panel as P } from '../data/uiEditor'
import { htmlFields, rowOfPin, svgFields, type Computed, type Field, type Group } from './panelfields'
import { canResize, isSvgElement, labelOf, moveTarget, type Session } from './session'
import type { ViewName } from './devices'
import { pickerValue } from './values'
import type { UnlinkedItem } from './vendor/engine.js'

export type { ViewName }

interface Props {
  session: Session
  /** Changes when the preview did (a field's text is read again). */
  rev: number
  /** Changes when a message was shown (a field that was refused shows the real value again). */
  nonce: number
  selected: number | null
  view: ViewName
  /** False for the view-only sizes: fields and handles are off, and `lockedNote` says why. */
  editable: boolean
  lockedNote: string
  link: boolean
  onLink: (on: boolean) => void
  /** The unlinked values pinned on the selected element. */
  pins: UnlinkedItem[]
  onSet: (properties: Record<string, string>, label: string) => void
  onBadValue: (label: string) => void
  onMove: (dir: 'up' | 'down') => void
  onNudge: (dx: number, dy: number) => void
}

const rowId = (prop: string) => `ue-f-${prop}`

/** The side panel's focus after a change: the field that was used gets it back when the panel is drawn again. */
const refocus = { prop: null as string | null }

function Dot({ env }: { env: string }) {
  return <span data-dot className="ue-dot" role="img" aria-label={P.dot(env)} title={P.dot(env)} />
}

function FieldRow({ field, shown, dot, env, disabled, onCommit }: { field: Field; shown: string; dot: boolean; env: string; disabled: boolean; onCommit: (text: string) => void }) {
  const done = useRef(false)
  const input = useRef<HTMLInputElement | HTMLSelectElement>(null)
  // Once per drawn field: a commit by Enter must not commit again when the field loses focus as it is redrawn.
  const commit = (text: string) => {
    if (done.current || text === shown) return
    done.current = true
    refocus.prop = field.prop
    onCommit(text)
  }
  useEffect(() => {
    if (refocus.prop === field.prop) {
      refocus.prop = null
      input.current?.focus({ preventScroll: true })
    }
  }, [field.prop])
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit(e.currentTarget.value)
    }
  }
  const id = rowId(field.prop)
  const picked = field.control === 'colour' ? pickerValue(shown) : null
  return (
    <div className="ue-row" data-field={field.prop}>
      <label htmlFor={id}>{field.label}</label>
      {field.control === 'select' ? (
        <select id={id} ref={input as RefObject<HTMLSelectElement>} defaultValue={shown} disabled={disabled} onChange={(e) => commit(e.currentTarget.value)}>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input id={id} ref={input as RefObject<HTMLInputElement>} type="text" defaultValue={shown} disabled={disabled} spellCheck={false} autoComplete="off" onKeyDown={onKey} onBlur={(e) => commit(e.currentTarget.value)} />
      )}
      {field.control === 'colour' && (
        <input type="color" className="ue-swatch" aria-label={P.pick(field.label)} defaultValue={picked ?? '#000000'} disabled={disabled} onChange={(e) => commit(e.currentTarget.value)} />
      )}
      {dot && <Dot env={env} />}
    </div>
  )
}

function NudgeRow({ label, disabled, onCommit }: { label: string; disabled: boolean; onCommit: (n: number) => void }) {
  const done = useRef(false)
  const id = `ue-nudge-${label.slice(-1).toLowerCase()}`
  return (
    <div className="ue-row">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        defaultValue="0"
        disabled={disabled}
        autoComplete="off"
        aria-describedby="ue-nudge-hint"
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          const n = Number(e.currentTarget.value.trim())
          if (done.current || !Number.isFinite(n) || n === 0) return
          done.current = true
          onCommit(Math.round(n))
        }}
      />
    </div>
  )
}

const GROUPS: { id: Group; title: string }[] = [
  { id: 'text', title: P.groups.text },
  { id: 'box', title: P.groups.box },
  { id: 'colours', title: P.groups.colours },
]

export default function Panel({ session, rev, nonce, selected, view, editable, lockedNote, link, onLink, pins, onSet, onBadValue, onMove, onNudge }: Props) {
  const el = selected !== null ? (session.preview.elements[selected] ?? null) : null
  const env = view === 'Phone' ? 'Phone' : 'Desktop'
  const other = view === 'Phone' ? 'Desktop' : 'Phone'
  const svg = !!el && isSvgElement(el)
  const cs = el ? (session.preview.doc.defaultView!.getComputedStyle(el) as unknown as Computed) : null
  const fields: Field[] = el && cs ? (svg ? svgFields(el, canResize(el), cs) : htmlFields(cs)) : []
  const dotRows = new Set(pins.map((p) => rowOfPin(p.property, [...fields.map((f) => f.prop)])).filter((r): r is string => r !== null))
  const pinEnv = (row: string) => {
    const p = pins.find((q) => rowOfPin(q.property, fields.map((f) => f.prop)) === row)
    return p ? (p.environment === 'phone' ? 'Phone' : 'Desktop') : env
  }
  const up = el && selected !== null ? moveTarget(session.preview.model, selected, 'up') : null
  const down = el && selected !== null ? moveTarget(session.preview.model, selected, 'down') : null
  const stamp = `${nonce}-${rev}-${selected}-${view}`
  const sections: ReactNode[] = []
  for (const g of GROUPS) {
    const rows = fields.filter((f) => f.group === g.id)
    if (!rows.length) continue
    sections.push(
      <fieldset key={g.id} className="ue-group" disabled={!editable}>
        <legend>{g.title}</legend>
        {rows.map((f) => (
          <FieldRow
            key={`${stamp}-${f.prop}`}
            field={f}
            shown={cs ? f.read(cs) : ''}
            dot={dotRows.has(f.prop)}
            env={pinEnv(f.prop)}
            disabled={!editable}
            onCommit={(text) => {
              const props = cs ? f.write(text, cs) : null
              if (props) onSet(props, f.label)
              else onBadValue(f.label)
            }}
          />
        ))}
      </fieldset>,
    )
  }

  return (
    <aside className="ue-panel" aria-label={P.title}>
      <h2 className="ue-panel-title">{P.title}</h2>
      <p className="ue-env">
        Size: <strong data-env>{view}</strong>
      </p>
      <p className="ue-selected" data-selected-label>
        {el && selected !== null ? labelOf(session, selected) : ''}
      </p>
      <div className="ue-linkrow">
        <input id="ue-link" type="checkbox" checked={svg ? true : link} disabled={!el || svg || !editable} onChange={(e) => onLink(e.currentTarget.checked)} aria-describedby="ue-link-hint" />
        <label htmlFor="ue-link">{P.linkTo(other)}</label>
      </div>
      <p id="ue-link-hint" className="ue-hint">
        {svg ? P.svgLink : P.linkHint}
      </p>
      {!editable && <p className="ue-note">{lockedNote}</p>}
      {!el && <p className="ue-hint">{P.none}</p>}
      {sections}
      {el && (
        <fieldset className="ue-group" data-field="position" disabled={!editable}>
          <legend>
            {P.groups.position}
            {dotRows.has('position') && <Dot env={pinEnv('position')} />}
          </legend>
          <div className="ue-row ue-moves">
            <button type="button" className="btn btn-secondary" disabled={!up} onClick={() => onMove('up')}>
              {P.moveUp}
            </button>
            <button type="button" className="btn btn-secondary" disabled={!down} onClick={() => onMove('down')}>
              {P.moveDown}
            </button>
          </div>
          <NudgeRow key={`${stamp}-x`} label={P.nudgeX} disabled={!editable} onCommit={(n) => onNudge(n, 0)} />
          <NudgeRow key={`${stamp}-y`} label={P.nudgeY} disabled={!editable} onCommit={(n) => onNudge(0, n)} />
          <p id="ue-nudge-hint" className="ue-hint">
            {P.nudgeHint}
          </p>
        </fieldset>
      )}
    </aside>
  )
}
