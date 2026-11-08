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
  isPhoneOrTablet,
  textOnComputer,
  TEXT_COPIED,
  TEXT_HINT_COMPUTER,
  TEXT_HINT_PHONE,
  TEXT_NOT_COPIED,
  writeRemembered,
  type ShareItem,
} from '../src/shop/share.ts'
import type { ShopViewProps } from '../src/shop/viewprops.ts'
import { closeServer, loadModule, render } from './helpers/ssr.ts'

after(closeServer)

const st = fixtureBundles.asksaved12.state
assert.ok(st.status === 'done')
const lists = savedLists(st.view.saved, st.view.search?.results ?? [], st.ratings)
const both = shareItems(lists, st.view.resolved, 'both')
const date = new Date(2026, 10, 7)

test('the fixture: 12 saved items, 7 loved then 5 liked, newest first inside each', () => {
  assert.equal(both.length, 12)
  assert.deepEqual([lists.loved.length, lists.liked.length], [7, 5])
  assert.deepEqual(both.map((i) => i.mine), [...Array(7).fill('love'), ...Array(5).fill('like')])
  assert.equal(both[0].title, 'Wool Bengal Tiger Hand-Tufted Rug')
  assert.equal(shareItems(lists, st.view.resolved, 'love').length, 7, 'Loved only')
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

test('plain text: heading, date, LOVED and LIKED sections numbered from 1, details, size, Also at, the link, a footer; no note', () => {
  const text = plainText(both, 'nice rug', date)
  const lines = text.split('\n')
  assert.deepEqual(lines.slice(0, 7), ['My saved list from ShopAI Tool: nice rug', 'Nov 7, 2026', '', 'LOVED (7)', '1. Wool Bengal Tiger Hand-Tufted Rug by Anthropologie', '   $98 · Anthropologie · 4.8 stars (111)', "   Size: 3' x 5'"])
  assert.ok(!text.includes('Your note') && !text.includes('love the colours'), 'no note line')
  assert.ok(lines.includes('   https://store.example.com/anthropologie/item-1'))
  assert.ok(lines.includes('LIKED (5)'))
  assert.ok(lines.includes('1. Multicolour boho rug by Demo Living'), 'liked numbering restarts')
  assert.ok(lines.includes('   Also at: Example Home Co. $109'))
  assert.equal(lines.at(-1), 'Prices and availability can change.')
  assert.ok(lines.includes('   $303 · Example Home Co.'), 'no star rating: nothing invented')
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

test('CSV: UTF-8 BOM, the eight columns, commas, quotes and newlines escaped, formulas defused, the filename by local date', () => {
  assert.deepEqual(CSV_HEADER, ['Rating', 'Title', 'Price', 'Store', 'Store rating', 'Rating count', 'Size or note', 'Link'])
  const csv = csvText(both)
  assert.equal(csv.charCodeAt(0), 0xfeff)
  assert.ok(csv.startsWith('﻿Rating,Title,Price,Store,Store rating,Rating count,Size or note,Link\r\n'))
  assert.ok(csv.includes('Loved,Wool Bengal Tiger Hand-Tufted Rug,$98,Anthropologie,4.8,111,3\' x 5\',https://store.example.com/anthropologie/item-1\r\n'))
  assert.ok(!csv.includes('Your comment') && !csv.includes('love the colours'), 'no comment column')
  assert.equal(csv.split('\r\n')[0].split(',').length, 8, 'eight columns')
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
  const p = { lists, resolved: st.view.resolved, query: 'nice rug', shareAvailable: false, onClose: noop, onPrint: noop, now: date, ...over }
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
  assert.ok(html.includes(TEXT_HINT_COMPUTER), 'a computer (and a test) gets the copy-then-open hint')
  assert.match(html, /links, prices and stores\.<\/p>/, 'the count line no longer mentions notes')
  assert.match(html, /<details class="share-preview"><summary>Preview the text<\/summary><textarea[^>]*readOnly=""[^>]*>My saved list from ShopAI Tool: nice rug\nNov 7, 2026/)
  assert.doesNotMatch(html, /<details[^>]* open/)
  // The optional fields are labelled, empty by default.
  assert.match(html, />To \(optional\)<\/label>/)
  assert.match(html, />Phone number \(optional\)<\/label>/)
  assert.match(html, /type="email"[^>]*value=""/)
  assert.match(html, /type="tel"[^>]*value=""/)
  // The "N more" notice is in the dialog before anything opens.
  assert.match(html, /<p class="share-notice">7 more not shown\. Use Copy, Print or Download for the full list\.<\/p>/)
  assert.match(html, /<p class="share-notice">6 more not shown\./)
})

test('dialog: Share… only when navigator.share exists', async () => {
  assert.doesNotMatch(await dialog({ shareAvailable: false }), /<span>Share…<\/span>/)
  const on = await dialog({ shareAvailable: true })
  assert.match(on, /<span>Share…<\/span>/)
  assert.equal(on.match(/class="share-hint"/g)?.length, 6)
})

test('dialog: no saved items says so and offers nothing to share', async () => {
  const empty = await dialog({ lists: { loved: [], liked: [] }, resolved: undefined })
  assert.match(empty, /<p class="share-empty" role="status">Love or like some results first\.<\/p>/)
  assert.doesNotMatch(empty, /share-action|share-preview/)
  assert.match(empty, /Loved and liked \(0\)/)
})

test('Saved row: "Share list (N)" with N = loved + liked, enabled with none, beside "Show all ›"', async () => {
  const { default: View } = await loadModule<{ default: ComponentType<ShopViewProps> }>('/src/shop/ShopView.tsx')
  const props = (key: string): ShopViewProps => ({
    state: fixtureBundles[key].state, value: '', onChange: noop, onSubmit: noop, onExample: noop, onRetry: noop, refineText: '', onRefineChange: noop, onShopAgain: noop,
    onRate: noop, onRetryRating: noop, onRemoveRefine: noop, onRemoveContext: noop,
    onAnswer: noop, onSubmitAnswers: noop, onRetryAnswers: noop, onSearchFilters: noop, onSaveFilters: noop,
    meta: fixtureBundles[key].meta, savedOpen: false, onToggleSaved: noop, savedTab: 'love', onSavedTab: noop, onResolve: async () => null,
  })
  const full = render(View, props('asksaved12'))
  assert.match(full, /<div class="shop-saved-side"><button type="button" class="shop-saved-share" aria-haspopup="dialog" aria-expanded="false">Share list \(12\)<\/button><button type="button" class="shop-link shop-saved-toggle"[^>]*>Show all ›<\/button><\/div>/)
  const none = render(View, props('savedempty'))
  assert.match(none, /class="shop-saved-share"[^>]*>Share list \(0\)<\/button>/)
  assert.doesNotMatch(none.match(/class="shop-saved-share"[^>]*>/)?.[0] ?? '', /disabled/)
})

test('print block: sections, one row per item with a thumbnail, title, price, store, rating, the link, no note; no ids; hidden on screen', async () => {
  const { SharePrint } = await loadModule<{ SharePrint: ComponentType<{ items: ShareItem[]; query: string; date: Date }> }>('/src/shop/ShareModal.tsx')
  const html = render(SharePrint, { items: both, query: 'nice rug', date })
  assert.match(html, /<h1 class="share-print-title">Saved list from ShopAI Tool: nice rug<\/h1><p class="share-print-date">Nov 7, 2026<\/p>/)
  assert.match(html, />Loved \(7\)<\/h2>/)
  assert.match(html, />Liked \(5\)<\/h2>/)
  assert.equal(html.match(/class="share-print-item"/g)?.length, 12)
  assert.equal(html.match(/<img class="share-print-thumb"/g)?.length, 12)
  assert.match(html, /<p class="share-print-link">https:\/\/store\.example\.com\/anthropologie\/item-1<\/p>/)
  assert.doesNotMatch(html, /Your note|love the colours/)
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

// ---- Text message: phones keep the sms: body, computers copy first ----

test('smsUrl: with a body it is sms:<number>?&body=<text>; without one it is the number alone, or sms: with no number', () => {
  assert.equal(smsUrl('555 123 4567', 'Hi there'), 'sms:5551234567?&body=Hi%20there')
  assert.equal(smsUrl('+1 (555) 123-4567'), 'sms:+15551234567')
  assert.equal(smsUrl(''), 'sms:')
  assert.equal(smsUrl('   '), 'sms:')
  assert.equal(smsUrl('', ''), 'sms:?&body=', 'an empty body is still a body')
  assert.equal(smsPlan(both, 'nice rug', '5551234567').url, smsUrl('5551234567', smsPlan(both, 'nice rug', '5551234567').text), 'the plan (phones) keeps the body')
})

test('platform: the client hint or an iPhone, iPad or Android user agent is a phone or tablet; anything else is a computer', () => {
  const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
  const win = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  const linux = 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0'
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  const ipad = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'
  for (const ua of [mac, win, linux, '']) assert.equal(isPhoneOrTablet(ua), false, ua)
  for (const ua of [iphone, ipad, android]) assert.equal(isPhoneOrTablet(ua), true, ua)
  assert.equal(isPhoneOrTablet(mac, true), true, 'the hint says mobile')
  assert.equal(isPhoneOrTablet(android, false), true, 'a user agent that names Android still counts')
  assert.equal(isPhoneOrTablet(mac, false), false)
})

test('computers: the short text is copied BEFORE the app is opened, and the app gets the number only', async () => {
  const events: string[] = []
  const plan = smsPlan(both, 'nice rug', '+1 (555) 123-4567')
  const out = await textOnComputer({
    text: plan.text,
    phone: '+1 (555) 123-4567',
    copy: async (t) => {
      await Promise.resolve()
      events.push(`copy:${t === plan.text}`)
      return true
    },
    navigate: (url) => void events.push(`open:${url}`),
  })
  assert.deepEqual(events, ['copy:true', 'open:sms:+15551234567'])
  assert.deepEqual(out, { copied: true })
  assert.ok(!events.join().includes('body='), 'no body goes to Messages on a computer')
  // No number typed: just sms:
  const none: string[] = []
  await textOnComputer({ text: 'x', phone: '', copy: async () => true, navigate: (u) => void none.push(u) })
  assert.deepEqual(none, ['sms:'])
})

test('computers: a failed copy still opens the app and reports it, so the page can show the text to copy by hand', async () => {
  const events: string[] = []
  const out = await textOnComputer({ text: 'x', phone: '5551234567', copy: async () => (events.push('copy'), false), navigate: (u) => void events.push(u) })
  assert.deepEqual(events, ['copy', 'sms:5551234567'])
  assert.deepEqual(out, { copied: false })
})

test('computers: the copy uses the same clipboard route as Copy (the clipboard first, then the old route)', async () => {
  const written: string[] = []
  const ok = await copyText('short', { clipboard: { writeText: async (t) => void written.push(t) }, legacy: () => false })
  assert.equal(ok, true)
  assert.deepEqual(written, ['short'])
  assert.equal(await copyText('short', { clipboard: { writeText: async () => Promise.reject(new Error('denied')) }, legacy: () => false }), false)
})

test('dialog: the Text hint says "Copies the list, then opens your messaging app. Paste it in." on a computer and keeps the old hint on a phone', async () => {
  assert.equal(TEXT_HINT_COMPUTER, 'Copies the list, then opens your messaging app. Paste it in.')
  assert.equal(TEXT_HINT_PHONE, 'Opens Messages. If nothing happens, use Share… or Copy.')
  const computer = await dialog({ mobile: false })
  assert.ok(computer.includes(TEXT_HINT_COMPUTER) && !computer.includes(TEXT_HINT_PHONE))
  const phone = await dialog({ mobile: true })
  assert.ok(phone.includes(TEXT_HINT_PHONE) && !phone.includes(TEXT_HINT_COMPUTER))
  assert.ok(phone.match(/<p class="share-notice">/), 'the "N more" notice still shows on a phone')
  assert.equal(SMS_LIMIT, 800)
  assert.equal(TEXT_COPIED, 'List copied. Paste it into the message (Cmd+V on Mac, Ctrl+V on Windows).')
  assert.match(TEXT_NOT_COPIED, /Could not copy the list\. Select the text below/)
})

test('the Text action (source): phones set the sms: link with the body; computers copy, open the number only, then show the note or the text by hand', () => {
  const src = readFileSync(new URL('../src/shop/ShareModal.tsx', import.meta.url), 'utf8')
  const doText = src.slice(src.indexOf('const doText'), src.indexOf('const doCopy'))
  assert.match(doText, /if \(mobile\) \{\s*window\.location\.href = textPlan\.url/)
  assert.match(doText, /await textOnComputer\(/)
  assert.match(doText, /setSaid\(copied \? TEXT_COPIED : TEXT_NOT_COPIED\)/)
  assert.match(doText, /setByHand\(copied \? null : textPlan\.text\)/)
})
