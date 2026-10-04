// What moment the globe shows. Live plays forward from an anchor at `speed`
// times real time (1x by default, so Live at 1x is exactly now). Offset is a
// time picked on the slider, then advancing at 1x; frozen is a near-miss
// replay held at its TCA. Speed applies to Live only, so scrubbing the slider
// stays a direct jump to the chosen moment.
export type Clock =
  | { kind: 'live'; speed: number; anchorSimMs: number; anchorRealMs: number }
  | { kind: 'offset'; offsetMs: number }
  | { kind: 'frozen'; atMs: number }

export const SPEEDS = [1, 10, 50] as const

export function liveClock(nowMs: number, speed = 1): Clock {
  return { kind: 'live', speed, anchorSimMs: nowMs, anchorRealMs: nowMs }
}

export function simTimeAt(clock: Clock, nowMs: number): number {
  switch (clock.kind) {
    case 'frozen':
      return clock.atMs
    case 'offset':
      return nowMs + clock.offsetMs
    case 'live':
      return clock.anchorSimMs + (nowMs - clock.anchorRealMs) * clock.speed
  }
}

// Change Live speed without a jump: re-anchor at the moment currently shown.
export function withSpeed(clock: Clock, speed: number, nowMs = Date.now()): Clock {
  if (clock.kind !== 'live') return clock
  return { kind: 'live', speed, anchorSimMs: simTimeAt(clock, nowMs), anchorRealMs: nowMs }
}
