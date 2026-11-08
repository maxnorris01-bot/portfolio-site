import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, test } from 'node:test'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { closeServer, loadModule } from './helpers/ssr.ts'
import { CONTACT_NOTE, CONTACT_SENT, MESSAGE_MAX, canSend, counterText, emptyForm, errorText, sendContact } from '../src/components/contact.ts'

after(closeServer)

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')
type ContactDialogProps = { form: typeof emptyForm; onChange: () => void; onSubmit: () => void; onClose: () => void; sending: boolean; sent: boolean; error: string | null }
type Modal = { ContactDialog: ComponentType<{ p: ContactDialogProps; titleId: string }> }
const dialog = async (over: Partial<ContactDialogProps> = {}) => {
  const { ContactDialog } = await loadModule<Modal>('/src/components/ContactModal.tsx')
  const p: ContactDialogProps = { form: emptyForm, onChange: () => {}, onSubmit: () => {}, onClose: () => {}, sending: false, sent: false, error: null, ...over }
  return renderToStaticMarkup(createElement(ContactDialog, { p, titleId: 't' }))
}

test('the form: a labelled dialog with three required, labelled fields, a counter, the note and a Send button', async () => {
  const html = await dialog()
  assert.match(html, /role="dialog" aria-modal="true" aria-labelledby="t"/)
  assert.match(html, /<label[^>]*for="t-name"[^>]*>Your name<\/label>/)
  assert.match(html, /<label[^>]*for="t-email"[^>]*>Your email<\/label>/)
  assert.match(html, /<label[^>]*for="t-message"[^>]*>Message<\/label>/)
  assert.equal(html.match(/ required=""/g)?.length, 3)
  assert.match(html, /maxLength="2000"|maxlength="2000"/i)
  assert.match(html, /0 \/ 2,000/)
  assert.ok(html.includes(CONTACT_NOTE))
  assert.equal(CONTACT_NOTE, 'Your message goes straight to Max. Your email is only used to reply.')
  assert.match(html, /<button type="submit"[^>]*disabled=""[^>]*>Send<\/button>/, 'Send is off until the fields are filled')
})

test('the honeypot "website": off-screen wrapper, aria-hidden, tabindex -1, autocomplete off', async () => {
  const html = await dialog()
  assert.match(html, /<div class="contact-trap" aria-hidden="true">/)
  assert.match(html, /<input type="text" tabindex="-1" autoComplete="off" name="website"/)
  assert.match(src('components/Contact.css'), /\.contact-trap \{[^}]*left: -10000px/)
})

test('sending, sent and failed states', async () => {
  const filled = { name: 'Ada', email: 'ada@example.org', message: 'Hi', website: '' }
  assert.match(await dialog({ form: filled, sending: true }), /disabled=""[^>]*>Sending…<\/button>/)
  const ok = await dialog({ form: filled, sent: true })
  assert.ok(ok.includes(CONTACT_SENT) && ok.includes('Close') && !ok.includes('<form'))
  const bad = await dialog({ form: filled, error: errorText(503) })
  assert.match(bad, /role="alert">Contact is temporarily unavailable\.<\/p>/)
  assert.ok(bad.includes('value="Ada"') && bad.includes('>Hi</textarea>'), 'the typed text is kept')
})

test('canSend, counter and the error texts', () => {
  assert.equal(canSend(emptyForm), false)
  assert.equal(canSend({ ...emptyForm, name: 'a', email: 'b', message: 'c' }), true)
  assert.equal(canSend({ ...emptyForm, name: 'a', email: 'b', message: 'c'.repeat(MESSAGE_MAX + 1) }), false)
  assert.equal(counterText(37), '37 / 2,000')
  assert.equal(errorText(503), 'Contact is temporarily unavailable.')
  assert.match(errorText(429), /Too many/)
  assert.match(errorText(400), /check/)
  assert.match(errorText(500), /could not be sent/)
})

test('sendContact posts the JSON to /api/contact and maps the answers', async () => {
  const calls: { url: string; init?: RequestInit }[] = []
  const answer = (status: number) => (async (url: RequestInfo | URL, init?: RequestInit) => (calls.push({ url: String(url), init }), new Response('{}', { status }))) as typeof fetch
  const form = { name: 'Ada', email: 'a@b.co', message: 'Hi', website: '' }
  assert.equal(await sendContact(form, answer(200)), null)
  assert.equal(calls[0].url, '/api/contact')
  assert.equal(calls[0].init?.method, 'POST')
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), form)
  assert.equal(await sendContact(form, answer(503)), 'Contact is temporarily unavailable.')
  assert.equal(await sendContact(form, answer(429)), errorText(429))
  assert.equal(await sendContact(form, (async () => { throw new Error('offline') }) as typeof fetch), errorText(0))
})

test('the header: Contact is a button right after Résumé in the left link group, same class as the links; the modal is closed at first', async () => {
  const { default: NavBar } = await loadModule<{ default: ComponentType }>('/src/components/NavBar.tsx')
  const html = renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, createElement(NavBar)))
  const links = html.slice(html.indexOf('class="nav-links"'), html.indexOf('class="nav-tools"'))
  assert.match(links, /Résumé<\/a><\/li><li><button[^>]*type="button"[^>]*class="nav-link nav-link-button"[^>]*aria-haspopup="dialog"[^>]*>Contact<\/button>/)
  assert.ok(!html.includes('role="dialog"'))
})

test('the modal handles focus, Esc, the backdrop and the focus trap (source checks)', () => {
  const s = src('components/ContactModal.tsx')
  assert.match(s, /e\.key === 'Escape'/)
  assert.match(s, /onMouseDown=\{\(e\) => e\.target === e\.currentTarget && p\.onClose\(\)\}/)
  assert.match(s, /trapTab\(/)
  assert.match(s, /back\?\.focus\(\)/)
  assert.match(s, /createPortal\(/)
})
