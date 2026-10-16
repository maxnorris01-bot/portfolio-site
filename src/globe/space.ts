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
import { SKY_BODIES, markerSizePx } from './skybodies.ts'
import { bodyPixels, type SpaceBodyView } from './spacebodies.ts'
import { SKY_RADIUS, STAR_MAX_PX, j2000ToScene, pickStarScored, starColor, starUniforms, type Mat3, type StarCatalog } from './stars.ts'

export { SKY_RADIUS }

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
 * A layer drawn behind the stars (the Gaia glow now; streamed deep-sky
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

/** The point-sprite material every star layer shares (Hipparcos and the streamed Gaia stars), so they size and fade identically. */
export function createStarMaterial(pixelRatio: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
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
}

/** The star field: one point per catalogue star, sized and faded by the field of view. */
export class StarField {
  readonly points: THREE.Points
  private readonly unitJ2000: Float32Array
  private readonly geometry: THREE.BufferGeometry
  private readonly material: THREE.ShaderMaterial
  private catalogLimit: number
  private readonly mags: Float32Array
  readonly count: number
  /** The catalogue behind the field (positions in J2000, magnitudes, colours). */
  readonly catalog: StarCatalog

  constructor(catalog: StarCatalog, pixelRatio: number) {
    this.unitJ2000 = catalog.dirJ2000
    this.mags = catalog.mag
    this.count = catalog.count
    this.catalog = catalog
    this.catalogLimit = catalog.count ? catalog.mag[catalog.count - 1] : 12
    const colors = new Float32Array(catalog.count * 3)
    for (let i = 0; i < catalog.count; i++) colors.set(starColor(catalog.bv[i]), i * 3)
    this.geometry = new THREE.BufferGeometry()
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(catalog.count * 3), 3))
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    this.geometry.setAttribute('mag', new THREE.BufferAttribute(catalog.mag, 1))
    this.material = createStarMaterial(pixelRatio)
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

  /** The unit direction of star `i` in scene axes (the same turn the sprites have). */
  direction(i: number): [number, number, number] {
    const a = (this.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array
    return [a[i * 3] / SKY_RADIUS, a[i * 3 + 1] / SKY_RADIUS, a[i * 3 + 2] / SKY_RADIUS]
  }

  /** The star a click or tap at this ray selects (catalogue index, or -1) and its score: see pickStarScored. */
  pickScored(ray: [number, number, number], fovDeg: number, screenPx: number, radiusPx: number): { index: number; score: number } {
    const a = (this.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array
    return pickStarScored(a, this.mags, this.count, ray, fovDeg, screenPx, radiusPx, SKY_RADIUS)
  }

  /** The star a click or tap at this ray selects (catalogue index, or -1). */
  pick(ray: [number, number, number], fovDeg: number, screenPx: number, radiusPx: number): number {
    return this.pickScored(ray, fovDeg, screenPx, radiusPx).index
  }

  /** The shared material (the streamed stars use the same one). */
  get starMaterial(): THREE.ShaderMaterial {
    return this.material
  }

  /** The faintest magnitude the limiting-magnitude rule may reach (it ends at the catalogue's own, until more stars stream in). */
  setCatalogLimit(mag: number) {
    this.catalogLimit = Math.max(this.catalogLimit, mag)
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

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, c: number) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  draw(canvas.getContext('2d')!, size / 2)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return { canvas, tex }
}

/** A body's position and size on screen, CSS px from the canvas's top left, for labels and picking. */
export interface ScreenBody {
  key: string
  x: number
  y: number
  r: number
  /** In front of the camera, on screen, and not behind the Earth. */
  visible: boolean
}

/**
 * The Sun, Moon and planets as sprites on the sky sphere, at their true
 * direction from the satellite. Sized to the true angular size where that's
 * larger than a readable minimum (the Moon fills the view at a fraction of a
 * degree), so a planet is a point and zooming in grows the discs.
 */
export class SpaceBodies {
  readonly group = new THREE.Group()
  private readonly sprites = new Map<string, { sprite: THREE.Sprite; glare?: THREE.Sprite }>()
  private readonly moon = canvasTexture(256, () => {})
  private moonK = -1
  private views: SpaceBodyView[] = []
  private readonly textures: THREE.Texture[] = []

  constructor() {
    const disc = canvasTexture(64, (ctx, c) => {
      ctx.fillStyle = '#05070d' // a dark rim, like the satellite points
      ctx.beginPath()
      ctx.arc(c, c, c - 1, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(c, c, c - 6, 0, Math.PI * 2)
      ctx.fill()
    })
    const sun = canvasTexture(128, (ctx, c) => {
      const g = ctx.createRadialGradient(c, c, 0, c, c, c)
      g.addColorStop(0, 'rgba(255,255,255,1)')
      g.addColorStop(0.2, 'rgba(255,255,255,1)')
      g.addColorStop(0.22, 'rgba(255,250,235,0.9)')
      g.addColorStop(0.5, 'rgba(255,240,200,0.18)')
      g.addColorStop(1, 'rgba(255,240,200,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, c * 2, c * 2)
    })
    this.textures.push(disc.tex, sun.tex, this.moon.tex)
    for (const def of SKY_BODIES) {
      const map = def.key === 'moon' ? this.moon.tex : def.key === 'sun' ? sun.tex : disc.tex
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map,
          color: def.color,
          transparent: true,
          depthTest: true,
          depthWrite: false,
          sizeAttenuation: true,
        }),
      )
      sprite.renderOrder = 5
      sprite.frustumCulled = false
      sprite.visible = false
      this.group.add(sprite)
      this.sprites.set(def.key, { sprite })
    }
    // The Sun's glare: a larger, additive halo behind its disc.
    const glare = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: sun.tex,
        color: '#fff1c4',
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthTest: true,
        depthWrite: false,
      }),
    )
    glare.renderOrder = 4
    glare.frustumCulled = false
    glare.visible = false
    this.group.add(glare)
    this.sprites.get('sun')!.glare = glare
  }

  set(views: SpaceBodyView[]) {
    this.views = views
  }

  get current(): readonly SpaceBodyView[] {
    return this.views
  }

  // The Moon's disc with the lit limb toward +x (the sprite is rotated to
  // the real limb direction); a faint unlit part so a crescent reads as a disc.
  private drawMoon(k: number) {
    const ctx = this.moon.canvas.getContext('2d')!
    const c = this.moon.canvas.width / 2
    const r = c - 8
    ctx.clearRect(0, 0, c * 2, c * 2)
    ctx.save()
    ctx.translate(c, c)
    ctx.fillStyle = '#05070d'
    ctx.beginPath()
    ctx.arc(0, 0, r + 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#4a505c'
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false)
    const rx = Math.max(r * Math.abs(1 - 2 * k), 0.01)
    if (k < 0.5) ctx.ellipse(0, 0, rx, r, 0, Math.PI / 2, -Math.PI / 2, true)
    else ctx.ellipse(0, 0, rx, r, 0, Math.PI / 2, (3 * Math.PI) / 2, false)
    ctx.fill()
    ctx.restore()
    this.moon.tex.needsUpdate = true
  }

  /**
   * Place and size every sprite for this frame and report where each is on
   * screen. `cameraPos` is the camera's world position (the group follows
   * it), `widthPx`/`heightPx` the canvas in CSS px.
   */
  layout(camera: THREE.PerspectiveCamera, fovDeg: number, widthPx: number, heightPx: number): ScreenBody[] {
    const out: ScreenBody[] = []
    const eye = camera.position
    const eyeLen = eye.length()
    const worldPerPx = (2 * SKY_RADIUS * Math.tan((fovDeg * Math.PI) / 360)) / heightPx
    const v = new THREE.Vector3()
    for (const view of this.views) {
      const entry = this.sprites.get(view.key)
      if (!entry) continue
      const def = SKY_BODIES.find((d) => d.key === view.key)!
      const dir = new THREE.Vector3(...view.dir)
      const px =
        view.key === 'sun'
          ? bodyPixels(view.angDiameterDeg, fovDeg, heightPx, 26)
          : view.key === 'moon'
            ? bodyPixels(view.angDiameterDeg, fovDeg, heightPx, 24)
            : markerSizePx('planet', view.mag)
      entry.sprite.position.copy(dir).multiplyScalar(SKY_RADIUS * 0.97)
      entry.sprite.scale.setScalar(px * worldPerPx)
      entry.sprite.visible = true
      if (entry.glare) {
        entry.glare.position.copy(entry.sprite.position)
        // A halo about 6 sun-diameters across, never under 90 px, fading out by the disc's edge as you zoom in.
        entry.glare.scale.setScalar(Math.max(90, px * 6) * worldPerPx)
        entry.glare.visible = true
        ;(entry.glare.material as THREE.SpriteMaterial).opacity = Math.min(1, Math.max(0.35, 90 / Math.max(90, px * 2)))
      }
      if (view.key === 'moon' && view.illuminated !== undefined) {
        if (Math.abs(view.illuminated - this.moonK) > 0.003) {
          this.moonK = view.illuminated
          this.drawMoon(view.illuminated)
        }
        if (view.limb) {
          // Turn the +x limb to the Sun's side as it appears on screen.
          const a = v.copy(dir).multiplyScalar(SKY_RADIUS).add(eye).project(camera)
          const b = new THREE.Vector3(...view.limb).multiplyScalar(0.02 * SKY_RADIUS)
          const c = b.add(new THREE.Vector3(...view.dir).multiplyScalar(SKY_RADIUS)).add(eye).project(camera)
          ;(entry.sprite.material as THREE.SpriteMaterial).rotation = Math.atan2(c.y - a.y, (c.x - a.x) * camera.aspect)
        }
      }
      // Where it is on screen, and whether the Earth hides it from this camera.
      const p = v.copy(dir).multiplyScalar(SKY_RADIUS).add(eye).project(camera)
      let hidden = false
      if (eyeLen > 1) {
        // The ray from the camera along `dir` meets the unit Earth sphere?
        const b = eye.x * dir.x + eye.y * dir.y + eye.z * dir.z
        const c = eyeLen * eyeLen - 1
        hidden = b * b - c >= 0 && -b - Math.sqrt(b * b - c) > 0
      }
      const onScreen = p.z < 1 && Math.abs(p.x) <= 1.1 && Math.abs(p.y) <= 1.1
      entry.sprite.visible = !hidden
      if (entry.glare) entry.glare.visible = !hidden
      out.push({
        key: view.key,
        x: ((p.x + 1) / 2) * widthPx,
        y: ((1 - p.y) / 2) * heightPx,
        r: px / 2,
        visible: onScreen && !hidden,
      })
      void def
    }
    return out
  }

  hide() {
    for (const e of this.sprites.values()) {
      e.sprite.visible = false
      if (e.glare) e.glare.visible = false
    }
  }

  dispose() {
    for (const e of this.sprites.values()) {
      ;(e.sprite.material as THREE.Material).dispose()
      if (e.glare) (e.glare.material as THREE.Material).dispose()
    }
    for (const t of this.textures) t.dispose()
  }
}

// ---- Atmosphere glow: a thin blue ring along the Earth's limb. ----

const GLOW_RADIUS = 1.03 // about 190 km: the glow is gone well inside it

const GLOW_VERTEX = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`

const GLOW_FRAGMENT = /* glsl */ `
uniform vec3 camPos;
uniform vec3 sunDir;
uniform float strength;
varying vec3 vWorld;
void main() {
  vec3 o = camPos;
  vec3 d = normalize(vWorld - o);
  // The ray's closest approach to the Earth's centre: its impact parameter
  // (in Earth radii) and the point of the limb it grazes.
  float t = -dot(o, d);
  vec3 p = o + d * t;
  float b = length(p);
  // A thin exponential layer of air above the surface: strongest right at the limb.
  float h = max(b - 1.0, 0.0);
  float air = exp(-h / 0.0065);
  // Lit by the Sun where the limb faces it; thin and faint on the night side.
  float lit = dot(p / max(b, 1e-4), sunDir);
  float day = mix(0.07, 1.0, smoothstep(-0.2, 0.35, lit));
  // A touch warmer toward the terminator.
  vec3 blue = vec3(0.30, 0.58, 1.0);
  vec3 warm = vec3(1.0, 0.62, 0.38);
  vec3 col = mix(blue, warm, 0.35 * (1.0 - smoothstep(-0.05, 0.3, abs(lit))) * step(-0.3, lit));
  float a = air * day * strength * 0.9;
  gl_FragColor = vec4(col * a, a);
}
`

/** A cheap limb glow: a back-face shell, shaded by the ray's grazing height above the surface and the sun angle. */
export class AtmosphereGlow {
  readonly mesh: THREE.Mesh
  private readonly material: THREE.ShaderMaterial

  constructor() {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        camPos: { value: new THREE.Vector3() },
        sunDir: { value: new THREE.Vector3(1, 0, 0) },
        strength: { value: 1 },
      },
      vertexShader: GLOW_VERTEX,
      fragmentShader: GLOW_FRAGMENT,
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    })
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(GLOW_RADIUS, 96, 48), this.material)
    this.mesh.renderOrder = 3
    this.mesh.frustumCulled = false
    this.mesh.visible = false
  }

  /** `camera` and `sunDir` in the scene's frame (the Earth at the origin, radii). */
  update(camera: THREE.Vector3, sunDir: THREE.Vector3) {
    const r = camera.length()
    // Inside the shell (a held view near the ground) there's no limb to glow.
    this.material.uniforms.strength.value = Math.min(1, Math.max(0, (r - GLOW_RADIUS) / 0.03))
    this.material.uniforms.camPos.value.copy(camera)
    this.material.uniforms.sunDir.value.copy(sunDir)
    this.mesh.visible = this.material.uniforms.strength.value > 0
  }

  hide() {
    this.mesh.visible = false
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.material.dispose()
  }
}

/**
 * Quality by device. Both keep every Hipparcos star: the Gaia tiles leave out
 * the Hipparcos stars they match, so a Hipparcos star not loaded would be a
 * hole in the sky. The streamed Gaia stars differ: stars drawn per view
 * (the budget), decoded stars kept in the cache, and requests in flight.
 */
export const STAR_TIERS = {
  phone: { maxMag: Infinity, gaiaBudget: 300_000, gaiaCache: 900_000, concurrency: 3 },
  desktop: { maxMag: Infinity, gaiaBudget: 1_500_000, gaiaCache: 3_000_000, concurrency: 6 },
} as const

/** A layer fixed in the inertial frame like the stars: turned with them when the day changes. */
export interface SkyRotatingLayer {
  readonly group: THREE.Object3D
  setRotation(m: Mat3): void
  dispose(): void
}

/** The sky around the satellite view: backdrop layers, then the stars, all at infinity. */
export class SpaceView {
  readonly group = new THREE.Group()
  private starField: StarField | null = null
  private readonly rotating: SkyRotatingLayer[] = []
  private lastRotation: Mat3 | null = null
  readonly bodies = new SpaceBodies()
  readonly glow = new AtmosphereGlow()
  private readonly backdrops: SkyBackdropLayer[] = []
  private readonly sceneToJ2000 = new THREE.Matrix3()
  private rotationFor = ''

  constructor(scene: THREE.Scene) {
    this.group.visible = false
    this.group.add(this.bodies.group)
    scene.add(this.group)
    scene.add(this.glow.mesh)
  }

  setStars(field: StarField) {
    this.starField?.dispose()
    if (this.starField) this.group.remove(this.starField.points)
    this.starField = field
    this.group.add(field.points)
    this.rotationFor = ''
  }

  /** Add a layer behind the stars (the Gaia glow; later, deep-sky tiles). */
  addBackdrop(layer: SkyBackdropLayer) {
    this.backdrops.push(layer)
    this.group.add(layer.object)
  }

  /** Add a layer drawn over the stars that turns with them (constellation figures and boundaries). */
  addRotating(layer: SkyRotatingLayer) {
    this.rotating.push(layer)
    this.group.add(layer.group)
    if (this.lastRotation) layer.setRotation(this.lastRotation)
  }

  /** A J2000 unit vector in scene axes, as the sky is turned now (null before the first date is set). */
  j2000ToSceneDir(v: readonly [number, number, number]): [number, number, number] | null {
    return this.lastRotation ? j2000ToScene([v[0], v[1], v[2]], this.lastRotation) : null
  }

  /** A scene-axes direction as a J2000 unit vector (the inverse of how the stars are turned). */
  sceneToJ2000Dir(v: readonly [number, number, number]): [number, number, number] {
    const e = new THREE.Vector3(v[0], v[1], v[2]).applyMatrix3(this.sceneToJ2000)
    return [e.x, e.y, e.z]
  }

  /** The star field once the catalogue has loaded. */
  get stars(): StarField | null {
    return this.starField
  }

  get hasStars() {
    return this.starField !== null
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
    this.lastRotation = m
    this.starField?.setRotation(m)
    for (const l of this.rotating) l.setRotation(m)
    // Scene (x, z, -y of date) back to J2000: transpose the rotation, after undoing the axis map.
    const toDate = new THREE.Matrix3().set(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8])
    const sceneToDate = new THREE.Matrix3().set(1, 0, 0, 0, 0, -1, 0, 1, 0)
    this.sceneToJ2000.copy(toDate.transpose()).multiply(sceneToDate)
  }

  /** Each satellite-view frame: follow the camera, size the stars for the field of view. */
  update(camera: THREE.PerspectiveCamera, fovDeg: number, date: Date) {
    this.group.visible = true
    this.group.position.copy(camera.position)
    this.starField?.update(fovDeg)
    const ctx: SkyContext = { camera, fovDeg, sceneToJ2000: this.sceneToJ2000, date }
    for (const b of this.backdrops) b.update(ctx)
  }

  hide() {
    this.group.visible = false
    this.bodies.hide()
    this.glow.hide()
  }

  dispose() {
    this.starField?.dispose()
    this.bodies.dispose()
    this.glow.mesh.removeFromParent()
    this.glow.dispose()
    for (const b of this.backdrops) b.dispose()
    for (const l of this.rotating) l.dispose()
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
