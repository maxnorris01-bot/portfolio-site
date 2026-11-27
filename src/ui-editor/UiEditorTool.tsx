import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { MAX_BYTES, codeView as codeViewText, deviceNote, labels, messages, panel } from '../data/uiEditor'
import CodeView, { type CodeViewHandle } from './CodeView'
import { changeOrder, counterText, diffHunks, offsetOfFile, stepChange, type Hunk } from './diff'
import Gallery from './Gallery'
import { canRotate, isEditable, viewport, type Orientation } from './devices'
import { cssSizeFor, handleAxes } from './geometry'
import { compensated } from './resizeedge'
import { Icon, IconButton, type IconName } from './icons'
import { CommentPopover, NotesList } from './Popovers'
import { kindOfFile, noteCount, noteRows, stripNotes } from './notes'
import { MenuButton } from './Menu'
import { INSERT_ITEMS } from './place'
import { fromFiles, fromPaste, downloadName, type Doc, type Incoming } from './intake'
import Ribbon, { type ViewName } from './Ribbon'
import { chainOf } from './path'
import { copyName, nameList, sectionHeader } from './sections'
import { SAMPLES, type SampleId } from './samples'
import { applyOne, closeSession, indexOfPath, isSvgElement, labelOf, moveTarget, openSession, parentContentWidth, pathOf, setViewport, trialEdges, trialEdit, type Applied, type Session } from './session'
import Stage, { type ResizeRequest } from './Stage'
import { emptyList, listReduce, mergeOffsets, canRedo, canUndo, customCount, effectiveEdits, type EditList, type ListAction } from './state'
import { noteSentence, refusalSentence } from './values'
import { widthToWrite, type WidthUnit } from './units'
import { listNotes, tabletMin, type Edit, type Environment, type InsertKind } from './vendor/engine.js'
import './UiEditorTool.css'

type Msg = { kind: 'ok' | 'refusal' | 'info'; text: string; notes?: string[]; /** One plain extra line said after the message (round 5: a dragged edge that could not follow the pointer). */ extra?: string }
type Confirm = { text: string; run: () => void; /** Views stage 2: the words of the yes button, and where the focus goes (the Reset button when nothing was done, the open view's button when it was). */ yes?: string; back?: string; after?: string }

const VIEWS: { name: ViewName; icon: IconName }[] = [
  { name: 'Desktop', icon: 'desktop' },
  { name: 'Tablet', icon: 'tablet' },
  { name: 'Phone', icon: 'phone' },
]

/** The visitor-facing editor: open some HTML or SVG, select an element, change it, copy or download the updated code. */
export default function UiEditorTool() {
  const [doc, setDoc] = useState<Doc | null>(null)
  const [list, setListState] = useState<EditList>(emptyList())
  const [view, setView] = useState<ViewName>('Desktop')
  const [orientation, setOrientation] = useState<Orientation>('portrait')
  const [selPath, setSelPath] = useState<string | null>(null)
  const [message, setMessage] = useState<Msg | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [rev, setRev] = useState(0)
  const [nonce, setNonce] = useState(0)
  const [replay, setReplay] = useState(0)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [holdHeight, setHoldHeight] = useState(0)
  const [galleryOpen, setGalleryOpen] = useState(false)
  // The grid over the preview and snapping to it: both off at every page load, nothing remembered; the distance between lines in CSS px.
  const [grid, setGrid] = useState(false)
  const [snap, setSnap] = useState(false)
  const [spacing, setSpacing] = useState(8)
  // Insert round 1: the kind being placed, and the path of the element whose text is open for editing.
  const [placing, setPlacing] = useState<InsertKind | null>(null)
  const [editingText, setEditingText] = useState<string | null>(null)
  // Stage 2: the note being written (the element's index, or 'page') and where it was opened from; the Notes list; whether the code includes the notes.
  const [commentFor, setCommentFor] = useState<{ target: number | 'page'; opener: 'bar' | 'pin' | 'notes'; pin?: number } | null>(null)
  const [notesOpen, setNotesOpen] = useState(false)
  const [include, setInclude] = useState(true)
  const [unitState, setUnitState] = useState<{ path: string | null; unit: WidthUnit }>({ path: null, unit: 'px' })
  // The walk over the changes of all the files: the change last visited (0: none) belongs to the export it was visited in, so the next edit starts it again.
  const [walk, setWalk] = useState<{ k: number; files: Record<string, string> | null; nonce: number }>({ k: 0, files: null, nonce: 0 })

  const frameHost = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLElement>(null)
  const sessionRef = useRef<Session | null>(null)
  const listRef = useRef(list)
  const viewRef = useRef(view)
  const orientRef = useRef(orientation)
  const busyRef = useRef(false)
  const generation = useRef(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const keepRef = useRef<HTMLButtonElement>(null)
  const codeViews = useRef<Record<string, CodeViewHandle | null>>({})
  const codeBox = useRef<HTMLDetailsElement>(null)
  const pasteMarkup = useRef<HTMLTextAreaElement>(null)
  const pasteCss = useRef<HTMLTextAreaElement>(null)

  const setList = (next: EditList) => {
    listRef.current = next
    setListState(next)
  }
  const show = (m: Msg | null) => {
    setMessage(m)
    setNonce((n) => n + 1)
  }
  /** The preview is being rebuilt: marked at once (in the event), so nothing acts on it before it is ready. */
  const startBusy = () => {
    busyRef.current = true
    setBusy(true)
  }
  const svgDoc = doc?.kind === 'svg'
  // The view is the environment an edit is made in: Desktop edits reach Phone and Tablet, Phone and Tablet edits are custom to that view.
  const environment: Environment = view === 'Phone' ? 'phone' : view === 'Tablet' ? 'tablet' : 'desktop'
  const editable = isEditable(view, orientation)

  // ---- the preview: built from the ORIGINAL document, with the edit list replayed on it ----
  // A new document, a view or an orientation closes the old preview first. A replay of the same document (a merged move, Undo, Redo, Reset all) builds the new preview BEHIND
  // the old one, which stays on screen until the new one is ready; the swap (below) is one step, so the stage never goes empty.
  const replayBehind = useRef(false)
  const swap = useRef<{ buffer: HTMLElement; old: Session } | null>(null)
  useEffect(() => {
    if (!doc) return
    const mine = ++generation.current
    const host = frameHost.current
    if (!host) return
    const old = sessionRef.current
    const behind = replayBehind.current && !!old
    replayBehind.current = false
    let buffer: HTMLElement | null = null
    if (behind) {
      buffer = document.createElement('div')
      buffer.setAttribute('data-preview-buffer', '')
      Object.assign(buffer.style, { position: 'absolute', left: '0', top: '0', visibility: 'hidden' })
      host.appendChild(buffer)
    } else {
      setHoldHeight(old?.preview.iframe.offsetHeight ?? 0)
      closeSession(old)
      sessionRef.current = null
      setSession(null)
    }
    busyRef.current = true
    setBusy(true)
    void openSession(doc, effectiveEdits(listRef.current.edits), buffer ?? host, viewport(viewRef.current, orientRef.current)).then((r) => {
      if (mine !== generation.current) {
        if (r.ok) closeSession(r.session)
        buffer?.remove()
        return
      }
      busyRef.current = false
      setBusy(false)
      if (!r.ok) {
        buffer?.remove()
        if (behind) {
          closeSession(old)
          sessionRef.current = null
          setSession(null)
        }
        show({ kind: 'refusal', text: messages.cannotOpen(r.message) })
        setDoc(null)
        return
      }
      if (buffer && old) swap.current = { buffer, old }
      sessionRef.current = r.session
      setSession(r.session)
      setHoldHeight(0)
      setRev((n) => n + 1)
    })
  }, [doc, replay])
  // The swap: before the browser draws, the new preview takes the old one's place and the old one is closed (once). The Stage has measured the new preview by now.
  useLayoutEffect(() => {
    const s = swap.current
    if (!s) return
    swap.current = null
    s.buffer.style.cssText = ''
    const wrapper = s.old.preview.iframe.parentElement
    closeSession(s.old)
    if (wrapper?.hasAttribute('data-preview-buffer')) wrapper.remove()
  }, [session])

  // Leaving the page takes the preview away.
  useEffect(
    () => () => {
      generation.current++
      closeSession(sessionRef.current)
    },
    [],
  )

  // The width unit belongs to the selected element: another selection starts in px again.
  const widthUnit: WidthUnit = unitState.path === selPath ? unitState.unit : 'px'
  const selected = session && selPath ? indexOfPath(session.preview.model, selPath) : -1
  const selIndex = selected >= 0 ? selected : null

  // ---- opening something ----
  const load = (next: Doc, warn: string[]) => {
    setList(emptyList())
    setSelPath(null)
    setPlacing(null)
    setEditingText(null)
    setCommentFor(null)
    setNotesOpen(false)
    setWarnings(warn)
    setGalleryOpen(false)
    setPasteOpen(false)
    show({ kind: 'info', text: messages.opened(next.name) })
    startBusy()
    setDoc({ ...next })
  }
  /** Run an action that replaces the open document; with unsaved edits, ask first. */
  const replaceDocument = (run: () => void) => {
    if (listRef.current.edits.length === 0) return run()
    setConfirm({ text: labels.replaceText, run })
  }
  useEffect(() => {
    if (confirm) keepRef.current?.focus()
  }, [confirm])

  /** After a dialog closes the focus goes back to a button of the bar (a view reset: the Reset button when nothing was done, the open view's button when it was). */
  const giveFocusTo = (selector?: string) => {
    if (!selector) return
    window.setTimeout(() => rootRef.current?.querySelector<HTMLElement>(`${selector}:not(:disabled)`)?.focus({ preventScroll: true }), 0)
  }
  const onPickSample = (id: SampleId) => replaceDocument(() => load(SAMPLES[id], []))
  /** The Samples button: over an open document it shows or hides the gallery; on a first visit the gallery is already there, so it takes the visitor to it. */
  const onSamples = () => {
    // The paste area is closed by the gallery: Samples with it open shows the gallery again, it never leaves the area on screen.
    if (pasteOpen) {
      setPasteOpen(false)
      setGalleryOpen(true)
      return
    }
    if (doc) setGalleryOpen((o) => !o)
    else rootRef.current?.querySelector<HTMLElement>('[data-sample-card]')?.focus()
  }
  /** "Your own code": Paste shows the paste area in place of the gallery; Upload opens the file chooser (the same types and limits as before). */
  const onPasteCard = () => {
    setPasteOpen(true)
    setGalleryOpen(false)
  }
  const onUploadCard = () => fileInput.current?.click()
  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.currentTarget.files ?? [])
    e.currentTarget.value = ''
    if (!files.length) return
    if (files.reduce((n, f) => n + f.size, 0) > MAX_BYTES) return show({ kind: 'refusal', text: messages.tooBig })
    const incoming: Incoming[] = await Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text(), bytes: f.size })))
    const r = fromFiles(incoming)
    if (!r.ok) return show({ kind: 'refusal', text: r.message })
    replaceDocument(() => load(r.doc, r.warnings))
  }
  const onOpenPaste = () => {
    const r = fromPaste(pasteMarkup.current?.value ?? '', pasteCss.current?.value ?? '')
    if (!r.ok) return show({ kind: 'refusal', text: r.message })
    replaceDocument(() => load(r.doc, r.warnings))
  }

  // ---- edits ----
  const scope = () => (svgDoc ? {} : { environment })

  /** One more edit on the live preview. A refusal shows the engine's reason and changes nothing. */
  const run = (edit: Edit, what: string, nextSel?: string | null | ((s: Session, applied: Extract<Applied, { ok: true }>) => string | null), extra?: string, watch?: Element | null): boolean => {
    const s = sessionRef.current
    if (!s || busyRef.current || !editable) return false
    const before = watch?.getBoundingClientRect()
    const applied = applyOne(s, edit)
    if (!applied.ok) {
      show({ kind: 'refusal', text: refusalSentence(messages.refused, { code: 'engine', message: applied.message }) })
      return false
    }
    // `watch`: an element that must have moved (a nudge). An edit the engine took but that shows nothing (a table cell ignores a shift) is not kept: the preview is built again from the list and one plain line says why.
    if (watch && before) {
      const after = watch.getBoundingClientRect()
      if (Math.abs(after.left - before.left) + Math.abs(after.top - before.top) < 0.4) {
        show({ kind: 'refusal', text: messages.nudgeNoEffect })
        startBusy()
        replayBehind.current = true
        setReplay((n) => n + 1)
        return false
      }
    }
    const last = listRef.current.edits[listRef.current.edits.length - 1]
    const merges = mergeOffsets(last, edit) !== undefined
    setList(listReduce(listRef.current, { type: 'apply', edit }))
    if (nextSel !== undefined) setSelPath(typeof nextSel === 'function' ? nextSel(s, applied) : nextSel)
    show({ kind: 'ok', text: messages.applied(what), notes: applied.notes.map(noteSentence), extra })
    // Two moves in a row are one edit: the preview is rebuilt so it shows exactly what the list says.
    if (merges) {
      startBusy()
      replayBehind.current = true
      setReplay((n) => n + 1)
    } else setRev((n) => n + 1)
    return true
  }

  const target = () => (selIndex !== null ? selIndex : null)

  const onSet = (properties: Record<string, string>, label: string) => {
    const t = target()
    if (t === null) return
    run({ op: 'set', target: t, properties, ...scope() }, `${label.toLowerCase()} set to ${Object.values(properties)[0]}`)
  }
  const onBadValue = (label: string) => show({ kind: 'refusal', text: messages.badValue(label.toLowerCase()) })

  // ---- insert, text and Delete (insert round 1): content edits, the same at every width, with no Link and no pins ----
  const commentOff = !session ? '' : !editable ? (view === 'Tablet' ? labels.commentTipTablet : labels.commentTipViewOnly) : selIndex === null ? labels.commentTipNone : ''
  const insertOff = svgDoc ? labels.insertTipSvg : !editable ? (view === 'Tablet' ? labels.insertTipTablet : labels.insertTipViewOnly) : ''
  const startPlacing = (kind: InsertKind) => {
    if (insertOff || !session) return
    setEditingText(null)
    setPlacing(kind)
    show({ kind: 'info', text: messages.placing((INSERT_ITEMS.find((i) => i.kind === kind)?.label ?? 'element').toLowerCase()) })
  }
  const cancelPlacing = () => {
    if (!placing) return
    setPlacing(null)
    show({ kind: 'info', text: messages.placingCancelled })
  }
  const trialInsert = (edit: Edit) => (session ? trialEdit(session, edit) : null)
  const onPlace = (edit: Edit) => {
    const what = (INSERT_ITEMS.find((i) => i.kind === (edit as { kind?: InsertKind }).kind)?.label ?? 'element').toLowerCase()
    setPlacing(null)
    run(edit, what, (s, applied) => (applied.selected !== undefined ? pathOf(s.preview.model, applied.selected) : null))
    show({ kind: 'ok', text: messages.inserted(what) })
  }
  // The engine's reason for a spot it refuses; moving to a spot it accepts says what placing is waiting for again.
  const onPlaceReason = (reason: string | null) => {
    if (reason) show({ kind: 'refusal', text: refusalSentence(messages.refused, { code: 'engine', message: reason }) })
    else if (placing) show({ kind: 'info', text: messages.placing((INSERT_ITEMS.find((i) => i.kind === placing)?.label ?? 'element').toLowerCase()) })
  }
  // Opened by the Edit text button: closing the text box gives the focus back to that button (stage 3, Y12), else to the preview.
  const textFromButton = useRef(false)
  const startTextEdit = (index?: number, fromButton = false) => {
    const s = sessionRef.current
    if (!s || busyRef.current || !editable || placing) return
    const i = index ?? selIndex
    if (i === null || i === undefined) return
    const el = s.preview.elements[i]
    if (!el) return
    // The engine says whether this element's text can be replaced: an element with child elements is refused, and nothing opens.
    const t = trialEdit(s, { op: 'text', target: i, text: el.textContent ?? '' })
    if (!t.ok) return show({ kind: 'refusal', text: refusalSentence(messages.refused, { code: 'engine', message: t.message }) })
    const path = pathOf(s.preview.model, i)
    textFromButton.current = fromButton
    setSelPath(path)
    setEditingText(path)
  }
  const stopTextEdit = (focusPreview: boolean) => {
    setEditingText(null)
    if (focusPreview) window.setTimeout(() => rootRef.current?.querySelector<HTMLElement>(textFromButton.current ? 'button[aria-label="' + labels.editText + '"]:not(:disabled)' : '.ue-overlay')?.focus({ preventScroll: true }), 0)
  }
  const applyText = (text: string) => {
    const t = selIndex
    stopTextEdit(true)
    if (t === null) return
    if (run({ op: 'text', target: t, text }, 'text')) show({ kind: 'ok', text: messages.textChanged })
  }
  const deleteElement = () => {
    const s = sessionRef.current
    if (!s || selIndex === null || !editable) return
    const parent = s.preview.elements[selIndex]?.parentElement
    const parentIndex = parent ? s.preview.elements.indexOf(parent) : -1
    // The element goes and the selection moves to its parent (its index does not change: the parent comes first in the document).
    if (run({ op: 'remove', target: selIndex }, 'removed', (s2) => (parentIndex >= 0 && parent && parent !== s2.preview.doc.body ? pathOf(s2.preview.model, parentIndex) : null))) show({ kind: 'ok', text: messages.removed })
  }
  // ---- notes (stage 2): `note` edits, the same at every width ----
  const selectIndexOnly = (i: number) => session && setSelPath(pathOf(session.preview.model, i))
  const saveNote = (target: number | 'page', text: string, existed: boolean) => {
    const had = existed
    const c = commentFor
    setCommentFor(null)
    // The focus goes back to what opened the popover (the Comment button, the pin or Notes), once the popover is gone.
    const el = c ? document.querySelector<HTMLElement>(anchorOf(c)) : null
    if (el) window.setTimeout(() => (el.isConnected ? el : document.querySelector<HTMLElement>(anchorOf(c!)))?.focus({ preventScroll: true }), 0)
    if (text === '' && !had) return
    if (run({ op: 'note', target, text }, 'note')) show({ kind: 'ok', text: text === '' ? messages.noteDeleted : messages.noteSaved })
  }
  const anchorOf = (c: NonNullable<typeof commentFor>) => (c.opener === 'pin' ? `[data-pin][data-n="${c.pin}"]` : c.opener === 'notes' ? 'button[data-opens="notes"]' : '.ue-bar button[data-opens="comment"]')
  const openerOf = (c: NonNullable<typeof commentFor>): HTMLElement | null => {
    const root = rootRef.current
    if (!root) return null
    return c.opener === 'pin' ? root.querySelector<HTMLElement>(`[data-pin][data-n="${c.pin}"]`) : root.querySelector<HTMLElement>(c.opener === 'notes' ? 'button[data-opens="notes"]' : 'button[data-opens="comment"]')
  }
  const closeComment = () => {
    const c = commentFor
    setCommentFor(null)
    const el = c ? openerOf(c) : null
    if (el) window.setTimeout(() => el.focus({ preventScroll: true }), 0)
  }
  const closeNotes = () => {
    setNotesOpen(false)
    const el = rootRef.current?.querySelector<HTMLElement>('button[data-opens="notes"]')
    if (el) window.setTimeout(() => el.focus({ preventScroll: true }), 0)
  }
  const openComment = (c: { target: number | 'page'; opener: 'bar' | 'pin' | 'notes'; pin?: number }) => {
    setNotesOpen(false)
    setCommentFor(c)
  }
  const canDelete = !!session && selIndex !== null && editable && trialEdit(session, { op: 'remove', target: selIndex }).ok

  const onMove = (dx: number, dy: number) => {
    const t = target()
    if (t === null) return
    run(...moveEdit(t, dx, dy, 'moved'))
  }
  // A move (a drag or an arrow key) is custom to where it is made: in Phone or Tablet one rule for that view's own range, in Desktop one rule for every width above the Phone breakpoint
  // (the Tablet range too, when the page has one). An SVG has no environments, so there it applies everywhere.
  const moveScope = () => (svgDoc ? { link: true } : environment === 'desktop' ? { environment, link: false } : { environment })
  const moveEdit = (t: number, dx: number, dy: number, verb: string): [Edit, string] => {
    const covers = view !== 'Desktop' ? `${view} only` : session && tabletMin(session.breakpoint) <= 768 ? 'Desktop and Tablet sizes' : 'Desktop only'
    return [{ op: 'offset', target: t, dx, dy, ...moveScope() }, `${verb} by ${dx}, ${dy} px${svgDoc ? '' : ` (${covers})`}`]
  }
  // Keys that arrive while the preview is being rebuilt (a run of arrow presses is one merged edit) are added up and applied when it is ready.
  const pendingNudge = useRef({ dx: 0, dy: 0 })
  const onNudge = (dx: number, dy: number) => {
    if (busyRef.current) {
      pendingNudge.current = { dx: pendingNudge.current.dx + dx, dy: pendingNudge.current.dy + dy }
      return
    }
    const t = target()
    if (t === null) return
    const [edit, what] = moveEdit(t, dx, dy, 'nudged')
    // The element is read from the live session, not from this render's: a press can land between a rebuild finishing and the screen drawing it again.
    run(edit, what, undefined, undefined, sessionRef.current?.preview.elements[t])
  }
  const onResize = async ({ handle, box, fullWidth }: ResizeRequest) => {
    const t = target()
    const el = t !== null ? session?.preview.elements[t] : null
    if (t === null || !el || !session) return
    const cs = session.preview.doc.defaultView!.getComputedStyle(el)
    const num = (v: string) => parseFloat(v) || 0
    const size = cssSizeFor(box, { sizing: cs.boxSizing, paddingX: num(cs.paddingLeft) + num(cs.paddingRight), paddingY: num(cs.paddingTop) + num(cs.paddingBottom), borderX: num(cs.borderLeftWidth) + num(cs.borderRightWidth), borderY: num(cs.borderTopWidth) + num(cs.borderBottomWidth) })
    const axes = handleAxes(handle)
    const svg = isSvgElement(el)
    const unit = svg ? '' : 'px'
    const properties: Record<string, string> = {}
    // A width is written in the unit the ribbon is in (px or % of the parent's content width), or as 100% when the drag snapped to the parent's edge.
    if (axes.width) properties.width = svg ? `${size.width}` : widthToWrite({ unit: widthUnit, cssPx: size.width, parentPx: parentContentWidth(el), snapped: fullWidth })
    if (axes.height) properties.height = `${size.height}${unit}`
    const what = `resized to ${Object.values(properties).join(' × ')}`
    const plain: Edit = { op: 'set', target: t, properties, ...scope() }
    const west = handle.includes('w'), north = handle.includes('n')
    if (!west && !north) {
      run(plain, what)
      return
    }
    // The west and north edges: the dragged edge follows the pointer and the opposite edge stays (the width or height plus a compensating margin), tried on a scratch
    // preview first. When that cannot be done exactly (the engine refuses it, or something else would move, or it is an SVG) the old behaviour is used and one plain
    // line says so.
    const line = [west ? messages.edgeFallback.west : '', north ? messages.edgeFallback.north : ''].filter(Boolean).join(' ')
    if (svg || busyRef.current) {
      run(plain, what, undefined, svg ? line : undefined)
      return
    }
    const rect = el.getBoundingClientRect()
    const margins = compensated(handle, { width: num(cs.width), height: num(cs.height), marginLeft: parseFloat(cs.marginLeft), marginTop: parseFloat(cs.marginTop) }, size)
    const compEdit: Edit = { op: 'set', target: t, properties: { ...properties, ...Object.fromEntries(Object.entries(margins).filter(([k]) => k.startsWith('margin'))) }, ...scope() }
    busyRef.current = true
    const tried = await trialEdges(session, effectiveEdits(listRef.current.edits), compEdit, viewport(viewRef.current, orientRef.current), t, handle, box.left - rect.left, box.top - rect.top).finally(() => {
      busyRef.current = false
    })
    if (sessionRef.current !== session) return
    if (tried.ok) run(compEdit, what)
    else run(plain, what, undefined, line)
  }
  const onReorder = (dir: 'up' | 'down') => {
    const t = target()
    if (t === null || !session) return
    const m = moveTarget(session.preview.model, t, dir)
    if (!m) return
    run({ op: 'reorder', target: t, placement: m.placement, sibling: m.sibling, ...scope() }, `moved ${dir} in the order`, m.pathAfter)
  }

  // ---- undo, redo, reset: replay the list on the original ----
  const stepList = (action: ListAction, what: string) => {
    if (busyRef.current) return
    const before = listRef.current
    const next = listReduce(before, action)
    if (next === before) return
    const changed = action.type === 'undo' ? before.edits.slice(next.edits.length) : action.type === 'redo' ? next.edits.slice(before.edits.length) : action.type === 'resetView' ? [] : before.edits
    // A reorder changes which element a path names: the selection is let go rather than guessed.
    if (changed.some((e) => e.op === 'reorder' || e.op === 'insert' || e.op === 'remove')) setSelPath(null)
    setPlacing(null)
    setEditingText(null)
    setCommentFor(null)
    setNotesOpen(false)
    setList(next)
    startBusy()
    replayBehind.current = true
    setReplay((n) => n + 1)
    show({ kind: 'info', text: what })
  }
  // Views stage 2: the small views' own changes (the engine's list of them, with the view resets applied): the mark on a view button reads them.
  const customised = { Tablet: customCount(list.edits, 'tablet') > 0, Phone: customCount(list.edits, 'phone') > 0 }
  const viewOf = (e: { environment: 'phone' | 'tablet' }) => (e.environment === 'phone' ? 'Phone' : 'Tablet')
  const onUndo = () => {
    const last = list.edits[list.edits.length - 1]
    stepList({ type: 'undo' }, last?.op === 'resetView' ? messages.undoneViewReset(viewOf(last)) : messages.undone)
  }
  const onRedo = () => {
    const next = list.redo[list.redo.length - 1]
    stepList({ type: 'redo' }, next?.op === 'resetView' ? messages.redoneViewReset(viewOf(next)) : messages.redone)
  }
  const small = view === 'Phone' || view === 'Tablet'
  /** "Reset to Desktop view": takes every change made in the open small view out of the list (one history entry, so one Undo brings them back); the dialog says so first. */
  const onResetView = () => {
    if (!small || !customised[view] || busyRef.current) return
    const environment = view === 'Phone' ? 'phone' : 'tablet'
    setConfirm({ text: labels.resetViewText(view), yes: labels.resetViewYes(view), back: '[data-reset-view]', after: '[data-view-button][aria-pressed="true"]', run: () => stepList({ type: 'resetView', environment }, messages.viewReset(view)) })
  }
  const onReset = () => setConfirm({ text: labels.resetText, run: () => stepList({ type: 'reset' }, messages.reset) })

  const onRootKey = (e: KeyboardEvent<HTMLElement>) => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
    const t = e.target as HTMLElement
    if (t.matches('input, textarea, select')) return // a field's own undo
    e.preventDefault()
    if (e.shiftKey) onRedo()
    else onUndo()
  }

  // Alt+Up Arrow selects the parent of the selected element (the selection only). It is a window-level key so it also works when nothing has the focus (a click on a path
  // button takes the focus away with the button), and it is left to a field when the focus is in one.
  const latestParent = useRef<() => void>(() => undefined)
  useEffect(() => {
    latestParent.current = () => {
      const el = session && selIndex !== null ? session.preview.elements[selIndex] : null
      const chain = el ? chainOf(el) : []
      if (session && chain.length > 1) setSelPath(pathOf(session.preview.model, session.preview.elements.indexOf(chain[chain.length - 2])))
    }
  })
  useEffect(() => {
    const on = (e: globalThis.KeyboardEvent) => {
      if (!e.altKey || e.key !== 'ArrowUp') return
      const a = document.activeElement as HTMLElement | null
      if (a && a !== document.body && !rootRef.current?.contains(a)) return
      if (a?.matches('input, textarea, select')) return
      e.preventDefault()
      latestParent.current()
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])

  // Escape cancels placing (no edit); F2 opens the text of the selected element (not while a field has the focus).
  const latestKeys = useRef({ cancelPlacing, startTextEdit })
  useEffect(() => {
    latestKeys.current = { cancelPlacing, startTextEdit }
  })
  useEffect(() => {
    const on = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') latestKeys.current.cancelPlacing()
      else if (e.key === 'F2') {
        const a = document.activeElement as HTMLElement | null
        if (a?.matches('input, textarea, select')) return
        if (a && a !== document.body && !rootRef.current?.contains(a)) return
        e.preventDefault()
        latestKeys.current.startTextEdit()
      }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])

  // ---- views ----
  const showSize = (v: ViewName, o: Orientation) => {
    setPlacing(null)
    setEditingText(null)
    setView(v)
    setOrientation(o)
    viewRef.current = v
    orientRef.current = o
    const s = sessionRef.current
    if (s) {
      setViewport(s, viewport(v, o))
      setRev((n) => n + 1)
    }
  }
  /** Another view always starts upright. */
  const onView = (v: ViewName) => showSize(v, 'portrait')
  const onRotate = () => showSize(viewRef.current, orientRef.current === 'portrait' ? 'landscape' : 'portrait')

  // ---- export ----
  // One section per file in the Updated code area, all visible (round 5): there is no shown file, no File selector and no switching. The changes of every
  // file against the file as it was opened (the primary file, or a companion stylesheet by the name the page links it by) are counted per section, and Previous
  // and Next change walk all of them in the order of the sections.
  // The notes in the code now (comments before elements and the one for the whole page), read by the engine from the model of the edited text; the pins are numbered like the list.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const noteList = useMemo(() => (session ? listNotes(session.preview.model) : { page: null, notes: [] }), [session, rev])
  // The edit list as the gate reads it (a read-only attribute of the tool): written again only when the list changed.
  const editListJson = useMemo(() => JSON.stringify(effectiveEdits(list.edits)), [list.edits])
  const notesTotal = noteCount(noteList)
  const pinRows = noteRows(noteList)
  // With no notes the switch is on again, so a note written next is in the code.
  if (notesTotal === 0 && !include) setInclude(true)
  // What is copied, downloaded and shown as Updated code: the code as the engine made it, or (Include comments off) the same without its notes and the header.
  const outFiles = useMemo(() => {
    const raw = session?.files ?? {}
    return include ? raw : Object.fromEntries(Object.entries(raw).map(([f, t]) => [f, stripNotes(t, kindOfFile(f))]))
  }, [session?.files, include])
  const files = session ? Object.keys(session.files) : []
  const hunksByFile = useMemo(() => {
    const out: Record<string, Hunk[]> = {}
    if (!session || !doc) return out
    for (const f of Object.keys(session.files)) out[f] = diffHunks(f === doc.file ? doc.source : (doc.companions[f] ?? outFiles[f]), outFiles[f])
    return out
  }, [session?.files, doc, outFiles]) // eslint-disable-line react-hooks/exhaustive-deps
  const counts = Object.fromEntries(files.map((f) => [f, hunksByFile[f]?.length ?? 0]))
  const changes = changeOrder(files, counts)
  const walkK = session && walk.files === session.files ? Math.min(walk.k, changes.length) : 0
  const visit = (k: number) => {
    const t = changes[k - 1]
    if (!t || !session) return
    setWalk({ k, files: session.files, nonce: walk.nonce + 1 })
  }
  const targetFor = (file: string) => (session && walk.files === session.files && walkK > 0 && changes[walkK - 1]?.file === file ? { change: changes[walkK - 1].index, nonce: walk.nonce } : null)
  const onCopy = async (file: string) => {
    const text = outFiles[file]
    if (text === undefined) return
    try {
      await navigator.clipboard.writeText(text)
      show({ kind: 'ok', text: messages.copied(file) })
    } catch {
      // No clipboard: show the code, selected, so it can be copied by hand.
      if (codeBox.current) codeBox.current.open = true
      const b = codeViews.current[file]?.box()
      if (b) {
        b.focus()
        window.getSelection()?.selectAllChildren(b)
      }
      show({ kind: 'info', text: messages.copyFailed })
    }
  }
  // ONE Download saves every file, one after the other, each under its own name: the page as <name>-edited.<ext>, a companion stylesheet under its own name so
  // the page's link still works. A browser may ask once to allow several downloads.
  const onDownload = () => {
    if (!files.length || !doc || !session) return
    const saved: string[] = []
    for (const f of files) {
      const text = outFiles[f]
      const name = downloadName(f, f === doc.file)
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      saved.push(name)
    }
    show({ kind: 'ok', text: messages.downloaded(nameList(saved)) })
  }

  const latestNudge = useRef(onNudge)
  useEffect(() => {
    latestNudge.current = onNudge
  })
  useEffect(() => {
    const { dx, dy } = pendingNudge.current
    // A button that was just used may have become disabled (Undo on the last edit): keep the focus in the editor so Ctrl-Z and the arrows still work.
    if (!busy && session && document.activeElement === document.body) rootRef.current?.querySelector<HTMLElement>('.ue-overlay')?.focus({ preventScroll: true })
    if (!busy && session && (dx !== 0 || dy !== 0)) {
      pendingNudge.current = { dx: 0, dy: 0 }
      latestNudge.current(dx, dy)
    }
  }, [busy, session])

  const hasDoc = !!doc
  const showGallery = !hasDoc || galleryOpen
  // The paste area takes the gallery's place while it is open.
  const galleryShown = showGallery && !pasteOpen
  // One slim line under the ribbon (round 4): the message, then what was left alone, in a single line that is cut with an ellipsis if it is too long (the whole
  // text is the tooltip and the region's text). Its height is always reserved while a document is open, so a message never moves the stage.
  const resultText = message ? [message.text, message.extra ?? '', message.notes && message.notes.length > 0 ? `${messages.noteLead} ${message.notes.join(' ')}` : ''].filter(Boolean).join(' ') : ''
  const result = (
    <div role="status" aria-label={labels.result} className={`ue-result${hasDoc ? ' is-reserved' : ''}${message ? ` is-${message.kind}` : ''}`} title={resultText || undefined}>
      {message && <p className="ue-result-line">{resultText}</p>}
    </div>
  )
  return (
    <section ref={rootRef} className="ue-tool" data-editor data-edit-list={editListJson} aria-label={labels.tool} aria-busy={busy || undefined} onKeyDown={onRootKey}>
      <div className="ue-sheet" data-card>
      <div className="ue-bar" role="group" aria-label={labels.bar}>
        <div className="ue-bar-group">
          <button type="button" className="btn btn-secondary" aria-expanded={galleryShown} onClick={onSamples}>
            {labels.samplesButton}
          </button>
          <input ref={fileInput} type="file" accept=".html,.htm,.svg,.css" multiple hidden onChange={(e) => void onFiles(e)} />
        </div>
        {hasDoc && (
          <>
            <div className="ue-bar-tools">
              <div className="ue-bar-group">
                <IconButton icon="undo" label={labels.undo} tip={labels.undoTip} disabled={!canUndo(list) || busy} onClick={onUndo} />
                <IconButton icon="redo" label={labels.redo} tip={labels.redoTip} disabled={!canRedo(list) || busy} onClick={onRedo} />
                <MenuButton
                  quickBar
                  name={labels.insert}
                  tip={insertOff || labels.insertTip}
                  disabled={!!insertOff || busy}
                  glyph={<Icon name="insert" />}
                  text={labels.insert}
                  spec={() => INSERT_ITEMS.map((i) => ({ label: i.label, role: 'menuitem' as const, run: () => startPlacing(i.kind) }))}
                />
                <IconButton icon="comment" label={labels.comment} tip={commentOff || labels.commentTip} opens="comment" disabled={!!commentOff || busy} onClick={() => selIndex !== null && openComment({ target: selIndex, opener: 'bar' })} />
              </div>
              <span className="ue-flex" />
              <div className="ue-bar-group" role="group" aria-label={labels.view}>
                {VIEWS.map((v) => {
                  const mark = v.name !== 'Desktop' && customised[v.name]
                  return <IconButton key={v.name} icon={v.icon} label={v.name} showLabel named={mark ? labels.viewNameCustom(v.name) : undefined} tip={mark ? labels.viewTipCustom(v.name) : labels.viewTip(v.name)} mark={mark} view pressed={view === v.name} onClick={() => onView(v.name)} />
                })}
                {canRotate(view) && <IconButton icon="rotate" label={labels.rotate} text={labels.rotate} tip={labels.rotateTip} onClick={onRotate} />}
              </div>
              <span className="ue-flex" />
              <div className="ue-bar-group">
                <label className="ue-include" title={labels.includeCommentsTip}>
                  <input type="checkbox" checked={include} disabled={notesTotal === 0} onChange={(e) => setInclude(e.currentTarget.checked)} />
                  {labels.includeComments}
                </label>
                <IconButton icon="download" label={labels.download} showLabel tip={labels.downloadTip(files)} onClick={onDownload} />
              </div>
              <span className="ue-sep" aria-hidden="true" />
              <IconButton icon="reset" label={labels.resetAll} showLabel tip={labels.resetTip} disabled={!canUndo(list) || busy} onClick={onReset} />
            </div>
          </>
        )}
      </div>
        {hasDoc && (
          <>
            <Ribbon
              session={session}
              rev={rev}
              nonce={nonce}
              selected={selIndex}
              view={view}
              editable={editable}
              lockedNote={view === 'Tablet' ? panel.tablet : panel.viewOnly}
              unit={widthUnit}
              onUnit={(u) => setUnitState({ path: selPath, unit: u })}
              onSet={onSet}
              onBadValue={onBadValue}
              onMessage={(text) => show({ kind: 'refusal', text })}
              onMove={onReorder}
              onSelectIndex={selectIndexOnly}
              onEditText={() => startTextEdit(undefined, true)}
              onDelete={deleteElement}
              canDelete={canDelete}
              notesCount={notesTotal}
              notesOpen={notesOpen}
              onNotes={() => (notesOpen ? closeNotes() : (setCommentFor(null), setNotesOpen(true)))}
              grid={grid}
              onGrid={setGrid}
              snap={snap}
              onSnap={setSnap}
              spacing={spacing}
              onSpacing={setSpacing}
            />
            {result}
          </>
        )}
      </div>

      {confirm && (
        <div className="ue-confirm" role="group" aria-label={labels.confirm}>
          <p>{confirm.text}</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              const c = confirm
              setConfirm(null)
              c.run()
              giveFocusTo(c.after)
            }}
          >
            {confirm.yes ?? labels.discard}
          </button>
          <button
            ref={keepRef}
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              const c = confirm
              setConfirm(null)
              giveFocusTo(c.back)
            }}
          >
            {labels.keep}
          </button>
        </div>
      )}

      {pasteOpen && (
        <div className="ue-paste" role="group" aria-label={labels.pasteTitle}>
          <div>
            <label htmlFor="ue-paste-markup">{labels.pasteMarkup}</label>
            <textarea id="ue-paste-markup" ref={pasteMarkup} rows={8} spellCheck={false} />
          </div>
          <div>
            <label htmlFor="ue-paste-css">{labels.pasteCss}</label>
            <textarea id="ue-paste-css" ref={pasteCss} rows={8} spellCheck={false} />
          </div>
          <div className="ue-paste-actions">
            <button type="button" className="btn btn-primary" onClick={onOpenPaste}>
              {labels.openPaste}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setPasteOpen(false)}>
              {labels.cancel}
            </button>
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <ul className="ue-warnings">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      {!hasDoc && result}

      {!hasDoc && galleryShown && <Gallery overlay={false} onPick={onPickSample} onPaste={onPasteCard} onUpload={onUploadCard} onClose={() => setGalleryOpen(false)} />}


      {hasDoc && (
        <div className="ue-work">
          <div className="ue-preview">
            {small && !svgDoc && (
              <div className="ue-banner" role="group" aria-label={labels.bannerName(view)} data-view-banner>
                <p className={`ue-banner-row${customised[view] ? ' is-off' : ''}`}>{labels.bannerFollows(view)}</p>
                <div className={`ue-banner-row has-button${customised[view] ? '' : ' is-off'}`}>
                  <p>{labels.bannerChanged(view)}</p>
                  <button type="button" className="btn btn-secondary" data-reset-view disabled={!customised[view] || busy} onClick={onResetView}>
                    {labels.resetView}
                  </button>
                </div>
              </div>
            )}
            {galleryShown && <Gallery overlay onPick={onPickSample} onPaste={onPasteCard} onUpload={onUploadCard} onClose={() => setGalleryOpen(false)} />}
            <div className="ue-scroll" data-stage-area inert={galleryShown || undefined} style={holdHeight ? { minHeight: holdHeight } : undefined}>
              <Stage frameHost={frameHost} session={session} rev={rev} selected={selIndex} editable={editable} view={view} orientation={orientation} onSelect={(i) => setSelPath(i === null || !session ? null : pathOf(session.preview.model, i))} onMove={onMove} onResize={onResize} onNudge={onNudge} grid={grid} snap={snap} spacing={spacing} placing={placing} trialInsert={trialInsert} onPlace={onPlace} onPlaceReason={onPlaceReason} textEdit={editingText !== null && editingText === selPath} onTextApply={applyText} onTextCancel={() => stopTextEdit(true)} onEditText={(i) => startTextEdit(i)} onDelete={deleteElement} pins={pinRows} onPin={(i) => { selectIndexOnly(i); openComment({ target: i, opener: 'pin', pin: pinRows.find((r) => r.index === i)?.n }) }} />
            </div>
            <p id="ue-preview-hint" className="ue-hint">
              {labels.previewHint}
            </p>
            {view === 'Phone' && orientation === 'portrait' && (
              <p data-device-note className="ue-hint">
                {deviceNote}
              </p>
            )}
          </div>
        </div>
      )}

      {hasDoc && (
        <details ref={codeBox} className="ue-code" open>
          <summary>{labels.code}</summary>
          <div className="ue-changes">
            <button type="button" className="btn btn-secondary" disabled={changes.length === 0} onClick={() => visit(stepChange(walkK, changes.length, -1))}>
              {codeViewText.previous}
            </button>
            <button type="button" className="btn btn-secondary" disabled={changes.length === 0} onClick={() => visit(stepChange(walkK, changes.length, 1))}>
              {codeViewText.next}
            </button>
            <span className="ue-counter" data-change-counter aria-live="polite">
              {counterText(walkK, changes.length)}
            </span>
          </div>
          {files.map((file) => (
            <CodeView key={file} ref={(h) => { codeViews.current[file] = h }} file={file} header={sectionHeader(file, counts[file] ?? 0)} copyName={copyName(files, file)} onCopy={() => void onCopy(file)} text={outFiles[file] ?? ''} hunks={hunksByFile[file] ?? []} total={changes.length} current={walkK} offset={offsetOfFile(files, counts, file)} target={targetFor(file)} onJump={(i) => visit(offsetOfFile(files, counts, file) + i)} />
          ))}
        </details>
      )}
      {commentFor && session && (
        <CommentPopover
          key={`${commentFor.target}-${rev}`}
          whole={commentFor.target === 'page'}
          existing={commentFor.target === 'page' ? noteList.page?.text ?? null : noteList.notes.find((n) => n.index === commentFor.target)?.text ?? null}
          anchor={anchorOf(commentFor)}
          onSave={(text) => saveNote(commentFor.target, text, (commentFor.target === 'page' ? noteList.page?.text : noteList.notes.find((n) => n.index === commentFor.target)?.text) !== undefined)}
          onDelete={() => saveNote(commentFor.target, '', true)}
          onClose={closeComment}
        />
      )}
      {notesOpen && session && (
        <NotesList
          page={noteList.page?.text ?? null}
          rows={pinRows.map((r) => ({ ...r, label: labelOf(session, r.index) }))}
          anchor={'button[data-opens="notes"]'}
          onAddPage={() => openComment({ target: 'page', opener: 'notes' })}
          onEditPage={() => openComment({ target: 'page', opener: 'notes' })}
          onDeletePage={() => { setNotesOpen(false); saveNote('page', '', true) }}
          onJump={(i) => { setNotesOpen(false); selectIndexOnly(i); session.preview.elements[i]?.scrollIntoView?.({ block: 'nearest' }) }}
          onEdit={(i) => { selectIndexOnly(i); openComment({ target: i, opener: 'notes' }) }}
          onDelete={(i) => { setNotesOpen(false); saveNote(i, '', true) }}
          onClose={closeNotes}
        />
      )}
    </section>
  )
}
