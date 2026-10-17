// The glow's look, in one place so the engine (the debug hook), the layer and
// the tests agree. Pure.

export interface GlowTuning {
  /** Baseline brightness, multiplying the narrow-field and Earth-in-view dimming. */
  gain: number
  /** How much of the atlas's colour is kept (1 = all, 0 = grey). */
  saturation: number
  /** The power applied to the atlas's (display-stretched) values: higher is more contrast. */
  gamma: number
  /** Gaussian blur of the map, degrees (sigma); 0 = none. Changing it rebuilds the map in the background. */
  blurDeg: number
}

/**
 * Tuned by hand with the debug Sky tuning panel (Max, 2026-10): a faint glow
 * (gain 0.20), a little colour (saturation 0.60), a touch less contrast than
 * the first version (gamma 1.35, from 1.5), and no blur: the map is drawn as
 * the atlas gives it, bilinearly interpolated between pixel centres. With a
 * blur of 0 the background blur work is skipped altogether.
 */
export const GLOW_DEFAULT: Readonly<GlowTuning> = { gain: 0.2, saturation: 0.6, gamma: 1.35, blurDeg: 0 }

/**
 * The stars' own tuned look (same panel): brightness x1.10, point size x1,
 * and 3.5 magnitudes added to the limiting magnitude at fields wider than 15
 * degrees (fading to nothing by 5 degrees), so a wide view shows far more of
 * the 118,217 Hipparcos stars than the naked-eye rule alone.
 */
export const STAR_LOOK_DEFAULT = { brightness: 1.1, size: 1, limitOffset: 3.5 } as const
