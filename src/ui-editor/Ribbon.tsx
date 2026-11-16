import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { panel as P } from '../data/uiEditor'
import { Icon, type IconName } from './icons'
import { htmlFields, rowOfPin, svgFields, type Computed, type Field } from './panelfields'
import { STEP_OF, alignButtons, familyOptions, kindOf, pressedAlign } from './ribbonfields'
import { canResize, isSvgElement, labelOf, moveTarget, parentContentWidth, type Session } from './session'
import type { ViewName } from './devices'
import { SIDES, allSidesBy, expandSides, showUniform, sidesText, withSide, type Side } from './sides'
import { HOLD_DELAY, HOLD_EVERY, MIN, STEP, stepAmount, stepped } from './steps'
import { percentOf, showWidth, typedWidth, type WidthUnit } from './units'
import { pickerValue } from './values'
import type { UnlinkedItem } from './vendor/engine.js'

export type { ViewName }

/** The two tabs. A command lives on one tab only. */
export type TabName = 'home' | 'layout'
const TABS: TabName[] = ['home', 'layout']

interface Props {
  session: Session | null
  /** Changes when the preview did (a field's text is read again). */
  rev: number
  /** Changes when a message was shown (a field that was refused shows the real value again). */
  nonce: number
  selected: number | null
  view: ViewName
  /** False for the view-only sizes: every control is off, and `lockedNote` says why. */
  editable: boolean
  lockedNote: string
  link: boolean
  onLink: (on: boolean) => void
  /** The width field's unit for the selected element. */
  unit: WidthUnit
  onUnit: (u: WidthUnit) => void
  /** The unlinked values pinned on the selected element. */
  pins: UnlinkedItem[]
  onSet: (properties: Record<string, string>, label: string) => void
  onBadValue: (label: string) => void
  onMove: (dir: 'up' | 'down') => void
  onNudge: (dx: number, dy: number) => void
  /** The grid over the preview, snapping to it, and the distance between its lines (CSS px): all the page's, none of them remembered. */
  grid: boolean
  onGrid: (on: boolean) => void
  snap: boolean
  onSnap: (on: boolean) => void
  spacing: number
  onSpacing: (n: number) => void
}

const rowId = (name: string) => `ue-f-${name.replace(/\s+/g, '-').toLowerCase()}`

/** The control that was used gets the focus back when the ribbon is drawn again (its inputs are made new for each preview). */
const refocus = { name: null as string | null }

const EMPTY = { fontFamily: '', fontSize: '', fontWeight: '400', color: '', textAlign: 'left', width: '', height: '', padding: '', margin: '', backgroundColor: '', borderTopColor: '', borderTopWidth: '', borderTopStyle: 'none', borderRadius: '', fill: '', stroke: '', strokeWidth: '', textAnchor: 'start' } as Computed

function Dot({ env }: { env: string }) {
  return <span data-dot className="ue-dot" role="img" aria-label={P.dot(env)} title={P.dot(env)} />
}

const Cap = ({ label }: { label: string }) => (P.caps[label] ? <span className="ue-cap" aria-hidden="true">{P.caps[label]}</span> : null)

/** A button that acts on a press and, held, again after HOLD_DELAY and then every HOLD_EVERY ms. A keyboard press (no pointer) acts once. */
function RepeatButton({ label, tip, disabled, onFire, children }: { label: string; tip: string; disabled: boolean; onFire: (shift: boolean) => void; children: ReactNode }) {
  const timer = useRef<{ start?: number; every?: number }>({})
  const fire = useRef(onFire)
  useEffect(() => {
    fire.current = onFire
  })
  const stop = () => {
    window.clearTimeout(timer.current.start)
    window.clearInterval(timer.current.every)
    timer.current = {}
  }
  useEffect(() => stop, [])
  const down = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || disabled) return
    stop()
    const shift = e.shiftKey
    fire.current(shift)
    timer.current.start = window.setTimeout(() => {
      timer.current.every = window.setInterval(() => fire.current(shift), HOLD_EVERY)
    }, HOLD_DELAY)
  }
  return (
    <button
      type="button"
      className="ue-rbtn"
      aria-label={label}
      title={tip}
      disabled={disabled}
      onPointerDown={down}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
      onBlur={stop}
      onClick={(e) => {
        if (e.detail === 0) fire.current(e.shiftKey) // the keyboard; a mouse press has already acted
      }}
    >
      {children}
    </button>
  )
}

/** The number between a stepper's buttons: always a real text input. Enter (or leaving it) commits what was typed. */
function NumberInput({ name, shown, stamp, disabled, wide, describedBy, onCommit }: { name: string; shown: string; stamp: string; disabled: boolean; wide?: boolean; describedBy?: string; onCommit: (text: string) => void }) {
  const done = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  const commit = (text: string) => {
    if (done.current || text === shown) return
    done.current = true
    refocus.name = name
    onCommit(text)
  }
  useEffect(() => {
    if (refocus.name === name) {
      refocus.name = null
      input.current?.focus({ preventScroll: true })
    }
  }, [name])
  return (
    <input
      key={stamp}
      ref={input}
      id={rowId(name)}
      type="text"
      className={`ue-num${wide ? ' is-wide' : ''}`}
      aria-label={name}
      title={name}
      aria-describedby={describedBy}
      defaultValue={shown}
      disabled={disabled}
      spellCheck={false}
      autoComplete="off"
      inputMode="decimal"
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit(e.currentTarget.value)
        }
      }}
      onBlur={(e) => commit(e.currentTarget.value)}
    />
  )
}

/** minus, the number, plus: one click is one edit (and a hold is one per repeat). */
function Stepper({ name, shown, stamp, disabled, step, unit, onStep, onCommit, describedBy }: { name: string; shown: string; stamp: string; disabled: boolean; step: number; unit: string; onStep: (dir: 1 | -1, shift: boolean) => void; onCommit: (text: string) => void; describedBy?: string }) {
  return (
    <span className="ue-stp">
      <RepeatButton label={P.decrease(name)} tip={P.stepTip(P.decrease(name), step, unit)} disabled={disabled} onFire={(s) => onStep(-1, s)}>
        <span aria-hidden="true">−</span>
      </RepeatButton>
      <NumberInput name={name} shown={shown} stamp={stamp} disabled={disabled} describedBy={describedBy} onCommit={onCommit} />
      <RepeatButton label={P.increase(name)} tip={P.stepTip(P.increase(name), step, unit)} disabled={disabled} onFire={(s) => onStep(1, s)}>
        <span aria-hidden="true">+</span>
      </RepeatButton>
    </span>
  )
}

const ALIGN_ICON: Record<string, IconName> = { left: 'alignLeft', start: 'alignLeft', center: 'alignCentre', middle: 'alignCentre', right: 'alignRight', end: 'alignRight', justify: 'alignJustify' }

/** A group of the ribbon: its controls above, its name under them (11 px, sentence case, muted). */
function Group({ id, name, field, children }: { id: string; name: string; field?: string; children: ReactNode }) {
  return (
    <div className="ue-rgroup" role="group" aria-label={name} data-ribbon-group={id} data-field={field}>
      <div className="ue-gc">{children}</div>
      <span className="ue-glabel" data-group-label>
        {name}
      </span>
    </div>
  )
}

const Row = ({ children }: { children: ReactNode }) => <div className="ue-row">{children}</div>

/** A large button (about 56 x 60): the icon above a short label. The accessible name is the label. */
function LargeButton({ icon, label, tip, pressed, disabled, onClick }: { icon: IconName; label: string; tip: string; pressed?: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" className="ue-rbtn ue-lg" aria-label={label} title={tip} aria-pressed={pressed} disabled={disabled} onClick={onClick}>
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  )
}

export default function Ribbon({ session, rev, nonce, selected, view, editable, lockedNote, link, onLink, unit, onUnit, pins, onSet, onBadValue, onMove, onNudge, grid, onGrid, snap, onSnap, spacing, onSpacing }: Props) {
  const el = session && selected !== null ? (session.preview.elements[selected] ?? null) : null
  const svg = !!el && isSvgElement(el)
  const cs = el ? (el.ownerDocument.defaultView!.getComputedStyle(el) as unknown as Computed) : null
  const fields: Field[] = el && cs ? (svg ? svgFields(el, canResize(el), cs) : htmlFields(cs)) : htmlFields(EMPTY)
  const live = !!el && editable
  const env = view === 'Phone' ? 'Phone' : 'Desktop'
  const other = view === 'Phone' ? 'Desktop' : 'Phone'
  const props = fields.map((f) => f.prop)
  const dotRows = new Set(pins.map((p) => rowOfPin(p.property, props)).filter((r): r is string => r !== null))
  const pinEnv = (row: string) => {
    const p = pins.find((q) => rowOfPin(q.property, props) === row)
    return p ? (p.environment === 'phone' ? 'Phone' : 'Desktop') : env
  }
  const up = session && el && selected !== null ? moveTarget(session.preview.model, selected, 'up') : null
  const down = session && el && selected !== null ? moveTarget(session.preview.model, selected, 'down') : null
  const stamp = `${nonce}-${rev}-${selected}-${view}-${unit}`
  // An SVG has no grid to snap to in HTML px: Snap is off there, with one plain line of text.
  const svgDoc = !!session && session.doc.kind === 'svg'

  // The tab that shows, and the Sides popover that is open (padding or margin).
  const [tab, setTab] = useState<TabName>('home')
  const [sidesOpen, setSidesOpen] = useState<'padding' | 'margin' | null>(null)
  const tabRefs = useRef<Record<TabName, HTMLDivElement | null>>({ home: null, layout: null })
  const sidesButtons = useRef<Record<string, HTMLButtonElement | null>>({})
  const popover = useRef<HTMLDivElement>(null)
  const openedBy = useRef<'padding' | 'margin' | null>(null)
  const closeSides = (focusButton: boolean) => {
    const which = openedBy.current
    openedBy.current = null
    setSidesOpen(null)
    if (focusButton && which) sidesButtons.current[which]?.focus()
  }
  const pickTab = (t: TabName, focus: boolean) => {
    setTab(t)
    if (sidesOpen) {
      openedBy.current = null
      setSidesOpen(null)
    }
    if (focus) tabRefs.current[t]?.focus()
  }
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>, t: TabName) => {
    const i = TABS.indexOf(t)
    const to = e.key === 'ArrowRight' ? TABS[(i + 1) % TABS.length] : e.key === 'ArrowLeft' ? TABS[(i + TABS.length - 1) % TABS.length] : e.key === 'Home' ? TABS[0] : e.key === 'End' ? TABS[TABS.length - 1] : null
    if (to) {
      e.preventDefault()
      pickTab(to, true)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      pickTab(t, false)
    }
  }
  // Focus moves into the popover when it opens; a click outside it closes it.
  useEffect(() => {
    if (!sidesOpen) return
    popover.current?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true })
    const away = (e: globalThis.PointerEvent) => {
      const t = e.target as Node
      if (popover.current?.contains(t) || Object.values(sidesButtons.current).some((b) => b?.contains(t))) return
      openedBy.current = null
      setSidesOpen(null)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [sidesOpen])

  // What a stepper click acts on is read from the preview at that moment (a held button repeats on the value the last repeat made).
  const live$ = useRef({ session, selected, unit, svg })
  useEffect(() => {
    live$.current = { session, selected, unit, svg }
  })
  const now = () => {
    const { session: s, selected: i } = live$.current
    const e = s && i !== null ? s.preview.elements[i] : null
    return e ? { el: e, cs: e.ownerDocument.defaultView!.getComputedStyle(e) as unknown as Computed } : null
  }
  const write = (f: Field, text: string, c: Computed) => {
    const out = f.write(text, c)
    if (out) onSet(out, f.label)
    else onBadValue(f.label)
  }
  const stepField = (f: Field, dir: 1 | -1, shift: boolean) => {
    const n = now()
    const key = STEP_OF[f.prop]
    if (!n || !key) return
    if (f.prop === 'width' && !live$.current.svg && live$.current.unit === '%') {
      const pct = percentOf(parseFloat(n.cs.width) || 0, parentContentWidth(n.el))
      return write(f, `${stepped(pct, dir, stepAmount('width', shift, '%'), MIN.width)}%`, n.cs)
    }
    const cur = parseFloat(f.read(n.cs)) || 0
    write(f, `${stepped(cur, dir, stepAmount(key, shift), MIN[key])}px`, n.cs)
  }
  const stepSides = (f: Field, dir: 1 | -1, shift: boolean, side?: Side) => {
    const n = now()
    const key = STEP_OF[f.prop]
    if (!n || !key) return
    const cur = expandSides(f.prop === 'padding' ? n.cs.padding : n.cs.margin) ?? [0, 0, 0, 0]
    const amount = stepAmount(key, shift)
    const next = side ? withSide(cur, side, stepped(cur[SIDES.indexOf(side)], dir, amount, MIN[key])) : allSidesBy(cur, dir * amount, MIN[key])
    write(f, sidesText(next), n.cs)
  }
  const commitSide = (f: Field, side: Side, text: string) => {
    const n = now()
    if (!n) return
    const v = parseFloat(text)
    const cur = expandSides(f.prop === 'padding' ? n.cs.padding : n.cs.margin) ?? [0, 0, 0, 0]
    if (!Number.isFinite(v)) return onBadValue(f.label)
    write(f, sidesText(withSide(cur, side, v)), n.cs)
  }
  const commitText = (f: Field, text: string) => {
    const n = now()
    if (!n) return
    write(f, f.prop === 'width' && !live$.current.svg ? (typedWidth(text, live$.current.unit) ?? text) : text, n.cs)
  }

  const renderField = (f: Field): ReactNode => {
    const kind = kindOf(f.prop, svg)
    const shown = cs ? f.read(cs) : ''
    const dot = dotRows.has(f.prop) ? <Dot env={pinEnv(f.prop)} /> : null
    const wrap = (children: ReactNode, extra?: string) => (
      <div key={f.prop + f.label} className={`ue-rctl${extra ? ` ${extra}` : ''}`} data-field={f.prop}>
        <Cap label={f.label} />
        {children}
        {dot}
      </div>
    )
    if (kind === 'family') {
      return wrap(
        <select key={`${stamp}-f`} id={rowId(f.prop)} aria-label={f.label} title={f.label} className="ue-fam" defaultValue={shown} disabled={!live} onChange={(e) => cs && write(f, e.currentTarget.value, cs)}>
          {familyOptions(shown).map((o, i) => (
            <option key={`${i}-${o.label}`} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>,
      )
    }
    if (kind === 'weight') {
      return wrap(
        <select key={`${stamp}-w`} id={rowId(f.prop)} aria-label={f.label} title={f.label} defaultValue={shown} disabled={!live} onChange={(e) => cs && write(f, e.currentTarget.value, cs)}>
          {(f.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>,
      )
    }
    if (kind === 'colour') {
      const picked = pickerValue(shown)
      return wrap(
        <>
          <NumberInput key={`${stamp}-c`} name={f.label} shown={shown} stamp={stamp} disabled={!live} wide onCommit={(t) => cs && write(f, t, cs)} />
          <ColourSwatch key={`${stamp}-s`} label={P.pick(f.label)} value={picked ?? '#000000'} disabled={!live} onPick={(hex) => cs && write(f, hex, cs)} />
        </>,
        'is-colour',
      )
    }
    if (kind === 'align') {
      const current = cs ? pressedAlign(shown, svg) : ''
      return (
        <div key={f.prop} className="ue-rctl" data-field={f.prop} role="group" aria-label={f.label}>
          <span className="ue-seg">
            {alignButtons(svg).map((b) => (
              <button key={b.value} type="button" className="ue-rbtn" aria-label={b.label} title={b.label} aria-pressed={current === b.value} disabled={!live} onClick={() => cs && write(f, b.value, cs)}>
                <Icon name={ALIGN_ICON[b.value]} />
              </button>
            ))}
          </span>
          {dot}
        </div>
      )
    }
    if (kind === 'sides') {
      const sides = cs ? expandSides(f.prop === 'padding' ? cs.padding : cs.margin) : null
      const key = STEP_OF[f.prop]
      const which = f.prop === 'padding' ? 'padding' : 'margin'
      return (
        <div key={f.prop} className="ue-rctl is-sides" data-field={f.prop}>
          <Cap label={f.label} />
          <Stepper name={f.label} shown={sides ? showUniform(sides) : ''} stamp={stamp} disabled={!live} step={STEP[key]} unit="px" onStep={(d, s) => stepSides(f, d, s)} onCommit={(t) => cs && write(f, t, cs)} />
          <button
            type="button"
            ref={(b) => {
              sidesButtons.current[which] = b
            }}
            className="ue-rbtn ue-sidesbtn"
            aria-label={P.sidesName(f.label)}
            title={P.sidesTip(f.label)}
            aria-expanded={sidesOpen === which}
            disabled={!live}
            onClick={() => {
              if (sidesOpen === which) closeSides(false)
              else {
                openedBy.current = which
                setSidesOpen(which)
              }
            }}
          >
            {P.sides}
          </button>
          {dot}
        </div>
      )
    }
    // width (with its unit) and every other stepper
    const key = STEP_OF[f.prop]
    const isWidth = kind === 'width'
    const parent = el && isWidth ? parentContentWidth(el) : 0
    const text = isWidth && el && cs ? showWidth(parseFloat(cs.width) || 0, parent, unit) : shown
    return wrap(
      <>
        <Stepper name={f.label} shown={text} stamp={stamp} disabled={!live} step={key === 'width' && unit === '%' ? 1 : STEP[key]} unit={isWidth && unit === '%' ? '%' : 'px'} onStep={(d, s) => stepField(f, d, s)} onCommit={(t) => commitText(f, t)} />
        {isWidth && (
          <span className="ue-seg" role="group" aria-label={P.widthUnit}>
            {(['px', '%'] as WidthUnit[]).map((u) => (
              <button key={u} type="button" className="ue-rbtn ue-unit" aria-label={u} aria-pressed={unit === u} title={`${P.widthUnit}: ${u}`} disabled={!live || (u === '%' && parent <= 0)} onClick={() => onUnit(u)}>
                {u}
              </button>
            ))}
          </span>
        )}
      </>,
    )
  }
  /** The control of the field with this label, when the selected element has it (an SVG has fewer). */
  const ctl = (label: string): ReactNode => {
    const f = fields.find((x) => x.label === label)
    return f ? renderField(f) : null
  }
  /** The four sides of padding or margin: a small popover under the Spacing group. */
  const sidesPopover = (label: string): ReactNode => {
    const f = fields.find((x) => x.label === label)
    if (!f || sidesOpen !== (f.prop === 'padding' ? 'padding' : 'margin')) return null
    const sides = cs ? expandSides(f.prop === 'padding' ? cs.padding : cs.margin) : null
    const key = STEP_OF[f.prop]
    return (
      <div
        ref={popover}
        className="ue-popover"
        role="dialog"
        aria-label={P.sidesName(f.label)}
        data-sides-popover
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            closeSides(true)
          }
        }}
      >
        {SIDES.map((side, i) => (
          <span key={side} className="ue-sidec">
            <span className="ue-cap" aria-hidden="true">
              {side[0].toUpperCase()}
            </span>
            <Stepper name={`${f.label} ${side}`} shown={sides ? `${sides[i]}px` : ''} stamp={stamp} disabled={!live} step={STEP[key]} unit="px" onStep={(d, s) => stepSides(f, d, s, side)} onCommit={(t) => commitSide(f, side, t)} />
          </span>
        ))}
      </div>
    )
  }

  const note = !el ? (editable ? P.none : lockedNote) : !editable ? lockedNote : ''
  const tip = svg ? P.svgLink : P.linkHint
  const nudge = (axis: 'X' | 'Y', label: string) => (
    <div className="ue-rctl" key={axis}>
      <Cap label={label} />
      <Stepper
        key={`${stamp}-n${axis}`}
        name={label}
        shown="0"
        stamp={stamp}
        disabled={!live}
        step={STEP.nudge}
        unit="px"
        describedBy="ue-nudge-hint"
        onStep={(d, s) => {
          const a = d * stepAmount('nudge', s)
          if (axis === 'X') onNudge(a, 0)
          else onNudge(0, a)
        }}
        onCommit={(t) => {
          const v = Math.round(Number(t.trim()))
          if (!Number.isFinite(v) || v === 0) return
          if (axis === 'X') onNudge(v, 0)
          else onNudge(0, v)
        }}
      />
    </div>
  )

  return (
    <div className="ue-ribbon" data-ribbon>
      <div className="ue-tabbar">
        <div className="ue-tabs" role="tablist" aria-label={P.tabList}>
          {TABS.map((t) => (
            <div
              key={t}
              ref={(e) => {
                tabRefs.current[t] = e
              }}
              id={`ue-tab-${t}`}
              role="tab"
              className="ue-tab"
              aria-selected={tab === t}
              aria-controls={`ue-panel-${t}`}
              tabIndex={tab === t ? 0 : -1}
              onClick={() => pickTab(t, false)}
              onKeyDown={(e) => onTabKey(e, t)}
            >
              {P.tabs[t]}
            </div>
          ))}
        </div>
        <p data-ribbon-note className="ue-rnote" hidden={!note}>
          {note}
        </p>
        <div className="ue-rend">
          <span className="ue-rlabel" data-selected-label>
            {el && selected !== null && session ? labelOf(session, selected) : ''}
          </span>
          <strong data-env>{view}</strong>
          <label className="ue-linkrow" htmlFor="ue-link" title={tip}>
            <input id="ue-link" type="checkbox" checked={svg ? true : link} disabled={!live || svg} title={tip} onChange={(e) => onLink(e.currentTarget.checked)} />
            {P.linkTo(other)}
          </label>
        </div>
      </div>

      <div className="ue-rpanel" role="tabpanel" id="ue-panel-home" aria-labelledby="ue-tab-home" data-ribbon-panel hidden={tab !== 'home'}>
        <Group id="font" name={P.groups.font}>
          <div className="ue-col">
            <Row>
              {ctl(P.fonts)}
              {ctl(P.fontSize)}
            </Row>
            <Row>
              {ctl(P.fontWeight)}
              {ctl(P.textColour)}
            </Row>
          </div>
        </Group>
        <Group id="paragraph" name={P.groups.paragraph}>
          <Row>{ctl(P.alignment)}</Row>
        </Group>
        <Group id="size" name={P.groups.size}>
          <div className="ue-col">
            <Row>{ctl(P.width)}</Row>
            <Row>{ctl(P.height)}</Row>
          </div>
        </Group>
        <Group id="shape" name={P.groups.shape}>
          <div className="ue-col">
            <Row>
              {ctl(P.background)}
              {ctl(P.borderColour)}
            </Row>
            <Row>
              {ctl(P.borderWidth)}
              {ctl(P.borderRadius)}
            </Row>
          </div>
        </Group>
      </div>

      <div className="ue-rpanel" role="tabpanel" id="ue-panel-layout" aria-labelledby="ue-tab-layout" data-ribbon-panel hidden={tab !== 'layout'}>
        <Group id="spacing" name={P.groups.spacing}>
          <div className="ue-col">
            <Row>{ctl(P.padding)}</Row>
            <Row>{ctl(P.margin)}</Row>
          </div>
          {sidesPopover(P.padding)}
          {sidesPopover(P.margin)}
        </Group>
        <Group id="position" name={P.groups.arrange} field="position">
          <LargeButton icon="moveUp" label={P.moveUp} tip={P.moveUpTip} disabled={!live || !up} onClick={() => onMove('up')} />
          <LargeButton icon="moveDown" label={P.moveDown} tip={P.moveDownTip} disabled={!live || !down} onClick={() => onMove('down')} />
          <div className="ue-col">
            <Row>{nudge('X', P.nudgeX)}</Row>
            <Row>{nudge('Y', P.nudgeY)}</Row>
          </div>
          {dotRows.has('position') && <Dot env={pinEnv('position')} />}
          <span id="ue-nudge-hint" className="ue-sr">
            {P.nudgeHint}
          </span>
        </Group>
        <Group id="grid" name={P.groups.grid}>
          <LargeButton icon="grid" label={P.grid} tip={P.gridTip} pressed={grid} disabled={!live} onClick={() => onGrid(!grid)} />
          <LargeButton icon="snap" label={P.snap} tip={P.snapTip} pressed={snap && !svgDoc} disabled={!live || svgDoc} onClick={() => onSnap(!snap)} />
          <div className="ue-col">
            <Row>
              <select id="ue-spacing" className="ue-spacing" aria-label={P.gridSpacing} title={P.gridSpacingTip} value={spacing} disabled={!live} onChange={(e) => onSpacing(Number(e.currentTarget.value))}>
                {P.spacings.map((n) => (
                  <option key={n} value={n}>
                    {P.spacingOption(n)}
                  </option>
                ))}
              </select>
            </Row>
            {svgDoc && (
              <p className="ue-snapnote" data-snap-note>
                {P.snapNoteSvg}
              </p>
            )}
          </div>
        </Group>
      </div>
    </div>
  )
}

/** The swatch: the browser's own colour picker. It acts once, when the picker is closed (the `change` event), not at every move of its cursor. */
function ColourSwatch({ label, value, disabled, onPick }: { label: string; value: string; disabled: boolean; onPick: (hex: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const latest = useRef(onPick)
  useEffect(() => {
    latest.current = onPick
  })
  useEffect(() => {
    const e = input.current
    if (!e) return
    const on = () => latest.current(e.value)
    e.addEventListener('change', on)
    return () => e.removeEventListener('change', on)
  }, [])
  return <input ref={input} type="color" className="ue-swatch" aria-label={label} title={label} defaultValue={value} disabled={disabled} />
}
