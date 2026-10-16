// The Milky Way's glow as a sky backdrop layer (SkyBackdropLayer in
// space.ts): a sphere behind the stars that samples the longitude-latitude
// texture built from the Gaia glow atlas (glow.ts) by J2000 direction. One
// texture read per pixel and a 48 x 24 sphere, so it is cheap on a phone.
// Dimmed as the field narrows (glowGain), since the stars drawn there
// already resolve some of the light.

import * as THREE from 'three'
import { glowGain } from './glow.ts'
import { SKY_RADIUS } from './stars.ts'
import type { SkyBackdropLayer, SkyContext } from './space.ts'

const VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform mat3 sceneToJ2000;
uniform float gain;
uniform float gamma;
uniform float saturation;
varying vec3 vDir;
void main() {
  vec3 d = normalize(sceneToJ2000 * normalize(vDir));
  float ra = atan(d.y, d.x);
  // RA increases to the left, 0 h in the middle; v = 0 at the south pole.
  float u = fract(0.5 - ra / 6.28318530718);
  float v = 0.5 + asin(clamp(d.z, -1.0, 1.0)) / 3.14159265359;
  // The atlas is stretched for display; a power curve darkens the faint sky so the stars stand out from it.
  vec3 c = pow(texture2D(map, vec2(u, v)).rgb, vec3(gamma));
  // Gaia's own colours are strong (the bulge is orange); a little toward grey keeps the glow soft behind the stars.
  c = mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, saturation) * gain;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}
`

/** The power applied to the atlas's (display-stretched) values, texture value to light. */
export const GLOW_GAMMA = 1.5
/** How much of the atlas's colour is kept (1 = all, 0 = grey). */
export const GLOW_SATURATION = 0.7

export class GlowLayer implements SkyBackdropLayer {
  readonly object: THREE.Mesh
  private readonly material: THREE.ShaderMaterial
  private readonly geometry: THREE.SphereGeometry
  private readonly texture: THREE.DataTexture
  /** Overall brightness of the glow against the stars (tuned by eye). */
  private readonly base: number

  /** `rgba`: a longitude-latitude map `width` by `height` (glow.ts's fillGlowRows). */
  constructor(rgba: Uint8Array, width: number, height: number, base = 1.0) {
    this.base = base
    this.texture = new THREE.DataTexture(rgba, width, height, THREE.RGBAFormat, THREE.UnsignedByteType)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.wrapS = THREE.RepeatWrapping
    this.texture.wrapT = THREE.ClampToEdgeWrapping
    this.texture.magFilter = THREE.LinearFilter
    this.texture.minFilter = THREE.LinearFilter
    this.texture.generateMipmaps = false
    this.texture.needsUpdate = true
    this.geometry = new THREE.SphereGeometry(SKY_RADIUS * 1.05, 48, 24)
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.texture }, sceneToJ2000: { value: new THREE.Matrix3() }, gain: { value: base }, gamma: { value: GLOW_GAMMA }, saturation: { value: GLOW_SATURATION } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
    })
    this.object = new THREE.Mesh(this.geometry, this.material)
    this.object.renderOrder = -2
    this.object.frustumCulled = false
  }

  update(ctx: SkyContext) {
    this.material.uniforms.sceneToJ2000.value.copy(ctx.sceneToJ2000)
    this.material.uniforms.gain.value = this.base * glowGain(ctx.fovDeg)
  }

  dispose() {
    this.geometry.dispose()
    this.texture.dispose()
    this.material.dispose()
  }
}
