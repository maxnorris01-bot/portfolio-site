import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { labels } from '../data/uiEditor'
import { HANDLES, arrowNudge, movedFar, resizedBox, type Box, type Handle } from './geometry'
import { canResize, type Session } from './session'

/** What a finished resize asks for: the border box the element should have (CSS px) and the handle's axes. */
export interface ResizeRequest {
  handle: Handle
  box: Box
}

interface Props {
  /** The element that carries the engine's iframe (the engine appends it). */
  frameHost: RefObject<HTMLDivElement | null>
  session: Session | null
  /** Changes whenever the preview did, so the boxes are measured again. */
  rev: number
  selected: number | null
  /** False in the Tablet view: elements can be looked at and selected, but not changed. */
  editable: boolean
  onSelect: (index: number | null) => void
  onMove: (dx: number, dy: number) => void
  onResize: (req: ResizeRequest) => void
  onNudge: (dx: number, dy: number) => void
}

type Drag = { kind: 'move' | Handle; startX: number; startY: number; pointer: number; moved: boolean; box: Box; hit: number | null; capture: Element }

const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}
const inside = (b: Box, x: number, y: number) => x >= b.left && x <= b.left + b.width && y >= b.top && y <= b.top + b.height
const place = (b: Box) => ({ left: b.left, top: b.top, width: b.width, height: b.height })

/**
 * The preview with the host's own pointer layer over it. Hover and selection outlines, the eight resize handles and the drag feedback are
 * elements of THIS page, positioned from the preview element's bounding rect: nothing is injected into the preview document, and the preview is
 * never scaled, so a pointer delta is a CSS px delta. A drag changes nothing until the pointer is released: then the page makes ONE edit and
 * the preview is re-derived from the engine's result. Escape cancels a drag. Pointer events with pointer capture, so mouse, pen and touch work.
 */
export default function Stage({ frameHost, session, rev, selected, editable, onSelect, onMove, onResize, onNudge }: Props) {
  const overlay = useRef<HTMLDivElement>(null)
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
    const root = session?.preview.doc.documentElement
    if (!root || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(root)
    return () => ro.disconnect()
  }, [session, rev, selected, elementOf])

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

  const arm = (e: ReactPointerEvent, kind: Drag['kind'], box: Box, h: number | null, capture: Element) => {
    capture.setPointerCapture?.(e.pointerId)
    drag.current = { kind, startX: e.clientX, startY: e.clientY, pointer: e.pointerId, moved: false, box, hit: h, capture }
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !session) return
    overlay.current?.focus({ preventScroll: true })
    const r = frameRect()
    const x = e.clientX - r.left, y = e.clientY - r.top
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
    if (editable && el) arm(e, 'move', boxOf(el), h, e.currentTarget)
  }

  const onHandleDown = (e: ReactPointerEvent<HTMLDivElement>, handle: Handle) => {
    e.stopPropagation()
    e.preventDefault()
    const el = elementOf(sel.current)
    if (e.button !== 0 || !editable || !el) return
    arm(e, handle, boxOf(el), null, e.currentTarget)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (d && d.pointer === e.pointerId) {
      const dx = e.clientX - d.startX, dy = e.clientY - d.startY
      if (!d.moved && !movedFar(dx, dy)) return
      d.moved = true
      const rx = Math.round(dx), ry = Math.round(dy)
      if (d.kind === 'move') setGhost({ box: { ...d.box, left: d.box.left + rx, top: d.box.top + ry }, text: `${rx >= 0 ? '+' : ''}${rx}, ${ry >= 0 ? '+' : ''}${ry}` })
      else {
        const b = resizedBox(d.box, d.kind, rx, ry)
        setGhost({ box: b, text: `${Math.round(b.width)} × ${Math.round(b.height)}` })
      }
      return
    }
    if (e.pointerType !== 'mouse' || !session) return
    const r = frameRect()
    const h = hit(e.clientX - r.left, e.clientY - r.top)
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
    const dx = Math.round(e.clientX - d.startX), dy = Math.round(e.clientY - d.startY)
    if (d.kind === 'move') onMove(dx, dy)
    else onResize({ handle: d.kind, box: resizedBox(d.box, d.kind, dx, dy) })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = arrowNudge(e.key, e.shiftKey)
    if (!n || sel.current === null || !editable) return
    e.preventDefault()
    onNudge(n.dx, n.dy)
  }

  const el = elementOf(selected)
  const resizable = !!el && editable && canResize(el)

  return (
    <div className="ue-stage" data-stage>
      <div ref={frameHost} className="ue-frame" />
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
            <span className="ue-ghost-text">{ghost.text}</span>
          </div>
        )}
      </div>
    </div>
  )
}
