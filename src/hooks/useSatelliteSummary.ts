import { useEffect, useState } from 'react'
import type { SatelliteSummary } from '../../api/satellite/summary'

// One URL for every caller, so the browser and Vercel's CDN cache one response.
const SUMMARY_URL = '/api/satellite/summary?limit=10'

export type SummaryState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; summary: SatelliteSummary }

export function useSatelliteSummary() {
  const [state, setState] = useState<SummaryState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetch(SUMMARY_URL, { signal: controller.signal })
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
  }, [attempt])

  const retry = () => {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }

  return { state, retry }
}
