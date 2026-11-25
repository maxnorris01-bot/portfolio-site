// The two popovers of the notes (insert round 1, stage 2): the Comment popover (one text area, Save, and Delete note when the element has a note) and the Notes list (the whole-page
// note first, then every note with its pin number). They are drawn in <body>, under the button or the pin that opened them, and kept inside the window; Escape closes them and the
// caller gives the focus back to what opened them; a click anywhere else closes them too.
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { labels } from '../data/uiEditor'

/** Put a popover under its opener (or above it when there is no room), inside the window; at phone width it takes the window's width. */
function place(el: HTMLElement, anchor: HTMLElement | null) {
  const a = anchor?.getBoundingClientRect()
  const vw = window.innerWidth, vh = window.innerHeight
  el.style.maxHeight = ''
  el.style.overflowY = ''
  const w = el.offsetWidth
  let left = a ? a.left : 8
  if (left + w > vw - 4) left = Math.max(4, vw - w - 4)
  let top = a ? a.bottom + 4 : 8
  let h = el.offsetHeight
  if (h > vh - 8) {
    h = vh - 8
    el.style.maxHeight = `${h}px`
    el.style.overflowY = 'auto'
  }
  if (top + h > vh - 4) top = a && a.top - h - 4 >= 4 ? a.top - h - 4 : Math.max(4, vh - 4 - h)
  el.style.left = `${left}px`
  el.style.top = `${top}px`
  el.style.visibility = 'visible'
}

/** A click outside the popover (and outside what opened it, which toggles it itself) closes it. */
function useClickAway(close: () => void, root: React.RefObject<HTMLElement | null>, keep: string) {
  useEffect(() => {
    const on = (e: MouseEvent) => {
      const t = e.target as Element | null
      if (root.current?.contains(t) || t?.closest?.(keep)) return
      close()
    }
    document.addEventListener('click', on, true)
    return () => document.removeEventListener('click', on, true)
  }, [close, root, keep])
}

export function CommentPopover({ existing, anchor, onSave, onDelete, onClose, whole }: { existing: string | null; anchor: string; onSave: (text: string) => void; onDelete: () => void; onClose: () => void; whole: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    if (box.current) place(box.current, document.querySelector<HTMLElement>(anchor))
  }, [anchor, existing])
  useEffect(() => {
    area.current?.focus({ preventScroll: true })
  }, [])
  useClickAway(onClose, box, '[data-pin], [data-opens="comment"]')
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      onSave(area.current?.value ?? '')
    }
  }
  return createPortal(
    <div ref={box} className="ue-popbox" data-comment-popover role="dialog" aria-label={whole ? labels.pageNoteField : labels.noteField} style={{ visibility: 'hidden' }} onKeyDown={onKey}>
      <textarea ref={area} className="ue-notearea" aria-label={labels.noteField} defaultValue={existing ?? ''} rows={4} spellCheck />
      <div className="ue-popbtns">
        <button type="button" className="btn btn-primary" onClick={() => onSave(area.current?.value ?? '')}>
          {labels.save}
        </button>
        {existing !== null && (
          <button type="button" className="btn btn-secondary" onClick={onDelete}>
            {labels.deleteNote}
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}

export interface NotesRowData {
  n: number
  index: number
  label: string
  text: string
}

export function NotesList({ page, rows, anchor, onAddPage, onEditPage, onDeletePage, onJump, onEdit, onDelete, onClose }: { page: string | null; rows: NotesRowData[]; anchor: string; onAddPage: () => void; onEditPage: () => void; onDeletePage: () => void; onJump: (index: number) => void; onEdit: (index: number) => void; onDelete: (index: number) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (box.current) place(box.current, document.querySelector<HTMLElement>(anchor))
  })
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true })
  }, [])
  useClickAway(onClose, box, '[data-opens="notes"]')
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
  }
  return createPortal(
    <div ref={box} className="ue-popbox ue-noteslist" data-notes-list role="dialog" aria-label={labels.notesList} style={{ visibility: 'hidden' }} onKeyDown={onKey}>
      <ul className="ue-notes-ul">
        {page === null ? (
          <li className="ue-notes-row" data-note-row="page">
            <button type="button" className="btn btn-secondary ue-addpage" aria-label={labels.addPageNote} onClick={onAddPage}>
              <span data-note-text>{labels.addPageNote}</span>
            </button>
          </li>
        ) : (
          <li className="ue-notes-row" data-note-row="page">
            <span className="ue-notetext" data-note-text>
              {page}
            </span>
            <button type="button" className="btn btn-secondary" aria-label={labels.edit} onClick={onEditPage}>
              {labels.edit}
            </button>
            <button type="button" className="btn btn-secondary" aria-label={labels.deletePageNote} onClick={onDeletePage}>
              {labels.deletePageNote}
            </button>
          </li>
        )}
        {rows.map((r) => (
          <li key={r.n} className="ue-notes-row" data-note-row data-n={r.n}>
            <span className="ue-pinnum" aria-hidden="true">
              {r.n}
            </span>
            <button type="button" className="ue-notelabel" data-note-label onClick={() => onJump(r.index)}>
              {r.label}
            </button>
            <span className="ue-notetext" data-note-text>
              {r.text}
            </span>
            <button type="button" className="btn btn-secondary" aria-label={labels.edit} onClick={() => onEdit(r.index)}>
              {labels.edit}
            </button>
            <button type="button" className="btn btn-secondary" aria-label={labels.deleteElement} onClick={() => onDelete(r.index)}>
              {labels.deleteElement}
            </button>
          </li>
        ))}
      </ul>
    </div>,
    document.body,
  )
}
