// The Sky view's stylized sky: the twilight phase for a solar elevation, and
// the sky colours that go with it. Pure functions, shared by the engine, the
// "Your sky" panel and the tests.

export type TwilightPhase = 'day' | 'civil' | 'nautical' | 'astronomical' | 'night'

/**
 * The phase for the Sun's elevation in degrees: daytime from sunrise/sunset
 * (the Sun's centre at -0.833 degrees, the conventional value allowing for
 * refraction and the Sun's radius), then civil twilight to -6, nautical to
 * -12, astronomical to -18, and night below.
 */
export function twilightPhase(elDeg: number): TwilightPhase {
  if (elDeg >= -0.833) return 'day'
  if (elDeg >= -6) return 'civil'
  if (elDeg >= -12) return 'nautical'
  if (elDeg >= -18) return 'astronomical'
  return 'night'
}

export const PHASE_LABEL: Record<TwilightPhase, string> = {
  day: 'Daytime',
  civil: 'Civil twilight',
  nautical: 'Nautical twilight',
  astronomical: 'Astronomical twilight',
  night: 'Night',
}

/**
 * The brightest any part of the sky may get (sRGB). A stylized, deep day blue:
 * every point colour, ring and line keeps at least 3:1 against it and the
 * grid labels at least 4.5:1 (checked in tests/twilight.test.ts), so
 * satellites stay legible at noon.
 */
export const SKY_CAP = '#223956'

// Zenith and horizon colours by solar elevation (sRGB); blended between
// keyframes in linear light. Night is the old sky colour.
const KEYS: { el: number; zenith: string; horizon: string }[] = [
  { el: -18, zenith: '#05070d', horizon: '#080b16' },
  { el: -12, zenith: '#060a18', horizon: '#0c1530' },
  { el: -6, zenith: '#0a1430', horizon: '#16264a' },
  { el: 0, zenith: '#102243', horizon: '#1c3052' },
  { el: 8, zenith: '#18305a', horizon: SKY_CAP },
]
/** Warm dawn/dusk glow toward the Sun's azimuth, low over the horizon. */
export const GLOW_COLOR = '#c2703a'
const GLOW_PEAK_EL = -1
const GLOW_HALF_WIDTH = 11
const GLOW_MAX = 0.06

export type Rgb = [number, number, number]

const toLinear = (hex: string): Rgb =>
  [1, 3, 5].map((i) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }) as Rgb

const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as Rgb

/** Relative luminance of a linear colour. */
export const luminance = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b

/**
 * The sky's colours for a solar elevation, in linear RGB: zenith, horizon, and
 * the glow colour already scaled by its strength (added at the horizon toward
 * the Sun). The glow peaks just before sunrise/just after sunset and fades out
 * by -12 and +10 degrees.
 */
export function skyPalette(elDeg: number): { zenith: Rgb; horizon: Rgb; glow: Rgb } {
  let zenith = toLinear(KEYS[0].zenith)
  let horizon = toLinear(KEYS[0].horizon)
  if (elDeg >= KEYS[KEYS.length - 1].el) {
    const k = KEYS[KEYS.length - 1]
    zenith = toLinear(k.zenith)
    horizon = toLinear(k.horizon)
  } else {
    for (let i = 0; i + 1 < KEYS.length; i++) {
      const a = KEYS[i]
      const b = KEYS[i + 1]
      if (elDeg >= a.el && elDeg < b.el) {
        const t = (elDeg - a.el) / (b.el - a.el)
        zenith = mixRgb(toLinear(a.zenith), toLinear(b.zenith), t)
        horizon = mixRgb(toLinear(a.horizon), toLinear(b.horizon), t)
      }
    }
  }
  const x = (elDeg - GLOW_PEAK_EL) / GLOW_HALF_WIDTH
  let strength = Math.abs(x) >= 1 ? 0 : GLOW_MAX * (1 - x * x) ** 2
  // Never let the glow lift the brightest point past the cap.
  const glowColor = toLinear(GLOW_COLOR)
  const headroom = Math.max(0, luminance(toLinear(SKY_CAP)) - luminance(horizon))
  strength = Math.min(strength, headroom / luminance(glowColor))
  const glow = glowColor.map((c) => c * strength) as Rgb
  return { zenith, horizon, glow }
}

/** The brightest point of the sky for a solar elevation: the horizon under the Sun, glow included. */
export function brightestSky(elDeg: number): Rgb {
  const { horizon, glow } = skyPalette(elDeg)
  return [0, 1, 2].map((i) => horizon[i] + glow[i]) as Rgb
}

/** The sky dome's shaders: a horizon-to-zenith blend plus the glow toward the Sun. */
export const SKY_VERTEX_SHADER = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const SKY_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 glow;
uniform vec3 sunDir;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(horizon, zenith, pow(h, 0.6));
  vec2 s = sunDir.xz;
  vec2 v = d.xz;
  float toward = (length(s) > 1e-4 && length(v) > 1e-4) ? max(dot(normalize(s), normalize(v)), 0.0) : 0.0;
  col += glow * pow(toward, 6.0) * pow(1.0 - h, 3.0);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`
