import { Children, Fragment, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { labels, messages, panel as P } from '../data/uiEditor'
import { Icon, type IconName } from './icons'
import { MenuButton, type MenuPart } from './Menu'
import { getRecents, recordRecent, subscribeRecents } from './recents'
import { DASHES, DIRECTIONS, DOUBLE_MIN, EFFECTS, FONT_SIZES, LINE_SPACINGS, OUTLINE_WEIGHTS, STANDARD_COLOURS, gradientCss, colourGrid, hexTyped, opaqueHex, pageColours, readGradient, type Gradient } from './menus'
import { htmlFields, svgFields, type Computed, type Field } from './panelfields'
import { STEP_OF, alignButtons, familyChoices, kindOf, pressedAlign } from './ribbonfields'
import { PATH_MAX, chainOf, visiblePath } from './path'
import { canResize, isSvgElement, labelOf, moveTarget, parentContentWidth, type Session } from './session'
import type { ViewName } from './devices'
import { SIDES, allSidesBy, expandSides, showUniform, sidesText, withSide, type Side } from './sides'
import { HOLD_DELAY, HOLD_EVERY, MIN, STEP, stepAmount, stepped } from './steps'
import { percentOf, showWidth, typedWidth, type WidthUnit } from './units'

export type { ViewName }

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
  /** The width field's unit for the selected element. */
  unit: WidthUnit
  onUnit: (u: WidthUnit) => void
  onSet: (properties: Record<string, string>, label: string) => void
  onBadValue: (label: string) => void
  /** One plain line for a value that was refused (an invalid hex, a double line under 3 px): nothing was changed. */
  onMessage: (text: string) => void
  onMove: (dir: 'up' | 'down') => void
  onNudge: (dx: number, dy: number) => void
  /** Where the selected element is shifted to in this view (the Nudge boxes show it), and a typed number: the new shift on one axis; false when it changes nothing. */
  shift: { dx: number; dy: number }
  onNudgeTo: (axis: 'X' | 'Y', to: number) => boolean
  /** Select another element of the preview by its index (a segment of the path, Select parent): the selection only, never an edit. */
  onSelectIndex: (index: number) => void
  /** Insert round 1: the strip's Edit text and Delete (the page decides what they do; Delete is off when the engine would refuse). */
  onEditText: () => void
  onDelete: () => void
  canDelete: boolean
  /** Stage 2: the Notes button (always there, with how many notes the code holds) and whether its list is open. */
  notesCount: number
  notesOpen: boolean
  onNotes: () => void
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

/** A width or a height is shown with at most one decimal ("268.7px"), so the number fits its 70 px box; what is written is never rounded. */
const oneDecimal = (text: string, prop: string): string => {
  if (prop !== 'width' && prop !== 'height') return text
  const m = /^(-?\d*\.?\d+)(px|%)$/.exec(text.trim())
  return m ? `${Math.round(parseFloat(m[1]) * 10) / 10}${m[2]}` : text
}

/** The room a stretching control needs at least (px): the group's column is never narrower than its two rows' minimums. */
const minW = (px: number): CSSProperties => ({ '--min': `${px}px` }) as CSSProperties

const EMPTY = { fontFamily: '', fontSize: '', fontWeight: '400', color: '', textAlign: 'left', width: '', height: '', padding: '', margin: '', backgroundColor: '', borderTopColor: '', borderTopWidth: '', borderTopStyle: 'none', borderRadius: '', fill: '', stroke: '', strokeWidth: '', textAnchor: 'start' } as Computed

/** The visible label of a control, above it (or under an icon button): 11 to 12 px, sentence case, in plain words. aria-hidden: the control's own name is its accessible name. */
const CtlLabel = ({ text }: { text: string }) => (
  <span className="ue-cl" data-ctl-label aria-hidden="true">
    {text}
  </span>
)

/** The hold-to-repeat behaviour of a stepper button or spin arrow: it acts on a press and, held, again after HOLD_DELAY and then every HOLD_EVERY ms. A keyboard press acts once. */
function useRepeat(onFire: (shift: boolean) => void, disabled: boolean) {
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
  return {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0 || disabled) return
      stop()
      const shift = e.shiftKey
      fire.current(shift)
      timer.current.start = window.setTimeout(() => {
        timer.current.every = window.setInterval(() => fire.current(shift), HOLD_EVERY)
      }, HOLD_DELAY)
    },
    onPointerUp: stop,
    onPointerCancel: stop,
    onPointerLeave: stop,
    onBlur: stop,
    /** The keyboard (no pointer, detail 0) acts once; a mouse press has already acted. */
    onClick: (e: { detail: number; shiftKey: boolean }) => {
      if (e.detail === 0 && !disabled) fire.current(e.shiftKey)
    },
  }
}

/** A button that acts on a press and, held, again (the grow and shrink buttons, the sides popover's plus and minus). */
function RepeatButton({ label, tip, disabled, onFire, fixedIcon, children }: { label: string; tip: string; disabled: boolean; onFire: (shift: boolean) => void; fixedIcon?: boolean; children: ReactNode }) {
  const rep = useRepeat(onFire, disabled)
  return (
    <button type="button" className="ue-rbtn" data-fixed-icon={fixedIcon ? '' : undefined} aria-label={label} title={tip} disabled={disabled} {...rep}>
      {children}
    </button>
  )
}

/** A spin arrow of a number box: not a tab stop (the keyboard uses the arrow keys in the box), named for the screen reader, holds to repeat. */
function SpinArrow({ name, dir, step, unit, disabled, onFire }: { name: string; dir: 'up' | 'down'; step: number; unit: string; disabled: boolean; onFire: (shift: boolean) => void }) {
  const rep = useRepeat(onFire, disabled)
  const label = dir === 'up' ? P.increase(name) : P.decrease(name)
  return <span role="button" data-spin={dir} data-for={name} aria-label={label} title={P.stepTip(label, step, unit)} aria-disabled={disabled || undefined} className="ue-spin" {...rep} />
}

/** The number in a box: always a real text input. Enter (or leaving it) commits what was typed; the arrow keys step it. Made new for each preview (`key`), so every typed value commits once and the next can follow. */
function NumberInput({ name, shown, disabled, describedBy, tip, onCommit, onArrow }: { name: string; shown: string; disabled: boolean; describedBy?: string; tip?: string; onCommit: (text: string) => boolean | void; onArrow?: (dir: 1 | -1, shift: boolean) => void }) {
  const done = useRef(false)
  const input = useRef<HTMLInputElement | null>(null)
  const commit = (text: string) => {
    if (done.current || text === shown) return
    done.current = true
    refocus.name = name
    // A commit that returns false changed nothing: the box shows what it showed (a typed number that is not one, or the number already there), and can commit again.
    if (onCommit(text) === false) {
      done.current = false
      if (input.current) input.current.value = shown
    }
  }
  return (
    <input
      ref={(el) => {
        input.current = el
        if (el && refocus.name === name) {
          refocus.name = null
          el.focus({ preventScroll: true })
        }
      }}
      id={rowId(name)}
      type="text"
      className="ue-num"
      aria-label={name}
      title={tip ?? P.typeTip(name)}
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
        } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && onArrow) {
          e.preventDefault()
          onArrow(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey)
        }
      }}
      onBlur={(e) => commit(e.currentTarget.value)}
    />
  )
}

/** A number box (round 6): the number with spin arrows at its right (or, fixed, with what the caller puts there). It shares the row, or keeps its width. */
function NumBox({ name, shown, stamp, disabled, fixed, step, unit, onStep, onCommit, describedBy, field, children }: { name: string; shown: string; stamp: string; disabled: boolean; fixed?: boolean; step: number; unit: string; onStep: (dir: 1 | -1, shift: boolean) => void; onCommit: (text: string) => void; describedBy?: string; field?: string; dot?: ReactNode; children?: ReactNode }) {
  return (
    <span className="ue-numbox" data-numbox data-stretch={fixed ? undefined : ''} data-fixed={fixed ? '' : undefined} data-field={field}>
      <NumberInput key={stamp} name={name} shown={shown} disabled={disabled} describedBy={describedBy} onCommit={onCommit} onArrow={onStep} />
      {!fixed && (
        <>
          <SpinArrow name={name} dir="up" step={step} unit={unit} disabled={disabled} onFire={(s) => onStep(1, s)} />
          <SpinArrow name={name} dir="down" step={step} unit={unit} disabled={disabled} onFire={(s) => onStep(-1, s)} />
        </>
      )}
      {children}
    </span>
  )
}

/** minus, the number, plus: one click is one edit (and a hold is one per repeat). Used by the Sides popover. */
function Stepper({ name, shown, stamp, disabled, step, unit, onStep, onCommit, describedBy }: { name: string; shown: string; stamp: string; disabled: boolean; step: number; unit: string; onStep: (dir: 1 | -1, shift: boolean) => void; onCommit: (text: string) => void; describedBy?: string }) {
  return (
    <span className="ue-stp">
      <RepeatButton label={P.decrease(name)} tip={P.stepTip(P.decrease(name), step, unit)} disabled={disabled} onFire={(s) => onStep(-1, s)}>
        <span aria-hidden="true">−</span>
      </RepeatButton>
      <NumberInput key={stamp} name={name} shown={shown} disabled={disabled} describedBy={describedBy} onCommit={onCommit} onArrow={onStep} />
      <RepeatButton label={P.increase(name)} tip={P.stepTip(P.increase(name), step, unit)} disabled={disabled} onFire={(s) => onStep(1, s)}>
        <span aria-hidden="true">+</span>
      </RepeatButton>
    </span>
  )
}

const ALIGN_ICON: Record<string, IconName> = { left: 'alignLeft', start: 'alignLeft', center: 'alignCentre', middle: 'alignCentre', right: 'alignRight', end: 'alignRight', justify: 'alignJustify' }

/** A group of the ribbon (round 6): two rows of controls, its name under them (12 px, muted). Every row fills the group's width. */
function Group({ id, name, children }: { id: string; name: string; children: ReactNode }) {
  return (
    <div className="ue-rgroup" role="group" aria-label={name} data-ribbon-group={id}>
      <div className="ue-rows" data-rows>
        {children}
      </div>
      <span className="ue-glabel" data-group-label>
        {name}
      </span>
    </div>
  )
}

/** One row of a group: 28 px high, its controls 4 px apart, the last one ending at the group's right edge. A row with nothing in it is not drawn. */
function Row({ children }: { children: ReactNode }) {
  if (Children.toArray(children).length === 0) return null
  return (
    <div className="ue-row" data-row>
      {children}
    </div>
  )
}

/** The word beside a number box (Height, Width, Corner radius, Padding, Margin, Nudge): the box carries the accessible name, so this is not read twice. */
const RowLabel = ({ text, wide }: { text: string; wide?: number }) => (
  <span className="ue-rl" data-row-label aria-hidden="true" style={wide ? { width: wide } : undefined}>
    {text}
  </span>
)
/** The room each row label takes, so the boxes of a group start at one edge. */
const LABEL_W: Record<string, number> = { Height: 40, Width: 40, 'Border radius': 80, Padding: 48, Margin: 48, nudge: 38 }

/** A 28 px button with its icon and its word (Move up, Grid, Snap). The accessible name is the label. */
function RibbonButton({ icon, label, tip, pressed, disabled, min, onClick }: { icon: IconName; label: string; tip: string; pressed?: boolean; disabled: boolean; min: number; onClick: () => void }) {
  return (
    <button type="button" className="ue-rbtn ue-wbtn" data-stretch style={minW(min)} aria-label={label} title={tip} aria-pressed={pressed} disabled={disabled} onClick={onClick}>
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  )
}

export default function Ribbon({ session, rev, nonce, selected, view, editable, lockedNote, unit, onUnit, onSet, onBadValue, onMessage, onMove, onNudge, shift, onNudgeTo, onSelectIndex, onEditText, onDelete, canDelete, notesCount, notesOpen, onNotes, grid, onGrid, snap, onSnap, spacing, onSpacing }: Props) {
  const el = session && selected !== null ? (session.preview.elements[selected] ?? null) : null
  const svg = !!el && isSvgElement(el)
  // The path of the strip: the chain from the child of <body> down to the selected element; the deepest PATH_MAX of it, with a leading ellipsis when it is longer.
  const chain = el ? chainOf(el) : []
  const labelsOf = (e: Element): string => `${e.localName}${e.getAttribute('id') ? ` #${e.getAttribute('id')}` : e.getAttribute('class')?.trim().split(/\s+/)[0] ? ` .${e.getAttribute('class')!.trim().split(/\s+/)[0]}` : ''}`
  const shown = visiblePath(chain.map(labelsOf), PATH_MAX)
  const shownEls = chain.slice(-shown.labels.length)
  const parentEl = chain.length > 1 ? chain[chain.length - 2] : null
  const cs = el ? (el.ownerDocument.defaultView!.getComputedStyle(el) as unknown as Computed) : null
  const fields: Field[] = el && cs ? (svg ? svgFields(el, canResize(el), cs) : htmlFields(cs)) : htmlFields(EMPTY)
  const live = !!el && editable
  const up = session && el && selected !== null ? moveTarget(session.preview.model, selected, 'up') : null
  const down = session && el && selected !== null ? moveTarget(session.preview.model, selected, 'down') : null
  const stamp = `${nonce}-${rev}-${selected}-${view}-${unit}`
  // An SVG has no grid to snap to in HTML px: Snap is off there, with one plain line of text.
  const svgDoc = !!session && session.doc.kind === 'svg'

  // The Sides popover that is open (padding or margin).
  const [sidesOpen, setSidesOpen] = useState<'padding' | 'margin' | null>(null)
  const sidesButtons = useRef<Record<string, HTMLButtonElement | null>>({})
  const popover = useRef<HTMLDivElement>(null)
  const openedBy = useRef<'padding' | 'margin' | null>(null)
  const closeSides = (focusButton: boolean) => {
    const which = openedBy.current
    openedBy.current = null
    setSidesOpen(null)
    if (focusButton && which) sidesButtons.current[which]?.focus()
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

  // The popover is as wide as its four steppers (CSS: `width: max-content`) and stays inside the window: where the Spacing group sits near the right edge it is moved left.
  useLayoutEffect(() => {
    const p = popover.current
    if (!sidesOpen || !p) return
    p.style.marginLeft = ''
    const r = p.getBoundingClientRect()
    const over = r.right - (window.innerWidth - 8)
    if (over > 0) p.style.marginLeft = `-${Math.min(over, Math.max(0, r.left - 8))}px`
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

  // ---- the menus (round 6) ----
  /** The page colours of the original document: its files in order, the primary file first. */
  const pageColoursOf = (): string[] => (session ? pageColours([session.doc.source, ...Object.values(session.doc.companions)]) : [])
  const fieldOf = (label: string): Field | undefined => fields.find((x) => x.label === label)
  /** What a swatch, the hex box or "No fill" writes is what the old field wrote: the field's own `write`. */
  const writeColour = (f: Field, text: string) => {
    const n = now()
    if (n) write(f, text, n.cs)
  }
  // Round 7b: the colours applied through the menus are remembered (the last eight, one list for the three menus); "No fill" and "No outline" are not colours and Undo applies nothing.
  const recents = useSyncExternalStore(subscribeRecents, getRecents)
  const applyColour = (f: Field, hex: string) => {
    writeColour(f, hex)
    recordRecent(hex)
  }
  const hexBox = (f: Field): MenuPart => ({
    hex: {
      name: f.label,
      prop: f.prop,
      // Only #rgb and #rrggbb are colours here; anything else is no edit and one plain line.
      onCommit: (text: string) => {
        const v = hexTyped(text)
        if (!v) return onMessage(messages.notAColour)
        writeColour(f, v)
        recordRecent(v)
      },
    },
  })
  /** The colour groups every colour menu starts with: the page's own colours, the eight standard ones, the grid, the recent colours, Pick any colour…, the "No …" item when there is one, and More colours… */
  const colourParts = (f: Field, current: string | null, none: { label: string; run: () => void } | null, extra: MenuPart[] = []): MenuPart[] => [
    { group: P.pageColours, items: pageColoursOf().map((c) => ({ label: c, role: 'menuitemradio' as const, swatch: c, checked: current === c, run: () => applyColour(f, c) })) },
    { group: P.standardColours, items: STANDARD_COLOURS.map((c) => ({ label: c, role: 'menuitemradio' as const, swatch: c, checked: current === c, run: () => applyColour(f, c) })) },
    { group: P.colourGrid, grid: true, items: colourGrid().map((c) => ({ label: P.gridName(c), role: 'menuitemradio' as const, swatch: c, checked: current === c, run: () => applyColour(f, c) })) },
    ...(recents.length ? [{ group: P.recentColours, items: recents.map((c) => ({ label: P.recentName(c), role: 'menuitemradio' as const, swatch: c, checked: current === c, run: () => applyColour(f, c) })) }] : []),
    { label: P.pickColour, tip: P.pickColourTip, pick: true },
    ...(none ? [{ label: none.label, run: none.run }] : []),
    { label: P.moreColours, reveals: 'hex' as const },
    hexBox(f),
    ...extra,
  ]

  /** Font colour: the letter A over a colour bar, 58 px, opening the colour menu. */
  const fontColour = (f: Field): ReactNode => {
    const current = cs ? opaqueHex(cs[svg ? 'fill' : 'color']) : null
    return (
      <MenuButton
        key={f.prop + f.label}
        name={P.fontColour}
        tip={P.fontColourTip}
        disabled={!live}
        fixed
        glyph={<Icon name="letterA" />}
        bar={current}
        field={f.prop}
        spec={() => colourParts(f, current, null)}
        picker={{ current, onPick: (hex) => applyColour(f, hex) }}
      />
    )
  }
  /**
   * B4, the Gradient submenu of Shape Fill: From and To (each opens the colour choices), the four directions and No gradient, written as `background-image: linear-gradient(...)`.
   * With no gradient yet, From is the element's fill colour (white when it has none) and To is its text colour. HTML only (an SVG shape has no background image).
   */
  const gradientItem = (): MenuPart => {
    const g = cs ? readGradient(cs.backgroundImage ?? '') : null
    const base: Gradient = g ?? { dir: 'to right', from: (cs && opaqueHex(cs.backgroundColor)) || '#ffffff', to: (cs && opaqueHex(cs.color)) || '#000000' }
    const edit = (patch: Partial<Gradient>) => onSet({ 'background-image': gradientCss({ ...base, ...patch }) }, 'gradient')
    const colourSub = (key: 'from' | 'to') => (): MenuPart[] => [
      { group: P.pageColours, items: pageColoursOf().map((c) => ({ label: c, role: 'menuitemradio' as const, swatch: c, checked: g?.[key] === c, run: () => edit({ [key]: c }) })) },
      { group: P.standardColours, items: STANDARD_COLOURS.map((c) => ({ label: c, role: 'menuitemradio' as const, swatch: c, checked: g?.[key] === c, run: () => edit({ [key]: c }) })) },
    ]
    return {
      label: P.gradient,
      sub: () => [
        { label: P.fromColour, sub: colourSub('from') },
        { label: P.toColour, sub: colourSub('to') },
        ...DIRECTIONS.map((d) => ({ label: d.label, role: 'menuitemradio' as const, checked: g?.dir === d.css, run: () => edit({ dir: d.css }) })),
        { label: P.noGradient, run: () => onSet({ 'background-image': 'none' }, 'gradient') },
      ],
    }
  }
  /** Shape Fill: the bucket, the fill colour as a bar, the name and a chevron. HTML writes the background colour, an SVG shape its fill. */
  const shapeFill = (f: Field): ReactNode => {
    const current = cs ? opaqueHex(svg ? cs.fill : cs.backgroundColor) : null
    return (
      <MenuButton
        key={f.prop + f.label}
        name={P.shapeFill}
        tip={P.shapeFillTip}
        disabled={!live}
        min={126}
        glyph={<Icon name="bucket" />}
        bar={current}
        text={P.shapeFill}
        field={f.prop}
        spec={() => colourParts(f, current, { label: P.noFill, run: () => writeColour(f, svg ? 'none' : 'transparent') }, svg ? [] : [gradientItem()])}
        picker={{ current, onPick: (hex) => applyColour(f, hex) }}
      />
    )
  }
  /** Shape Outline: the pencil, the line colour as a bar, the name and a chevron; its menu holds the colours, No outline, the Weight and the Dashes (HTML only) submenus. */
  const shapeOutline = (f: Field): ReactNode => {
    const current = cs ? opaqueHex(svg ? cs.stroke : cs.borderTopColor) : null
    const weightField = fieldOf(P.borderWidth)
    const bw = cs ? parseFloat(svg ? cs.strokeWidth : cs.borderTopWidth) || 0 : 0
    const bs = cs ? (svg ? (cs.stroke === 'none' ? 'none' : 'solid') : cs.borderTopStyle) : 'none'
    const lineOn = bs !== 'none' && bw > 0
    const extra: MenuPart[] = []
    if (weightField) {
      extra.push({
        label: P.weight,
        sub: () => OUTLINE_WEIGHTS.map((w) => ({ label: P.weightItem(w), role: 'menuitemradio' as const, line: `${w}px solid currentColor`, checked: lineOn && bw === w, run: () => writeColour(weightField, `${w}px`) })),
      })
    }
    if (!svg) {
      extra.push({
        label: P.dashes,
        sub: () =>
          DASHES.map((d) => ({
            label: d.label,
            role: 'menuitemradio' as const,
            checked: lineOn && bs === d.value,
            run: () => {
              const w = lineOn ? bw : 1
              if (d.value === 'double' && w < DOUBLE_MIN) return onMessage(messages.doubleNeedsThree)
              onSet({ 'border-style': d.value, ...(lineOn ? {} : { 'border-width': '1px' }) }, 'border style')
            },
          })),
      })
    }
    return (
      <MenuButton
        key={f.prop + f.label}
        name={P.shapeOutline}
        tip={P.shapeOutlineTip}
        disabled={!live}
        min={126}
        glyph={<Icon name="pencil" />}
        bar={current}
        text={P.shapeOutline}
        field={f.prop}
        spec={() => colourParts(f, current, { label: P.noOutline, run: () => (svg ? writeColour(f, 'none') : onSet({ 'border-style': 'none' }, 'border style')) }, extra)}
        picker={{ current, onPick: (hex) => applyColour(f, hex) }}
      />
    )
  }

  /** B1, Shape Effects: None, Subtle, Medium and Strong, written as a box-shadow; the one that is current is marked. HTML only (a shadow does not apply to an SVG shape). */
  const shapeEffects = (): ReactNode => {
    const now$ = cs?.boxShadow ?? ''
    return (
      <MenuButton
        name={P.shapeEffects}
        tip={P.shapeEffectsTip}
        disabled={!live || svg}
        min={84}
        glyph={<Icon name="shadow" />}
        text={P.effectsWord}
        spec={() => EFFECTS.map((e) => ({ label: e.label, role: 'menuitemradio' as const, checked: now$ === e.computed, run: () => onSet({ 'box-shadow': e.css }, 'shadow') }))}
      />
    )
  }

  /** B2, Italic and Underline: toggles that show pressed from the element's computed style (also when the style comes from the page) and write font-style or text-decoration-line. */
  const styleToggles = (): ReactNode => {
    const italic = cs?.fontStyle === 'italic' || cs?.fontStyle === 'oblique'
    const underline = !!cs?.textDecorationLine?.includes('underline')
    // An SVG has text styling only on its text.
    const ok = !svg || (!!el && ['text', 'tspan', 'textpath'].includes(el.localName.toLowerCase()))
    return (
      <>
        <button type="button" className="ue-rbtn" data-fixed-icon aria-label={P.italic} title={P.italicTip} aria-pressed={italic} disabled={!live || !ok} onClick={() => onSet({ 'font-style': italic ? 'normal' : 'italic' }, 'font style')}>
          <Icon name="italic" />
        </button>
        <button type="button" className="ue-rbtn" data-fixed-icon aria-label={P.underline} title={P.underlineTip} aria-pressed={underline} disabled={!live || !ok} onClick={() => onSet({ 'text-decoration-line': underline ? 'none' : 'underline' }, 'text decoration')}>
          <Icon name="underline" />
        </button>
        {lineSpacing()}
      </>
    )
  }
  /** B3, Line spacing: 1.0, 1.15, 1.5 and 2.0 as a unitless line-height; the one that is current is marked. HTML only. */
  const lineSpacing = (): ReactNode => {
    const ratio = cs ? (parseFloat(cs.lineHeight ?? '') || 0) / (parseFloat(cs.fontSize) || 1) : 0
    return (
      <MenuButton
        name={P.lineSpacing}
        tip={P.lineSpacingTip}
        disabled={!live || svg}
        min={62}
        glyph={<Icon name="lineSpacing" />}
        spec={() => LINE_SPACINGS.map((l) => ({ label: l.label, role: 'menuitemradio' as const, checked: Math.abs(ratio - parseFloat(l.css)) < 0.01, run: () => onSet({ 'line-height': l.css }, 'line spacing') }))}
      />
    )
  }

  const renderField = (f: Field): ReactNode => {
    const kind = kindOf(f.prop, svg)
    const shown = cs ? f.read(cs) : ''
    if (kind === 'family') {
      return (
        <span key={f.prop} className="ue-sel" data-stretch style={minW(78)} data-field={f.prop}>
          <select key={`${stamp}-f`} id={rowId(f.prop)} aria-label={f.label} title={P.fontTip(shown)} className="ue-fam" defaultValue={shown} disabled={!live} onChange={(e) => cs && write(f, e.currentTarget.value, cs)}>
            {familyChoices(shown).map((o, i) => (
              <option key={`${i}-${o.label}`} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </span>
      )
    }
    if (kind === 'weight') {
      return (
        <span key={f.prop} className="ue-sel" data-stretch style={minW(56)} data-field={f.prop}>
          <select key={`${stamp}-w`} id={rowId(f.prop)} aria-label={f.label} title={P.weightTip} className="ue-wt" defaultValue={shown} disabled={!live} onChange={(e) => cs && write(f, e.currentTarget.value, cs)}>
            {(f.options ?? []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </span>
      )
    }
    if (kind === 'colour') {
      if (f.label === P.textColour) return fontColour(f)
      if (f.label === P.background) return shapeFill(f)
      return shapeOutline(f)
    }
    if (kind === 'align') {
      const current = cs ? pressedAlign(shown, svg) : ''
      return (
        <div key={f.prop} className="ue-segmented ue-aligns" data-segmented data-stretch style={minW(112)} data-field={f.prop} role="group" aria-label={f.label}>
          {alignButtons(svg).map((b) => (
            <button key={b.value} type="button" className="ue-rbtn ue-al" aria-label={b.label} title={P.alignTip(b.label)} aria-pressed={current === b.value} disabled={!live} onClick={() => cs && write(f, b.value, cs)}>
              <Icon name={ALIGN_ICON[b.value]} />
            </button>
          ))}
        </div>
      )
    }
    if (kind === 'sides') {
      const sides = cs ? expandSides(f.prop === 'padding' ? cs.padding : cs.margin) : null
      const key = STEP_OF[f.prop]
      const which = f.prop === 'padding' ? 'padding' : 'margin'
      return (
        <Fragment key={f.prop}>
          <RowLabel text={P.rowLabels[f.label] ?? f.label} wide={LABEL_W[f.label]} />
          <NumBox name={f.label} shown={sides ? showUniform(sides) : ''} stamp={stamp} disabled={!live} step={STEP[key]} unit="px" onStep={(d, sh) => stepSides(f, d, sh)} onCommit={(t) => cs && write(f, t, cs)} field={f.prop} />
          <button
            type="button"
            ref={(b) => {
              sidesButtons.current[which] = b
            }}
            className="ue-rbtn ue-sidesbtn"
            data-fixed
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
        </Fragment>
      )
    }
    // the font size: a 62 px box with the presets arrow, then the grow and shrink buttons
    if (f.prop === 'font-size') {
      const cur = cs ? Math.round((parseFloat(cs.fontSize) || 0) * 100) / 100 : 0
      return (
        <Fragment key={f.prop}>
          <NumBox name={f.label} shown={shown} stamp={stamp} disabled={!live} fixed step={STEP.fontSize} unit="px" onStep={(d, sh) => stepField(f, d, sh)} onCommit={(t) => commitText(f, t)} field={f.prop}>
            <MenuButton name={P.fontSizePresets} tip={P.fontSizePresetsTip} disabled={!live} fixed glyph={null} spec={() => FONT_SIZES.map((n) => ({ label: String(n), role: 'menuitemradio' as const, checked: cur === n, run: () => writeColour(f, `${n}px`) }))} />
          </NumBox>
          <RepeatButton fixedIcon label={P.increase(f.label)} tip={P.stepTip(P.increase(f.label), STEP.fontSize, 'px')} disabled={!live} onFire={(sh) => stepField(f, 1, sh)}>
            <Icon name="textGrow" />
          </RepeatButton>
          <RepeatButton fixedIcon label={P.decrease(f.label)} tip={P.stepTip(P.decrease(f.label), STEP.fontSize, 'px')} disabled={!live} onFire={(sh) => stepField(f, -1, sh)}>
            <Icon name="textShrink" />
          </RepeatButton>
        </Fragment>
      )
    }
    // width (with its unit) and every other number box
    const key = STEP_OF[f.prop]
    if (!key) return null
    const isWidth = kind === 'width'
    const parent = el && isWidth ? parentContentWidth(el) : 0
    const text = oneDecimal(isWidth && el && cs ? showWidth(parseFloat(cs.width) || 0, parent, unit) : shown, f.prop)
    return (
      <Fragment key={f.prop + f.label}>
        <RowLabel text={P.rowLabels[f.label] ?? f.label} wide={LABEL_W[f.label]} />
        <NumBox name={f.label} shown={text} stamp={stamp} disabled={!live} step={key === 'width' && unit === '%' ? 1 : STEP[key]} unit={isWidth && unit === '%' ? '%' : 'px'} onStep={(d, sh) => stepField(f, d, sh)} onCommit={(t) => commitText(f, t)} field={f.prop} />
        {isWidth && (
          <span className="ue-seg2" data-fixed role="group" aria-label={P.widthUnit}>
            {(['px', '%'] as WidthUnit[]).map((u) => (
              <button key={u} type="button" className="ue-rbtn ue-unit" aria-label={u} aria-pressed={unit === u} title={P.unitTip(u)} disabled={!live || (u === '%' && parent <= 0)} onClick={() => onUnit(u)}>
                {u}
              </button>
            ))}
          </span>
        )}
      </Fragment>
    )
  }
  /** What an SVG element does not have is drawn switched off (like PowerPoint's), so the ribbon keeps the same controls and no group is left empty. */
  const switchedOff = (label: string): ReactNode => {
    const num = (name: string, key: string) => (
      <Fragment key={key}>
        <RowLabel text={P.rowLabels[name] ?? name} wide={LABEL_W[name]} />
        <NumBox name={name} shown="" stamp={stamp} disabled step={STEP.width} unit="px" onStep={() => {}} onCommit={() => {}} />
      </Fragment>
    )
    if (label === P.width || label === P.height || label === P.borderRadius) return num(label, label)
    if (label === P.padding || label === P.margin) {
      return (
        <Fragment key={label}>
          {num(label, `${label}-n`)}
          <button type="button" className="ue-rbtn ue-sidesbtn" data-fixed aria-label={P.sidesName(label)} title={P.sidesTip(label)} aria-expanded={false} disabled>
            {P.sides}
          </button>
        </Fragment>
      )
    }
    if (label === P.textColour) return <MenuButton key={label} name={P.fontColour} tip={P.fontColourTip} disabled fixed glyph={<Icon name="letterA" />} spec={() => []} />
    if (label === P.background) return <MenuButton key={label} name={P.shapeFill} tip={P.shapeFillTip} disabled min={126} glyph={<Icon name="bucket" />} text={P.shapeFill} spec={() => []} />
    return null
  }
  /** The control of the field with this label, when the selected element has it (an SVG has fewer: the rest is switched off). */
  const ctl = (label: string): ReactNode => {
    const f = fields.find((x) => x.label === label)
    return f ? renderField(f) : svg ? switchedOff(label) : null
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
            <CtlLabel text={side[0].toUpperCase() + side.slice(1)} />
            <Stepper name={`${f.label} ${side}`} shown={sides ? `${sides[i]}px` : ''} stamp={stamp} disabled={!live} step={STEP[key]} unit="px" onStep={(d, s) => stepSides(f, d, s, side)} onCommit={(t) => commitSide(f, side, t)} />
          </span>
        ))}
      </div>
    )
  }

  const note = !el ? (editable ? P.none : lockedNote) : !editable ? lockedNote : ''
  const nudge = (axis: 'X' | 'Y', label: string) => (
    <NumBox
      key={`${stamp}-n${axis}`}
      name={label}
      shown={String(axis === 'X' ? shift.dx : shift.dy)}
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
        return t.trim() !== '' && Number.isFinite(v) && onNudgeTo(axis, v)
      }}
    />
  )

  return (
    <div className="ue-ribbon" data-ribbon>
      <div className="ue-strip" data-ribbon-strip>
        <span className="ue-strip-title">{P.strip}</span>
        <nav className="ue-path" data-path aria-label={P.pathLabel}>
          {shown.more && (
            <span className="ue-path-more" data-path-more aria-hidden="true">
              …
            </span>
          )}
          {shownEls.slice(0, -1).map((a, i) => (
            <Fragment key={`${i}-${shown.labels[i]}`}>
              <button type="button" className="ue-seg-btn" aria-label={P.pathName(shown.labels[i])} title={P.pathTip(shown.labels[i])} onClick={() => session && onSelectIndex(session.preview.elements.indexOf(a))}>
                {shown.labels[i]}
              </button>
              <span className="ue-path-sep" aria-hidden="true">
                ›
              </span>
            </Fragment>
          ))}
          <span className="ue-rlabel" data-selected-label>
            {el && selected !== null && session ? labelOf(session, selected) : ''}
          </span>
        </nav>
        <button type="button" className="ue-seg-btn ue-selpar" aria-label={P.selectParent} title={P.selectParentTip} disabled={!parentEl} onClick={() => parentEl && session && onSelectIndex(session.preview.elements.indexOf(parentEl))}>
          {P.selectParent}
        </button>
        <button type="button" className="ue-seg-btn ue-selpar" aria-label={labels.editText} title={labels.editTextTip} disabled={!live} onClick={onEditText}>
          {labels.editText}
        </button>
        <button type="button" className="ue-seg-btn ue-selpar" aria-label={labels.deleteElement} title={labels.deleteTip} disabled={!canDelete} onClick={onDelete}>
          {labels.deleteElement}
        </button>
        <button type="button" data-opens="notes" className="ue-seg-btn ue-selpar ue-notesbtn" aria-label={labels.notes} aria-expanded={notesOpen} title={labels.notesTip} onClick={onNotes}>
          {labels.notes}
          <span className="ue-notecount" aria-hidden="true">
            {notesCount}
          </span>
        </button>
        <strong data-env>{view}</strong>
        <p data-ribbon-note className="ue-rnote" hidden={!note} title={note}>
          {note}
        </p>
        {svgDoc && (
          <p className="ue-snapnote" data-snap-note>
            {P.snapNoteSvg}
          </p>
        )}
      </div>

      <div className="ue-rpanel" data-ribbon-panel>
        <Group id="font" name={P.groups.font}>
          <Row>
            {ctl(P.fonts)}
            {ctl(P.fontSize)}
          </Row>
          <Row>
            {ctl(P.fontWeight)}
            {ctl(P.textColour)}
          </Row>
        </Group>
        <Group id="paragraph" name={P.groups.paragraph}>
          <Row>{ctl(P.alignment)}</Row>
          <Row>{styleToggles()}</Row>
        </Group>
        <Group id="size" name={P.groups.size}>
          <Row>{ctl(P.height)}</Row>
          <Row>{ctl(P.width)}</Row>
        </Group>
        <Group id="shape" name={P.groups.shapeStyles}>
          <Row>
            {ctl(P.background)}
            {ctl(P.borderColour)}
          </Row>
          <Row>
            {ctl(P.borderRadius)}
            {shapeEffects()}
          </Row>
        </Group>
        <Group id="spacing" name={P.groups.spacing}>
          <Row>{ctl(P.padding)}</Row>
          <Row>{ctl(P.margin)}</Row>
          {sidesPopover(P.padding)}
          {sidesPopover(P.margin)}
        </Group>
        <Group id="position" name={P.groups.arrange}>
          <Row>
            <RibbonButton icon="moveUp" label={P.moveUp} tip={P.moveUpTip} disabled={!live || !up} min={92} onClick={() => onMove('up')} />
            <RibbonButton icon="moveDown" label={P.moveDown} tip={P.moveDownTip} disabled={!live || !down} min={92} onClick={() => onMove('down')} />
          </Row>
          <Row>
            <RowLabel text={P.rowLabels.nudge} wide={LABEL_W.nudge} />
            {nudge('X', P.nudgeX)}
            {nudge('Y', P.nudgeY)}
          </Row>
          <span id="ue-nudge-hint" className="ue-sr">
            {P.nudgeHint}
          </span>
        </Group>
        <Group id="grid" name={P.groups.grid}>
          <Row>
            <RibbonButton icon="grid" label={P.grid} tip={P.gridTip} pressed={grid} disabled={false} min={56} onClick={() => onGrid(!grid)} />
            <RibbonButton icon="snap" label={P.snap} tip={P.snapTip} pressed={snap && !svgDoc} disabled={svgDoc} min={56} onClick={() => onSnap(!snap)} />
          </Row>
          <Row>
            <span className="ue-sel" data-stretch style={minW(60)}>
              <select id="ue-spacing" className="ue-spacing" aria-label={P.gridSpacing} title={P.gridSpacingTip} value={spacing} onChange={(e) => onSpacing(Number(e.currentTarget.value))}>
                {P.spacings.map((n) => (
                  <option key={n} value={n}>
                    {P.spacingOption(n)}
                  </option>
                ))}
              </select>
            </span>
          </Row>
        </Group>
      </div>
    </div>
  )
}
