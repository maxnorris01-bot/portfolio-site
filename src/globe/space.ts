// The satellite view's space: the star field, and the sky backdrop layers
// behind it. Loaded with a dynamic import the first time that view opens,
// together with the star catalogue file, so neither touches the globe's
// own chunk.
//
// Everything here is at infinity: a group centred on the camera every frame
// (no parallax), turned only by the J2000-to-date rotation (fixed in the
// inertial frame, whatever the satellite or the Earth's rotation do). It's
// depth-tested against the Earth, so the Earth hides what's behind it.

import * as THREE from 'three'
import { STAR_MAX_PX, starColor, starUniforms, type Mat3, type StarCatalog } from './stars.ts'

/** Where the sky is drawn, in scene units from the camera (inside the far plane, beyond the Earth from GEO). */
export const SKY_RADIUS = 15

/** What a sky layer is given each frame. */
export interface SkyContext {
  camera: THREE.PerspectiveCamera
  /** The field of view actually rendered, degrees. */
  fovDeg: number
  /** Scene axes back to J2000 (for layers whose images are in J2000 coordinates). */
  sceneToJ2000: THREE.Matrix3
  date: Date
}

/**
 * A layer drawn behind the stars (the Milky Way band now; streamed deep-sky
 * survey tiles later): an object on the sky sphere, centred on the camera
 * with the stars, drawn before them.
 */
export interface SkyBackdropLayer {
  readonly object: THREE.Object3D
  update(ctx: SkyContext): void
  dispose(): void
}

const STAR_VERTEX = /* glsl */ `
attribute float mag;
attribute vec3 color;
uniform float limitMag;
uniform float grow;
uniform float narrow;
uniform float pixelRatio;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float above = limitMag - mag;
  if (above <= 0.0) {
    // Fainter than this field of view shows: off screen, no fragments.
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  float sizePx = min(${STAR_MAX_PX.toFixed(1)}, (1.2 + 0.55 * above) * grow);
  float fadeIn = min(1.0, above / 1.5);
  vAlpha = min(1.0, (0.35 + 0.15 * above) * fadeIn) * narrow;
  vColor = color;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  // At least 1.5 device pixels, so faint stars don't shimmer in and out.
  gl_PointSize = max(1.5, sizePx * pixelRatio);
}
`

const STAR_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  // A soft round point: a Gaussian profile, crisp at any size.
  vec2 c = gl_PointCoord - 0.5;
  float a = exp(-dot(c, c) * 18.0);
  gl_FragColor = vec4(vColor, vAlpha * a);
  #include <colorspace_fragment>
}
`

/** The star field: one point per catalogue star, sized and faded by the field of view. */
export class StarField {
  readonly points: THREE.Points
  private readonly unitJ2000: Float32Array
  private readonly geometry: THREE.BufferGeometry
  private readonly material: THREE.ShaderMaterial
  private readonly catalogLimit: number

  constructor(catalog: StarCatalog, pixelRatio: number) {
    this.unitJ2000 = catalog.dirJ2000
    this.catalogLimit = catalog.count ? catalog.mag[catalog.count - 1] : 12
    const colors = new Float32Array(catalog.count * 3)
    for (let i = 0; i < catalog.count; i++) colors.set(starColor(catalog.bv[i]), i * 3)
    this.geometry = new THREE.BufferGeometry()
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(catalog.count * 3), 3))
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    this.geometry.setAttribute('mag', new THREE.BufferAttribute(catalog.mag, 1))
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        limitMag: { value: 6.5 },
        grow: { value: 1 },
        narrow: { value: 1 },
        pixelRatio: { value: pixelRatio },
      },
      vertexShader: STAR_VERTEX,
      fragmentShader: STAR_FRAGMENT,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    })
    this.points = new THREE.Points(this.geometry, this.material)
    this.points.frustumCulled = false
    this.points.renderOrder = -1
  }

  /** Turn the stars to the date (J2000 to true equator of date, row-major) and into scene axes. */
  setRotation(j2000ToDate: Mat3) {
    const m = j2000ToDate
    const d = this.unitJ2000
    const pos = this.geometry.getAttribute('position') as THREE.BufferAttribute
    const out = pos.array as Float32Array
    for (let i = 0; i < d.length; i += 3) {
      const x = m[0] * d[i] + m[1] * d[i + 1] + m[2] * d[i + 2]
      const y = m[3] * d[i] + m[4] * d[i + 1] + m[5] * d[i + 2]
      const z = m[6] * d[i] + m[7] * d[i + 1] + m[8] * d[i + 2]
      // Scene axes (x, z, -y), on the sky sphere.
      out[i] = x * SKY_RADIUS
      out[i + 1] = z * SKY_RADIUS
      out[i + 2] = -y * SKY_RADIUS
    }
    pos.needsUpdate = true
  }

  update(fovDeg: number) {
    const u = starUniforms(fovDeg, this.catalogLimit)
    this.material.uniforms.limitMag.value = u.limitMag
    this.material.uniforms.grow.value = u.grow
    this.material.uniforms.narrow.value = u.narrow
  }

  dispose() {
    this.geometry.dispose()
    this.material.dispose()
  }
}

/** Quality by device: phones keep the stars down to magnitude 8 (about 42,000), desktops all of them. */
export const STAR_TIERS = { phone: { maxMag: 8 }, desktop: { maxMag: Infinity } } as const

/** The sky around the satellite view: backdrop layers, then the stars, all at infinity. */
export class SpaceView {
  readonly group = new THREE.Group()
  private stars: StarField | null = null
  private readonly backdrops: SkyBackdropLayer[] = []
  private readonly sceneToJ2000 = new THREE.Matrix3()
  private rotationFor = ''

  constructor(scene: THREE.Scene) {
    this.group.visible = false
    scene.add(this.group)
  }

  setStars(field: StarField) {
    this.stars?.dispose()
    if (this.stars) this.group.remove(this.stars.points)
    this.stars = field
    this.group.add(field.points)
    this.rotationFor = ''
  }

  /** Add a layer behind the stars (the Milky Way; later, deep-sky tiles). */
  addBackdrop(layer: SkyBackdropLayer) {
    this.backdrops.push(layer)
    this.group.add(layer.object)
  }

  get hasStars() {
    return this.stars !== null
  }

  get backdropCount() {
    return this.backdrops.length
  }

  /**
   * Re-turn the sky for `date` when the day changes (precession moves the
   * stars about 0.01 degrees a year, so once a day is plenty).
   */
  setDate(date: Date, j2000ToDate: (d: Date) => Mat3) {
    const day = date.toISOString().slice(0, 10)
    if (day === this.rotationFor) return
    this.rotationFor = day
    const m = j2000ToDate(date)
    this.stars?.setRotation(m)
    // Scene (x, z, -y of date) back to J2000: transpose the rotation, after undoing the axis map.
    const toDate = new THREE.Matrix3().set(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8])
    const sceneToDate = new THREE.Matrix3().set(1, 0, 0, 0, 0, -1, 0, 1, 0)
    this.sceneToJ2000.copy(toDate.transpose()).multiply(sceneToDate)
  }

  /** Each satellite-view frame: follow the camera, size the stars for the field of view. */
  update(camera: THREE.PerspectiveCamera, fovDeg: number, date: Date) {
    this.group.visible = true
    this.group.position.copy(camera.position)
    this.stars?.update(fovDeg)
    const ctx: SkyContext = { camera, fovDeg, sceneToJ2000: this.sceneToJ2000, date }
    for (const b of this.backdrops) b.update(ctx)
  }

  hide() {
    this.group.visible = false
  }

  dispose() {
    this.stars?.dispose()
    for (const b of this.backdrops) b.dispose()
    this.group.removeFromParent()
  }
}

/** Fetch and read the star catalogue file (lazily, when the satellite view first opens). */
export async function loadStarCatalog(url: string, maxMag: number) {
  const { readStarCatalog } = await import('./stars.ts')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`star catalogue: HTTP ${res.status}`)
  return readStarCatalog(await res.arrayBuffer(), maxMag)
}
