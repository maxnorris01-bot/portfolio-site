// Day/night shading for the globe. The weights are plain functions of the
// Sun's elevation at a surface point (as its sine, the dot product of the
// surface normal and the Sun direction), so the shader and the tests share
// them: the GLSL below is generated from the same constants.

const DEG = Math.PI / 180

export const DAY_NIGHT = {
  /**
   * The lit side is brightened by this factor (linear), so day and night are
   * easy to tell apart even with satellites crowding the view. Off, the globe
   * is exactly the old, uniformly lit look (factor 1).
   */
  dayGain: 1.6,
  /** At and above this solar elevation the surface is fully lit, as before. */
  fullDayDeg: 3,
  /**
   * At and below this it's full night. +3 to -12 degrees is a soft band about
   * as wide as civil plus nautical twilight (~1,700 km on the ground).
   */
  fullNightDeg: -12,
  /** City lights start to show at sunset and reach full strength here. */
  lightsFullDeg: -10,
  /** The night side keeps this much of the day texture, so land stays just visible. */
  nightFloor: 0.03,
  /**
   * The Black Marble map carries a faint grey-blue land base (linear luminance
   * about 0.002-0.035) under the lights (cities 0.26-0.97). Texels fade in
   * from `lightsFrom` to `lightsTo`, so only the lights are added and the
   * night side stays dark.
   */
  lightsFrom: 0.03,
  lightsTo: 0.12,
} as const

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * Weights for one surface point: `day` multiplies the (already tinted) day
 * texture and `lights` multiplies the night-lights texture. Off, or with the
 * Sun anywhere, `day` is 1 and `lights` 0 when `enabled` is false: exactly the
 * old, uniformly lit globe. Without the lights texture (still loading, or
 * failed), `lights` is 0 and the night side is plain darkened day texture.
 */
export function dayNightWeights(
  sinSunElevation: number,
  { enabled = true, hasLights = true }: { enabled?: boolean; hasLights?: boolean } = {},
): { day: number; lights: number } {
  if (!enabled) return { day: 1, lights: 0 }
  const { dayGain, fullDayDeg, fullNightDeg, lightsFullDeg, nightFloor } = DAY_NIGHT
  const lit = smoothstep(Math.sin(fullNightDeg * DEG), Math.sin(fullDayDeg * DEG), sinSunElevation)
  const dark = 1 - smoothstep(Math.sin(lightsFullDeg * DEG), 0, sinSunElevation)
  return { day: nightFloor + (dayGain - nightFloor) * lit, lights: hasLights ? dark : 0 }
}

const f = (x: number) => x.toFixed(6)

/** The Earth material's shaders: the same weights as dayNightWeights, per fragment. */
export const EARTH_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormalW;
void main() {
  vUv = uv;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

// The Earth's fragment shader. `tiled`: the satellite view's imagery tiles,
// which sample their own tile image (`tileMap`, on `vUv`) and fall back to
// the 2K day texture (on `vUvGlobal`) where the tile has no data (GIBS fills
// gaps with black); the night lights always come from the global texture. A tile also fades in
// as a whole (`opacity`) and along the edges flagged in `feather` (west,
// east, north, south; `vEdge` runs 0..1 across the drawn tile), blending into
// whatever is drawn beneath it. The 2K and night textures are only read where
// they contribute (explicit gradients keep their mip selection right inside
// the branches).
function earthFragment(tiled: boolean) {
  return /* glsl */ `
uniform sampler2D dayMap;
uniform sampler2D nightMap;
${tiled ? 'uniform sampler2D tileMap;\nuniform float opacity;\nuniform vec4 feather;\nvarying vec2 vUvGlobal;\nvarying vec2 vEdge;' : ''}
uniform vec3 tint;
uniform vec3 sunDir;
uniform float enabled;
uniform float hasLights;
varying vec2 vUv;
varying vec3 vNormalW;
void main() {
${
  tiled
    ? `  vec2 g = vUvGlobal;
  vec2 gdx = dFdx(g);
  vec2 gdy = dFdy(g);
  vec3 tile = texture2D(tileMap, vUv).rgb;
  vec3 day = tile;
  if (dot(tile, vec3(0.333)) < 0.012) day = textureGrad(dayMap, g, gdx, gdy).rgb;
  day *= tint;`
    : `  vec2 g = vUv;
  vec3 day = texture2D(dayMap, g).rgb * tint;`
}
  float s = dot(normalize(vNormalW), sunDir);
  float lit = smoothstep(${f(Math.sin(DAY_NIGHT.fullNightDeg * DEG))}, ${f(Math.sin(DAY_NIGHT.fullDayDeg * DEG))}, s);
  float dark = 1.0 - smoothstep(${f(Math.sin(DAY_NIGHT.lightsFullDeg * DEG))}, 0.0, s);
  float dayW = mix(1.0, ${f(DAY_NIGHT.nightFloor)} + ${f(DAY_NIGHT.dayGain - DAY_NIGHT.nightFloor)} * lit, enabled);
  float lightsW = enabled * hasLights * dark;
${
  tiled
    ? `  vec3 lights = vec3(0.0);
  if (lightsW > 0.0) lights = textureGrad(nightMap, g, gdx, gdy).rgb;
  vec2 e = vEdge;
  float fw = ${f(TILE_FEATHER)};
  float a = opacity;
  a *= mix(1.0, smoothstep(0.0, fw, e.x), feather.x);
  a *= mix(1.0, smoothstep(0.0, fw, 1.0 - e.x), feather.y);
  a *= mix(1.0, smoothstep(0.0, fw, e.y), feather.z);
  a *= mix(1.0, smoothstep(0.0, fw, 1.0 - e.y), feather.w);`
    : `  vec3 lights = texture2D(nightMap, g).rgb;
  float a = 1.0;`
}
  lights *= smoothstep(${f(DAY_NIGHT.lightsFrom)}, ${f(DAY_NIGHT.lightsTo)}, dot(lights, vec3(0.2126, 0.7152, 0.0722)));
  gl_FragColor = vec4(day * dayW + lights * lightsW, a);
  #include <colorspace_fragment>
}
`
}

/** How far a tile's flagged edges fade, as a fraction of its width or height. */
export const TILE_FEATHER = 0.08

export const EARTH_FRAGMENT_SHADER = earthFragment(false)

/** The satellite view's imagery tiles: the same lighting on tile images. */
export const TILE_VERTEX_SHADER = /* glsl */ `
attribute vec2 uvGlobal;
attribute vec2 edge;
varying vec2 vUv;
varying vec2 vUvGlobal;
varying vec2 vEdge;
varying vec3 vNormalW;
void main() {
  vUv = uv;
  vUvGlobal = uvGlobal;
  vEdge = edge;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
export const TILE_FRAGMENT_SHADER = earthFragment(true)
