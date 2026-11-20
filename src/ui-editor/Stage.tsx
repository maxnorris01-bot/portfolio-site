import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { labels } from '../data/uiEditor'
import { HANDLES, arrowNudge, handleAxes, movedFar, resizedBox, type Box, type Handle } from './geometry'
import { HEIGHT_MARGIN, bezel, fitScale, frameSize, toCss, type Orientation, type ViewName } from './devices'
import { canResize, isSvgElement, parentContentWidth, type Session } from './session'
import { snapBox, snapMove, snaps } from './snap'
import { fullWidthFits, snapsToParent } from './units'

/** What a finished resize asks for: the border box the element should have (CSS px) and the handle's axes. */
export interface ResizeRequest {
  handle: Handle
  box: Box
  /** The new width is within 2 CSS px of the parent's content width: the page writes `width: 100%` (HTML only). */
  fullWidth: boolean
}

interface Props {
  /** The element that carries the engine's iframe (the engine appends it). */
  frameHost: RefObject<HTMLDivElement | null>
  session: Session | null
  /** Changes whenever the preview did, so the boxes are measured again. */
  rev: number
  selected: number | null
  /** False in a view-only size: elements can be looked at and selected, but not changed. */
  editable: boolean
  view: ViewName
  orientation: Orientation
  onSelect: (index: number | null) => void
  onMove: (dx: number, dy: number) => void
  onResize: (req: ResizeRequest) => void
  onNudge: (dx: number, dy: number) => void
  /** The grid over the preview (drawn by this page, above the preview, in the preview's own px and scaled with the device), snapping to it, and the distance between lines. */
  grid: boolean
  snap: boolean
  spacing: number
}

/** `snap` is set for a resize of an HTML element whose `width: 100%` would fit its parent: the parent's content width, which a drag near it snaps to. */
type Drag = { kind: 'move' | Handle; startX: number; startY: number; pointer: number; moved: boolean; box: Box; hit: number | null; capture: Element; snap: number | null; html: boolean; scroll: { x: number; y: number } }

const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}
const inside = (b: Box, x: number, y: number) => x >= b.left && x <= b.left + b.width && y >= b.top && y <= b.top + b.height
const place = (b: Box) => ({ left: b.left, top: b.top, width: b.width, height: b.height })

/**
 * The preview with the host's own pointer layer over it. Hover and selection outlines, the eight resize handles and the drag feedback are
 * elements of THIS page, positioned from the preview element's bounding rect: nothing is injected into the preview document. The device is drawn
 * inside a wrapper that is scaled down (CSS transform) when it would not fit, and the pointer layer is inside that wrapper, so outlines and handles
 * need no conversion for drawing; but a pointer moves in SCREEN px, so every pointer distance is divided by the scale (toCss) before it becomes a
 * CSS px number for the engine. A drag changes nothing until the pointer is released: then the page makes ONE edit and
 * the preview is re-derived from the engine's result. Escape cancels a drag. Pointer events with pointer capture, so mouse, pen and touch work.
 */
export default function Stage({ frameHost, session, rev, selected, editable, view, orientation, onSelect, onMove, onResize, onNudge, grid, snap, spacing }: Props) {
  const overlay = useRef<HTMLDivElement>(null)
  const slot = useRef<HTMLDivElement>(null)
  const scaler = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [slotHeight, setSlotHeight] = useState<number | null>(null)
  const drag = useRef<Drag | null>(null)
  const [hover, setHover] = useState<Box | null>(null)
  const [selBox, setSelBox] = useState<Box | null>(null)
  const [ghost, setGhost] = useState<{ box: Box; text: string } | null>(null)
  const sel = useRef(selected)
  useLayoutEffect(() => {
    sel.current = selected
  }, [selected])

  const elementOf = useCallback((i: number | null) => (session && i !== null ? (session.preview.elements[i] ?? null) : null), [session])

  // Measure the selection again whenever the preview changed, the selection moved, or the page reflowed (images, fonts, a resize of the frame).
  useLayoutEffect(() => {
    const measure = () => {
      const el = elementOf(selected)
      setSelBox(el && el.isConnected ? boxOf(el) : null)
    }
    measure()
    const doc = session?.preview.doc
    const root = doc?.documentElement
    if (!doc || !root || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(root)
    // A device with its own screen height scrolls inside the frame: the outline follows the element.
    doc.addEventListener('scroll', measure, { passive: true })
    return () => {
      ro.disconnect()
      doc.removeEventListener('scroll', measure)
    }
  }, [session, rev, selected, elementOf])

  // The pointer layer covers the frame, so the wheel is handed on to a screen that scrolls (a phone or tablet); at its end the page scrolls as usual.
  useEffect(() => {
    const layer = overlay.current
    const win = session?.preview.doc.defaultView
    if (!layer || !win) return
    const onWheel = (e: WheelEvent) => {
      const k = layer.offsetWidth ? layer.getBoundingClientRect().width / layer.offsetWidth : 1
      const x = win.scrollX, y = win.scrollY
      win.scrollBy(toCss(e.deltaX, k), toCss(e.deltaY, k))
      if (win.scrollX !== x || win.scrollY !== y) e.preventDefault()
    }
    layer.addEventListener('wheel', onWheel, { passive: false })
    return () => layer.removeEventListener('wheel', onWheel)
  }, [session])

  // Scale to fit: whenever the room, the window or the device changes, the whole device is shrunk to fit (never enlarged). The wrapper's layout box
  // keeps its natural size, so the slot is given the scaled height. (Measured in the observer's callback, which also runs once on observe.)
  const framedView = view !== 'Desktop'
  useLayoutEffect(() => {
    const room = slot.current, box = scaler.current
    if (!room || !box || typeof ResizeObserver === 'undefined') return
    const fit = () => {
      const w = room.clientWidth
      if (w <= 0) return // hidden (the gallery covers it): keep what was measured
      const s = fitScale({ frameWidth: frameSize(view, orientation, 0).width, frameHeight: box.offsetHeight, areaWidth: w, availableHeight: window.innerHeight - HEIGHT_MARGIN, framed: framedView })
      setScale(s)
      setSlotHeight(box.offsetHeight * s)
    }
    const ro = new ResizeObserver(fit)
    ro.observe(room)
    ro.observe(box)
    window.addEventListener('resize', fit)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', fit)
    }
  }, [view, orientation, framedView])

  /** Screen px per CSS px of the stage as it is drawn now (1 when it is not scaled), read from the layout so it is the number the pointer really sees. */
  const kNow = () => {
    const o = overlay.current
    return o && o.offsetWidth ? o.getBoundingClientRect().width / o.offsetWidth : 1
  }
  const frameRect = () => overlay.current!.getBoundingClientRect()

  /** The element a point (in the frame's own coordinates) is over, as an index into the preview's elements; null over the empty page. */
  const hit = (x: number, y: number): number | null => {
    if (!session) return null
    const e = session.preview.doc.elementFromPoint(x, y)
    if (!e || e === session.preview.doc.documentElement || e === session.preview.doc.body) return null
    const i = session.preview.elements.indexOf(e)
    return i < 0 ? null : i
  }

  const cancel = useCallback(() => {
    const d = drag.current
    drag.current = null
    setGhost(null)
    if (d && d.capture.hasPointerCapture?.(d.pointer)) d.capture.releasePointerCapture(d.pointer)
  }, [])

  // Escape cancels a drag with no edit.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && drag.current) {
        e.preventDefault()
        cancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cancel])

  /** The parent's content width when a drag of this element may snap to it, else null. */
  const snapWidthOf = (el: Element | null, kind: Drag['kind']): number | null => {
    if (!el || kind === 'move' || !handleAxes(kind).width || isSvgElement(el)) return null
    const cs = el.ownerDocument.defaultView!.getComputedStyle(el)
    const num = (v: string) => parseFloat(v) || 0
    const fits = fullWidthFits({ sizing: cs.boxSizing, paddingX: num(cs.paddingLeft) + num(cs.paddingRight), borderX: num(cs.borderLeftWidth) + num(cs.borderRightWidth) })
    const parent = parentContentWidth(el)
    return fits && parent > 0 ? parent : null
  }
  /**
   * The box a resize drag gives: the dragged edges move; a width within 2 px of the parent's content width becomes exactly that (the 100% snap, which wins);
   * else, with Snap on (and Alt not held, and an HTML element), the dragged edges are put on grid lines of the preview's document.
   */
  const resizeBox = (d: Drag, kind: Handle, rx: number, ry: number, alt: boolean): { box: Box; snapped: boolean } => {
    const b = resizedBox(d.box, kind, rx, ry)
    if (d.snap !== null && handleAxes(kind).width && snapsToParent(b.width, d.snap)) return { box: { ...b, width: d.snap, left: kind.includes('w') ? b.left + b.width - d.snap : b.left }, snapped: true }
    if (!snaps({ snapOn: snap, html: d.html, alt })) return { box: b, snapped: false }
    const g = snapBox({ ...b, left: b.left + d.scroll.x, top: b.top + d.scroll.y }, kind, spacing)
    return { box: { ...g, left: g.left - d.scroll.x, top: g.top - d.scroll.y }, snapped: false }
  }
  /** A move that has gone (rx, ry): the offset to ask for, which with Snap on puts the element's top-left on the nearest grid lines. */
  const moveBy = (d: Drag, rx: number, ry: number, alt: boolean): { dx: number; dy: number } => {
    if (!snaps({ snapOn: snap, html: d.html, alt })) return { dx: rx, dy: ry }
    return snapMove({ left: d.box.left + d.scroll.x, top: d.box.top + d.scroll.y, dx: rx, dy: ry, spacing })
  }

  const arm = (e: ReactPointerEvent, kind: Drag['kind'], box: Box, h: number | null, capture: Element, el: Element | null = null) => {
    capture.setPointerCapture?.(e.pointerId)
    const win = session?.preview.doc.defaultView
    drag.current = { kind, startX: e.clientX, startY: e.clientY, pointer: e.pointerId, moved: false, box, hit: h, capture, snap: snapWidthOf(el, kind), html: !!el && !isSvgElement(el), scroll: { x: win?.scrollX ?? 0, y: win?.scrollY ?? 0 } }
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !session) return
    overlay.current?.focus({ preventScroll: true })
    const r = frameRect(), k = kNow()
    const x = toCss(e.clientX - r.left, k), y = toCss(e.clientY - r.top, k)
    const h = hit(x, y)
    const current = sel.current
    const selBoxNow = elementOf(current) ? boxOf(elementOf(current)!) : null
    const onSelected = current !== null && selBoxNow !== null && inside(selBoxNow, x, y)
    if (h === null && !onSelected) {
      onSelect(null)
      return
    }
    // Pressing on the selected element keeps it selected (it may be the start of a drag); anywhere else selects what is under the pointer.
    const target = onSelected ? current : h
    if (!onSelected) onSelect(h)
    const el = elementOf(target)
    if (editable && el) arm(e, 'move', boxOf(el), h, e.currentTarget, el)
  }

  const onHandleDown = (e: ReactPointerEvent<HTMLDivElement>, handle: Handle) => {
    e.stopPropagation()
    e.preventDefault()
    const el = elementOf(sel.current)
    if (e.button !== 0 || !editable || !el) return
    arm(e, handle, boxOf(el), null, e.currentTarget, el)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (d && d.pointer === e.pointerId) {
      // Whether it is a drag at all is judged in screen px (how far the hand moved); what it asks for is in CSS px.
      if (!d.moved && !movedFar(e.clientX - d.startX, e.clientY - d.startY)) return
      d.moved = true
      const k = kNow()
      const rx = Math.round(toCss(e.clientX - d.startX, k)), ry = Math.round(toCss(e.clientY - d.startY, k))
      if (d.kind === 'move') {
        const m = moveBy(d, rx, ry, e.altKey)
        const sh = (n: number) => `${n >= 0 ? '+' : ''}${Math.round(n * 10) / 10}`
        setGhost({ box: { ...d.box, left: d.box.left + m.dx, top: d.box.top + m.dy }, text: `${sh(m.dx)}, ${sh(m.dy)}` })
      } else {
        const { box: b, snapped } = resizeBox(d, d.kind, rx, ry, e.altKey)
        setGhost({ box: b, text: snapped ? labels.fullWidth : `${Math.round(b.width)} × ${Math.round(b.height)}` })
      }
      return
    }
    if (e.pointerType !== 'mouse' || !session) return
    const r = frameRect(), k = kNow()
    const h = hit(toCss(e.clientX - r.left, k), toCss(e.clientY - r.top, k))
    const el = elementOf(h)
    setHover(el && h !== sel.current ? boxOf(el) : null)
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.pointer !== e.pointerId) return
    cancel()
    if (!d.moved) {
      // A plain click on the selected element selects what is under the pointer (a child, perhaps).
      if (d.kind === 'move' && d.hit !== null && d.hit !== sel.current) onSelect(d.hit)
      return
    }
    const k = kNow()
    const dx = Math.round(toCss(e.clientX - d.startX, k)), dy = Math.round(toCss(e.clientY - d.startY, k))
    if (d.kind === 'move') {
      const m = moveBy(d, dx, dy, e.altKey)
      onMove(m.dx, m.dy)
    } else {
      const { box, snapped } = resizeBox(d, d.kind, dx, dy, e.altKey)
      onResize({ handle: d.kind, box, fullWidth: snapped })
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey) return // Alt+Up Arrow selects the parent (the tool's own key handler); it is not a nudge
    const n = arrowNudge(e.key, e.shiftKey)
    if (!n || sel.current === null || !editable) return
    e.preventDefault()
    onNudge(n.dx, n.dy)
  }

  const el = elementOf(selected)
  const resizable = !!el && editable && canResize(el)

  const framed = view !== 'Desktop'
  const b = bezel(view, orientation)
  return (
    <div ref={slot} className="ue-device-slot" style={slotHeight !== null ? { height: slotHeight } : undefined}>
      <div
        ref={scaler}
        className="ue-device-scale"
        data-device-scale
        style={{ width: frameSize(view, orientation, 0).width, transform: scale < 1 ? `scale(${scale})` : undefined, ['--ue-inv' as string]: String(1 / scale) }}
      >
        <div
          className={`ue-device is-${view.toLowerCase()}`}
          {...(framed ? { 'data-device-frame': '', 'data-device': view.toLowerCase(), 'data-orientation': orientation } : {})}
          style={framed ? { padding: `${b.top}px ${b.right}px ${b.bottom}px ${b.left}px` } : undefined}
        >
          <div className="ue-stage" data-stage>
            <div ref={frameHost} className="ue-frame" />
            {grid && <div className="ue-grid" data-grid-overlay aria-hidden="true" style={{ backgroundSize: `${spacing}px ${spacing}px` }} />}
            <div
              ref={overlay}
              className={`ue-overlay${selected !== null && editable ? ' is-armed' : ''}`}
              tabIndex={session ? 0 : -1}
              role="group"
              aria-label={labels.preview}
              aria-describedby="ue-preview-hint"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={cancel}
              onPointerLeave={() => !drag.current && setHover(null)}
              onKeyDown={onKeyDown}
            >
              {hover && <div data-hover className="ue-hover" style={place(hover)} />}
              {selBox && (
                <div data-selection className="ue-selection" style={place(selBox)}>
                  {resizable && HANDLES.map((h) => <div key={h} data-handle={h} className={`ue-handle is-${h}`} aria-hidden="true" onPointerDown={(e) => onHandleDown(e, h)} />)}
                </div>
              )}
              {ghost && (
                <div className="ue-ghost" style={place(ghost.box)} aria-hidden="true">
                  <span className="ue-ghost-text" data-drag-label>
                    {ghost.text}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
