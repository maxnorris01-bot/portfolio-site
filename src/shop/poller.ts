import { ShopError, isAbort, type ShopClient } from './api.ts'
import type { JobStatus, SessionView } from './types.ts'

/** Polls are never closer together than this. */
export const POLL_INTERVAL_MS = 1000
/** After this long the page says it is taking a while; after GIVE_UP it stops with an error. */
export const SLOW_AFTER_MS = 60_000
export const GIVE_UP_AFTER_MS = 90_000

export type PollHandlers = {
  onProgress: (job: JobStatus) => void
  onDone: (result: SessionView) => void
  onError: (error: ShopError) => void
  onSlow: () => void
}

/** Polls one job at a time. Starting another job, or stop(), ends the one before. */
export class JobPoller {
  private client: Pick<ShopClient, 'pollJob'>
  private timer: ReturnType<typeof setTimeout> | null = null
  private controller: AbortController | null = null
  private run = 0

  constructor(client: Pick<ShopClient, 'pollJob'>) {
    this.client = client
  }

  start(jobId: string, sessionId: string | null, h: PollHandlers) {
    this.stop()
    const run = this.run
    const began = Date.now()
    let slow = false
    const controller = new AbortController()
    this.controller = controller

    const tick = async () => {
      this.timer = null
      try {
        const job = await this.client.pollJob(jobId, sessionId, controller.signal)
        if (run !== this.run) return
        if (job.state === 'done') {
          this.stop()
          return h.onDone(job.result)
        }
        if (job.state === 'error') {
          this.stop()
          return h.onError(new ShopError('server_error', job.error || 'The search failed. Please try again.', job.status ?? 500))
        }
        h.onProgress(job)
      } catch (e) {
        if (run !== this.run || isAbort(e)) return
        this.stop()
        return h.onError(e instanceof ShopError ? e : new ShopError('network', 'Lost contact with ShopAI. Please try again.'))
      }
      const waited = Date.now() - began
      if (waited >= GIVE_UP_AFTER_MS) {
        this.stop()
        return h.onError(new ShopError('timeout', 'This is taking much longer than usual. Please try again.'))
      }
      if (!slow && waited >= SLOW_AFTER_MS) {
        slow = true
        h.onSlow()
      }
      this.timer = setTimeout(() => void tick(), POLL_INTERVAL_MS)
    }
    void tick()
  }

  stop() {
    this.run += 1
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    this.controller?.abort()
    this.controller = null
  }
}
