import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { trapTab } from './filters.ts'
import type { SavedLists } from './saved.ts'
import {
  canShare,
  copyText,
  type CopyEnv,
  csvFilename,
  csvText,
  emailError,
  emailPlan,
  isPhoneOrTablet,
  phoneError,
  plainText,
  readRemembered,
  shareDate,
  shareHeading,
  shareItems,
  shareText,
  smsPlan,
  textOnComputer,
  writeRemembered,
  SHARE_FOOTER,
  TEXT_COPIED,
  TEXT_HINT_COMPUTER,
  TEXT_HINT_PHONE,
  TEXT_NOT_COPIED,
  type ShareItem,
  type ShareScope,
} from './share.ts'
import type { ResolvedLink } from './types.ts'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'

export const SHARE_BUTTON = (n: number) => `Share list (${n})`
export const SHARE_TITLE = 'Share your saved list'
export const SHARE_EMPTY = 'Love or like some results first.'

const icon = (children: ReactNode) => (
  <svg className="share-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {children}
  </svg>
)
const ICONS = {
  share: icon(<><path d="M12 15V3" /><path d="M8 7l4-4 4 4" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></>),
  mail: icon(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>),
  text: icon(<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />),
  print: icon(<><path d="M7 9V3h10v6" /><rect x="4" y="9" width="16" height="8" rx="2" /><path d="M7 14h10v7H7z" /></>),
  copy: icon(<><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></>),
  download: icon(<><path d="M12 3v12" /><path d="M8 11l4 4 4-4" /><path d="M4 20h16" /></>),
}

export type ShareDialogProps = {
  lists: SavedLists
  resolved: Record<string, ResolvedLink> | undefined
  /** The request the list came from (in the subject and the heading). */
  query: string
  /** True when `navigator.share` exists (the Share… button is only then). */
  shareAvailable: boolean
  /** A phone or tablet (Text opens the messaging app with the list in it); else a computer (Text copies the list, then opens the app). Read from the browser when left out. */
  mobile?: boolean
  onClose: () => void
  /** Called when Print is pressed: the page then shows the print block and prints. */
  onPrint: (items: ShareItem[], date: Date) => void
  now?: Date
}

function Row({ icon: ic, label, hint, onClick, disabled, children, extra }: { icon: ReactNode; label: string; hint: string; onClick: () => void; disabled?: boolean; children?: ReactNode; extra?: ReactNode }) {
  return (
    <div className="share-row">
      {children}
      <button type="button" className="share-action" onClick={onClick} disabled={disabled}>
        {ic}
        <span>{label}</span>
      </button>
      <p className="share-hint">{hint}</p>
      {extra}
    </div>
  )
}

/** The browser's own word on phone or tablet (false when there is no browser, as in a test). */
function browserIsMobile(): boolean {
  if (typeof navigator === 'undefined') return false
  return isPhoneOrTablet(navigator.userAgent ?? '', (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile)
}

/** The Clipboard API, with the old textarea + execCommand route behind it. */
function browserCopyEnv(): CopyEnv {
  return {
    clipboard: typeof navigator === 'undefined' ? undefined : navigator.clipboard,
    legacy: (t) => {
      const area = document.createElement('textarea')
      area.value = t
      area.setAttribute('readonly', '')
      area.style.cssText = 'position:fixed;top:0;left:0;opacity:0'
      document.body.appendChild(area)
      area.select()
      const done = document.execCommand('copy')
      area.remove()
      return done
    },
  }
}

/** The dialog's markup (the modal below adds the portal, focus and keys). */
export function ShareDialog({ p, titleId, dialogRef, onKeyDown }: { p: ShareDialogProps; titleId: string; dialogRef?: RefObject<HTMLDivElement | null>; onKeyDown?: (e: KeyboardEvent) => void }) {
  const id = useId()
  const [scope, setScope] = useState<ShareScope>('both')
  const [to, setTo] = useState(() => readRemembered('email'))
  const [phone, setPhone] = useState(() => readRemembered('phone'))
  const [tried, setTried] = useState<{ email: boolean; phone: boolean }>({ email: false, phone: false })
  const [said, setSaid] = useState('')
  const [byHand, setByHand] = useState<string | null>(null)
  const byHandRef = useRef<HTMLTextAreaElement>(null)
  const mobile = p.mobile ?? browserIsMobile()
  const [date] = useState(() => p.now ?? new Date())
  const emailRef = useRef<HTMLInputElement>(null)
  const phoneRef = useRef<HTMLInputElement>(null)
  const counts = { both: p.lists.loved.length + p.lists.liked.length, love: p.lists.loved.length }
  const items = useMemo(() => shareItems(p.lists, p.resolved, scope), [p.lists, p.resolved, scope])
  const text = useMemo(() => plainText(items, p.query, date), [items, p.query, date])
  const emailProblem = emailError(to)
  const phoneProblem = phoneError(phone)
  const mailPlan = useMemo(() => emailPlan(items, p.query, date, to), [items, p.query, date, to])
  const textPlan = useMemo(() => smsPlan(items, p.query, phone), [items, p.query, phone])

  const doShare = async () => {
    const r = await shareText(typeof navigator === 'undefined' ? undefined : navigator, shareHeading(p.query), text)
    setSaid(r === 'failed' ? 'Could not open the share sheet. Try Copy instead.' : '')
  }
  const doEmail = () => {
    setTried((t) => ({ ...t, email: true }))
    if (emailProblem) return emailRef.current?.focus()
    window.location.href = mailPlan.url
  }
  // On a phone or tablet the text goes in the sms: link. On a computer Messages drops the body, so the list is copied first and the app opened with the number only.
  const doText = async () => {
    setTried((t) => ({ ...t, phone: true }))
    if (phoneProblem) return phoneRef.current?.focus()
    if (mobile) {
      window.location.href = textPlan.url
      return
    }
    const { copied } = await textOnComputer({ text: textPlan.text, phone, copy: (t) => copyText(t, browserCopyEnv()), navigate: (url) => void (window.location.href = url) })
    setSaid(copied ? TEXT_COPIED : TEXT_NOT_COPIED)
    setByHand(copied ? null : textPlan.text)
  }
  useEffect(() => {
    if (byHand !== null) byHandRef.current?.select()
  }, [byHand])
  const doCopy = async () => {
    const ok = await copyText(text, browserCopyEnv())
    setSaid(ok ? 'Copied' : 'Could not copy. Select the text in the preview and copy it by hand.')
  }
  const doCsv = () => {
    const url = URL.createObjectURL(new Blob([csvText(items)], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = csvFilename(date)
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="filters-backdrop" onMouseDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <div ref={dialogRef} className="filters-dialog share-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown}>
        <header className="filters-head">
          <h2 id={titleId} className="filters-title">
            {SHARE_TITLE}
          </h2>
          <div className="share-scope" role="radiogroup" aria-label="What to share">
            {(
              [
                ['both', 'Loved and liked'],
                ['love', 'Loved only'],
              ] as const
            ).map(([key, label]) => (
              <button key={key} type="button" role="radio" aria-checked={scope === key} className={`share-scope-btn${scope === key ? ' is-on' : ''}`} onClick={() => setScope(key)}>
                {label} ({counts[key]})
              </button>
            ))}
          </div>
        </header>
        <div className="filters-body">
          {items.length === 0 ? (
            <p className="share-empty" role="status">
              {SHARE_EMPTY}
            </p>
          ) : (
            <>
              <p className="share-count">
                {items.length} item{items.length === 1 ? '' : 's'}: links, prices and stores.
              </p>
              {p.shareAvailable && <Row icon={ICONS.share} label="Share…" hint="Opens the share sheet: AirDrop, Messages, Mail, Notes." onClick={() => void doShare()} />}
              <Row
                icon={ICONS.mail}
                label="Email"
                hint="Opens your mail app with the list in a new message."
                onClick={doEmail}
                extra={mailPlan.hidden > 0 ? <p className="share-notice">{mailPlan.text.slice(mailPlan.text.lastIndexOf('\n\n') + 2)}</p> : null}
              >
                <div className="share-field">
                  <label htmlFor={`${id}-to`}>To (optional)</label>
                  <input
                    ref={emailRef}
                    id={`${id}-to`}
                    className="shop-input"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={to}
                    aria-invalid={tried.email && emailProblem ? true : undefined}
                    aria-describedby={tried.email && emailProblem ? `${id}-to-error` : undefined}
                    onChange={(e) => {
                      setTo(e.target.value)
                      if (emailError(e.target.value) === null) writeRemembered('email', e.target.value.trim())
                    }}
                  />
                  {tried.email && emailProblem && (
                    <p id={`${id}-to-error`} className="filters-error" role="alert">
                      {emailProblem}
                    </p>
                  )}
                </div>
              </Row>
              <Row
                icon={ICONS.text}
                label="Text message"
                hint={mobile ? TEXT_HINT_PHONE : TEXT_HINT_COMPUTER}
                onClick={() => void doText()}
                extra={
                  <>
                    {textPlan.hidden > 0 && <p className="share-notice">{textPlan.text.slice(textPlan.text.lastIndexOf('\n\n') + 2)}</p>}
                    {byHand !== null && <textarea ref={byHandRef} className="share-preview-text" readOnly rows={6} value={byHand} aria-label="The text message, to copy by hand" />}
                  </>
                }
              >
                <div className="share-field">
                  <label htmlFor={`${id}-phone`}>Phone number (optional)</label>
                  <input
                    ref={phoneRef}
                    id={`${id}-phone`}
                    className="shop-input"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phone}
                    aria-invalid={tried.phone && phoneProblem ? true : undefined}
                    aria-describedby={tried.phone && phoneProblem ? `${id}-phone-error` : undefined}
                    onChange={(e) => {
                      setPhone(e.target.value)
                      if (phoneError(e.target.value) === null) writeRemembered('phone', e.target.value.trim())
                    }}
                  />
                  {tried.phone && phoneProblem && (
                    <p id={`${id}-phone-error`} className="filters-error" role="alert">
                      {phoneProblem}
                    </p>
                  )}
                </div>
              </Row>
              <Row icon={ICONS.print} label="Print / Save as PDF" hint="Opens the print dialog with a clean page; choose Save as PDF to keep a copy." onClick={() => p.onPrint(items, date)} />
              <Row icon={ICONS.copy} label="Copy as text" hint="Copies the whole list to paste anywhere." onClick={() => void doCopy()} />
              <Row icon={ICONS.download} label="Download CSV" hint="A spreadsheet file for Excel, Numbers or Sheets." onClick={doCsv} />
              <details className="share-preview">
                <summary>Preview the text</summary>
                <textarea className="share-preview-text" readOnly rows={12} value={text} aria-label="The list as text" />
              </details>
            </>
          )}
          <p className="share-said" role="status" aria-live="polite">
            {said}
          </p>
        </div>
        <footer className="filters-foot">
          <div className="filters-actions">
            <button type="button" className="btn btn-secondary" onClick={p.onClose}>
              Close
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

/** The print-only block: the same data as the text, one row per item with a 90px picture, hidden on screen (Share.css shows it only in print). */
export function SharePrint({ items, query, date }: { items: readonly ShareItem[]; query: string; date: Date }) {
  const groups = [
    { name: 'Loved', rows: items.filter((i) => i.mine === 'love') },
    { name: 'Liked', rows: items.filter((i) => i.mine === 'like') },
  ].filter((g) => g.rows.length > 0)
  return (
    <div className="share-print">
      <h1 className="share-print-title">Saved list from ShopAI Tool: {query}</h1>
      <p className="share-print-date">{shareDate(date)}</p>
      {groups.map((g) => (
        <section key={g.name}>
          <h2 className="share-print-section">
            {g.name} ({g.rows.length})
          </h2>
          <ol className="share-print-list">
            {g.rows.map((i, n) => (
              <li key={`${g.name}-${n}`} className="share-print-item">
                {i.thumb ? <img className="share-print-thumb" src={i.thumb} alt="" referrerPolicy="no-referrer" /> : <span className="share-print-thumb is-none" />}
                <div className="share-print-body">
                  <p className="share-print-name">{i.title}</p>
                  <p>{[i.price, i.store, i.storeRating === null ? null : `${i.storeRating.toFixed(1)} stars${i.ratingCount ? ` (${i.ratingCount.toLocaleString('en-US')})` : ''}`].filter(Boolean).join(' · ')}</p>
                  {i.size && <p>Size: {i.size}</p>}
                  {i.also && <p>{i.also}</p>}
                  <p className="share-print-link">{i.link}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
      <p className="share-print-foot">{SHARE_FOOTER}</p>
    </div>
  )
}

export type ShareModalProps = Omit<ShareDialogProps, 'shareAvailable' | 'onPrint'> & { returnFocus: RefObject<HTMLElement | null> }

/**
 * The Share list dialog: the Refine dialog's shell (backdrop, focus moves in, Tab trapped, Esc closes, focus goes back to the button,
 * a full-height sheet under 700px). Print adds the print block to the page, prints, and removes it when printing ends.
 */
export default function ShareModal(p: ShareModalProps) {
  const titleId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const { returnFocus, onClose } = p
  const [printing, setPrinting] = useState<{ items: ShareItem[]; date: Date } | null>(null)

  useEffect(() => {
    const back = returnFocus.current
    rootRef.current?.focus()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
      back?.focus()
    }
  }, [returnFocus])

  // The block is in the DOM before print() is called; it goes away when printing ends.
  useEffect(() => {
    if (!printing) return
    const end = () => setPrinting(null)
    window.addEventListener('afterprint', end)
    const frame = requestAnimationFrame(() => window.print())
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('afterprint', end)
    }
  }, [printing])

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

  return createPortal(
    <>
      <ShareDialog p={{ ...p, shareAvailable: canShare(typeof navigator === 'undefined' ? undefined : navigator), onPrint: (items, date) => setPrinting({ items, date }) }} titleId={titleId} dialogRef={rootRef} onKeyDown={onKey} />
      {printing && <SharePrint items={printing.items} query={p.query} date={printing.date} />}
    </>,
    document.body,
  )
}
