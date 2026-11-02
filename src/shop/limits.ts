import type { ShopErrorCode, UsageInfo } from './types.ts'

/** What failed, in the terms the page shows banners by. */
export type LimitInfo = {
  message: string
  retryAfterS: number | null
  resetsAt: string | null
  code: ShopErrorCode | null
  limit: string | null
}

/** "5:00 PM" in the visitor's time zone (`timeZone` is for tests), or null. */
export function localTime(iso: string | null | undefined, timeZone?: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone })
}

/** The friendly sentence for a refused request, by limit type; the server's own message is the fallback. */
export function limitText(info: LimitInfo, timeZone?: string): string {
  const reset = localTime(info.resetsAt, timeZone)
  const resets = reset ? ` It resets at ${reset}.` : ''
  if (info.code === 'maintenance') return 'ShopAI is paused right now. Please try again later.'
  if (info.code === 'cap_reached') {
    switch (info.limit) {
      case 'searches':
        return 'You have used all of your searches for this visit.'
      case 'shop_agains':
        return 'You have used all of your Shop Agains for this visit.'
      case 'session':
        return 'You have reached the limit for this visit.'
      case 'ip_day':
        return `You have reached your limit for today.${resets}`
      case 'global_day':
        return `The site has reached its limit for today.${resets}`
    }
  }
  return info.message
}

/** Which buttons a refused request turns off until the page is reloaded. */
export type Blocked = { search: boolean; again: boolean }
export const noBlocks: Blocked = { search: false, again: false }

export function limitBlocks(info: Pick<LimitInfo, 'code' | 'limit'>): Blocked {
  if (info.code === 'maintenance') return { search: true, again: true }
  if (info.code !== 'cap_reached') return noBlocks
  switch (info.limit) {
    case 'searches':
      return { search: true, again: false }
    case 'shop_agains':
      return { search: false, again: true }
    case 'session':
    case 'ip_day':
    case 'global_day':
      return { search: true, again: true }
    default:
      return noBlocks
  }
}

export const isLimit = (info: Pick<LimitInfo, 'code'>) => info.code === 'cap_reached' || info.code === 'maintenance'

/**
 * "Searches used: 2 of 8 · Shop Agains: 1 of 25 · Daily limit resets at 5:00 PM".
 * Shop Agains used is the server's count. Searches used is the session's recorded searches minus its Shop Agains
 * (the contract gives search_count for both kinds together). No dollar amounts.
 */
export function usageLine(usage: UsageInfo | null, counts: { searchCount?: number; shopAgainsUsed?: number } | null, timeZone?: string): string | null {
  if (!usage) return null
  const again = counts?.shopAgainsUsed ?? 0
  const searches = Math.max(0, (counts?.searchCount ?? 0) - again)
  const parts = [`Searches used: ${searches} of ${usage.maxSearches}`, `Shop Agains: ${again} of ${usage.maxShopAgains}`]
  const reset = localTime(usage.resetsAt, timeZone)
  if (reset) parts.push(`Daily limit resets at ${reset}`)
  return parts.join(' · ')
}

/**
 * What the guardrails card shows when the service has not reported this visit's limits (a fresh visit has no session yet, and
 * GET /auth/session sends no usage block until it has one): the service's own defaults (room-redesign-agent, app/shop/thresholds.py:
 * 8 searches and 25 Shop Agains per session; the daily limit resets at the next UTC midnight, app/shop/caps.py). A deployment can
 * set other values, in which case the reported ones replace these as soon as there is a visit. No dollar amounts, ever.
 */
export const DEFAULT_MAX_SEARCHES = 8
export const DEFAULT_MAX_SHOP_AGAINS = 25
export function defaultUsage(now: Date = new Date()): UsageInfo {
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
  return { maxSearches: DEFAULT_MAX_SEARCHES, maxShopAgains: DEFAULT_MAX_SHOP_AGAINS, resetsAt: midnight.toISOString() }
}

/** The usage block of GET /auth/session, reduced to what the page shows; null when absent or not understood. */
export function usageFrom(auth: { authenticated: boolean; usage?: { session?: { max_searches?: number; max_shop_agains?: number }; resets_at?: string } }): UsageInfo | null {
  const s = auth.authenticated ? auth.usage?.session : undefined
  if (!s || typeof s.max_searches !== 'number' || typeof s.max_shop_agains !== 'number') return null
  return { maxSearches: s.max_searches, maxShopAgains: s.max_shop_agains, resetsAt: auth.usage?.resets_at ?? null }
}
