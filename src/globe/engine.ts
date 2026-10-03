import * as THREE from 'three'
import { TrackballControls } from 'three/addons/controls/TrackballControls.js'
import { gstime, propagate, twoline2satrec, type SatRec } from 'satellite.js'
import { earthRotationY, writeInertial } from './frames'
import type { CatalogObject } from './types'

// Each object is re-propagated every SLICE frames, not every frame. The
// 2026-10-03 frame-time spike showed every-object-every-frame fails at 4-6x
// CPU throttling, while slice=10 holds ~50-60 fps (~0.17 s, ~1.3 km of LEO
// motion between refreshes, invisible at globe scale).
const SLICE = 10

const DEFAULT_CAMERA = new THREE.Vector3(0, 1.6, 5.6)
const POINT_PX = 2.2
const HIGHLIGHT_PX = 26
const CAMERA_ANIM_MS = 1400

export type Clock =
  | { kind: 'live' }
  | { kind: 'offset'; offsetMs: number }
  | { kind: 'frozen'; atMs: number }

function dotTexture(ring: boolean): THREE.CanvasTexture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
  const c = size / 2
  if (ring) {
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.arc(c, c, c - 6, 0, Math.PI * 2)
    ctx.stroke()
  } else {
    // A dark rim keeps points readable over the ocean texture; vertex colour
    // multiplies the white centre and leaves the rim dark.
    ctx.fillStyle = '#05070d'
    ctx.beginPath()
    ctx.arc(c, c, c - 1, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(c, c, c * 0.68, 0, Math.PI * 2)
    ctx.fill()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

export class GlobeEngine {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly controls: TrackballControls
  private readonly earth: THREE.Mesh
  private readonly geometry = new THREE.BufferGeometry()
  private readonly pointsMaterial: THREE.PointsMaterial
  private readonly highlightGeometry = new THREE.BufferGeometry()
  private readonly highlight: THREE.Points
  private readonly resizeObserver: ResizeObserver

  private positions = new Float32Array(0)
  private satrecs: (SatRec | null)[] = []
  private indexById = new Map<number, number>()
  private clock: Clock = { kind: 'live' }
  private sliceIndex = 0
  private fullPending = true
  private focusIdx: [number, number] | null = null
  private camAnim: {
    start: number
    fromPos: THREE.Vector3
    toPos: THREE.Vector3
    fromTarget: THREE.Vector3
    toTarget: THREE.Vector3
  } | null = null
  private camAnimDone?: () => void
  private raf = 0
  private disposed = false
  private readonly container: HTMLElement
  private readonly onTick?: (simMs: number) => void

  constructor(container: HTMLElement, textureUrl: string, onTick?: (simMs: number) => void) {
    this.container = container
    this.onTick = onTick
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(0x05070d)
    container.appendChild(this.renderer.domElement)

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.005, 200)
    this.camera.position.copy(DEFAULT_CAMERA)
    this.controls = new TrackballControls(this.camera, this.renderer.domElement)
    this.controls.rotateSpeed = 2.2
    this.controls.zoomSpeed = 1.1
    this.controls.panSpeed = 0.5
    this.controls.dynamicDampingFactor = 0.15
    this.resetLimits()

    const texture = new THREE.TextureLoader().load(textureUrl)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
    this.earth = new THREE.Mesh(
      new THREE.SphereGeometry(1, 96, 64),
      // Slightly dimmed so the points read above the surface.
      new THREE.MeshBasicMaterial({ map: texture, color: 0xc4c4c4 }),
    )
    this.scene.add(this.earth)

    const pr = this.renderer.getPixelRatio()
    this.pointsMaterial = new THREE.PointsMaterial({
      size: POINT_PX * pr,
      sizeAttenuation: false,
      vertexColors: true,
      map: dotTexture(false),
      alphaTest: 0.5,
    })
    this.scene.add(new THREE.Points(this.geometry, this.pointsMaterial))

    this.highlightGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(6), 3).setUsage(THREE.DynamicDrawUsage),
    )
    this.highlight = new THREE.Points(
      this.highlightGeometry,
      new THREE.PointsMaterial({
        size: HIGHLIGHT_PX * pr,
        sizeAttenuation: false,
        map: dotTexture(true),
        transparent: true,
        depthTest: false,
        color: 0xffffff,
      }),
    )
    this.highlight.renderOrder = 1
    this.highlight.visible = false
    this.scene.add(this.highlight)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()
    this.raf = requestAnimationFrame(this.frame)
  }

  /** Replace the catalog. Points stay hidden until the first full propagation. */
  setCatalog(objects: CatalogObject[]) {
    this.satrecs = objects.map((o) => {
      const rec = twoline2satrec(o.tle_line1, o.tle_line2)
      return rec.error ? null : rec
    })
    this.indexById = new Map(objects.map((o, i) => [o.norad_id, i]))
    this.positions = new Float32Array(objects.length * 3)
    const attr = new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage)
    this.geometry.setAttribute('position', attr)
    this.geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(objects.length * 3).fill(1), 3),
    )
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1000)
    this.fullPending = true
    if (this.focusIdx) this.highlight.visible = false
    this.focusIdx = null
  }

  /** Recolor in place: one rgb triple per catalog object. No re-propagation. */
  setColors(rgb: Float32Array) {
    const attr = this.geometry.getAttribute('color') as THREE.BufferAttribute | undefined
    if (!attr || attr.array.length !== rgb.length) return
    ;(attr.array as Float32Array).set(rgb)
    attr.needsUpdate = true
  }

  /**
   * Change what time is displayed. `immediate` re-propagates every object on
   * the next frame (one heavier frame) instead of letting slices catch up over
   * ~10 frames; used for discrete jumps, not while dragging the slider.
   */
  setClock(clock: Clock, immediate = false) {
    this.clock = clock
    if (immediate) this.fullPending = true
  }

  simTimeMs(): number {
    const c = this.clock
    if (c.kind === 'frozen') return c.atMs
    return Date.now() + (c.kind === 'offset' ? c.offsetMs : 0)
  }

  /**
   * Freeze time at a conjunction's TCA, ring both objects and fly the camera
   * to them. Returns false if either object isn't in the loaded catalog.
   */
  focusPair(aId: number, bId: number, tcaMs: number): boolean {
    const a = this.indexById.get(aId)
    const b = this.indexById.get(bId)
    if (a === undefined || b === undefined || !this.satrecs[a] || !this.satrecs[b]) return false
    this.focusIdx = [a, b]
    this.setClock({ kind: 'frozen', atMs: tcaMs }, true)

    const date = new Date(tcaMs)
    const pa = this.positionOf(a, date)
    const pb = this.positionOf(b, date)
    if (!pa || !pb) return false
    const mid = pa.add(pb).multiplyScalar(0.5)
    this.updateHighlight(date)
    this.highlight.visible = true
    this.controls.minDistance = 0.02
    // Look down at the pair from just outside it, with Earth behind.
    this.animateCamera(mid.clone().add(mid.clone().normalize().multiplyScalar(0.9)), mid)
    return true
  }

  /** Back to the free-roam view of the whole globe. The caller sets the clock. */
  resetView() {
    this.focusIdx = null
    this.highlight.visible = false
    this.animateCamera(DEFAULT_CAMERA.clone(), new THREE.Vector3(), () => {
      this.resetLimits()
      this.camera.up.set(0, 1, 0)
    })
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.resizeObserver.disconnect()
    this.controls.dispose()
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
        obj.geometry.dispose()
        const m = obj.material as THREE.MeshBasicMaterial | THREE.PointsMaterial
        m.map?.dispose()
        m.dispose()
      }
    })
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  private resetLimits() {
    this.controls.minDistance = 1.15
    this.controls.maxDistance = 30
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.container
    if (!w || !h) return
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.controls.handleResize()
  }

  private positionOf(i: number, date: Date): THREE.Vector3 | null {
    const rec = this.satrecs[i]
    const pv = rec && propagate(rec, date)
    if (!pv) return null
    const tmp = new Float32Array(3)
    writeInertial(tmp, 0, pv.position.x, pv.position.y, pv.position.z)
    return new THREE.Vector3(tmp[0], tmp[1], tmp[2])
  }

  private propagateRange(from: number, to: number, date: Date) {
    const pos = this.positions
    for (let i = from; i < to; i++) {
      const rec = this.satrecs[i]
      const pv = rec && propagate(rec, date)
      if (pv) writeInertial(pos, i, pv.position.x, pv.position.y, pv.position.z)
      else pos[i * 3] = pos[i * 3 + 1] = pos[i * 3 + 2] = 0 // hidden inside Earth
    }
  }

  private updateHighlight(date: Date) {
    if (!this.focusIdx) return
    const attr = this.highlightGeometry.getAttribute('position') as THREE.BufferAttribute
    const arr = attr.array as Float32Array
    this.focusIdx.forEach((idx, k) => {
      const rec = this.satrecs[idx]
      const pv = rec && propagate(rec, date)
      if (pv) writeInertial(arr, k, pv.position.x, pv.position.y, pv.position.z)
    })
    attr.needsUpdate = true
  }

  private animateCamera(toPos: THREE.Vector3, toTarget: THREE.Vector3, done?: () => void) {
    this.camAnim = {
      start: performance.now(),
      fromPos: this.camera.position.clone(),
      toPos,
      fromTarget: this.controls.target.clone(),
      toTarget,
    }
    this.camAnimDone = done
    this.controls.enabled = false
  }

  private stepCamera(now: number) {
    const a = this.camAnim
    if (!a) return
    const t = Math.min(1, (now - a.start) / CAMERA_ANIM_MS)
    const k = easeInOut(t)
    this.camera.position.lerpVectors(a.fromPos, a.toPos, k)
    this.controls.target.lerpVectors(a.fromTarget, a.toTarget, k)
    if (t === 1) {
      this.camAnim = null
      this.controls.enabled = true
      this.camAnimDone?.()
      this.camAnimDone = undefined
    }
  }

  private frame = (now: number) => {
    if (this.disposed) return
    const simMs = this.simTimeMs()
    const date = new Date(simMs)
    this.earth.rotation.y = earthRotationY(gstime(date))

    const n = this.satrecs.length
    if (n) {
      if (this.fullPending) {
        this.propagateRange(0, n, date)
        this.fullPending = false
      } else {
        const from = Math.floor((this.sliceIndex * n) / SLICE)
        const to = Math.floor(((this.sliceIndex + 1) * n) / SLICE)
        this.propagateRange(from, to, date)
      }
      this.sliceIndex = (this.sliceIndex + 1) % SLICE
      ;(this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
      this.updateHighlight(date)
    }

    this.stepCamera(now)
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
    this.onTick?.(simMs)
    this.raf = requestAnimationFrame(this.frame)
  }
}
