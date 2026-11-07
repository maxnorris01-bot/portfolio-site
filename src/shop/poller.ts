import { ShopError, isAbort, type ShopClient } from './api.ts'
import type { Clarify, JobStatus, SessionView } from './types.ts'

/** Polls are never closer together than this. */
export const POLL_INTERVAL_MS = 1000
/** After the job itself has finished, polls go on this many more times while the server still says it is checking pictures. */
export const PICTURE_TAIL_POLLS = 10
/** After this long the page says it is taking a while; after GIVE_UP it stops with an error. */
export const SLOW_AFTER_MS = 60_000
export const GIVE_UP_AFTER_MS = 90_000

export type PollHandlers = {
  onProgress: (job: JobStatus) => void
  onDone: (result: SessionView) => void
  onError: (error: ShopError) => void
  onSlow: () => void
  /** Stage Q2: every poll that carries a `clarify` object (a backend with the flag off never does). */
  onClarify?: (clarify: Clarify) => void
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

    // Once the job is done or failed, polling continues only while pictures are still being checked, so the last `clarify` is not stale.
    let tail = 0
    const pending = (c: Clarify | undefined) => c !== undefined && c.state === 'ready' && c.pictures_state === 'pending'

    const tick = async () => {
      this.timer = null
      try {
        const job = await this.client.pollJob(jobId, sessionId, controller.signal)
        if (run !== this.run) return
        if (job.clarify) h.onClarify?.(job.clarify)
        if (job.state === 'done' || job.state === 'error') {
          if (tail === 0) {
            if (job.state === 'done') h.onDone(job.result)
            else h.onError(new ShopError('server_error', job.error || 'The search failed. Please try again.', job.status ?? 500))
          }
          if (pending(job.clarify) && tail < PICTURE_TAIL_POLLS) {
            tail += 1
            this.timer = setTimeout(() => void tick(), POLL_INTERVAL_MS)
            return
          }
          this.stop()
          return
        }
        h.onProgress(job)
      } catch (e) {
        if (run !== this.run || isAbort(e)) return
        this.stop()
        if (tail > 0) return // the job's own outcome was already delivered
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
