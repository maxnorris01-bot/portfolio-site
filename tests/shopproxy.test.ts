import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const raw = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')
const config = JSON.parse(raw)

type Route = {
  src: string
  dest: string
  transforms?: { type: string; op: string; target: { key: string }; args: string; env: string[] }[]
}
const shopRoute = (config.routes as Route[]).find((r) => r.src === '/api/shop/(.*)')

test('vercel.json parses and keeps the single-page-app rewrite that excludes /api/', () => {
  assert.equal(config.rewrites.length, 1)
  const [rewrite] = config.rewrites
  assert.equal(rewrite.destination, '/index.html')
  const re = new RegExp(`^${rewrite.source}$`)
  assert.ok(re.test('/satellite-conjunction-screening'))
  assert.ok(re.test('/resume'))
  assert.ok(!re.test('/api/satellite/summary'))
  assert.ok(!re.test('/api/shop/auth/session'))
})

test('/api/shop/* is forwarded to the Shop Mode API on Fly over https, with the rest of the path appended', () => {
  assert.ok(shopRoute, 'shop route missing')
  assert.equal(shopRoute.dest, 'https://room-redesign-shop.fly.dev/api/shop/$1')
  assert.equal(new URL(shopRoute.dest.replace('$1', 'x')).protocol, 'https:')
})

test('the route sets x-origin-secret from SHOP_ORIGIN_SECRET, listed in env', () => {
  assert.ok(shopRoute)
  const [t, ...rest] = shopRoute.transforms ?? []
  assert.equal(rest.length, 0)
  assert.equal(t.type, 'request.headers')
  assert.equal(t.op, 'set') // set replaces a visitor-supplied value
  assert.equal(t.target.key, 'x-origin-secret')
  assert.equal(t.args, '$SHOP_ORIGIN_SECRET')
  assert.deepEqual(t.env, ['SHOP_ORIGIN_SECRET'])
})

test('no secret-looking literal appears in vercel.json', () => {
  assert.doesNotMatch(raw, /[0-9a-fA-F]{32,}/)
  // Any long unbroken token (base64, hex, keys) other than the known URL and names.
  const allowed = new Set(['SHOP_ORIGIN_SECRET', 'x-vercel-enable-rewrite-caching', 'room-redesign-shop.fly.dev', 'satellite-conjunction-screening'])
  for (const token of raw.match(/[A-Za-z0-9+/=_-]{32,}/g) ?? []) {
    assert.ok(allowed.has(token), `suspicious literal: ${token.slice(0, 6)}…`)
  }
  assert.doesNotMatch(raw, /sk-|ghp_|AKIA|Bearer /)
})

test('Vercel never caches /api/shop responses', () => {
  const entry = (config.headers as { source: string; headers: { key: string; value: string }[] }[]).find(
    (h) => h.source === '/api/shop/:path*',
  )
  assert.ok(entry, 'headers entry missing')
  assert.deepEqual(entry.headers, [{ key: 'x-vercel-enable-rewrite-caching', value: '0' }])
})
