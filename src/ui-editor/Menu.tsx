// The ribbon's menu primitive (round 6): PowerPoint's Shape Fill, Shape Outline and Font colour galleries, the font size presets and the Part B menus all use it.
// A button opens a `role="menu"` by a click, Enter, Space or Down; the arrow keys move; Enter chooses; Escape and a click outside close it and give the focus back to
// the button; the chosen value is marked (`aria-checked`). A submenu opens by a click, Enter or Right and closes with Left or Escape. A menu stays inside the window
// (it scrolls inside when it is taller, and at phone width it is as wide as the window with items at least 44 px high). The menus are drawn in <body>, because the ribbon's
// container (contain: layout) would otherwise be their containing block.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './icons'

export interface MenuItem {
  /** The item's accessible name (aria-label) and, unless `text` says otherwise, the word it shows. */
  label: string
  text?: string
  tip?: string
  role?: 'menuitem' | 'menuitemradio'
  checked?: boolean
  /** A colour swatch (a CSS colour): drawn as a square, named by its label. */
  swatch?: string
  /** A line preview (a CSS border shorthand), drawn before the label. */
  line?: string
  disabled?: boolean
  /** The items of the submenu this item opens. */
  sub?: () => MenuPart[]
  run?: () => void
  /** Choosing it does not close the menu: it reveals the hex box inside it ("More colours…"). */
  reveals?: 'hex'
}
export interface MenuGroup {
  group: string
  items: MenuItem[]
}
/** The hex box of "More colours…": shown once that item was chosen. `onCommit` gets what was typed; it says whether it was taken (the menu closes either way). */
export interface MenuHex {
  hex: { name: string; prop: string; onCommit: (text: string) => void }
}
export type MenuPart = MenuItem | MenuGroup | MenuHex

const isGroup = (p: MenuPart): p is MenuGroup => 'group' in p
const isHex = (p: MenuPart): p is MenuHex => 'hex' in p

/** Only one menu is open at a time: opening another closes the one before it (without taking the focus back). */
let closeOther: (() => void) | null = null

const ITEM = '[role=menuitem], [role=menuitemradio], [role=menuitemcheckbox]'

interface ButtonProps {
  /** The button's accessible name and the name of its menu. */
  name: string
  tip: string
  disabled: boolean
  /** Fixed width (a 58 px colour button) instead of sharing the row. */
  fixed?: boolean
  /** The room the button needs at least when it shares its row (px). */
  min?: number
  glyph?: ReactNode
  /** The colour bar under the glyph: a CSS colour, or null for "no colour" (transparent, drawn hatched). Omitted: no bar. */
  bar?: string | null
  text?: string
  chevron?: boolean
  spec: () => MenuPart[]
  /** The `data-field` of the setting this menu belongs to (the gate reads the unlinked dot inside it). */
  field?: string
  dot?: ReactNode
}

/** The button of a menu and the menu itself. */
export function MenuButton({ name, tip, disabled, fixed, min, glyph, bar, text, chevron = true, spec, field, dot }: ButtonProps) {
  const [open, setOpen] = useState(false)
  /** The labels of the submenus open now, with the element that opened each (for placing and for the focus on closing). */
  const [path, setPath] = useState<{ label: string; trigger: HTMLElement }[]>([])
  const [hexOpen, setHexOpen] = useState(false)
  const [button, setButton] = useState<HTMLButtonElement | null>(null)
  const closeMine = useRef<() => void>(() => {})

  const close = useCallback(
    (focusButton: boolean) => {
      setOpen(false)
      setPath([])
      setHexOpen(false)
      if (closeOther === closeMine.current) closeOther = null
      if (focusButton) button?.focus({ preventScroll: true })
    },
    [button],
  )
  useEffect(() => {
    closeMine.current = () => close(false)
  })

  const openMenu = () => {
    if (disabled) return
    if (closeOther && closeOther !== closeMine.current) closeOther()
    closeOther = closeMine.current
    setPath([])
    setHexOpen(false)
    setOpen(true)
  }
  useEffect(
    () => () => {
      if (closeOther === closeMine.current) closeOther = null
    },
    [],
  )
  // A control switched off while its menu is open closes the menu.
  if (disabled && open) {
    setOpen(false)
    setPath([])
    setHexOpen(false)
  }

  // A click anywhere outside the menus and this button closes the menu and gives the focus back.
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      const t = e.target as Element | null
      if (t?.closest?.('[data-menu]') || button?.contains(t)) return
      // Another menu button: that button opens its own menu (and closes this one without the focus).
      if (t?.closest?.('[data-menu-button]')) return
      close(true)
    }
    document.addEventListener('click', away, true)
    return () => document.removeEventListener('click', away, true)
  }, [open, close, button])

  const toggle = () => {
    if (open) close(true)
    else openMenu()
  }

  // The parts shown by each open menu: the top menu, then one per open submenu (looked up again by label, so the values are always the current ones).
  const top = open ? spec() : []
  const levels: { parts: MenuPart[]; label: string; anchor: HTMLElement | null }[] = [{ parts: top, label: name, anchor: button }]
  let parts = top
  for (const step of path) {
    const it = flat(parts).find((x) => x.label === step.label)
    if (!it?.sub) break
    parts = it.sub()
    levels.push({ parts, label: step.label, anchor: step.trigger })
  }

  const openSub = (it: MenuItem, trigger: HTMLElement, depth: number) => {
    // Opening a trigger that is already open keeps it; opening another replaces the submenus from this depth on.
    setPath((p) => (p[depth - 1]?.label === it.label ? p : [...p.slice(0, depth - 1), { label: it.label, trigger }]))
  }
  const closeSub = (depth: number) => {
    const trigger = path[depth - 2]?.trigger
    setPath((p) => p.slice(0, depth - 1))
    trigger?.focus({ preventScroll: true })
  }
  const choose = (it: MenuItem, el: HTMLElement, depth: number) => {
    if (it.disabled) return
    if (it.sub) return openSub(it, el, depth)
    if (it.reveals === 'hex') return setHexOpen(true)
    close(true)
    it.run?.()
  }

  const onButtonKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' && !disabled) {
      e.preventDefault()
      if (!open) openMenu()
    }
  }

  return (
    <>
      <button
        ref={setButton}
        type="button"
        className="ue-rbtn ue-menubtn"
        data-menu-button={name}
        data-stretch={fixed ? undefined : ''}
        data-fixed={fixed ? '' : undefined}
        style={min ? ({ '--min': `${min}px` } as CSSProperties) : undefined}
        data-field={field}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={name}
        title={tip}
        disabled={disabled}
        onClick={toggle}
        onKeyDown={onButtonKey}
      >
        {glyph}
        {bar !== undefined && <i className="ue-colourbar" data-colour-bar style={{ '--bar': bar ?? 'transparent' } as CSSProperties} data-none={bar === null ? '' : undefined} />}
        {text && <span className="ue-menutext">{text}</span>}
        {chevron && <Icon name="chevron" />}
        {dot}
      </button>
      {open &&
        levels.map((lv, i) => (
          <Panel
            key={`${i}-${lv.label}`}
            label={lv.label}
            parts={lv.parts}
            anchor={lv.anchor}
            depth={i + 1}
            expandedLabel={path[i]?.label}
            hexOpen={hexOpen}
            onChoose={choose}
            onClose={close}
            onCloseSub={closeSub}
            onHexDone={() => close(true)}
          />
        ))}
    </>
  )
}

const flat = (parts: MenuPart[]): MenuItem[] => parts.flatMap((p) => (isGroup(p) ? p.items : isHex(p) ? [] : [p]))

interface PanelProps {
  label: string
  parts: MenuPart[]
  anchor: HTMLElement | null
  depth: number
  expandedLabel: string | undefined
  hexOpen: boolean
  onChoose: (it: MenuItem, el: HTMLElement, depth: number) => void
  onClose: (focusButton: boolean) => void
  onCloseSub: (depth: number) => void
  onHexDone: () => void
}

/** One menu: placed under its button (or beside the item that opened it), kept inside the window, with the keys of the menu pattern. */
function Panel({ label, parts, anchor, depth, expandedLabel, hexOpen, onChoose, onClose, onCloseSub, onHexDone }: PanelProps) {
  const el = useRef<HTMLDivElement>(null)

  // Placement: under the button, or to the right of the trigger; flipped left when it would leave the window; scrolled inside when taller than the room left. Done on the
  // element itself (no state), before the first paint and again when its content changes size.
  useLayoutEffect(() => {
    const m = el.current
    if (!m || !anchor) return
    m.style.maxHeight = ''
    m.style.overflowY = ''
    const a = anchor.getBoundingClientRect()
    const mw = m.offsetWidth, vw = window.innerWidth, vh = window.innerHeight
    const side = depth > 1
    let left = side ? a.right + 2 : a.left
    const top = side ? a.top : a.bottom + 2
    if (left + mw > vw - 4) left = Math.max(4, side ? a.left - mw - 2 : vw - mw - 4)
    const room = vh - top - 8
    m.style.left = `${left}px`
    m.style.top = `${top}px`
    if (m.offsetHeight > room) {
      m.style.maxHeight = `${Math.max(120, room)}px`
      m.style.overflowY = 'auto'
    }
    m.style.visibility = 'visible'
  }, [anchor, depth, hexOpen, parts.length])

  // Focus: the chosen item, else the first (a submenu takes it from its trigger).
  useEffect(() => {
    const items = [...(el.current?.querySelectorAll<HTMLElement>(ITEM) ?? [])].filter((x) => x.closest('[role=menu]') === el.current)
    ;(items.find((x) => x.getAttribute('aria-checked') === 'true') ?? items[0])?.focus({ preventScroll: true })
  }, [])
  // The hex box takes the focus when it appears.
  const hexInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (hexOpen) hexInput.current?.focus({ preventScroll: true })
  }, [hexOpen])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation()
    const t = e.target as HTMLElement
    if (t.matches('input')) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose(true)
      }
      return
    }
    const items = [...(el.current?.querySelectorAll<HTMLElement>(ITEM) ?? [])].filter((x) => x.closest('[role=menu]') === el.current && x.getClientRects().length)
    const i = items.indexOf(document.activeElement as HTMLElement)
    const go = (n: number) => {
      e.preventDefault()
      items[(n + items.length) % items.length]?.focus({ preventScroll: true })
    }
    const active = document.activeElement as HTMLElement | null
    const isSwatch = !!active?.hasAttribute('data-swatch')
    if (e.key === 'ArrowDown' || (e.key === 'ArrowRight' && isSwatch)) go(i + 1)
    else if (e.key === 'ArrowUp' || (e.key === 'ArrowLeft' && isSwatch && depth === 1)) go(i - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(items.length - 1)
    else if (e.key === 'ArrowRight' && active?.hasAttribute('aria-haspopup')) {
      e.preventDefault()
      active.click()
    } else if (e.key === 'ArrowLeft' && depth > 1) {
      e.preventDefault()
      onCloseSub(depth)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      if (depth > 1) onCloseSub(depth)
      else onClose(true)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      onClose(true)
    }
  }

  const item = (it: MenuItem, key: string) => {
    const expanded = it.sub ? expandedLabel === it.label : undefined
    return (
      <button
        key={key}
        type="button"
        tabIndex={-1}
        role={it.role ?? 'menuitem'}
        aria-label={it.label}
        title={it.tip ?? it.label}
        aria-checked={it.checked === undefined ? undefined : !!it.checked}
        aria-haspopup={it.sub ? 'menu' : undefined}
        aria-expanded={expanded}
        aria-disabled={it.disabled || undefined}
        data-swatch={it.swatch ? '' : undefined}
        style={it.swatch ? ({ '--sw': it.swatch } as CSSProperties) : undefined}
        onClick={(e) => {
          e.stopPropagation()
          onChoose(it, e.currentTarget, depth)
        }}
      >
        {it.swatch ? null : it.line ? (
          <>
            <i className="ue-lineprev" data-line-preview style={{ borderTop: it.line }} />
            <span>{it.label}</span>
          </>
        ) : (
          <>
            <span>{it.text ?? it.label}</span>
            {it.sub && (
              <em aria-hidden="true" className="ue-subarrow">
                ›
              </em>
            )}
          </>
        )}
      </button>
    )
  }

  return createPortal(
    <div
      ref={el}
      role="menu"
      aria-label={label}
      data-menu
      data-depth={depth}
      className="ue-menu"
      style={{ left: 0, top: 0, visibility: 'hidden' }}
      onKeyDown={onKeyDown}
    >
      {parts.map((p, i) =>
        isGroup(p) ? (
          <div key={`g${i}-${p.group}`} role="group" aria-label={p.group} data-menu-group className="ue-menugroup">
            <div className="ue-menuhead" data-menu-heading aria-hidden="true">
              {p.group}
            </div>
            <div className="ue-swatches" data-swatches>
              {p.items.map((it, j) => item(it, `${i}-${j}-${it.label}`))}
            </div>
          </div>
        ) : isHex(p) ? (
          hexOpen && (
            <div key={`h${i}`} className="ue-hexrow" data-hexrow>
              <input
                ref={hexInput}
                type="text"
                aria-label={p.hex.name}
                data-field={p.hex.prop}
                data-hex={p.hex.prop}
                title="Type a colour as #rgb or #rrggbb, then press Enter."
                placeholder="#rrggbb"
                spellCheck={false}
                autoComplete="off"
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  e.stopPropagation()
                  const text = e.currentTarget.value
                  onHexDone()
                  p.hex.onCommit(text)
                }}
              />
            </div>
          )
        ) : (
          item(p, `${i}-${p.label}`)
        ),
      )}
    </div>,
    document.body,
  )
}
