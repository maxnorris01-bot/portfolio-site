import type { DatasetKey } from './types.ts'

export const HOUR_MS = 3_600_000
export const DAY_MS = 24 * HOUR_MS
export const BACK_DAYS = 7

const startOfUtcDay = (date: string) => Date.parse(`${date}T00:00:00Z`)
const utcDate = (ms: number) => new Date(ms).toISOString().slice(0, 10)

// Which snapshot to propagate for a displayed time. Anything from the current
// run's window start onward (including the ~24 h forward range) uses today's
// current.json. Earlier times use that day's retained snapshot, or the nearest
// earlier one if a day is missing, so the past is drawn from that day's own
// elements rather than today's propagated backward. `historyDates` comes from
// history/index.json, newest first or in any order.
export function datasetFor(
  tMs: number,
  currentStartMs: number,
  historyDates: string[],
): DatasetKey {
  if (tMs >= currentStartMs || historyDates.length === 0) return 'current'
  const day = utcDate(tMs)
  if (day === utcDate(currentStartMs)) return 'current'
  const sorted = [...historyDates].sort()
  let pick = sorted[0]
  for (const d of sorted) if (d <= day) pick = d
  return pick === utcDate(currentStartMs) ? 'current' : pick
}

// The slider's range: about a day forward of now, and back to the oldest
// retained snapshot (at most BACK_DAYS). With no history yet, the backward
// range stops where the current snapshot's own window starts.
export function sliderBounds(nowMs: number, currentStartMs: number, historyDates: string[]) {
  const maxMs = nowMs + DAY_MS
  if (historyDates.length === 0) return { minMs: Math.min(currentStartMs, nowMs), maxMs }
  const oldest = startOfUtcDay([...historyDates].sort()[0])
  return { minMs: Math.min(Math.max(oldest, nowMs - BACK_DAYS * DAY_MS), currentStartMs), maxMs }
}
