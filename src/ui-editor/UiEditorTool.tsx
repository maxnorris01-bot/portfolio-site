import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { MAX_BYTES, deviceNote, labels, messages, panel } from '../data/uiEditor'
import Gallery from './Gallery'
import { canRotate, isEditable, viewport, type Orientation } from './devices'
import { cssSizeFor, handleAxes } from './geometry'
import { IconButton, type IconName } from './icons'
import { fromFiles, fromPaste, downloadName, type Doc, type Incoming } from './intake'
import Panel, { type ViewName } from './Panel'
import { SAMPLES, type SampleId } from './samples'
import { applyOne, closeSession, indexOfPath, isSvgElement, labelOf, moveTarget, openSession, pathOf, setViewport, type Session } from './session'
import Stage, { type ResizeRequest } from './Stage'
import { emptyList, listReduce, mergeOffsets, canRedo, canUndo, type EditList, type ListAction } from './state'
import { noteSentence, refusalSentence } from './values'
import { listUnlinked, type Edit, type Environment } from './vendor/engine.js'
import './UiEditorTool.css'

type Msg = { kind: 'ok' | 'refusal' | 'info'; text: string; notes?: string[] }
type Confirm = { text: string; run: () => void }

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
  const [link, setLink] = useState(true)
  const [selPath, setSelPath] = useState<string | null>(null)
  const [message, setMessage] = useState<Msg | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [rev, setRev] = useState(0)
  const [nonce, setNonce] = useState(0)
  const [replay, setReplay] = useState(0)
  const [fileName, setFileName] = useState('')
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [holdHeight, setHoldHeight] = useState(0)
  const [galleryOpen, setGalleryOpen] = useState(false)

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
  const codeRef = useRef<HTMLTextAreaElement>(null)
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
  const environment: Environment = view === 'Phone' ? 'phone' : 'desktop'
  const editable = isEditable(view, orientation)

  // ---- the preview: built from the ORIGINAL document, with the edit list replayed on it ----
  useEffect(() => {
    if (!doc) return
    const mine = ++generation.current
    const host = frameHost.current
    if (!host) return
    setHoldHeight(sessionRef.current?.preview.iframe.offsetHeight ?? 0)
    closeSession(sessionRef.current)
    sessionRef.current = null
    setSession(null)
    busyRef.current = true
    setBusy(true)
    void openSession(doc, listRef.current.edits, host, viewport(viewRef.current, orientRef.current)).then((r) => {
      if (mine !== generation.current) {
        if (r.ok) closeSession(r.session)
        return
      }
      busyRef.current = false
      setBusy(false)
      if (!r.ok) {
        show({ kind: 'refusal', text: messages.cannotOpen(r.message) })
        setDoc(null)
        return
      }
      sessionRef.current = r.session
      setSession(r.session)
      setHoldHeight(0)
      setRev((n) => n + 1)
    })
  }, [doc, replay])

  // Leaving the page takes the preview away.
  useEffect(
    () => () => {
      generation.current++
      closeSession(sessionRef.current)
    },
    [],
  )

  const selected = session && selPath ? indexOfPath(session.preview.model, selPath) : -1
  const selIndex = selected >= 0 ? selected : null
  const pins = session ? listUnlinked(session.state) : []
  const mine = pins.filter((p) => p.selector === selPath)

  // ---- opening something ----
  const load = (next: Doc, warn: string[]) => {
    setList(emptyList())
    setSelPath(null)
    setWarnings(warn)
    setGalleryOpen(false)
    setFileName(next.file)
    setReviewOpen(false)
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

  const onPickSample = (id: SampleId) => replaceDocument(() => load(SAMPLES[id], []))
  /** The Samples button: over an open document it shows or hides the gallery; on a first visit the gallery is already there, so it takes the visitor to it. */
  const onSamples = () => {
    if (doc) setGalleryOpen((o) => !o)
    else rootRef.current?.querySelector<HTMLElement>('[data-sample-card]')?.focus()
  }
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
  const scope = () => ({ environment, link: svgDoc ? true : link })

  /** One more edit on the live preview. A refusal shows the engine's reason and changes nothing. */
  const run = (edit: Edit, what: string, nextSel?: string | null): boolean => {
    const s = sessionRef.current
    if (!s || busyRef.current || !editable) return false
    const applied = applyOne(s, edit)
    if (!applied.ok) {
      show({ kind: 'refusal', text: refusalSentence(messages.refused, { code: 'engine', message: applied.message }) })
      return false
    }
    const last = listRef.current.edits[listRef.current.edits.length - 1]
    const merges = mergeOffsets(last, edit) !== undefined
    setList(listReduce(listRef.current, { type: 'apply', edit }))
    if (nextSel !== undefined) setSelPath(nextSel)
    show({ kind: 'ok', text: messages.applied(what), notes: applied.notes.map(noteSentence) })
    // Two moves in a row are one edit: the preview is rebuilt so it shows exactly what the list says.
    if (merges) {
      startBusy()
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

  const onMove = (dx: number, dy: number) => {
    const t = target()
    if (t === null) return
    // Moving is unlinked in this version (an SVG has no environments, so there it applies everywhere).
    run({ op: 'offset', target: t, dx, dy, environment, link: !!svgDoc }, `moved by ${dx}, ${dy} px${svgDoc ? '' : ` (${view} only)`}`)
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
    run({ op: 'offset', target: t, dx, dy, ...scope() }, `nudged by ${dx}, ${dy} px`)
  }
  const onResize = ({ handle, box }: ResizeRequest) => {
    const t = target()
    const el = t !== null ? session?.preview.elements[t] : null
    if (t === null || !el || !session) return
    const cs = session.preview.doc.defaultView!.getComputedStyle(el)
    const num = (v: string) => parseFloat(v) || 0
    const size = cssSizeFor(box, { sizing: cs.boxSizing, paddingX: num(cs.paddingLeft) + num(cs.paddingRight), paddingY: num(cs.paddingTop) + num(cs.paddingBottom), borderX: num(cs.borderLeftWidth) + num(cs.borderRightWidth), borderY: num(cs.borderTopWidth) + num(cs.borderBottomWidth) })
    const axes = handleAxes(handle)
    const unit = isSvgElement(el) ? '' : 'px'
    const properties: Record<string, string> = {}
    if (axes.width) properties.width = `${size.width}${unit}`
    if (axes.height) properties.height = `${size.height}${unit}`
    run({ op: 'set', target: t, properties, ...scope() }, `resized to ${Object.values(properties).join(' × ')}`)
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
    const changed = action.type === 'undo' ? before.edits.slice(next.edits.length) : action.type === 'redo' ? next.edits.slice(before.edits.length) : before.edits
    // A reorder changes which element a path names: the selection is let go rather than guessed.
    if (changed.some((e) => e.op === 'reorder')) setSelPath(null)
    setList(next)
    startBusy()
    setReplay((n) => n + 1)
    show({ kind: 'info', text: what })
  }
  const onUndo = () => stepList({ type: 'undo' }, messages.undone)
  const onRedo = () => stepList({ type: 'redo' }, messages.redone)
  const onReset = () => setConfirm({ text: labels.resetText, run: () => stepList({ type: 'reset' }, messages.reset) })

  const onRootKey = (e: KeyboardEvent<HTMLElement>) => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
    const t = e.target as HTMLElement
    if (t.matches('input, textarea, select')) return // a field's own undo
    e.preventDefault()
    if (e.shiftKey) onRedo()
    else onUndo()
  }

  // ---- views ----
  const showSize = (v: ViewName, o: Orientation) => {
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
  const files = session ? Object.keys(session.files) : []
  const file = session && files.includes(fileName) ? fileName : (files[0] ?? '')
  const text = session && file ? (session.files[file] ?? '') : ''
  const onCopy = async () => {
    if (!file) return
    try {
      await navigator.clipboard.writeText(text)
      show({ kind: 'ok', text: messages.copied(file) })
    } catch {
      // No clipboard: show the code, selected, so it can be copied by hand.
      if (codeBox.current) codeBox.current.open = true
      codeRef.current?.focus()
      codeRef.current?.select()
      show({ kind: 'info', text: messages.copyFailed })
    }
  }
  const onDownload = () => {
    if (!file || !doc) return
    const name = downloadName(file, file === doc.file)
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    show({ kind: 'ok', text: messages.downloaded(name) })
  }

  // ---- the Review unlinked list ----
  const jump = (selector: string, env: Environment) => {
    const v: ViewName = env === 'phone' ? 'Phone' : 'Desktop'
    if (viewRef.current !== v) onView(v)
    setSelPath(selector)
    setReviewOpen(false)
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
  const result = (
    <div role="status" aria-label={labels.result} className={`ue-result${message ? ` is-${message.kind}` : ''}`}>
      {message && <p>{message.text}</p>}
      {message?.notes && message.notes.length > 0 && (
        <>
          <p className="ue-notes-lead">{messages.noteLead}</p>
          <ul>
            {message.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
  return (
    <section ref={rootRef} className="ue-tool" data-editor aria-label={labels.tool} aria-busy={busy || undefined} onKeyDown={onRootKey}>
      <div className="ue-bar" role="group" aria-label={labels.bar}>
        <div className="ue-bar-group">
          <button type="button" className="btn btn-secondary" aria-expanded={showGallery} onClick={onSamples}>
            {labels.samplesButton}
          </button>
          <button type="button" className="btn btn-secondary" aria-expanded={pasteOpen} onClick={() => setPasteOpen((o) => !o)}>
            {labels.paste}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => fileInput.current?.click()}>
            {labels.upload}
          </button>
          <input ref={fileInput} type="file" accept=".html,.htm,.svg,.css" multiple hidden onChange={(e) => void onFiles(e)} />
        </div>
        {hasDoc && (
          <>
            <div className="ue-bar-group" role="group" aria-label={labels.view}>
              {VIEWS.map((v) => (
                <IconButton key={v.name} icon={v.icon} label={v.name} pressed={view === v.name} onClick={() => onView(v.name)} />
              ))}
              {canRotate(view) && <IconButton icon="rotate" label={labels.rotate} onClick={onRotate} />}
            </div>
            <div className="ue-bar-group">
              <IconButton icon="undo" label={labels.undo} disabled={!canUndo(list) || busy} onClick={onUndo} />
              <IconButton icon="redo" label={labels.redo} disabled={!canRedo(list) || busy} onClick={onRedo} />
              <IconButton icon="reset" label={labels.resetAll} disabled={!canUndo(list) || busy} onClick={onReset} />
            </div>
            <div className="ue-bar-group">
              <IconButton icon="review" label={labels.review(pins.length)} expanded={reviewOpen} badge={pins.length} disabled={pins.length === 0} onClick={() => setReviewOpen((o) => !o)} />
            </div>
            <div className="ue-bar-group">
              <label htmlFor="ue-file">{labels.file}</label>
              <select id="ue-file" value={file} disabled={files.length === 0} onChange={(e) => setFileName(e.currentTarget.value)}>
                {files.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <IconButton icon="copy" label={labels.copy} disabled={!session} onClick={() => void onCopy()} />
              <IconButton icon="download" label={labels.download} disabled={!session} onClick={onDownload} />
            </div>
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
            }}
          >
            {labels.discard}
          </button>
          <button ref={keepRef} type="button" className="btn btn-secondary" onClick={() => setConfirm(null)}>
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

      {reviewOpen && session && (
        <ul className="ue-review" aria-label={labels.reviewList}>
          {pins.map((p) => {
            const i = indexOfPath(session.preview.model, p.selector)
            const name = i >= 0 ? labelOf(session, i) : p.selector
            const env = p.environment === 'phone' ? 'Phone' : 'Desktop'
            return (
              <li key={`${p.selector}|${p.property}|${p.environment}`}>
                <button type="button" className="ue-review-item" onClick={() => jump(p.selector, p.environment)}>
                  {`${name} · ${p.property} · ${env} only: ${p.value}`}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {!hasDoc && result}

      {!hasDoc && showGallery && <Gallery overlay={false} onPick={onPickSample} onClose={() => setGalleryOpen(false)} />}

      {hasDoc && (
        <div className="ue-work">
          <div className="ue-preview">
            {showGallery && <Gallery overlay onPick={onPickSample} onClose={() => setGalleryOpen(false)} />}
            <div className="ue-scroll" data-stage-area inert={showGallery || undefined} style={holdHeight ? { minHeight: holdHeight } : undefined}>
              <Stage frameHost={frameHost} session={session} rev={rev} selected={selIndex} editable={editable} view={view} orientation={orientation} onSelect={(i) => setSelPath(i === null || !session ? null : pathOf(session.preview.model, i))} onMove={onMove} onResize={onResize} onNudge={onNudge} />
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
          <div className="ue-side">
            {session ? (
              <Panel session={session} rev={rev} nonce={nonce} selected={selIndex} view={view} editable={editable} lockedNote={view === 'Tablet' ? panel.tablet : panel.viewOnly} link={link} onLink={setLink} pins={mine} onSet={onSet} onBadValue={onBadValue} onMove={onReorder} onNudge={onNudge} />
            ) : (
              <aside className="ue-panel" aria-label={panel.title}>
                <p className="ue-hint">{messages.working}</p>
              </aside>
            )}
            {result}
          </div>
        </div>
      )}

      {hasDoc && (
        <details ref={codeBox} className="ue-code">
          <summary>{labels.code}</summary>
          <textarea ref={codeRef} readOnly rows={12} spellCheck={false} aria-label={`${labels.code}: ${file}`} value={text} />
        </details>
      )}
    </section>
  )
}
