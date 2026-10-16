// A lookup of one Gaia star in SIMBAD (CDS), for its name, type and spectral
// type, which the tile data doesn't carry. Pure apart from the injected fetch
// and timers, so it is tested with recorded responses.
//
// One request per selection at most: a new selection waits a moment (a
// debounce, so tapping through stars sends nothing for the ones skipped),
// cancels one in flight, and answers from a session cache; requests are also
// kept at least a second apart, and an offline browser sends none. SIMBAD
// publishes no rate limit (docs/research/2026-10-streamed-star-catalogue.md),
// so the client stays well under any plausible one. CORS is open (`*`).
//
// The query joins the identifier table to `basic` and nothing else (a join
// with all the fluxes timed out at 40 s in the research):
//   SELECT main_id, otype, sp_type, plx_value, plx_err FROM ident JOIN basic
//   ON oid = oidref WHERE id = 'Gaia DR3 <source id>'

export const SIMBAD_URL = 'https://simbad.cds.unistra.fr/simbad/sim-tap/sync'

export interface SimbadResult {
  /** SIMBAD's main identifier, tidied ("HD 37306"). */
  name: string
  /** Its object type code ("*", "SB*", "LP*"...), and a plain gloss when it is one we know. */
  otype: string
  otypeGloss: string | null
  /** MK spectral type, or null. */
  spType: string | null
  plxMas: number | null
  plxErrMas: number | null
}

export type SimbadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'found'; result: SimbadResult }
  | { kind: 'notfound' }
  | { kind: 'error' }
  | { kind: 'offline' }

/** A Gaia DR3 source ID is plain digits; anything else is not sent. */
export const isSourceId = (id: string) => /^\d{5,20}$/.test(id)

export function simbadQuery(sourceId: string): string {
  if (!isSourceId(sourceId)) throw new Error('not a Gaia source ID')
  return (
    'SELECT basic.main_id, basic.otype, basic.sp_type, basic.plx_value, basic.plx_err ' +
    'FROM ident JOIN basic ON basic.oid = ident.oidref ' +
    `WHERE ident.id = 'Gaia DR3 ${sourceId}'`
  )
}

export function simbadUrl(sourceId: string): string {
  const q = new URLSearchParams({ request: 'doQuery', lang: 'adql', format: 'json', query: simbadQuery(sourceId) })
  return `${SIMBAD_URL}?${q}`
}

/** Plain words for the object types a star lookup returns (SIMBAD's own codes are the fallback). */
export const OTYPE_GLOSS: Record<string, string> = {
  '*': 'star',
  '**': 'double star',
  'SB*': 'spectroscopic binary',
  'EB*': 'eclipsing binary',
  'El*': 'ellipsoidal variable',
  'V*': 'variable star',
  'Pu*': 'pulsating variable',
  'LP*': 'long-period variable',
  'Mi*': 'Mira variable',
  'dS*': 'delta Scuti variable',
  'RR*': 'RR Lyrae variable',
  'Ce*': 'Cepheid variable',
  'BY*': 'BY Draconis variable',
  'RS*': 'RS CVn variable',
  'Or*': 'variable in an orion nebula region',
  'TT*': 'T Tauri star',
  'Ae*': 'Herbig Ae/Be star',
  'Be*': 'Be star',
  'RG*': 'red giant',
  'AB*': 'asymptotic giant branch star',
  'HB*': 'horizontal branch star',
  'WD*': 'white dwarf',
  'PM*': 'high proper motion star',
  'C*': 'carbon star',
  'S*': 'S-type star',
  'bC*': 'beta Cephei variable',
  'Em*': 'emission-line star',
  'Pe*': 'peculiar star',
  'HS*': 'hot subdwarf',
  'Y*O': 'young stellar object',
  'pr*': 'pre-main-sequence star',
  'SN*': 'supernova',
  'Ro*': 'rotationally variable star',
  'a2*': 'alpha2 CVn variable',
  'sg*': 'evolved supergiant',
  's*r': 'red supergiant',
  'bL*': 'beta Lyrae-type eclipsing binary',
  'No*': 'nova',
  'Psr': 'pulsar',
  'Cl*': 'star cluster',
  'MoC': 'molecular cloud',
  'IR': 'infrared source',
  'X': 'X-ray source',
}

const tidy = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Read SIMBAD's JSON reply: the first row, or null when the identifier isn't there. Throws on anything that isn't a TAP table. */
export function parseSimbad(json: unknown): SimbadResult | null {
  const t = json as { metadata?: { name?: string }[]; data?: unknown[][] }
  if (!t || !Array.isArray(t.metadata) || !Array.isArray(t.data)) throw new Error('not a SIMBAD table')
  if (t.data.length === 0) return null
  const cols = t.metadata.map((m) => m.name)
  const row = t.data[0]
  const at = (n: string) => row[cols.indexOf(n)]
  const id = at('main_id')
  if (typeof id !== 'string' || !id.trim()) throw new Error('SIMBAD row without a name')
  const name = tidy(id.replace(/^NAME\s+/, ''))
  const otypeRaw = at('otype')
  const otype = typeof otypeRaw === 'string' ? otypeRaw.trim() : ''
  const sp = at('sp_type')
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  return {
    name,
    otype,
    otypeGloss: OTYPE_GLOSS[otype] ?? null,
    spType: typeof sp === 'string' && sp.trim() ? sp.trim() : null,
    plxMas: num(at('plx_value')),
    plxErrMas: num(at('plx_err')),
  }
}

export interface SimbadClientOptions {
  fetch?: typeof fetch
  setTimeout?: (fn: () => void, ms: number) => unknown
  clearTimeout?: (h: unknown) => void
  now?: () => number
  online?: () => boolean
  /** Wait after a selection before asking (default 400 ms). */
  debounceMs?: number
  /** Least gap between two requests (default 1000 ms). */
  minGapMs?: number
  /** Give up on one request (default 8000 ms). */
  timeoutMs?: number
  /** Answers kept for the session (default 200). */
  cacheSize?: number
}

/**
 * Looks up the selected star, at most once per selection. `lookup` is called
 * with each new selection; `onState` receives the state as it changes
 * (loading, found, not found, error, offline), at once from the cache when
 * the star has been seen.
 */
export class SimbadClient {
  requests = 0
  private readonly o: Required<SimbadClientOptions>
  private readonly cache = new Map<string, SimbadState>()
  private timer: unknown = null
  private ctl: AbortController | null = null
  private current: string | null = null
  private lastAt = -Infinity
  private readonly onState: (sourceId: string, s: SimbadState) => void

  constructor(onState: (sourceId: string, s: SimbadState) => void, options: SimbadClientOptions = {}) {
    this.onState = onState
    this.o = {
      fetch: options.fetch ?? ((...a) => fetch(...a)),
      setTimeout: options.setTimeout ?? ((fn, ms) => setTimeout(fn, ms)),
      clearTimeout: options.clearTimeout ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>)),
      now: options.now ?? (() => Date.now()),
      online: options.online ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false)),
      debounceMs: options.debounceMs ?? 400,
      minGapMs: options.minGapMs ?? 1000,
      timeoutMs: options.timeoutMs ?? 8000,
      cacheSize: options.cacheSize ?? 200,
    }
  }

  /** The state for a source ID (what the card shows), without asking. */
  stateOf(sourceId: string): SimbadState {
    return this.cache.get(sourceId) ?? (this.current === sourceId ? { kind: 'loading' } : { kind: 'idle' })
  }

  /** A star was selected: answer from the cache, or schedule one request (cancelling any earlier one). */
  lookup(sourceId: string): void {
    this.cancel()
    this.current = sourceId
    if (!isSourceId(sourceId)) return this.onState(sourceId, { kind: 'error' })
    const cached = this.cache.get(sourceId)
    // Found and not-found answers are kept; errors and offline are tried again on the next selection.
    if (cached && (cached.kind === 'found' || cached.kind === 'notfound')) return this.onState(sourceId, cached)
    if (!this.o.online()) return this.onState(sourceId, { kind: 'offline' })
    this.onState(sourceId, { kind: 'loading' })
    const wait = Math.max(this.o.debounceMs, this.lastAt + this.o.minGapMs - this.o.now())
    this.timer = this.o.setTimeout(() => void this.send(sourceId), wait)
  }

  /** The selection ended: no request starts, and one in flight is dropped. */
  cancel(): void {
    if (this.timer !== null) this.o.clearTimeout(this.timer)
    this.timer = null
    this.ctl?.abort()
    this.ctl = null
    this.current = null
  }

  private remember(id: string, s: SimbadState) {
    this.cache.delete(id)
    this.cache.set(id, s)
    while (this.cache.size > this.o.cacheSize) this.cache.delete(this.cache.keys().next().value as string)
  }

  private async send(id: string) {
    this.timer = null
    if (this.current !== id) return
    const ctl = new AbortController()
    this.ctl = ctl
    const timeout = this.o.setTimeout(() => ctl.abort(), this.o.timeoutMs)
    this.lastAt = this.o.now()
    this.requests++
    let state: SimbadState
    try {
      const res = await this.o.fetch(simbadUrl(id), { signal: ctl.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const result = parseSimbad(await res.json())
      state = result ? { kind: 'found', result } : { kind: 'notfound' }
    } catch {
      if (this.current !== id) return // cancelled: nothing to say
      state = { kind: this.o.online() ? 'error' : 'offline' }
    } finally {
      this.o.clearTimeout(timeout)
    }
    if (this.ctl === ctl) this.ctl = null
    if (this.current !== id) return
    this.remember(id, state)
    this.onState(id, state)
  }
}
