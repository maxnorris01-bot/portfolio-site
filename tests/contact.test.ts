import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BODY_MAX_BYTES, MESSAGE_MAX, PER_VISITOR_DAY, PER_VISITOR_HOUR, SITEWIDE_DAY, buildMail, check, handle, newLimiter, stripControl, take, visitorId, type Deps, type Mail } from '../api/contact.ts'

const OWNER = 'owner@example.test'
const PASS = 'app-password-value'

function setup(over: Partial<Deps> = {}) {
  const sent: Mail[] = []
  let time = 1_700_000_000_000
  const deps: Deps = {
    env: { CONTACT_GMAIL_USER: OWNER, CONTACT_GMAIL_APP_PASSWORD: PASS },
    now: () => time,
    limiter: newLimiter(),
    salt: 'test-salt',
    sendMail: async (mail) => void sent.push(mail),
    ...over,
  }
  return { deps, sent, advance: (ms: number) => (time += ms) }
}

const good = { name: 'Ada', email: 'ada@example.org', message: 'Hello there', website: '' }
const post = (body: unknown, ip = '203.0.113.7') =>
  new Request('http://localhost/api/contact', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `${ip}, 10.0.0.1` }, body: typeof body === 'string' ? body : JSON.stringify(body) })
const run = async (deps: Deps, body: unknown, ip?: string) => {
  const res = await handle(post(body, ip), deps)
  return { status: res.status, json: (await res.json()) as { ok: boolean; error?: string }, res }
}

test('a good message is sent: from the owner as "Portfolio contact", to the owner, Reply-To the visitor, plain text', async () => {
  const { deps, sent } = setup()
  const { status, json } = await run(deps, good)
  assert.equal(status, 200)
  assert.deepEqual(json, { ok: true })
  assert.equal(sent.length, 1)
  assert.equal(sent[0].from, `"Portfolio contact" <${OWNER}>`)
  assert.equal(sent[0].to, OWNER)
  assert.equal(sent[0].replyTo, 'ada@example.org')
  assert.equal(sent[0].subject, 'Portfolio message from Ada')
  assert.equal(sent[0].text, 'Name: Ada\nEmail: ada@example.org\n\nHello there\n')
})

test('validation: types, lengths, email format, empty fields, bad JSON, oversize body', async () => {
  const bad: [string, unknown, string][] = [
    ['not JSON', 'nope{', 'invalid_body'],
    ['an array', [], 'invalid_body'],
    ['null', 'null', 'invalid_body'],
    ['name not a string', { ...good, name: 5 }, 'invalid_body'],
    ['message missing', { name: 'a', email: 'a@b.co' }, 'invalid_body'],
    ['website not a string', { ...good, website: 1 }, 'invalid_body'],
    ['empty name', { ...good, name: '   ' }, 'invalid_name'],
    ['long name', { ...good, name: 'x'.repeat(101) }, 'invalid_name'],
    ['no at sign', { ...good, email: 'ada.example.org' }, 'invalid_email'],
    ['no dot', { ...good, email: 'ada@example' }, 'invalid_email'],
    ['space in email', { ...good, email: 'a da@example.org' }, 'invalid_email'],
    ['two addresses', { ...good, email: 'a@b.co,c@d.co' }, 'invalid_email'],
    ['long email', { ...good, email: `${'a'.repeat(200)}@example.org` }, 'invalid_email'],
    ['empty message', { ...good, message: ' \n ' }, 'invalid_message'],
    ['long message', { ...good, message: 'm'.repeat(MESSAGE_MAX + 1) }, 'invalid_message'],
    ['body too big', JSON.stringify({ ...good, message: 'm'.repeat(BODY_MAX_BYTES) }), 'invalid_body'],
  ]
  for (const [label, body, error] of bad) {
    const { deps, sent } = setup()
    const out = await run(deps, body)
    assert.equal(out.status, 400, label)
    assert.deepEqual(out.json, { ok: false, error }, label)
    assert.equal(sent.length, 0, label)
  }
  const edge = setup()
  assert.equal((await run(edge.deps, { ...good, name: 'x'.repeat(100), message: 'm'.repeat(MESSAGE_MAX) })).status, 200)
})

test('control characters are stripped; the message keeps its line breaks', () => {
  assert.equal(stripControl('a\u0000b\u0007c\u001bd\u007fe'), 'abcde')
  assert.equal(stripControl('a\r\nb\tc'), 'abc')
  assert.equal(stripControl('a\r\nb\tc', true), 'a\r\nb\tc')
  const out = check({ ...good, message: 'one\u0000\ntwo' })
  assert.ok(out.ok && out.fields.message === 'one\ntwo')
})

test('a header-injection attempt in the name or email cannot add a header or a second recipient', async () => {
  const { deps, sent } = setup()
  const out = await run(deps, { ...good, name: 'Eve\r\nBcc: victim@example.net\r\nSubject: spam' })
  assert.equal(out.status, 200)
  assert.equal(sent.length, 1)
  assert.ok(!/[\r\n]/.test(sent[0].subject), 'no line break in the subject')
  assert.equal(sent[0].subject, 'Portfolio message from EveBcc: victim@example.netSubject: spam')
  assert.ok(!/[\r\n]/.test(sent[0].from + sent[0].to + sent[0].replyTo))
  const mail = buildMail({ name: 'n', email: 'a@b.co', message: 'm' }, OWNER)
  assert.equal(mail.to, OWNER)
  const email = setup()
  const smuggled = await run(email.deps, { ...good, email: 'a@b.co\r\nBcc: v@x.co' })
  assert.deepEqual(smuggled.json, { ok: false, error: 'invalid_email' }, 'a second address smuggled into the email is refused')
  assert.equal(email.sent.length, 0)
})

test('the honeypot: a filled "website" gets 200 {ok:true} and nothing is sent or counted', async () => {
  const { deps, sent } = setup()
  for (let i = 0; i < 10; i++) {
    const out = await run(deps, { ...good, website: 'http://spam.example' })
    assert.equal(out.status, 200)
    assert.deepEqual(out.json, { ok: true })
  }
  assert.equal(sent.length, 0)
  assert.equal(deps.limiter.sitewide.length, 0)
  assert.equal((await run(deps, good)).status, 200, 'a real message still goes')
})

test('rate limits: 3 an hour and 5 a day per visitor, 30 a day sitewide, with Retry-After; each visitor counted apart', async () => {
  const { deps, sent, advance } = setup()
  for (let i = 0; i < PER_VISITOR_HOUR; i++) assert.equal((await run(deps, good)).status, 200)
  const blocked = await run(deps, good)
  assert.equal(blocked.status, 429)
  assert.deepEqual(blocked.json, { ok: false, error: 'rate_limited' })
  assert.ok(Number(blocked.res.headers.get('retry-after')) > 0)
  assert.equal(sent.length, 3)
  assert.equal((await run(deps, good, '198.51.100.9')).status, 200, 'another visitor is not blocked')

  advance(3_600_000 + 1000)
  assert.equal((await run(deps, good)).status, 200, 'the hour passed: 4th of the day')
  assert.equal((await run(deps, good)).status, 200, '5th of the day')
  const day = await run(deps, good)
  assert.equal(day.status, 429, `a 6th in the day is refused (limit ${PER_VISITOR_DAY})`)
  assert.ok(Number(day.res.headers.get('retry-after')) > 3000, 'told to wait much longer than an hour')
  advance(24 * 3_600_000)
  assert.equal((await run(deps, good)).status, 200, 'a day later')
})

test('the sitewide cap of 30 a day stops everyone; a refused message is not counted', async () => {
  const { deps, sent, advance } = setup()
  for (let i = 0; i < SITEWIDE_DAY; i++) {
    assert.equal((await run(deps, good, `192.0.2.${i}`)).status, 200)
  }
  assert.equal((await run(deps, good, '192.0.2.200')).status, 429)
  assert.equal(sent.length, SITEWIDE_DAY)
  assert.equal(deps.limiter.sitewide.length, SITEWIDE_DAY)
  advance(24 * 3_600_000 + 1)
  assert.equal((await run(deps, good, '192.0.2.200')).status, 200)
})

test('visitors are hashed with the salt: the address is not in the key, and a salt change changes the key', () => {
  const req = post(good, '203.0.113.7')
  const a = visitorId(req, 'one')
  assert.ok(!a.includes('203.0.113.7'))
  assert.match(a, /^[0-9a-f]{32}$/)
  assert.notEqual(a, visitorId(req, 'two'))
  assert.equal(a, visitorId(post(good, '203.0.113.7'), 'one'))
  const limiter = newLimiter()
  take(limiter, a, 1)
  assert.deepEqual([...limiter.visitors.keys()], [a])
  assert.ok(![...limiter.visitors.keys()].some((k) => k.includes('203.0.113.7')))
})

test('missing env vars: 503 {ok:false,error:"unavailable"} and nothing sent, with no address, variable name or stack in the response', async () => {
  for (const env of [{}, { CONTACT_GMAIL_USER: OWNER }, { CONTACT_GMAIL_APP_PASSWORD: PASS }, { CONTACT_GMAIL_USER: '', CONTACT_GMAIL_APP_PASSWORD: '' }]) {
    const { deps, sent } = setup({ env })
    const { status, res } = await run(deps, good)
    assert.equal(status, 503)
    const text = await handle(post(good), deps).then((r) => r.text())
    assert.equal(text, '{"ok":false,"error":"unavailable"}')
    assert.ok(!text.includes(OWNER) && !text.includes('CONTACT_') && !text.includes(' at '))
    assert.equal(sent.length, 0)
    assert.equal(res.headers.get('content-type'), 'application/json')
  }
})

test('a failing transport: 500 {ok:false,error:"send_failed"}; the error text (and the address in it) never reaches the response', async () => {
  const { deps } = setup({
    sendMail: async () => {
      throw new Error(`535 auth failed for ${OWNER} with ${PASS}`)
    },
  })
  const log = console.error
  const logged: unknown[][] = []
  console.error = (...a: unknown[]) => void logged.push(a)
  try {
    const res = await handle(post(good), deps)
    const text = await res.text()
    assert.equal(res.status, 500)
    assert.equal(text, '{"ok":false,"error":"send_failed"}')
  } finally {
    console.error = log
  }
  assert.deepEqual(logged, [['contact: send_failed']], 'only a short code is logged')
})
