// Constellation figures and IAU boundaries drawn on the sky sphere in the
// inertial frame, with the stars: thin antialiased lines made of screen-space
// quads (a WebGL line is one device pixel wide, whatever you ask), turned by
// the same J2000-to-date rotation as the stars so they move with them.
//
// Cost: the figures are about 700 segments and the boundaries about 3,600,
// one draw call each, two triangles a segment, nothing per frame but a few
// uniforms (and the vertices again when the day changes).

import * as THREE from 'three'
import { figureCentre, easeOpacity, layerTargets, type BoundsFile, type ConstellationToggle, type ResolvedFigure } from './constellations.ts'
import { SKY_RADIUS, j2000ToScene, raDecToJ2000, type Mat3 } from './stars.ts'
import type { Vec3 } from './pov.ts'

const LINE_VERTEX = /* glsl */ `
attribute vec3 other;
attribute float side;
attribute float flip;
attribute vec2 con;
uniform vec2 viewport;
uniform float halfWidth;
uniform float gapPx;
uniform float alpha;
uniform vec3 color;
uniform float activeCon;
uniform float activeAlpha;
uniform vec3 activeColor;
varying float vAcross;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 c0 = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vec4 c1 = projectionMatrix * modelViewMatrix * vec4(other, 1.0);
  const float eps = 1e-3;
  bool lit = con.x == activeCon || con.y == activeCon;
  vAlpha = lit ? activeAlpha : alpha;
  vColor = lit ? activeColor : color;
  if ((c0.w < eps && c1.w < eps) || vAlpha <= 0.0) {
    // Behind the camera, or not drawn: off screen, no fragments.
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vAcross = 0.0;
    return;
  }
  // Clip each end to the near side of the camera (linear in clip space).
  vec4 a = c0;
  vec4 b = c1;
  if (c0.w < eps) a = mix(c0, c1, (eps - c0.w) / (c1.w - c0.w));
  if (c1.w < eps) b = mix(c1, c0, (eps - c1.w) / (c0.w - c1.w));
  vec2 p0 = a.xy / a.w * 0.5 * viewport;
  vec2 p1 = b.xy / b.w * 0.5 * viewport;
  vec2 d = p1 - p0;
  float len = length(d);
  vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  // Stop short of the star at this end (a negative gap lengthens the line a little).
  float gap = gapPx >= 0.0 ? min(gapPx, len * 0.35) : gapPx;
  float hw = halfWidth + 1.0;
  // flip is -1 at the far end, where dir points back along the segment.
  vec2 p = p0 + dir * gap + vec2(-dir.y, dir.x) * flip * side * hw;
  gl_Position = vec4(p / (0.5 * viewport) * a.w, a.z, a.w);
  vAcross = side * hw;
}
`

const LINE_FRAGMENT = /* glsl */ `
uniform float halfWidth;
varying float vAcross;
varying float vAlpha;
varying vec3 vColor;
void main() {
  // A one-device-pixel soft edge around the core width.
  float cover = clamp(halfWidth + 0.5 - abs(vAcross), 0.0, 1.0);
  gl_FragColor = vec4(vColor, vAlpha * cover);
  #include <colorspace_fragment>
}
`

interface LineStyle {
  color: THREE.Color
  activeColor: THREE.Color
  alpha: number
  activeAlpha: number
  gapCssPx: number
  widthCssPx: number
}

/** Soft, so the stars stay the brightest thing in the sky. */
const FIGURE_STYLE: LineStyle = {
  color: new THREE.Color('#7fa4d6'),
  activeColor: new THREE.Color('#cfe4ff'),
  alpha: 0.42,
  activeAlpha: 0.95,
  gapCssPx: 7,
  widthCssPx: 1.1,
}
const BOUNDARY_STYLE: LineStyle = {
  color: new THREE.Color('#b99a6e'),
  activeColor: new THREE.Color('#ffd9a0'),
  alpha: 0.26,
  activeAlpha: 0.8,
  gapCssPx: -0.6,
  widthCssPx: 0.9,
}

/** A set of line segments on the sky sphere, tied to constellation indices. */
class LineSet {
  readonly mesh: THREE.Mesh
  private readonly geometry = new THREE.BufferGeometry()
  readonly material: THREE.ShaderMaterial
  private readonly ends: Float32Array
  private readonly count: number
  private readonly style: LineStyle

  /** `ends`: J2000 unit vectors, six numbers a segment; `cons`: two constellation indices a segment (or -1). */
  constructor(ends: Float32Array, cons: Float32Array, style: LineStyle, pixelRatio: number) {
    this.style = style
    this.ends = ends
    this.count = ends.length / 6
    const n = this.count
    const position = new Float32Array(n * 12)
    const other = new Float32Array(n * 12)
    const side = new Float32Array(n * 4)
    const flip = new Float32Array(n * 4)
    const con = new Float32Array(n * 8)
    const index = new Uint32Array(n * 6)
    for (let s = 0; s < n; s++) {
      for (let k = 0; k < 4; k++) {
        const v = s * 4 + k
        side[v] = k % 2 === 0 ? -1 : 1
        flip[v] = k < 2 ? 1 : -1
        con[v * 2] = cons[s * 2]
        con[v * 2 + 1] = cons[s * 2 + 1]
      }
      const o = s * 6
      index.set([s * 4, s * 4 + 1, s * 4 + 2, s * 4 + 1, s * 4 + 3, s * 4 + 2], o)
    }
    this.geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
    this.geometry.setAttribute('other', new THREE.BufferAttribute(other, 3))
    this.geometry.setAttribute('side', new THREE.BufferAttribute(side, 1))
    this.geometry.setAttribute('flip', new THREE.BufferAttribute(flip, 1))
    this.geometry.setAttribute('con', new THREE.BufferAttribute(con, 2))
    this.geometry.setIndex(new THREE.BufferAttribute(index, 1))
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        viewport: { value: new THREE.Vector2(1, 1) },
        halfWidth: { value: (style.widthCssPx * pixelRatio) / 2 },
        gapPx: { value: style.gapCssPx * pixelRatio },
        alpha: { value: 0 },
        color: { value: style.color },
        activeCon: { value: -1 },
        activeAlpha: { value: 0 },
        activeColor: { value: style.activeColor },
      },
      vertexShader: LINE_VERTEX,
      fragmentShader: LINE_FRAGMENT,
      transparent: true,
      blending: THREE.AdditiveBlending,
      // The quads are built in screen space, so their winding is not fixed.
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: true,
    })
    this.mesh = new THREE.Mesh(this.geometry, this.material)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = -1.5
    this.mesh.visible = false
  }

  setRotation(m: Mat3) {
    const pos = this.geometry.getAttribute('position') as THREE.BufferAttribute
    const oth = this.geometry.getAttribute('other') as THREE.BufferAttribute
    const P = pos.array as Float32Array
    const O = oth.array as Float32Array
    const e = this.ends
    const turn = (i: number, out: Float32Array, at: number) => {
      const x = m[0] * e[i] + m[1] * e[i + 1] + m[2] * e[i + 2]
      const y = m[3] * e[i] + m[4] * e[i + 1] + m[5] * e[i + 2]
      const z = m[6] * e[i] + m[7] * e[i + 1] + m[8] * e[i + 2]
      out[at] = x * SKY_RADIUS
      out[at + 1] = z * SKY_RADIUS
      out[at + 2] = -y * SKY_RADIUS
    }
    for (let s = 0; s < this.count; s++) {
      for (let k = 0; k < 4; k++) {
        const v = (s * 4 + k) * 3
        const atEnd = k >= 2
        // Vertices 0,1 sit at end A (other = B); 2,3 at end B (other = A).
        turn(s * 6 + (atEnd ? 3 : 0), P, v)
        turn(s * 6 + (atEnd ? 0 : 3), O, v)
      }
    }
    pos.needsUpdate = true
    oth.needsUpdate = true
  }

  /** Opacity 0..1 for the base lines, `active` 0..1 for the highlighted constellation. */
  setLook(opacity: number, activeConstellation: number, highlight: number, viewport: THREE.Vector2) {
    const u = this.material.uniforms
    const base = this.style.alpha * opacity
    u.alpha.value = base
    u.activeCon.value = activeConstellation
    u.activeAlpha.value = base + (this.style.activeAlpha - base) * highlight
    u.viewport.value.copy(viewport)
    this.mesh.visible = base > 0.002 || (activeConstellation >= 0 && highlight > 0.002)
  }

  dispose() {
    this.geometry.dispose()
    this.material.dispose()
  }
}

export interface ConstellationLook {
  toggle: ConstellationToggle
  /** The constellation to emphasise (the selected star's, or a tapped label's), or -1. */
  active: number
  /** Show that figure even with the switch off. */
  highlight: boolean
  fovDeg: number
  /** The canvas in CSS px. */
  widthPx: number
  heightPx: number
  dtSec: number
  reducedMotion: boolean
}

/** What the layer exposes to the engine for labels. */
export interface FigureView {
  index: number
  abbr: string
  name: string
  areaSqDeg: number
  /** Centre of the figure, scene axes (a unit direction). */
  centre: Vec3
  /** Largest angle from the centre to a star of the figure, degrees. */
  extentDeg: number
}

export class ConstellationLayer {
  readonly group = new THREE.Group()
  readonly figures: ResolvedFigure[]
  readonly views: FigureView[]
  private readonly centresJ2000: Vec3[]
  private readonly lines: LineSet
  private bounds: LineSet | null = null
  private rotation: Mat3 | null = null
  private readonly viewport = new THREE.Vector2(1, 1)
  private readonly pixelRatio: number
  /** Eased opacities of each part. */
  readonly opacity = { lines: 0, names: 0, boundaries: 0, highlight: 0 }

  constructor(figures: ResolvedFigure[], starDirsJ2000: Float32Array, pixelRatio: number) {
    this.figures = figures
    this.pixelRatio = pixelRatio
    const ends: number[] = []
    const cons: number[] = []
    this.centresJ2000 = []
    const extents: number[] = []
    for (const f of figures) {
      for (let k = 0; k < f.segments.length; k += 2) {
        const a = f.segments[k]
        const b = f.segments[k + 1]
        ends.push(
          starDirsJ2000[a * 3],
          starDirsJ2000[a * 3 + 1],
          starDirsJ2000[a * 3 + 2],
          starDirsJ2000[b * 3],
          starDirsJ2000[b * 3 + 1],
          starDirsJ2000[b * 3 + 2],
        )
        cons.push(f.index, -1)
      }
      const dirs: Vec3[] = f.stars.map((i) => [starDirsJ2000[i * 3], starDirsJ2000[i * 3 + 1], starDirsJ2000[i * 3 + 2]])
      const { centre, extentDeg } = figureCentre(dirs.length ? dirs : [[1, 0, 0]])
      this.centresJ2000.push(centre)
      extents.push(extentDeg)
    }
    this.lines = new LineSet(new Float32Array(ends), new Float32Array(cons), FIGURE_STYLE, pixelRatio)
    this.group.add(this.lines.mesh)
    this.views = figures.map((f, i) => ({
      index: f.index,
      abbr: f.abbr,
      name: f.name,
      areaSqDeg: f.areaSqDeg,
      centre: [0, 0, 1],
      extentDeg: extents[i],
    }))
  }

  /** Add the IAU boundaries once their file has loaded. */
  setBounds(file: BoundsFile) {
    if (this.bounds) return
    const ends: number[] = []
    const cons: number[] = []
    const toVec = (lon: number, lat: number) => raDecToJ2000(lon * file.unit, lat * file.unit)
    for (const [c1, c2, flat] of file.chains) {
      for (let k = 0; k + 3 < flat.length; k += 2) {
        const a = toVec(flat[k], flat[k + 1])
        const b = toVec(flat[k + 2], flat[k + 3])
        ends.push(a[0], a[1], a[2], b[0], b[1], b[2])
        cons.push(c1, c2)
      }
    }
    this.bounds = new LineSet(new Float32Array(ends), new Float32Array(cons), BOUNDARY_STYLE, this.pixelRatio)
    this.group.add(this.bounds.mesh)
    if (this.rotation) this.bounds.setRotation(this.rotation)
  }

  get hasBounds() {
    return this.bounds !== null
  }

  /** Turn to the date (J2000 to true equator of date, row-major): the same rotation the stars get. */
  setRotation(m: Mat3) {
    this.rotation = m
    this.lines.setRotation(m)
    this.bounds?.setRotation(m)
    for (let i = 0; i < this.views.length; i++) this.views[i].centre = j2000ToScene(this.centresJ2000[i], m)
  }

  /** Each frame: ease the opacities toward the toggle and set the lines' look. */
  update(look: ConstellationLook) {
    const t = layerTargets(look.toggle, look.highlight && look.active >= 0)
    const o = this.opacity
    o.lines = easeOpacity(o.lines, t.lines, look.dtSec, look.reducedMotion)
    o.names = easeOpacity(o.names, t.names, look.dtSec, look.reducedMotion)
    o.boundaries = easeOpacity(o.boundaries, t.boundaries, look.dtSec, look.reducedMotion)
    o.highlight = easeOpacity(o.highlight, t.highlight, look.dtSec, look.reducedMotion)
    this.viewport.set(look.widthPx * this.pixelRatio, look.heightPx * this.pixelRatio)
    this.lines.setLook(o.lines, look.active, o.highlight, this.viewport)
    // The boundary is emphasised only while boundaries are shown at all.
    this.bounds?.setLook(o.boundaries, look.active, o.highlight * o.boundaries, this.viewport)
  }

  /** Anything still fading or showing (so the engine can skip label work when nothing is). */
  get active(): boolean {
    const o = this.opacity
    return o.lines > 0.002 || o.names > 0.002 || o.boundaries > 0.002 || o.highlight > 0.002
  }

  dispose() {
    this.lines.dispose()
    this.bounds?.dispose()
    this.group.removeFromParent()
  }
}
