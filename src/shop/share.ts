// Share list: what the Saved items become as text, a mailto: or sms: link, a CSV file and a print block. All pure (the modal only calls them),
// so tests drive them without a browser. Nothing here reads a session or an internal id: a shared list holds titles, prices, stores,
// links and the shopper's own ratings.
import type { SavedLists } from './saved.ts'
import { alsoAtLine, formatPrice, safeHref } from './state.ts'
import type { ResolvedLink } from './types.ts'

export type ShareScope = 'both' | 'love'

export type ShareItem = {
  mine: 'love' | 'like'
  title: string
  /** As the cards show it ("$98"), or "Price not listed". */
  price: string
  store: string
  storeRating: number | null
  ratingCount: number | null
  /** The size line and the "Also at" line, when there are any. */
  size: string | null
  also: string | null
  link: string
  linkKind: 'store' | 'item' | 'search'
  /** The picture, for the print block only (never in the text, the CSV or a link). */
  thumb: string
}

export const SHARE_FOOTER = 'Prices and availability can change.'
export const EMAIL_LIMIT = 1900
export const SMS_LIMIT = 800
export const moreNotice = (n: number) => `${n} more not shown. Use Copy, Print or Download for the full list.`

/** A Google search for the product, the last resort for a link. */
export const searchLink = (title: string, store: string) => `https://www.google.com/search?q=${encodeURIComponent(`${title} ${store}`.trim())}`

type LinkFields = { id: string; title: string; seller: string; link: string; link_kind?: 'google_panel' | 'retailer' | 'none' }

/**
 * The link for an item: the store link already looked up in this session (`resolved`), else the link the result carries (a store page, or
 * Google's product page), else a search for "<title> <store>". Nothing is looked up here (lookups are paid and capped).
 */
export function shareLink(item: LinkFields, resolved: Record<string, ResolvedLink> | undefined): { href: string; kind: ShareItem['linkKind'] } {
  const known = resolved?.[item.id]
  const store = known?.status === 'resolved' ? safeHref(known.link) : null
  if (store) return { href: store, kind: 'store' }
  const own = item.link_kind === 'none' ? null : safeHref(item.link)
  if (own) return { href: own, kind: 'item' }
  return { href: searchLink(item.title, item.seller), kind: 'search' }
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Loved first, then liked, each newest first as the Saved row shows them ("Loved only" drops the liked). */
export function shareItems(lists: SavedLists, resolved: Record<string, ResolvedLink> | undefined, scope: ShareScope): ShareItem[] {
  const rows = scope === 'love' ? lists.loved : [...lists.loved, ...lists.liked]
  return rows.map((r) => {
    const { href, kind } = shareLink(r, resolved)
    return {
      mine: r.mine,
      title: oneLine(r.title),
      price: formatPrice(r.price, r.currency) ?? 'Price not listed',
      store: oneLine(r.seller ?? ''),
      storeRating: r.rating ?? null,
      ratingCount: r.rating_count ?? null,
      size: r.size_hint ? oneLine(r.size_hint) : null,
      also: alsoAtLine(r),
      link: href,
      linkKind: kind,
      thumb: r.thumbnail_url ?? '',
    }
  })
}

const stars = (i: Pick<ShareItem, 'storeRating' | 'ratingCount'>) =>
  i.storeRating === null ? null : `${i.storeRating.toFixed(1)} stars${i.ratingCount ? ` (${i.ratingCount.toLocaleString('en-US')})` : ''}`

export const shareDate = (d: Date) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d)
export const shareHeading = (query: string) => `My saved list from ShopAI Tool: ${oneLine(query)}`

/** The full plain-text list: sections LOVED and LIKED (numbered), details, the link, and a footer. Never HTML. */
export function plainText(items: readonly ShareItem[], query: string, date: Date): string {
  const lines = [shareHeading(query), shareDate(date)]
  for (const [mine, name] of [['love', 'LOVED'], ['like', 'LIKED']] as const) {
    const group = items.filter((i) => i.mine === mine)
    if (group.length === 0) continue
    lines.push('', `${name} (${group.length})`)
    group.forEach((i, n) => {
      lines.push(`${n + 1}. ${i.title}${i.store ? ` by ${i.store}` : ''}`)
      lines.push(`   ${[i.price, i.store, stars(i)].filter(Boolean).join(' · ')}`)
      if (i.size) lines.push(`   Size: ${i.size}`)
      if (i.also) lines.push(`   ${i.also}`)
      lines.push(`   ${i.link}`)
    })
  }
  lines.push('', SHARE_FOOTER)
  return lines.join('\n')
}

/** The short form for a text message: title, price and link per item. */
export function shortText(items: readonly ShareItem[], query: string): string {
  const lines = [`My saved list from ShopAI: ${oneLine(query)}`]
  items.forEach((i, n) => lines.push(`${n + 1}. ${i.title}, ${i.price}`, i.link))
  return lines.join('\n')
}

/** As many items as fit `limit` (measured by `measure`), then a notice for the rest. `shown` < total means the notice is in `text`. */
export function fitItems(items: readonly ShareItem[], build: (shown: readonly ShareItem[]) => string, measure: (text: string) => number, limit: number): { text: string; shown: number; hidden: number } {
  for (let n = items.length; n >= 0; n--) {
    const hidden = items.length - n
    const text = hidden > 0 ? `${build(items.slice(0, n))}\n\n${moreNotice(hidden)}` : build(items)
    if (measure(text) <= limit || n === 0) return { text, shown: n, hidden }
  }
  return { text: build([]), shown: 0, hidden: items.length }
}

// ---- mailto: and sms: ----

export const emailSubject = (query: string) => `My saved list from ShopAI: ${oneLine(query)}`
/** The recipient as it goes in the path: encoded, but "@" stays readable. */
const recipient = (to: string) => encodeURIComponent(to.trim()).replace(/%40/g, '@')

export function mailtoUrl(to: string, subject: string, body: string): string {
  return `mailto:${recipient(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace(/\n/g, '\r\n'))}`
}

/** The number as it goes in the sms: path: digits, with a leading "+" kept; spaces, dashes and brackets dropped. */
export function phoneForSms(phone: string): string {
  const t = phone.trim()
  return `${t.startsWith('+') ? '+' : ''}${t.replace(/\D/g, '')}`
}

/** `sms:<number>?&body=<text>`; with no body just `sms:<number>` (or `sms:` with no number). */
export function smsUrl(phone: string, body?: string): string {
  return body === undefined ? `sms:${phoneForSms(phone)}` : `sms:${phoneForSms(phone)}?&body=${encodeURIComponent(body)}`
}

/** A phone or tablet: the user-agent client hint says mobile, or the user agent names an iPhone, an iPad or Android. */
export function isPhoneOrTablet(userAgent: string, mobileHint?: boolean): boolean {
  return mobileHint === true || /iPhone|iPad|Android/i.test(userAgent)
}

export const TEXT_HINT_PHONE = 'Opens Messages. If nothing happens, use Share… or Copy.'
export const TEXT_HINT_COMPUTER = 'Copies the list, then opens your messaging app. Paste it in.'
export const TEXT_COPIED = 'List copied. Paste it into the message (Cmd+V on Mac, Ctrl+V on Windows).'
export const TEXT_NOT_COPIED = 'Could not copy the list. Select the text below and copy it by hand.'

/**
 * Text message on a computer: copy the short text first, then open the messaging app with the number only (a body is unreliable in
 * Messages on a desktop). The app opens either way; `copied` says which note to show.
 */
export async function textOnComputer(args: { text: string; phone: string; copy: (text: string) => Promise<boolean>; navigate: (url: string) => void }): Promise<{ copied: boolean }> {
  const copied = await args.copy(args.text)
  args.navigate(smsUrl(args.phone))
  return { copied }
}

export function emailPlan(items: readonly ShareItem[], query: string, date: Date, to: string) {
  const subject = emailSubject(query)
  const r = fitItems(items, (shown) => plainText(shown, query, date), (t) => mailtoUrl(to, subject, t).length, EMAIL_LIMIT)
  return { ...r, url: mailtoUrl(to, subject, r.text) }
}

export function smsPlan(items: readonly ShareItem[], query: string, phone: string) {
  const r = fitItems(items, (shown) => shortText(shown, query), (t) => t.length, SMS_LIMIT)
  return { ...r, url: smsUrl(phone, r.text) }
}

// ---- the optional fields ----

/** Empty is fine (the field is optional); otherwise one plain address. */
export const emailError = (v: string): string | null => (v.trim() === '' || /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/.test(v.trim()) ? null : 'Enter a valid email address')
/** Empty is fine; otherwise digits, spaces, dashes, brackets and a leading + only, with 7 to 15 digits. */
export function phoneError(v: string): string | null {
  const t = v.trim()
  if (t === '') return null
  const ok = /^\+?[0-9\s\-()]+$/.test(t) && /^\+?[^+]*$/.test(t)
  const digits = t.replace(/\D/g, '').length
  return ok && digits >= 7 && digits <= 15 ? null : 'Enter a phone number with digits, +, spaces, dashes or brackets'
}

const KEYS = { email: 'shop.share.email', phone: 'shop.share.phone' } as const
type Store = Pick<Storage, 'getItem' | 'setItem'>
const defaultStore = (): Store | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
/** What was typed last time ('' by default, and when storage is blocked or throws). */
export function readRemembered(which: keyof typeof KEYS, store: Store | null = defaultStore()): string {
  try {
    return store?.getItem(KEYS[which]) ?? ''
  } catch {
    return ''
  }
}
export function writeRemembered(which: keyof typeof KEYS, value: string, store: Store | null = defaultStore()) {
  try {
    store?.setItem(KEYS[which], value)
  } catch {
    // Blocked storage: the field is just not remembered.
  }
}

// ---- CSV ----

export const CSV_HEADER = ['Rating', 'Title', 'Price', 'Store', 'Store rating', 'Rating count', 'Size or note', 'Link']

/** One CSV field: quoted when it has a comma, quote or newline; a leading = + - @ is defused so a spreadsheet does not run it as a formula. */
export function csvField(value: string | number | null): string {
  let s = value === null ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** UTF-8 with a byte order mark (so Excel reads the accents), CRLF line ends. */
export function csvText(items: readonly ShareItem[]): string {
  const rows = items.map((i) => [i.mine === 'love' ? 'Loved' : 'Liked', i.title, i.price, i.store, i.storeRating, i.ratingCount, [i.size, i.also].filter(Boolean).join('; '), i.link])
  return `\uFEFF${[CSV_HEADER, ...rows].map((r) => r.map((v) => csvField(v)).join(',')).join('\r\n')}\r\n`
}

const two = (n: number) => String(n).padStart(2, '0')
export const csvFilename = (d: Date) => `shopai-saved-${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}.csv`

// ---- Share…, Copy ----

export type NavigatorShare = { share?: (data: { title?: string; text?: string }) => Promise<void> }
export const canShare = (nav: NavigatorShare | undefined): boolean => typeof nav?.share === 'function'

/** The system share sheet; a cancel (AbortError) is not an error. */
export async function shareText(nav: NavigatorShare | undefined, title: string, text: string): Promise<'shared' | 'cancelled' | 'failed' | 'unavailable'> {
  if (!nav?.share) return 'unavailable'
  try {
    await nav.share({ title, text })
    return 'shared'
  } catch (e) {
    return (e as { name?: string } | null)?.name === 'AbortError' ? 'cancelled' : 'failed'
  }
}

export type CopyEnv = { clipboard?: { writeText: (t: string) => Promise<void> }; legacy: (t: string) => boolean }
/** The Clipboard API, else the old textarea + execCommand route. True when it copied. */
export async function copyText(text: string, env: CopyEnv): Promise<boolean> {
  if (env.clipboard) {
    try {
      await env.clipboard.writeText(text)
      return true
    } catch {
      // Blocked (no permission, an insecure page): fall through to the old route.
    }
  }
  try {
    return env.legacy(text)
  } catch {
    return false
  }
}
