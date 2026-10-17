// The Milky Way's glow as a sky backdrop layer (SkyBackdropLayer in
// space.ts): a sphere behind the stars that samples the longitude-latitude
// texture built from the Gaia glow atlas (glow.ts) by J2000 direction. One
// texture read per pixel and a 48 x 24 sphere, so it is cheap on a phone.
// Dimmed as the field narrows (glowGain), since the stars drawn there
// already resolve some of the light.

import * as THREE from 'three'
import { GlowBlur, glowGain } from './glow.ts'
import { GLOW_DEFAULT } from './glowtuning.ts'
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

export class GlowLayer implements SkyBackdropLayer {
  readonly object: THREE.Mesh
  private readonly material: THREE.ShaderMaterial
  private readonly geometry: THREE.SphereGeometry
  private readonly texture: THREE.DataTexture
  private readonly raw: Uint8Array
  private readonly data: Uint8Array
  private readonly width: number
  private readonly height: number
  private job: GlowBlur | null = null
  private jobSigma = 0
  /** The blur (sigma, degrees) the texture shows now; null until the first blur is done. */
  appliedBlur: number | null = null

  /** `rgba`: the unblurred longitude-latitude map `width` by `height` (glow.ts's fillGlowRows). It is blurred in the background and shown when ready. */
  constructor(rgba: Uint8Array, width: number, height: number) {
    this.raw = rgba
    this.width = width
    this.height = height
    this.data = new Uint8Array(rgba)
    this.texture = new THREE.DataTexture(this.data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.wrapS = THREE.RepeatWrapping
    this.texture.wrapT = THREE.ClampToEdgeWrapping
    this.texture.magFilter = THREE.LinearFilter
    this.texture.minFilter = THREE.LinearFilter
    this.texture.generateMipmaps = false
    this.texture.needsUpdate = true
    this.geometry = new THREE.SphereGeometry(SKY_RADIUS * 1.05, 48, 24)
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.texture }, sceneToJ2000: { value: new THREE.Matrix3() }, gain: { value: GLOW_DEFAULT.gain }, gamma: { value: GLOW_DEFAULT.gamma }, saturation: { value: GLOW_DEFAULT.saturation } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
    })
    this.object = new THREE.Mesh(this.geometry, this.material)
    this.object.renderOrder = -2
    this.object.frustumCulled = false
    this.object.visible = false // until the first blur is done
  }

  update(ctx: SkyContext) {
    const t = ctx.glow ?? GLOW_DEFAULT
    // A changed blur rebuilds the texture a few rows a frame (the raw map is kept).
    if (!this.job && (this.appliedBlur === null || Math.abs(t.blurDeg - this.appliedBlur) > 0.01)) {
      this.jobSigma = Math.max(0, t.blurDeg)
      if (this.jobSigma < 0.02) this.finish(this.raw)
      else this.job = new GlowBlur(this.raw, this.width, this.height, this.jobSigma)
    }
    if (this.job && this.job.step(64)) {
      const out = this.job.out
      this.job = null
      this.finish(out)
    }
    const u = this.material.uniforms
    u.sceneToJ2000.value.copy(ctx.sceneToJ2000)
    // The baseline gain multiplies the narrow-field dimming and the Earth-in-view dimming.
    u.gain.value = t.gain * glowGain(ctx.fovDeg) * ctx.dim
    u.gamma.value = t.gamma
    u.saturation.value = t.saturation
  }

  private finish(data: Uint8Array) {
    this.data.set(data)
    this.texture.needsUpdate = true
    this.appliedBlur = this.jobSigma
    this.object.visible = true
  }

  dispose() {
    this.geometry.dispose()
    this.texture.dispose()
    this.material.dispose()
  }
}
