import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, test } from 'node:test'
import type { ComponentType } from 'react'
import { fixtureBundles } from '../src/shop/fixtures.ts'
import { savedLists } from '../src/shop/saved.ts'
import {
  CSV_HEADER,
  EMAIL_LIMIT,
  SMS_LIMIT,
  canShare,
  copyText,
  csvField,
  csvFilename,
  csvText,
  emailError,
  emailPlan,
  fitItems,
  mailtoUrl,
  moreNotice,
  phoneError,
  phoneForSms,
  plainText,
  readRemembered,
  searchLink,
  shareItems,
  shareLink,
  shareText,
  shortText,
  smsPlan,
  smsUrl,
  writeRemembered,
  type ShareItem,
} from '../src/shop/share.ts'
import type { ShopViewProps } from '../src/shop/viewprops.ts'
import { closeServer, loadModule, render } from './helpers/ssr.ts'

after(closeServer)

const st = fixtureBundles.asksaved12.state
assert.ok(st.status === 'done')
const lists = savedLists(st.view.saved, st.view.search?.results ?? [], st.ratings)
const both = shareItems(lists, st.ratings, st.view.resolved, 'both')
const date = new Date(2026, 10, 7)

test('the fixture: 12 saved items, 7 loved then 5 liked, newest first inside each', () => {
  assert.equal(both.length, 12)
  assert.deepEqual([lists.loved.length, lists.liked.length], [7, 5])
  assert.deepEqual(both.map((i) => i.mine), [...Array(7).fill('love'), ...Array(5).fill('like')])
  assert.equal(both[0].title, 'Wool Bengal Tiger Hand-Tufted Rug')
  assert.equal(shareItems(lists, st.ratings, st.view.resolved, 'love').length, 7, 'Loved only')
})

test('link rule: the resolved store link, else the result\'s own link, else a Google search for "<title> <store>"; never looked up here', () => {
  const kinds = both.map((i) => i.linkKind)
  assert.deepEqual({ store: kinds.filter((k) => k === 'store').length, item: kinds.filter((k) => k === 'item').length, search: kinds.filter((k) => k === 'search').length }, { store: 4, item: 5, search: 3 })
  const item = { id: 'a', title: 'Blue rug & more', seller: 'Shop (US)', link: 'https://example.com/p', link_kind: 'retailer' as const }
  assert.deepEqual(shareLink(item, { a: { status: 'resolved', link: 'https://store.example.com/x' } }), { href: 'https://store.example.com/x', kind: 'store' })
  assert.equal(shareLink(item, { a: { status: 'fallback', link: 'https://www.google.com/x' } }).href, 'https://example.com/p', 'a fallback lookup is not a store link')
  assert.equal(shareLink({ ...item, link_kind: 'google_panel' }, undefined).kind, 'item')
  assert.deepEqual(shareLink({ ...item, link_kind: 'none' }, undefined), { href: 'https://www.google.com/search?q=Blue%20rug%20%26%20more%20Shop%20(US)', kind: 'search' })
  assert.equal(shareLink({ ...item, link: 'javascript:alert(1)' }, undefined).kind, 'search', 'an unsafe link is never shared')
  assert.equal(searchLink('rug', ''), 'https://www.google.com/search?q=rug')
})

test('plain text: heading, date, LOVED and LIKED sections numbered from 1, details, size, Also at, your note, the link, a footer', () => {
  const text = plainText(both, 'nice rug', date)
  const lines = text.split('\n')
  assert.deepEqual(lines.slice(0, 7), ['My saved list from ShopAI Tool: nice rug', 'Nov 7, 2026', '', 'LOVED (7)', '1. Wool Bengal Tiger Hand-Tufted Rug by Anthropologie', '   $98 · Anthropologie · 4.8 stars (111)', "   Size: 3' x 5'"])
  assert.ok(lines.includes('   Your note: love the colours'))
  assert.ok(lines.includes('   https://store.example.com/anthropologie/item-1'))
  assert.ok(lines.includes('LIKED (5)'))
  assert.ok(lines.includes('1. Multicolour boho rug by Demo Living'), 'liked numbering restarts')
  assert.ok(lines.includes('   Also at: Example Home Co. $109'))
  assert.equal(lines.at(-1), 'Prices and availability can change.')
  assert.ok(lines.includes('   $303 · Example Home Co.'), 'no star rating: nothing invented')
  assert.ok(lines.includes('   Your note: for the kitchen, comma, "quotes" and a new line'), 'a note is one line')
})

test('no internal id, session id or HTML in anything shared', () => {
  const everything = [plainText(both, 'nice rug', date), shortText(both, 'nice rug'), csvText(both), emailPlan(both, 'nice rug', date, 'a@b.co').url, smsPlan(both, 'nice rug', '5551234567').url].join('\n')
  assert.doesNotMatch(everything, /\bsv-\d|\bcd-\d|fixture-session|session_id|result_id/)
  assert.doesNotMatch(plainText(both, 'nice rug', date), /<[a-z]/i)
  for (const i of both) assert.ok(!Object.keys(i).includes('id'))
})

test('email: the whole mailto URL stays under 1,900 characters and ends with the "N more" notice; a short list is complete', () => {
  const plan = emailPlan(both, 'nice rug', date, 'me@example.com')
  assert.ok(plan.url.length <= EMAIL_LIMIT && plan.url.length > 1000, String(plan.url.length))
  assert.ok(plan.hidden > 0 && plan.shown + plan.hidden === 12)
  assert.ok(plan.text.endsWith(moreNotice(plan.hidden)))
  assert.equal(moreNotice(8), '8 more not shown. Use Copy, Print or Download for the full list.')
  assert.ok(decodeURIComponent(plan.url).includes(moreNotice(plan.hidden)))
  assert.ok(plan.url.startsWith('mailto:me@example.com?subject=My%20saved%20list%20from%20ShopAI%3A%20nice%20rug&body='))
  const few = emailPlan(both.slice(0, 2), 'nice rug', date, '')
  assert.equal(few.hidden, 0)
  assert.doesNotMatch(few.text, /more not shown/)
  assert.ok(few.url.startsWith('mailto:?subject='))
  // The cut keeps whole items: every shown item has its link.
  assert.equal(plan.text.split('\n').filter((l) => /^ {3}https?:/.test(l)).length, plan.shown)
})

test('SMS: a short body (title, price, link), under 800 characters, with the same "N more" ending', () => {
  const plan = smsPlan(both, 'nice rug', '+1 (555) 123-4567')
  assert.ok(plan.text.length <= SMS_LIMIT && plan.text.length > 600, String(plan.text.length))
  assert.ok(plan.hidden > 0 && plan.text.endsWith(moreNotice(plan.hidden)))
  assert.doesNotMatch(plan.text, /Your note|stars|LOVED|Prices and availability/, 'only title, price and link')
  assert.match(plan.text, /^My saved list from ShopAI: nice rug\n1\. Wool Bengal Tiger Hand-Tufted Rug, \$98\nhttps:\/\/store\.example\.com\/anthropologie\/item-1\n2\./)
  const few = smsPlan(both.slice(0, 2), 'nice rug', '')
  assert.equal(few.hidden, 0)
  assert.ok(few.url.startsWith('sms:?&body='))
})

test('fitItems: as many whole items as fit, zero items fit nothing and still reports them', () => {
  const r = fitItems(both, (shown) => shown.map((i) => i.title).join('|'), (t) => t.length, 10)
  assert.equal(r.shown, 0)
  assert.equal(r.hidden, 12)
  assert.equal(fitItems(both, (shown) => `${shown.length}`, (t) => t.length, 1000).hidden, 0)
})

test('mailto and sms URLs: encoded, "+" kept in the number, "@" kept readable, CRLF in the mail body', () => {
  assert.equal(mailtoUrl('me+rugs@example.com', 'A & B', 'line1\nline2'), 'mailto:me%2Brugs@example.com?subject=A%20%26%20B&body=line1%0D%0Aline2')
  assert.equal(phoneForSms('+1 (555) 123-4567'), '+15551234567')
  assert.equal(phoneForSms('555-123-4567'), '5551234567')
  assert.equal(smsUrl('+1 (555) 123-4567', 'Hi & bye: 100%\nnext'), 'sms:+15551234567?&body=Hi%20%26%20bye%3A%20100%25%0Anext')
  assert.ok(!smsUrl('+15551234567', 'x').includes('%2B'))
})

test('the optional fields: empty is fine; an email must look like one; a phone is digits, +, spaces, dashes and brackets', () => {
  for (const ok of ['', '  ', 'me@example.com', ' me+x@mail.example.co.uk ']) assert.equal(emailError(ok), null, ok)
  for (const bad of ['me', 'me@', '@example.com', 'me@example', 'a b@example.com', 'a@b.com, c@d.com', 'me@@example.com']) assert.equal(emailError(bad), 'Enter a valid email address', bad)
  for (const ok of ['', '5551234567', '+1 (555) 123-4567', '555-123-4567', '+44 20 7946 0958']) assert.equal(phoneError(ok), null, ok)
  for (const bad of ['abc', '12', '555-CALL-NOW', '5551234567890123', '1+2345678', '+1 (555) 123-45x7']) assert.ok(phoneError(bad), bad)
})

test('remembered fields: empty by default, kept in localStorage, and a missing, blocked or throwing store is ignored', () => {
  const kept = new Map<string, string>()
  const store = { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v) }
  assert.equal(readRemembered('email', store), '')
  writeRemembered('email', 'me@example.com', store)
  writeRemembered('phone', '+1 555 123 4567', store)
  assert.equal(readRemembered('email', store), 'me@example.com')
  assert.equal(readRemembered('phone', store), '+1 555 123 4567')
  const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('quota') } }
  assert.equal(readRemembered('email', broken), '')
  assert.doesNotThrow(() => writeRemembered('email', 'x@y.zz', broken))
  assert.equal(readRemembered('email', null), '')
  assert.doesNotThrow(() => writeRemembered('phone', '1', null))
  // Never hard-coded: nothing in the source holds an address or a number.
  assert.doesNotMatch(readFileSync(new URL('../src/shop/share.ts', import.meta.url), 'utf8') + readFileSync(new URL('../src/shop/ShareModal.tsx', import.meta.url), 'utf8'), /[\w.+-]+@(?!example)[\w-]+\.[a-z]{2,}/i)
})

test('CSV: UTF-8 BOM, the nine columns, commas, quotes and newlines escaped, formulas defused, the filename by local date', () => {
  assert.deepEqual(CSV_HEADER, ['Rating', 'Title', 'Price', 'Store', 'Store rating', 'Rating count', 'Size or note', 'Your comment', 'Link'])
  const csv = csvText(both)
  assert.equal(csv.charCodeAt(0), 0xfeff)
  assert.ok(csv.startsWith('﻿Rating,Title,Price,Store,Store rating,Rating count,Size or note,Your comment,Link\r\n'))
  assert.ok(csv.includes('Loved,Wool Bengal Tiger Hand-Tufted Rug,$98,Anthropologie,4.8,111,3\' x 5\',love the colours,https://store.example.com/anthropologie/item-1\r\n'))
  assert.ok(csv.includes('"check the pile height, ""low"" is subjective"'))
  assert.equal(csvField('a,b'), '"a,b"')
  assert.equal(csvField('say "hi"'), '"say ""hi"""')
  assert.equal(csvField('two\nlines'), '"two\nlines"')
  assert.equal(csvField('=SUM(A1)'), "'=SUM(A1)")
  assert.equal(csvField(null), '')
  assert.equal(csvField(4.8), '4.8')
  const lines = csv.split('\r\n')
  assert.equal(lines.at(-1), '')
  assert.ok(csv.includes('Liked,Example Gray polyester runner'))
  assert.equal(csvFilename(new Date(2026, 0, 5)), 'shopai-saved-2026-01-05.csv')
  assert.equal(csvFilename(new Date(2026, 10, 7)), 'shopai-saved-2026-11-07.csv')
})

test('Share… exists only with navigator.share; a cancel (AbortError) is silent; another failure is reported', async () => {
  assert.equal(canShare(undefined), false)
  assert.equal(canShare({}), false)
  assert.equal(canShare({ share: async () => {} }), true)
  const sent: unknown[] = []
  assert.equal(await shareText({ share: async (d) => void sent.push(d) }, 'T', 'body'), 'shared')
  assert.deepEqual(sent, [{ title: 'T', text: 'body' }])
  assert.equal(await shareText({ share: async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }) } }, 'T', 'b'), 'cancelled')
  assert.equal(await shareText({ share: async () => { throw new Error('nope') } }, 'T', 'b'), 'failed')
  assert.equal(await shareText(undefined, 'T', 'b'), 'unavailable')
})

test('Copy: the Clipboard API, else the textarea fallback; both failing is reported', async () => {
  const wrote: string[] = []
  assert.equal(await copyText('abc', { clipboard: { writeText: async (t) => void wrote.push(t) }, legacy: () => { throw new Error('unused') } }), true)
  assert.deepEqual(wrote, ['abc'])
  const old: string[] = []
  assert.equal(await copyText('def', { legacy: (t) => (old.push(t), true) }), true)
  assert.equal(await copyText('ghi', { clipboard: { writeText: async () => { throw new Error('denied') } }, legacy: (t) => (old.push(t), true) }), true)
  assert.deepEqual(old, ['def', 'ghi'])
  assert.equal(await copyText('x', { legacy: () => false }), false)
  assert.equal(await copyText('x', { legacy: () => { throw new Error('no') } }), false)
})

// ---- the view ----

const noop = () => {}
const dialog = async (over: Record<string, unknown> = {}) => {
  const { ShareDialog } = await loadModule<{ ShareDialog: ComponentType<{ p: Record<string, unknown>; titleId: string }> }>('/src/shop/ShareModal.tsx')
  const p = { lists, ratings: st.ratings, resolved: st.view.resolved, query: 'nice rug', shareAvailable: false, onClose: noop, onPrint: noop, now: date, ...over }
  return render(ShareDialog, { p, titleId: 'ttl' })
}

test('dialog: labelled, scope toggle with counts, the five ways to share with a hint each, the text preview collapsed', async () => {
  const html = await dialog()
  assert.match(html, /role="dialog" aria-modal="true" aria-labelledby="ttl"/)
  assert.match(html, />Share your saved list<\/h2>/)
  assert.match(html, /role="radiogroup" aria-label="What to share"/)
  assert.match(html, /aria-checked="true" class="share-scope-btn is-on">Loved and liked \(12\)</)
  assert.match(html, /aria-checked="false" class="share-scope-btn">Loved only \(7\)</)
  for (const label of ['Email', 'Text message', 'Print / Save as PDF', 'Copy as text', 'Download CSV']) assert.match(html, new RegExp(`<span>${label.replace(/[/]/g, '\\/')}<\\/span>`), label)
  assert.equal(html.match(/class="share-hint"/g)?.length, 5)
  assert.match(html, /Opens Messages\. If nothing happens, use Share… or Copy\./)
  assert.match(html, /<details class="share-preview"><summary>Preview the text<\/summary><textarea[^>]*readOnly=""[^>]*>My saved list from ShopAI Tool: nice rug\nNov 7, 2026/)
  assert.doesNotMatch(html, /<details[^>]* open/)
  // The optional fields are labelled, empty by default.
  assert.match(html, />To \(optional\)<\/label>/)
  assert.match(html, />Phone number \(optional\)<\/label>/)
  assert.match(html, /type="email"[^>]*value=""/)
  assert.match(html, /type="tel"[^>]*value=""/)
  // The "N more" notice is in the dialog before anything opens.
  assert.match(html, /<p class="share-notice">8 more not shown\. Use Copy, Print or Download for the full list\.<\/p>/)
  assert.match(html, /<p class="share-notice">6 more not shown\./)
})

test('dialog: Share… only when navigator.share exists', async () => {
  assert.doesNotMatch(await dialog({ shareAvailable: false }), /<span>Share…<\/span>/)
  const on = await dialog({ shareAvailable: true })
  assert.match(on, /<span>Share…<\/span>/)
  assert.equal(on.match(/class="share-hint"/g)?.length, 6)
})

test('dialog: no saved items says so and offers nothing to share', async () => {
  const empty = await dialog({ lists: { loved: [], liked: [] }, ratings: {}, resolved: undefined })
  assert.match(empty, /<p class="share-empty" role="status">Love or like some results first\.<\/p>/)
  assert.doesNotMatch(empty, /share-action|share-preview/)
  assert.match(empty, /Loved and liked \(0\)/)
})

test('Saved row: "Share list (N)" with N = loved + liked, enabled with none, beside "Show all ›"', async () => {
  const { default: View } = await loadModule<{ default: ComponentType<ShopViewProps> }>('/src/shop/ShopView.tsx')
  const props = (key: string): ShopViewProps => ({
    state: fixtureBundles[key].state, value: '', onChange: noop, onSubmit: noop, onExample: noop, onRetry: noop, refineText: '', onRefineChange: noop, onShopAgain: noop,
    onRate: noop, onComment: noop, onCommentBlur: noop, onRetryRating: noop, onRemoveRefine: noop, onRemoveContext: noop,
    onAnswer: noop, onSubmitAnswers: noop, onRetryAnswers: noop, onSearchFilters: noop, onSaveFilters: noop,
    meta: fixtureBundles[key].meta, savedOpen: false, onToggleSaved: noop, savedTab: 'love', onSavedTab: noop, onResolve: async () => null,
  })
  const full = render(View, props('asksaved12'))
  assert.match(full, /<div class="shop-saved-side"><button type="button" class="shop-saved-share" aria-haspopup="dialog" aria-expanded="false">Share list \(12\)<\/button><button type="button" class="shop-link shop-saved-toggle"[^>]*>Show all ›<\/button><\/div>/)
  const none = render(View, props('savedempty'))
  assert.match(none, /class="shop-saved-share"[^>]*>Share list \(0\)<\/button>/)
  assert.doesNotMatch(none.match(/class="shop-saved-share"[^>]*>/)?.[0] ?? '', /disabled/)
})

test('print block: sections, one row per item with a thumbnail, title, price, store, rating, your note, the link; no ids; hidden on screen', async () => {
  const { SharePrint } = await loadModule<{ SharePrint: ComponentType<{ items: ShareItem[]; query: string; date: Date }> }>('/src/shop/ShareModal.tsx')
  const html = render(SharePrint, { items: both, query: 'nice rug', date })
  assert.match(html, /<h1 class="share-print-title">Saved list from ShopAI Tool: nice rug<\/h1><p class="share-print-date">Nov 7, 2026<\/p>/)
  assert.match(html, />Loved \(7\)<\/h2>/)
  assert.match(html, />Liked \(5\)<\/h2>/)
  assert.equal(html.match(/class="share-print-item"/g)?.length, 12)
  assert.equal(html.match(/<img class="share-print-thumb"/g)?.length, 12)
  assert.match(html, /<p class="share-print-link">https:\/\/store\.example\.com\/anthropologie\/item-1<\/p>/)
  assert.match(html, /Your note: love the colours/)
  assert.match(html, /<p class="share-print-foot">Prices and availability can change\.<\/p>/)
  assert.doesNotMatch(html, /\bsv-\d/)
  const css = readFileSync(new URL('../src/shop/Share.css', import.meta.url), 'utf8')
  assert.match(css, /\n\.share-print \{\s*display: none;\s*\}/, 'hidden outside print')
  const print = css.slice(css.indexOf('@media print'))
  assert.match(print, /body > :not\(\.share-print\) \{\s*display: none !important;/, 'in print everything else is hidden')
  assert.match(print, /\.share-print-item \{[^}]*break-inside: avoid;/)
  assert.match(print, /width: 90px;/)
  assert.match(print, /color: #000;[^}]*background: #fff;/)
  assert.match(print, /overflow-wrap: anywhere;/, 'long links wrap')
  const modal = readFileSync(new URL('../src/shop/ShareModal.tsx', import.meta.url), 'utf8')
  assert.match(modal, /addEventListener\('afterprint', end\)/, 'the block goes away when printing ends')
  assert.match(modal, /requestAnimationFrame\(\(\) => window\.print\(\)\)/, 'print() runs after the block is in the DOM')
})

test('dialog shell: the Refine dialog\'s classes, focus trap and Esc; a full-height sheet under 700px', () => {
  const modal = readFileSync(new URL('../src/shop/ShareModal.tsx', import.meta.url), 'utf8')
  assert.match(modal, /className="filters-backdrop"/)
  assert.match(modal, /className="filters-dialog share-dialog"/)
  assert.match(modal, /trapTab\(/)
  assert.match(modal, /e\.key === 'Escape'/)
  assert.match(modal, /back\?\.focus\(\)/, 'focus goes back to the button')
  assert.match(readFileSync(new URL('../src/shop/Filters.css', import.meta.url), 'utf8'), /@media \(max-width: 699px\)[^]*\.filters-dialog \{[^}]*width: 100%;[^}]*max-height: none;/)
})
