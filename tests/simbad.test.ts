import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { SIMBAD_CREDIT } from '../src/globe/imagery.ts'
import { OTYPE_GLOSS, SimbadClient, isSourceId, parseSimbad, simbadQuery, simbadUrl, type SimbadState } from '../src/globe/simbad.ts'

const fixture = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8')
const found = JSON.parse(fixture('simbad-found.json'))
const none = JSON.parse(fixture('simbad-none.json'))
const proxima = JSON.parse(fixture('simbad-proxima.json'))

test('the query joins identifiers to basic and asks for one Gaia DR3 source, only for a plain numeric ID', () => {
  const q = simbadQuery('3010113299530081664')
  assert.match(q, /FROM ident JOIN basic ON basic\.oid = ident\.oidref/)
  assert.match(q, /WHERE ident\.id = 'Gaia DR3 3010113299530081664'$/)
  assert.doesNotMatch(q, /allfluxes/)
  const u = new URL(simbadUrl('3010113299530081664'))
  assert.equal(u.origin + u.pathname, 'https://simbad.cds.unistra.fr/simbad/sim-tap/sync')
  assert.equal(u.searchParams.get('format'), 'json')
  assert.equal(u.searchParams.get('lang'), 'adql')
  for (const bad of ["1' OR '1'='1", '12', 'abc', '', '1'.repeat(30)]) {
    assert.equal(isSourceId(bad), false, bad)
    assert.throws(() => simbadQuery(bad))
  }
})

test('a recorded reply parses: tidy name, type with a gloss, spectral type, parallax', () => {
  const r = parseSimbad(found)!
  assert.equal(r.name, 'HD 37306') // SIMBAD pads it as "HD  37306"
  assert.equal(r.otype, '*')
  assert.equal(r.otypeGloss, 'star')
  assert.equal(r.spType, 'A1V')
  assert.ok(Math.abs(r.plxMas! - 14.3768) < 1e-6)
  assert.ok(Math.abs(r.plxErrMas! - 0.0378) < 1e-3)
  const p = parseSimbad(proxima)!
  assert.equal(p.name, 'Proxima Centauri') // the NAME prefix is dropped
  assert.equal(p.otype, 'PM*')
  assert.equal(p.otypeGloss, 'high proper motion star')
  assert.equal(p.spType, 'M5.5Ve')
})

test('an identifier SIMBAD does not have is null; a reply that is not a table is an error', () => {
  assert.equal(parseSimbad(none), null)
  assert.throws(() => parseSimbad({ metadata: [] }), /SIMBAD table/)
  assert.throws(() => parseSimbad(null), /SIMBAD table/)
  assert.throws(() => parseSimbad({ metadata: [{ name: 'main_id' }], data: [[null]] }), /name/)
  // A row with no spectral type or parallax.
  const bare = parseSimbad({ metadata: [{ name: 'main_id' }, { name: 'otype' }, { name: 'sp_type' }, { name: 'plx_value' }, { name: 'plx_err' }], data: [['* 1 Foo', 'V*', null, null, null]] })!
  assert.equal(bare.spType, null)
  assert.equal(bare.plxMas, null)
  assert.equal(bare.otypeGloss, 'variable star')
  assert.equal(parseSimbad({ metadata: [{ name: 'main_id' }, { name: 'otype' }], data: [['X 1', 'Zz?']] })!.otypeGloss, null)
  assert.ok(Object.keys(OTYPE_GLOSS).length > 20)
  assert.match(SIMBAD_CREDIT, /SIMBAD database, CDS, Strasbourg/)
})

// ---- the client, with a fake clock and fetch ----

function rig(opts: { online?: () => boolean; reply?: (url: string) => Promise<Response> } = {}) {
  let now = 1_000_000
  const timers: { at: number; fn: () => void; id: number }[] = []
  let nextId = 1
  const urls: string[] = []
  const aborted: boolean[] = []
  const states: [string, SimbadState][] = []
  const fakeFetch = ((url: string, init?: { signal?: AbortSignal }) => {
    urls.push(url)
    const k = aborted.push(false) - 1
    init?.signal?.addEventListener('abort', () => (aborted[k] = true))
    return (
      opts.reply?.(url) ??
      Promise.resolve(new Response(JSON.stringify(found), { status: 200, headers: { 'content-type': 'application/json' } }))
    )
  }) as unknown as typeof fetch
  const client = new SimbadClient((id, s) => states.push([id, s]), {
    fetch: fakeFetch,
    now: () => now,
    online: opts.online,
    setTimeout: (fn, ms) => {
      const id = nextId++
      timers.push({ at: now + ms, fn, id })
      return id
    },
    clearTimeout: (h) => {
      const i = timers.findIndex((t) => t.id === h)
      if (i >= 0) timers.splice(i, 1)
    },
  })
  const advance = async (ms: number) => {
    const end = now + ms
    for (;;) {
      timers.sort((a, b) => a.at - b.at)
      const t = timers[0]
      if (!t || t.at > end) break
      timers.shift()
      now = t.at
      t.fn()
      await new Promise((r) => setTimeout(r, 0))
    }
    now = end
    await new Promise((r) => setTimeout(r, 0))
  }
  return { client, advance, urls, states, aborted, last: () => states[states.length - 1] }
}

const ID_A = '3010113299530081664'
const ID_B = '5853498713190525696'

test('a selection waits out the debounce, then asks once, and the answer arrives', async () => {
  const r = rig()
  r.client.lookup(ID_A)
  assert.equal(r.last()[1].kind, 'loading')
  await r.advance(300)
  assert.equal(r.urls.length, 0) // still debouncing
  await r.advance(200)
  assert.equal(r.urls.length, 1)
  assert.equal(r.client.requests, 1)
  const [id, s] = r.last()
  assert.equal(id, ID_A)
  assert.equal(s.kind, 'found')
  assert.equal(s.kind === 'found' && s.result.name, 'HD 37306')
})

test('tapping through stars sends nothing for the ones skipped', async () => {
  const r = rig()
  r.client.lookup(ID_A)
  await r.advance(100)
  r.client.lookup(ID_B)
  await r.advance(100)
  r.client.lookup('1111111111111111')
  await r.advance(2000)
  assert.equal(r.urls.length, 1)
  assert.ok(r.urls[0].includes('1111111111111111'))
})

test('deselecting before the request starts, or while it is in flight, drops it', async () => {
  const r = rig({ reply: () => new Promise<Response>(() => {}) }) // never answers
  r.client.lookup(ID_A)
  r.client.cancel()
  await r.advance(2000)
  assert.equal(r.urls.length, 0)
  r.client.lookup(ID_A)
  await r.advance(500)
  assert.equal(r.urls.length, 1)
  r.client.cancel()
  assert.equal(r.aborted[0], true)
  await r.advance(20000)
  assert.ok(r.states.every(([, s]) => s.kind !== 'error')) // a cancelled lookup says nothing more
})

test('answers are cached for the session: the same star again asks nothing', async () => {
  const r = rig()
  r.client.lookup(ID_A)
  await r.advance(600)
  const n = r.urls.length
  r.client.lookup(ID_A)
  assert.equal(r.last()[1].kind, 'found') // at once
  await r.advance(5000)
  assert.equal(r.urls.length, n)
  // A not-found answer is cached too (no hammering SIMBAD for an unnamed star).
  const none404 = rig({ reply: () => Promise.resolve(new Response(JSON.stringify(none), { status: 200 })) })
  none404.client.lookup(ID_B)
  await none404.advance(600)
  assert.equal(none404.last()[1].kind, 'notfound')
  none404.client.lookup(ID_B)
  await none404.advance(5000)
  assert.equal(none404.urls.length, 1)
})

test('requests are at least a second apart, even for quick selections', async () => {
  const r = rig()
  r.client.lookup(ID_A)
  await r.advance(450)
  assert.equal(r.urls.length, 1)
  r.client.lookup(ID_B)
  await r.advance(450) // 450 ms after the first request ended its debounce: too soon
  assert.equal(r.urls.length, 1)
  await r.advance(700)
  assert.equal(r.urls.length, 2)
})

test('an error is shown, not cached, and tried again on the next selection; a non-JSON reply is an error', async () => {
  let fail = true
  const r = rig({
    reply: () => Promise.resolve(fail ? new Response(fixture('simbad-error.xml'), { status: 400 }) : new Response(JSON.stringify(found), { status: 200 })),
  })
  r.client.lookup(ID_A)
  await r.advance(600)
  assert.equal(r.last()[1].kind, 'error')
  fail = false
  r.client.lookup(ID_A)
  await r.advance(1600)
  assert.equal(r.last()[1].kind, 'found')
  assert.equal(r.urls.length, 2)
  const html = rig({ reply: () => Promise.resolve(new Response('<html>maintenance</html>', { status: 200 })) })
  html.client.lookup(ID_A)
  await html.advance(600)
  assert.equal(html.last()[1].kind, 'error')
})

test('offline sends no request and says so; a network failure while offline reads as offline', async () => {
  const off = rig({ online: () => false })
  off.client.lookup(ID_A)
  await off.advance(5000)
  assert.equal(off.urls.length, 0)
  assert.equal(off.last()[1].kind, 'offline')
  let online = true
  const drop = rig({ online: () => online, reply: () => { online = false; return Promise.reject(new TypeError('Failed to fetch')) } })
  drop.client.lookup(ID_A)
  await drop.advance(600)
  assert.equal(drop.last()[1].kind, 'offline')
})

test('a request that never answers times out as an error', async () => {
  const r = rig({ reply: () => new Promise<Response>(() => {}) })
  r.client.lookup(ID_A)
  await r.advance(600)
  assert.equal(r.urls.length, 1)
  await r.advance(9000)
  assert.equal(r.aborted[0], true)
})

test('an invalid source ID is never sent', async () => {
  const r = rig()
  r.client.lookup("1'; DROP TABLE basic; --")
  await r.advance(3000)
  assert.equal(r.urls.length, 0)
  assert.equal(r.last()[1].kind, 'error')
})
