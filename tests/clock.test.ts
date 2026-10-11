import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  SPEEDS,
  canPlay,
  clampToEnd,
  isPaused,
  liveClock,
  pauseClock,
  playClock,
  scrubClock,
  simTimeAt,
  togglePlay,
  withSpeed,
} from '../src/globe/clock.ts'

const NOW = Date.parse('2026-10-08T12:00:00Z')
const HOUR = 3_600_000
const DAY = 24 * HOUR

test('a scrubbed time plays forward from the picked moment at every speed', () => {
  for (const speed of SPEEDS) {
    for (const picked of [NOW - 6 * HOUR, NOW + 6 * HOUR]) {
      const c = scrubClock(picked, speed, NOW)
      assert.equal(simTimeAt(c, NOW), picked) // no jump at the pick
      assert.equal(simTimeAt(c, NOW + 10_000), picked + 10_000 * speed)
      assert.equal(c.kind, 'scrub') // it stays a scrubbed time; it never becomes live
    }
  }
})

test('changing speed from a scrubbed time re-anchors without a jump and stays scrubbed', () => {
  const c1 = scrubClock(NOW - 6 * HOUR, 1, NOW)
  for (const speed of SPEEDS) {
    const c = withSpeed(c1, speed, NOW + 5000)
    assert.equal(c.kind, 'scrub')
    assert.equal(simTimeAt(c, NOW + 5000), NOW - 6 * HOUR + 5000)
    assert.equal(simTimeAt(c, NOW + 6000), NOW - 6 * HOUR + 5000 + 1000 * speed)
  }
})

test('scrubbing keeps the selected speed', () => {
  // The slider builds its clock from the current speed: 50x live, then a scrub, is still 50x.
  const live50 = liveClock(NOW, 50)
  const scrubbed = scrubClock(NOW - DAY, live50.speed, NOW)
  assert.equal(scrubbed.speed, 50)
  assert.equal(simTimeAt(scrubbed, NOW + 1000), NOW - DAY + 50_000)
})

test('a near-miss replay plays on from its closest approach at the selected speed', () => {
  const tca = NOW + 3 * HOUR
  for (const speed of SPEEDS) {
    const held = { kind: 'frozen' as const, speed, atMs: tca } // during the camera fly-in
    assert.equal(simTimeAt(held, NOW + 99_999), tca)
    const playing = scrubClock(tca, held.speed, NOW + 1500) // when the camera arrives
    assert.equal(simTimeAt(playing, NOW + 1500), tca)
    assert.equal(simTimeAt(playing, NOW + 2500), tca + 1000 * speed)
  }
})

test('a paused clock resumes from where it stopped when a speed is picked', () => {
  const paused = { kind: 'frozen' as const, speed: 1, atMs: NOW - HOUR }
  for (const speed of SPEEDS) {
    const c = withSpeed(paused, speed, NOW)
    assert.equal(c.kind, 'scrub')
    assert.equal(simTimeAt(c, NOW), NOW - HOUR)
    assert.equal(simTimeAt(c, NOW + 2000), NOW - HOUR + 2000 * speed)
  }
})

test('playback pauses at the end of the range, keeping its speed, live or scrubbed', () => {
  const end = NOW + DAY
  for (const speed of SPEEDS) {
    // From a minute before the end, 30 real seconds later: 1x is still short
    // of it, 10x and 50x have passed it.
    const scrub = scrubClock(end - 60_000, speed, NOW)
    const later = NOW + 30_000
    const r = clampToEnd(scrub, later, end)
    if (speed === 1) {
      assert.equal(r.clock, scrub)
    } else {
      assert.deepEqual(r.clock, { kind: 'frozen', speed, atMs: end })
      assert.equal(r.simMs, end)
    }
    // Live works the same way: at 50x it reaches a day ahead in under half an hour.
    const live = liveClock(NOW, speed)
    const t = NOW + (DAY / (speed - 1 || 1)) * 1.01
    const r2 = clampToEnd(live, t, t + DAY)
    if (speed > 1) assert.deepEqual(r2.clock, { kind: 'frozen', speed, atMs: t + DAY })
    else assert.equal(r2.clock, live)
  }
  // Before the end nothing changes.
  const early = scrubClock(NOW - HOUR, 50, NOW)
  assert.equal(clampToEnd(early, NOW + 1000, NOW + 1000 + DAY).clock, early)
})

test('a scrubbed past time plays through the present without becoming live', () => {
  const c = scrubClock(NOW - 10 * 60_000, 10, NOW) // 10 minutes ago, at 10x
  const t = NOW + 120_000 // two real minutes later: 20 sim minutes on
  assert.equal(simTimeAt(c, t), NOW + 10 * 60_000)
  assert.ok(simTimeAt(c, t) > t) // now ahead of real time, still a scrub
  assert.equal(clampToEnd(c, t, t + DAY).clock.kind, 'scrub')
})

test('Pause from Live freezes the exact moment shown; Play resumes from it as a scrubbed time, not Live', () => {
  const live = liveClock(NOW - 10_000, 10) // live at 10x for 10 s of real time
  const shown = simTimeAt(live, NOW)
  const paused = pauseClock(live, NOW)
  assert.deepEqual(paused, { kind: 'frozen', speed: 10, atMs: shown })
  assert.ok(isPaused(paused))
  assert.equal(simTimeAt(paused, NOW + 5 * HOUR), shown) // stays put
  const played = playClock(paused, NOW + HOUR)
  assert.equal(played.kind, 'scrub') // only the Live button returns to live
  assert.equal(simTimeAt(played, NOW + HOUR), shown) // no jump on resume
  assert.equal(simTimeAt(played, NOW + HOUR + 1000), shown + 10_000) // at the kept speed
})

test('Pause and Play from a scrubbed time and from a replay keep the time and the speed', () => {
  const scrub = scrubClock(NOW - 6 * HOUR, 50, NOW - 2000)
  const at = simTimeAt(scrub, NOW)
  const paused = pauseClock(scrub, NOW)
  assert.deepEqual(paused, { kind: 'frozen', speed: 50, atMs: at })
  const resumed = playClock(paused, NOW + 60_000)
  assert.equal(simTimeAt(resumed, NOW + 60_000), at)
  assert.equal(resumed.speed, 50)
  // Pausing twice, or playing something already playing, changes nothing.
  assert.equal(pauseClock(paused, NOW + 1), paused)
  assert.equal(playClock(resumed, NOW + 2), resumed)
})

test('the toggle alternates, and Play does not fight the end-of-range pause', () => {
  const end = NOW + DAY
  let c = liveClock(NOW)
  c = togglePlay(c, NOW + 1000, end)
  assert.equal(c.kind, 'frozen')
  c = togglePlay(c, NOW + 5000, end)
  assert.equal(c.kind, 'scrub')
  assert.equal(simTimeAt(c, NOW + 5000), NOW + 1000)
  // Playback that ran into the end pauses there (clampToEnd); Play then has nothing ahead.
  const atEnd = clampToEnd(scrubClock(end - 1000, 50, NOW), NOW + 1000, end).clock
  assert.deepEqual(atEnd, { kind: 'frozen', speed: 50, atMs: end })
  assert.equal(canPlay(atEnd, end), false)
  assert.equal(playClock(atEnd, NOW + 2000, end), atEnd) // stays paused, no flip-flop
  assert.equal(togglePlay(atEnd, NOW + 2000, end), atEnd)
  // Paused before the end, Play works.
  assert.equal(canPlay({ kind: 'frozen', speed: 1, atMs: end - 1 }, end), true)
  // Picking a speed while paused still resumes, as before.
  assert.equal(withSpeed(pauseClock(liveClock(NOW), NOW), 10, NOW).kind, 'scrub')
})
