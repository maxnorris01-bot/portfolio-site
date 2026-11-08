// POST /api/contact
//
// Emails a visitor's message to the site owner over Gmail SMTP, so the owner's
// address never reaches the browser. JSON body: {name, email, message, website}
// (`website` is a honeypot real visitors never fill).
//
// Limits (best effort): 3 messages per visitor per hour, 5 per visitor per day,
// 30 sitewide per day. They live in this function instance's memory, so they
// reset on a cold start and are not shared between instances. A visitor is the
// first x-forwarded-for address, hashed with a per-instance random salt; raw
// addresses and message text are never stored or logged.
//
// Env: CONTACT_GMAIL_USER (the owner's Gmail address, also the recipient) and
// CONTACT_GMAIL_APP_PASSWORD (a Gmail app password). Missing: 503 "unavailable".
// Nothing in a response or a log carries the address, a variable name or a stack.
//
// Self-contained apart from nodemailer, so it runs on Vercel, under the Vite dev
// middleware and under `node --test`.

import { createHash, randomBytes } from 'node:crypto'
import nodemailer from 'nodemailer'

export const NAME_MAX = 100
export const EMAIL_MAX = 200
export const MESSAGE_MAX = 2000
export const BODY_MAX_BYTES = 10_000

export const PER_VISITOR_HOUR = 3
export const PER_VISITOR_DAY = 5
export const SITEWIDE_DAY = 30

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
/** The per-visitor table is trimmed past this many visitors, oldest first. */
const MAX_VISITORS = 5000

export type ContactError = 'invalid_body' | 'invalid_name' | 'invalid_email' | 'invalid_message' | 'rate_limited' | 'unavailable' | 'send_failed'

export type Mail = { from: string; to: string; replyTo: string; subject: string; text: string }

export type Limiter = { visitors: Map<string, number[]>; sitewide: number[] }

export const newLimiter = (): Limiter => ({ visitors: new Map(), sitewide: [] })

export type Deps = {
  env: Record<string, string | undefined>
  now: () => number
  limiter: Limiter
  salt: string
  sendMail: (mail: Mail, auth: { user: string; pass: string }) => Promise<void>
}

export type Fields = { name: string; email: string; message: string }

/** Control characters out. Newlines and tabs survive only where `keepLines` says (the message). */
export function stripControl(value: string, keepLines = false): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(keepLines ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, '')
}

const EMAIL_RE = /^[^\s@<>(),;:"[\]\\]+@[^\s@<>(),;:"[\]\\]+\.[^\s@<>(),;:"[\]\\]{2,}$/

export type Checked = { ok: true; honeypot: boolean; fields: Fields } | { ok: false; error: ContactError }

/** Types, lengths and format of a parsed body. A filled honeypot comes back as `honeypot: true` before any field is judged. */
export function check(body: unknown): Checked {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false, error: 'invalid_body' }
  const b = body as Record<string, unknown>
  if (b.website !== undefined && typeof b.website !== 'string') return { ok: false, error: 'invalid_body' }
  if (typeof b.website === 'string' && b.website.trim() !== '') return { ok: true, honeypot: true, fields: { name: '', email: '', message: '' } }
  if (typeof b.name !== 'string' || typeof b.email !== 'string' || typeof b.message !== 'string') return { ok: false, error: 'invalid_body' }
  const name = stripControl(b.name).trim()
  const email = stripControl(b.email).trim()
  const message = stripControl(b.message, true).trim()
  if (name.length < 1 || name.length > NAME_MAX) return { ok: false, error: 'invalid_name' }
  if (email.length > EMAIL_MAX || !EMAIL_RE.test(email)) return { ok: false, error: 'invalid_email' }
  if (message.length < 1 || message.length > MESSAGE_MAX) return { ok: false, error: 'invalid_message' }
  return { ok: true, honeypot: false, fields: { name, email, message } }
}

/** A visitor's id: the first x-forwarded-for address, salted and hashed (never kept raw). */
export function visitorId(request: Request, salt: string): string {
  const first = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  return createHash('sha256').update(`${salt}:${first}`).digest('hex').slice(0, 32)
}

/** Counts the message against the three limits and returns null, or returns the seconds to wait. Nothing is counted when a limit is hit. */
export function take(limiter: Limiter, visitor: string, now: number): number | null {
  limiter.sitewide = limiter.sitewide.filter((t) => now - t < DAY_MS)
  const mine = (limiter.visitors.get(visitor) ?? []).filter((t) => now - t < DAY_MS)
  const lastHour = mine.filter((t) => now - t < HOUR_MS)
  const wait = (times: number[], window: number, limit: number) => Math.max(1, Math.ceil((times[times.length - limit] + window - now) / 1000))
  if (lastHour.length >= PER_VISITOR_HOUR) return wait(lastHour, HOUR_MS, PER_VISITOR_HOUR)
  if (mine.length >= PER_VISITOR_DAY) return wait(mine, DAY_MS, PER_VISITOR_DAY)
  if (limiter.sitewide.length >= SITEWIDE_DAY) return wait(limiter.sitewide, DAY_MS, SITEWIDE_DAY)
  mine.push(now)
  limiter.sitewide.push(now)
  limiter.visitors.delete(visitor)
  limiter.visitors.set(visitor, mine)
  for (const key of limiter.visitors.keys()) {
    if (limiter.visitors.size <= MAX_VISITORS) break
    limiter.visitors.delete(key)
  }
  return null
}

export function buildMail(fields: Fields, owner: string): Mail {
  return {
    from: `"Portfolio contact" <${owner}>`,
    to: owner,
    replyTo: fields.email,
    subject: `Portfolio message from ${fields.name}`,
    text: `Name: ${fields.name}\nEmail: ${fields.email}\n\n${fields.message}\n`,
  }
}

const reply = (status: number, body: { ok: true } | { ok: false; error: ContactError }, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } })

const fail = (status: number, error: ContactError, headers?: Record<string, string>) => reply(status, { ok: false, error }, headers)

async function sendWithGmail(mail: Mail, auth: { user: string; pass: string }): Promise<void> {
  const transport = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth })
  await transport.sendMail(mail)
}

const defaults: Deps = {
  env: process.env,
  now: () => Date.now(),
  limiter: newLimiter(),
  salt: randomBytes(16).toString('hex'),
  sendMail: sendWithGmail,
}

export async function handle(request: Request, deps: Deps): Promise<Response> {
  const text = await request.text().catch(() => '')
  if (text.length > BODY_MAX_BYTES) return fail(400, 'invalid_body')
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return fail(400, 'invalid_body')
  }
  const checked = check(body)
  if (!checked.ok) return fail(400, checked.error)
  if (checked.honeypot) return reply(200, { ok: true })

  const user = deps.env.CONTACT_GMAIL_USER
  const pass = deps.env.CONTACT_GMAIL_APP_PASSWORD
  if (!user || !pass) {
    console.error('contact: unavailable')
    return fail(503, 'unavailable')
  }
  const wait = take(deps.limiter, visitorId(request, deps.salt), deps.now())
  if (wait !== null) return fail(429, 'rate_limited', { 'Retry-After': String(wait) })
  try {
    await deps.sendMail(buildMail(checked.fields, user), { user, pass })
  } catch {
    console.error('contact: send_failed')
    return fail(500, 'send_failed')
  }
  return reply(200, { ok: true })
}

export async function POST(request: Request): Promise<Response> {
  return handle(request, defaults)
}
