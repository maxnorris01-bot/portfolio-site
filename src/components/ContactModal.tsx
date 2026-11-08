import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { trapTab } from '../shop/filters.ts'
import './Contact.css'
import {
  CONTACT_CLOSE,
  CONTACT_EMAIL_LABEL,
  CONTACT_MESSAGE_LABEL,
  CONTACT_NAME_LABEL,
  CONTACT_NOTE,
  CONTACT_SEND,
  CONTACT_SENDING,
  CONTACT_SENT,
  CONTACT_TITLE,
  EMAIL_MAX,
  MESSAGE_MAX,
  NAME_MAX,
  canSend,
  counterText,
  emptyForm,
  sendContact,
  type ContactForm,
} from './contact.ts'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export type ContactDialogProps = {
  form: ContactForm
  onChange: (next: ContactForm) => void
  onSubmit: () => void
  onClose: () => void
  sending: boolean
  sent: boolean
  error: string | null
}

/** The dialog's markup (the modal below adds the portal, focus and keys). */
export function ContactDialog({ p, titleId, dialogRef, onKeyDown }: { p: ContactDialogProps; titleId: string; dialogRef?: RefObject<HTMLDivElement | null>; onKeyDown?: (e: KeyboardEvent) => void }) {
  const { form, onChange } = p
  const nameId = `${titleId}-name`
  const emailId = `${titleId}-email`
  const messageId = `${titleId}-message`
  const errorId = `${titleId}-error`
  const set = (key: keyof ContactForm) => (e: { target: { value: string } }) => onChange({ ...form, [key]: e.target.value })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (canSend(form) && !p.sending) p.onSubmit()
  }
  return (
    <div className="contact-backdrop" onMouseDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <div ref={dialogRef} className="contact-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown}>
        <header className="contact-head">
          <h2 id={titleId} className="contact-title">
            {CONTACT_TITLE}
          </h2>
        </header>
        {p.sent ? (
          <div className="contact-body">
            <p className="contact-sent" role="status">
              {CONTACT_SENT}
            </p>
            <div className="contact-actions">
              <button type="button" className="btn btn-primary contact-close" data-autofocus onClick={p.onClose}>
                {CONTACT_CLOSE}
              </button>
            </div>
          </div>
        ) : (
          <form className="contact-body" onSubmit={submit} noValidate>
            <div className="contact-field">
              <label className="contact-label" htmlFor={nameId}>
                {CONTACT_NAME_LABEL}
              </label>
              <input id={nameId} className="contact-input" type="text" name="name" required maxLength={NAME_MAX} autoComplete="name" value={form.name} onChange={set('name')} />
            </div>
            <div className="contact-field">
              <label className="contact-label" htmlFor={emailId}>
                {CONTACT_EMAIL_LABEL}
              </label>
              <input id={emailId} className="contact-input" type="email" name="email" required maxLength={EMAIL_MAX} autoComplete="email" value={form.email} onChange={set('email')} />
            </div>
            <div className="contact-field">
              <label className="contact-label" htmlFor={messageId}>
                {CONTACT_MESSAGE_LABEL}
              </label>
              <textarea
                id={messageId}
                className="contact-input contact-textarea"
                name="message"
                required
                rows={6}
                maxLength={MESSAGE_MAX}
                aria-describedby={`${messageId}-count`}
                value={form.message}
                onChange={set('message')}
              />
              <p id={`${messageId}-count`} className="contact-count" aria-live="polite">
                {counterText(form.message.length)}
              </p>
            </div>
            <div className="contact-trap" aria-hidden="true">
              <label>
                Website
                <input type="text" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} />
              </label>
            </div>
            {p.error && (
              <p id={errorId} className="contact-error" role="alert">
                {p.error}
              </p>
            )}
            <p className="contact-note">{CONTACT_NOTE}</p>
            <div className="contact-actions">
              <button type="button" className="btn btn-secondary contact-close" onClick={p.onClose}>
                {CONTACT_CLOSE}
              </button>
              <button type="submit" className="btn btn-primary contact-send" disabled={!canSend(form) || p.sending} aria-describedby={p.error ? errorId : undefined}>
                {p.sending ? CONTACT_SENDING : CONTACT_SEND}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

/** The Contact dialog in the page body: focus in on open (the name box), kept inside, Esc and the backdrop close it, and focus goes back to the button. */
export default function ContactModal({ onClose, returnFocus, doFetch }: { onClose: () => void; returnFocus: RefObject<HTMLElement | null>; doFetch?: typeof fetch }) {
  const titleId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [form, setForm] = useState<ContactForm>(emptyForm)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const back = returnFocus.current
    rootRef.current?.querySelector<HTMLElement>('input[name="name"]')?.focus()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
      back?.focus()
    }
  }, [returnFocus])

  useEffect(() => {
    if (sent) rootRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
  }, [sent])

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key !== 'Tab') return
    const items = [...(rootRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
    const to = trapTab(items.indexOf(document.activeElement as HTMLElement), items.length, e.shiftKey)
    if (to === null) return
    e.preventDefault()
    items[to]?.focus()
  }

  const submit = async () => {
    setSending(true)
    setError(null)
    const problem = await sendContact(form, doFetch)
    setSending(false)
    if (problem) setError(problem)
    else setSent(true)
  }

  return createPortal(<ContactDialog p={{ form, onChange: setForm, onSubmit: submit, onClose, sending, sent, error }} titleId={titleId} dialogRef={rootRef} onKeyDown={onKey} />, document.body)
}
