// What moment the globe shows. Every clock carries the selected playback
// speed, so the speed buttons work wherever the time is:
// - live: plays forward from now at `speed` (Live at 1x is exactly now);
// - scrub: plays forward at `speed` from a moment picked on the slider or a
//   near-miss's closest approach, and stays there (it never snaps back to
//   live; the Live button is the way back to the present);
// - frozen: paused at `atMs`, e.g. at the end of the slider's range. Picking a
//   speed resumes playback from there.
export type Clock =
  | { kind: 'live'; speed: number; anchorSimMs: number; anchorRealMs: number }
  | { kind: 'scrub'; speed: number; anchorSimMs: number; anchorRealMs: number }
  | { kind: 'frozen'; speed: number; atMs: number }

export const SPEEDS = [1, 10, 50] as const

export function liveClock(nowMs: number, speed = 1): Clock {
  return { kind: 'live', speed, anchorSimMs: nowMs, anchorRealMs: nowMs }
}

/** Play forward from `atMs` at `speed`, starting at real time `nowMs`. */
export function scrubClock(atMs: number, speed = 1, nowMs = Date.now()): Clock {
  return { kind: 'scrub', speed, anchorSimMs: atMs, anchorRealMs: nowMs }
}

export function simTimeAt(clock: Clock, nowMs: number): number {
  if (clock.kind === 'frozen') return clock.atMs
  return clock.anchorSimMs + (nowMs - clock.anchorRealMs) * clock.speed
}

/**
 * Change speed without a jump: re-anchor at the moment currently shown. Live
 * stays live and a scrubbed time stays scrubbed; a paused clock resumes from
 * where it stopped.
 */
export function withSpeed(clock: Clock, speed: number, nowMs = Date.now()): Clock {
  const at = simTimeAt(clock, nowMs)
  if (clock.kind === 'live') return { kind: 'live', speed, anchorSimMs: at, anchorRealMs: nowMs }
  return scrubClock(at, speed, nowMs)
}

/**
 * Hold playback at the end of the slider's range (`endMs`, about a day ahead
 * of now): a playing clock that has run past it pauses there, keeping its
 * speed. Returns the clock to use and the moment to show.
 */
export function clampToEnd(clock: Clock, nowMs: number, endMs: number): { clock: Clock; simMs: number } {
  const simMs = simTimeAt(clock, nowMs)
  if (clock.kind === 'frozen' || simMs <= endMs) return { clock, simMs }
  return { clock: { kind: 'frozen', speed: clock.speed, atMs: endMs }, simMs: endMs }
}

/** Whether playback is paused (the "frozen" clock). */
export const isPaused = (clock: Clock) => clock.kind === 'frozen'

/**
 * Pause: freeze at the moment shown, keeping the selected speed for when
 * playback resumes. Live, scrubbed or replaying, the time doesn't move.
 */
export function pauseClock(clock: Clock, nowMs = Date.now()): Clock {
  if (clock.kind === 'frozen') return clock
  return { kind: 'frozen', speed: clock.speed, atMs: simTimeAt(clock, nowMs) }
}

/**
 * Play: resume at the selected speed from the paused moment. It plays on as
 * a scrubbed time, never jumping back to Live (only the Live button does
 * that). Paused at the end of the slider's range (`endMs`) there's nothing
 * ahead to play, so it stays paused rather than fighting the end-of-range
 * pause.
 */
export function playClock(clock: Clock, nowMs = Date.now(), endMs = Infinity): Clock {
  if (clock.kind !== 'frozen') return clock
  if (clock.atMs >= endMs) return clock
  return scrubClock(clock.atMs, clock.speed, nowMs)
}

/** Pause if playing, play if paused (the Pause/Play button and Space). */
export function togglePlay(clock: Clock, nowMs = Date.now(), endMs = Infinity): Clock {
  return isPaused(clock) ? playClock(clock, nowMs, endMs) : pauseClock(clock, nowMs)
}

/** Whether Play can do anything: paused before the end of the range, or playing. */
export const canPlay = (clock: Clock, endMs = Infinity) => clock.kind !== 'frozen' || clock.atMs < endMs
