import { useEffect, useState } from 'react'
import type { SatelliteSummary } from '../../api/satellite/summary'

// One URL per snapshot for every caller, so the browser and Vercel's CDN
// cache one response each.
const summaryUrl = (date: string | null) =>
  `/api/satellite/summary?limit=10${date ? `&date=${date}` : ''}`

export type SummaryState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; summary: SatelliteSummary }

/**
 * The summary for the latest run, or for a retained snapshot's `date`
 * (YYYY-MM-DD). With `enabled: false` nothing is fetched.
 */
export function useSatelliteSummary({
  date = null,
  enabled = true,
}: { date?: string | null; enabled?: boolean } = {}) {
  const [state, setState] = useState<SummaryState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [prevKey, setPrevKey] = useState(date)

  // A different snapshot starts from a loading state, not the previous data.
  if (prevKey !== date) {
    setPrevKey(date)
    setState({ status: 'loading' })
  }

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    fetch(summaryUrl(date), { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<SatelliteSummary>
      })
      .then((summary) => setState({ status: 'ready', summary }))
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          console.error('Failed to load satellite summary', err)
          setState({ status: 'error' })
        }
      })
    return () => controller.abort()
  }, [attempt, date, enabled])

  const retry = () => {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }

  return { state, retry }
}
