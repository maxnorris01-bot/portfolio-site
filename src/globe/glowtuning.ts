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
 * Chosen by eye against screenshots: a faint soft band, not a photograph.
 * Gain 0.5 (half the first version's brightness), saturation 0.45 (from 0.7),
 * a 1 degree blur (the atlas's own pixels are 0.46 degrees, so the glow
 * effectively resolves about 2.4 degrees: the bulge, the Great Rift as a soft
 * darkening and the Magellanic Clouds, but not the dust-lane filaments), and a
 * gamma of 1.3 (from 1.5) because the blur already removes the harsh detail.
 */
export const GLOW_DEFAULT: Readonly<GlowTuning> = { gain: 0.5, saturation: 0.45, gamma: 1.3, blurDeg: 1.0 }
