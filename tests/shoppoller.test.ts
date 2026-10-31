import assert from 'node:assert/strict'
import { afterEach, beforeEach, mock, test } from 'node:test'
import { ShopError } from '../src/shop/api.ts'
import { GIVE_UP_AFTER_MS, JobPoller, POLL_INTERVAL_MS, SLOW_AFTER_MS, type PollHandlers } from '../src/shop/poller.ts'
import type { JobStatus } from '../src/shop/types.ts'
import { fixtureView } from '../src/shop/fixtures.ts'

beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'] }))
afterEach(() => mock.timers.reset())

const running: JobStatus = { state: 'running', phase: 'search', steps: [] }

function setup(script: (n: number) => JobStatus | Error) {
  const times: number[] = []
  const log: string[] = []
  const client = {
    pollJob: async (_id: string, _s: string | null, signal?: AbortSignal) => {
      times.push(Date.now())
      const out = script(times.length)
      void signal
      if (out instanceof Error) throw out
      return out
    },
  }
  const handlers: PollHandlers = {
    onProgress: () => log.push('progress'),
    onDone: () => log.push('done'),
    onError: (e) => log.push(`error:${e.code}`),
    onSlow: () => log.push('slow'),
  }
  return { poller: new JobPoller(client), times, log, handlers }
}

const flush = async (ms: number) => {
  mock.timers.tick(ms)
  for (let i = 0; i < 6; i++) await Promise.resolve()
}

test('polls about once a second, never faster, and stops when the job is done', async () => {
  const { poller, times, log, handlers } = setup((n) => (n < 4 ? running : { state: 'done', result: fixtureView }))
  poller.start('j', null, handlers)
  for (let i = 0; i < 10; i++) await flush(500)
  assert.equal(times.length, 4)
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= POLL_INTERVAL_MS, 'interval')
  assert.equal(POLL_INTERVAL_MS, 1000)
  assert.deepEqual(log, ['progress', 'progress', 'progress', 'done'])
})

test('polling stops on a job error, and the job message is shown', async () => {
  const { poller, times, log, handlers } = setup((n) => (n < 2 ? running : { state: 'error', status: 500, error: 'The search failed.' }))
  poller.start('j', null, handlers)
  for (let i = 0; i < 8; i++) await flush(1000)
  assert.equal(times.length, 2)
  assert.deepEqual(log, ['progress', 'error:server_error'])
})

test('polling stops after a request error', async () => {
  const { poller, times, log, handlers } = setup(() => new ShopError('network', 'down'))
  poller.start('j', null, handlers)
  for (let i = 0; i < 5; i++) await flush(1000)
  assert.equal(times.length, 1)
  assert.deepEqual(log, ['error:network'])
})

test('stop() (unmount) ends polling', async () => {
  const { poller, times, handlers } = setup(() => running)
  poller.start('j', null, handlers)
  await flush(0)
  await flush(1000)
  const before = times.length
  poller.stop()
  for (let i = 0; i < 5; i++) await flush(1000)
  assert.equal(times.length, before)
})

test('starting a new job ends the old one', async () => {
  const seen: string[] = []
  const client = { pollJob: async (id: string) => { seen.push(id); return running } }
  const poller = new JobPoller(client)
  const noop: PollHandlers = { onProgress() {}, onDone() {}, onError() {}, onSlow() {} }
  poller.start('old', null, noop)
  await flush(0)
  poller.start('new', null, noop)
  for (let i = 0; i < 4; i++) await flush(1000)
  assert.ok(seen.includes('new'))
  assert.equal(seen.filter((s) => s === 'old').length, 1, 'old job is not polled again')
})

test('a slow job gets a calm message at 60 s and a clear error at 90 s, then stops', async () => {
  const { poller, times, log, handlers } = setup(() => running)
  poller.start('j', null, handlers)
  for (let t = 0; t < GIVE_UP_AFTER_MS + 5000; t += 1000) await flush(1000)
  assert.equal(SLOW_AFTER_MS, 60_000)
  assert.equal(log.filter((l) => l === 'slow').length, 1)
  assert.equal(log.at(-1), 'error:timeout')
  const count = times.length
  for (let i = 0; i < 5; i++) await flush(1000)
  assert.equal(times.length, count)
  assert.ok(log.indexOf('slow') < log.indexOf('error:timeout'))
})
