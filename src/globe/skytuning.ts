// The ?debug=1 sky tuning panel's logic: the sliders (ranges, steps, defaults),
// the presets, the JSON export, the remembered values, and a controller that
// sits between the panel and the engine's own settings. The engine's fields
// (glowGain, skyDim, starBrightness...) are the one source of truth: the
// panel reads and writes them, and so does the console, so they cannot
// disagree. Pure (the engine, storage and timers are passed in), so it is
// tested. Loaded only in debug mode.

import { GLOW_DEFAULT, STAR_LOOK_DEFAULT } from './glowtuning.ts'
import { SKY_DIM_DEFAULT, type SkyDimTargets } from './skydim.ts'
import { MAX_FOV_DEFAULT, MAX_FOV_SLIDER_MAX, MAX_FOV_SLIDER_MIN } from './fovcap.ts'

export type SkyTuningKey =
  | 'glowGain'
  | 'glowSaturation'
  | 'glowGamma'
  | 'glowBlur'
  | 'skyGlowSunlit'
  | 'skyStarsSunlit'
  | 'skyGlowNight'
  | 'skyStarsNight'
  | 'starBrightness'
  | 'starSize'
  | 'wideLimitOffset'
  | 'maxFov'

export type SkyTuningValues = Record<SkyTuningKey, number>

/** The star settings' shipped defaults (see glowtuning.ts), and the neutral values (no change to the stars) the original look used. */
export const STAR_TUNING_DEFAULT = {
  starBrightness: STAR_LOOK_DEFAULT.brightness,
  starSize: STAR_LOOK_DEFAULT.size,
  wideLimitOffset: STAR_LOOK_DEFAULT.limitOffset,
} as const
export const STAR_TUNING_NEUTRAL = { starBrightness: 1, starSize: 1, wideLimitOffset: 0 } as const

/** What the panel reads and writes: the engine's public settings (the same ones the console hooks are). */
export interface TuningTarget {
  glowGain: number
  glowSaturation: number
  glowGamma: number
  glowBlur: number
  skyDim: SkyDimTargets
  starBrightness: number
  starSize: number
  wideLimitOffset: number
  maxFov: number
}

export interface SliderSpec {
  key: SkyTuningKey
  group: 'Glow' | 'Earth in view' | 'Stars' | 'View'
  label: string
  min: number
  max: number
  step: number
  default: number
  /** Digits shown in the readout. */
  digits: number
  unit?: string
  hint?: string
}

export const SKY_TUNING_SLIDERS: readonly SliderSpec[] = [
  { key: 'glowGain', group: 'Glow', label: 'Gain', min: 0, max: 2, step: 0.01, default: GLOW_DEFAULT.gain, digits: 2, hint: 'Overall brightness of the Milky Way glow' },
  { key: 'glowSaturation', group: 'Glow', label: 'Saturation', min: 0, max: 1.5, step: 0.01, default: GLOW_DEFAULT.saturation, digits: 2, hint: '0 grey, 1 the atlas\'s own colour' },
  { key: 'glowGamma', group: 'Glow', label: 'Gamma', min: 0.8, max: 2.2, step: 0.01, default: GLOW_DEFAULT.gamma, digits: 2, hint: 'Contrast: higher is darker and punchier' },
  { key: 'glowBlur', group: 'Glow', label: 'Blur', min: 0, max: 2, step: 0.05, default: GLOW_DEFAULT.blurDeg, digits: 2, unit: '°', hint: 'Softness; rebuilds the map in the background' },
  { key: 'skyGlowSunlit', group: 'Earth in view', label: 'Glow, sunlit', min: 0, max: 1, step: 0.01, default: SKY_DIM_DEFAULT.glowSunlit, digits: 2, hint: 'Glow × this with the Earth filling the view, day side' },
  { key: 'skyStarsSunlit', group: 'Earth in view', label: 'Stars, sunlit', min: 0, max: 1, step: 0.01, default: SKY_DIM_DEFAULT.starsSunlit, digits: 2 },
  { key: 'skyGlowNight', group: 'Earth in view', label: 'Glow, night', min: 0, max: 1, step: 0.01, default: SKY_DIM_DEFAULT.glowNight, digits: 2, hint: 'The same over the night side' },
  { key: 'skyStarsNight', group: 'Earth in view', label: 'Stars, night', min: 0, max: 1, step: 0.01, default: SKY_DIM_DEFAULT.starsNight, digits: 2 },
  { key: 'starBrightness', group: 'Stars', label: 'Brightness', min: 0.25, max: 3, step: 0.01, default: STAR_TUNING_DEFAULT.starBrightness, digits: 2, unit: '×', hint: 'Every star\'s brightness' },
  { key: 'starSize', group: 'Stars', label: 'Point size', min: 0.5, max: 2.5, step: 0.01, default: STAR_TUNING_DEFAULT.starSize, digits: 2, unit: '×' },
  { key: 'wideLimitOffset', group: 'Stars', label: 'Wide-field limit', min: -1, max: 4, step: 0.05, default: STAR_TUNING_DEFAULT.wideLimitOffset, digits: 2, unit: ' mag', hint: 'Fainter stars shown at fields wider than 15° (none under 5°)' },
  { key: 'maxFov', group: 'View', label: 'Max field of view', min: MAX_FOV_SLIDER_MIN, max: MAX_FOV_SLIDER_MAX, step: 1, default: MAX_FOV_DEFAULT, digits: 0, unit: '°', hint: 'The larger of the horizontal and vertical angles cannot exceed this (Satellite, Sky and Globe views). Above about 100° the edges distort.' },
]

const SPEC = new Map(SKY_TUNING_SLIDERS.map((s) => [s.key, s]))

export const SKY_TUNING_KEYS = SKY_TUNING_SLIDERS.map((s) => s.key)

/** The shipped defaults. */
export const SKY_TUNING_DEFAULTS: Readonly<SkyTuningValues> = Object.fromEntries(SKY_TUNING_SLIDERS.map((s) => [s.key, s.default])) as SkyTuningValues

/**
 * The look before the glow was softened and the Earth-in-view dimming added:
 * glow gain 1.0, saturation 0.7, gamma 1.5, no blur, sky dimming off (every
 * dimming factor 1); the stars as they were then (brightness x1, size x1, no
 * limiting-magnitude offset).
 */
export const SKY_TUNING_ORIGINAL: Readonly<SkyTuningValues> = {
  ...SKY_TUNING_DEFAULTS,
  ...STAR_TUNING_NEUTRAL,
  glowGain: 1.0,
  glowSaturation: 0.7,
  glowGamma: 1.5,
  glowBlur: 0,
  skyGlowSunlit: 1,
  skyStarsSunlit: 1,
  skyGlowNight: 1,
  skyStarsNight: 1,
}

/** A value held to its slider's range and rounded to its step. */
export function clampValue(key: SkyTuningKey, value: number): number {
  const s = SPEC.get(key)!
  if (!Number.isFinite(value)) return s.default
  const stepped = Math.round((value - s.min) / s.step) * s.step + s.min
  const digits = Math.max(0, Math.ceil(-Math.log10(s.step)) + 1)
  return Math.min(s.max, Math.max(s.min, Number(stepped.toFixed(digits))))
}

/** The current values, read from the engine's settings. */
export function readValues(t: TuningTarget): SkyTuningValues {
  return {
    glowGain: t.glowGain,
    glowSaturation: t.glowSaturation,
    glowGamma: t.glowGamma,
    glowBlur: t.glowBlur,
    skyGlowSunlit: t.skyDim.glowSunlit,
    skyStarsSunlit: t.skyDim.starsSunlit,
    skyGlowNight: t.skyDim.glowNight,
    skyStarsNight: t.skyDim.starsNight,
    starBrightness: t.starBrightness,
    starSize: t.starSize,
    wideLimitOffset: t.wideLimitOffset,
    maxFov: t.maxFov,
  }
}

/** Write one value into the engine's settings (held to range). */
export function writeValue(t: TuningTarget, key: SkyTuningKey, value: number): void {
  const v = clampValue(key, value)
  switch (key) {
    case 'glowGain': t.glowGain = v; break
    case 'glowSaturation': t.glowSaturation = v; break
    case 'glowGamma': t.glowGamma = v; break
    case 'glowBlur': t.glowBlur = v; break
    case 'skyGlowSunlit': t.skyDim.glowSunlit = v; break
    case 'skyStarsSunlit': t.skyDim.starsSunlit = v; break
    case 'skyGlowNight': t.skyDim.glowNight = v; break
    case 'skyStarsNight': t.skyDim.starsNight = v; break
    case 'starBrightness': t.starBrightness = v; break
    case 'starSize': t.starSize = v; break
    case 'wideLimitOffset': t.wideLimitOffset = v; break
    case 'maxFov': t.maxFov = v; break
  }
}

export function writeValues(t: TuningTarget, values: Partial<SkyTuningValues>): void {
  for (const k of SKY_TUNING_KEYS) if (values[k] !== undefined) writeValue(t, k, values[k]!)
}

/** A short JSON of every value, rounded to its slider's precision, for "Copy settings". */
export function toJson(values: SkyTuningValues): string {
  const out: Record<string, number> = {}
  for (const s of SKY_TUNING_SLIDERS) out[s.key] = Number(values[s.key].toFixed(s.digits))
  return JSON.stringify(out)
}

/** Read a JSON of values back (unknown keys and non-numbers are ignored); null if it isn't an object. */
export function parseJson(text: string): Partial<SkyTuningValues> | null {
  try {
    const o = JSON.parse(text) as unknown
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null
    const out: Partial<SkyTuningValues> = {}
    for (const k of SKY_TUNING_KEYS) {
      const v = (o as Record<string, unknown>)[k]
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = clampValue(k, v)
    }
    return out
  } catch {
    return null
  }
}

// ---- remembered values (debug mode only) ----

export const STORAGE_KEY = 'sky-tuning-v1'

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** The browser's localStorage, or null where it is blocked or throws (private windows, cleared site data). */
export function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function loadStored(storage: StorageLike | null = browserStorage()): Partial<SkyTuningValues> | null {
  try {
    const raw = storage?.getItem(STORAGE_KEY)
    return raw ? parseJson(raw) : null
  } catch {
    return null
  }
}

export function saveStored(values: SkyTuningValues, storage: StorageLike | null = browserStorage()): boolean {
  try {
    if (!storage) return false
    storage.setItem(STORAGE_KEY, toJson(values))
    return true
  } catch {
    return false
  }
}

export function clearStored(storage: StorageLike | null = browserStorage()): void {
  try {
    storage?.removeItem(STORAGE_KEY)
  } catch {
    /* blocked: nothing to clear */
  }
}

/** Apply remembered values to the engine (debug mode, at start). Returns whether any were found. */
export function applyStored(t: TuningTarget, storage: StorageLike | null = browserStorage()): boolean {
  const v = loadStored(storage)
  if (!v) return false
  writeValues(t, v)
  return true
}

// ---- the controller the panel uses ----

export interface ControllerOptions {
  storage?: StorageLike | null
  setTimeout?: (fn: () => void, ms: number) => unknown
  clearTimeout?: (h: unknown) => void
  /** How long a blur change waits for the slider to rest before the map rebuilds (default 250 ms). */
  blurDebounceMs?: number
}

/**
 * What a slider does: set the engine's value at once (the glow, the dimming and
 * the stars read it every frame), except the blur, which rebuilds the map in
 * the background and so waits until the slider has rested. Every change is
 * remembered; reset forgets them.
 */
export class TuningController {
  private readonly t: TuningTarget
  private readonly o: Required<ControllerOptions>
  private pendingBlur: number | null = null
  private timer: unknown = null

  constructor(target: TuningTarget, options: ControllerOptions = {}) {
    this.t = target
    this.o = {
      storage: options.storage === undefined ? browserStorage() : options.storage,
      setTimeout: options.setTimeout ?? ((fn, ms) => setTimeout(fn, ms)),
      clearTimeout: options.clearTimeout ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>)),
      blurDebounceMs: options.blurDebounceMs ?? 250,
    }
  }

  /** The values the sliders show: the engine's, except a blur still waiting to be applied. */
  values(): SkyTuningValues {
    const v = readValues(this.t)
    if (this.pendingBlur !== null) v.glowBlur = this.pendingBlur
    return v
  }

  set(key: SkyTuningKey, value: number): void {
    const v = clampValue(key, value)
    if (key === 'glowBlur') {
      this.pendingBlur = v
      if (this.timer !== null) this.o.clearTimeout(this.timer)
      this.timer = this.o.setTimeout(() => this.flush(), this.o.blurDebounceMs)
      return
    }
    writeValue(this.t, key, v)
    saveStored(this.values(), this.o.storage)
  }

  /** Apply a waiting blur now. */
  flush(): void {
    if (this.timer !== null) this.o.clearTimeout(this.timer)
    this.timer = null
    if (this.pendingBlur !== null) {
      this.t.glowBlur = this.pendingBlur
      this.pendingBlur = null
    }
    saveStored(this.values(), this.o.storage)
  }

  private setAll(v: SkyTuningValues) {
    if (this.timer !== null) this.o.clearTimeout(this.timer)
    this.timer = null
    this.pendingBlur = null
    writeValues(this.t, v)
  }

  /** The shipped defaults; forgets the remembered values. */
  reset(): void {
    this.setAll(SKY_TUNING_DEFAULTS)
    clearStored(this.o.storage)
  }

  /** The look before the softening and the Earth dimming. Remembered like any change. */
  original(): void {
    this.setAll(SKY_TUNING_ORIGINAL)
    saveStored(this.values(), this.o.storage)
  }

  json(): string {
    return toJson(this.values())
  }

  /** Does the engine hold exactly the shipped defaults? */
  isDefault(): boolean {
    const v = this.values()
    return SKY_TUNING_KEYS.every((k) => Math.abs(v[k] - SKY_TUNING_DEFAULTS[k]) < 1e-9)
  }

  dispose(): void {
    if (this.timer !== null) this.o.clearTimeout(this.timer)
    this.timer = null
  }
}
