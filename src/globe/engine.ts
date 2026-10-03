import * as THREE from 'three'
import { TrackballControls } from 'three/addons/controls/TrackballControls.js'
import {
  degreesLat,
  degreesLong,
  eciToGeodetic,
  gstime,
  propagate,
  twoline2satrec,
  type SatRec,
} from 'satellite.js'
import { liveClock, simTimeAt, type Clock } from './clock'
import { earthRotationY, writeInertial } from './frames'
import { nearestTo } from './neighbors'
import { pickNearest } from './picking'
import type { CatalogObject } from './types'

// Each object is re-propagated every SLICE frames, not every frame. The
// 2026-10-03 frame-time spike showed every-object-every-frame fails at 4-6x
// CPU throttling, while slice=10 holds ~50-60 fps (~0.17 s, ~1.3 km of LEO
// motion between refreshes, invisible at globe scale).
const SLICE = 10

const DEFAULT_CAMERA = new THREE.Vector3(0, 1.6, 5.6)
const POINT_PX = 2.2
const CAMERA_ANIM_MS = 1400
// Replay lets the camera get within ~2 km of the pair, close enough for a
// multi-km miss line to be visible. Sub-100 m misses stay sub-pixel at any
// sensible zoom; the distance label carries those.
const FOCUS_MIN_DISTANCE = 0.0003
// Free-roam zoom floor, measured from Earth's centre: 1.10 radii is ~640 km
// up, just above Starlink's shells (Phase 1's floor was 1.15, ~960 km). Any
// lower and the camera, which always looks at Earth's centre, sinks beneath
// the dense LEO shell and sees almost no points; the 2k texture also turns to
// a blur. Replay and stations allow much closer (FOCUS_MIN_DISTANCE).
const FREE_MIN_DISTANCE = 1.1
// Most station pieces a group ring can mark at once.
const MAX_GROUP = 32
// Screen-space pick radius in CSS px; larger for touch.
const PICK_PX_MOUSE = 10
const PICK_PX_TOUCH = 20
const CLICK_MAX_MOVE_PX = 5

// Ring colours. The two objects of a near-miss pair get different colours and
// sizes so both stay visible as concentric rings when they're closer together
// than a pixel (most flagged misses are).
export const RING_A = '#ffffff'
export const RING_B = '#f2c14e'
export const RING_INSPECT = '#e85d3f'
export const RING_GROUP = '#7fd8ff'

export type { Clock } from './clock'

export interface Neighbor {
  index: number
  km: number
  atMs: number
}

export interface InspectedPosition {
  latDeg: number
  lonDeg: number
  altKm: number
}

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

// One always-on-top ring marking a single object.
function makeRing(texture: THREE.Texture, color: string, px: number): THREE.Points {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(3), 3).setUsage(THREE.DynamicDrawUsage),
  )
  const ring = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: px,
      sizeAttenuation: false,
      map: texture,
      transparent: true,
      depthTest: false,
      color,
    }),
  )
  ring.renderOrder = 2
  ring.visible = false
  return ring
}

export class GlobeEngine {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly controls: TrackballControls
  private readonly earth: THREE.Mesh
  private readonly geometry = new THREE.BufferGeometry()
  private readonly pointsMaterial: THREE.PointsMaterial
  private readonly ringA: THREE.Points
  private readonly ringB: THREE.Points
  private readonly ringInspect: THREE.Points
  private readonly ringGroup: THREE.Points
  private readonly missLine: THREE.Line
  private readonly missLabel: HTMLDivElement
  private readonly resizeObserver: ResizeObserver

  private positions = new Float32Array(0)
  private rgba = new Float32Array(0)
  private satrecs: (SatRec | null)[] = []
  private indexById = new Map<number, number>()
  private clock: Clock = liveClock(Date.now())
  private sliceIndex = 0
  private fullPending = true
  private focusIdx: [number, number] | null = null
  private inspectIdx: number | null = null
  private groupIdx: number[] | null = null
  private readonly groupCentre = new THREE.Vector3()
  private camAnim: {
    start: number
    fromPos: THREE.Vector3
    toPos: THREE.Vector3
    fromTarget: THREE.Vector3
    toTarget: THREE.Vector3
    /** When following a moving station: camera offset from its centre. */
    followOffset?: THREE.Vector3
  } | null = null
  private camAnimDone?: () => void
  private pointerDown: { x: number; y: number } | null = null
  private raf = 0
  private disposed = false
  private readonly container: HTMLElement
  private readonly onTick?: (simMs: number) => void
  private readonly onPick?: (index: number | null) => void

  constructor(
    container: HTMLElement,
    textureUrl: string,
    callbacks: { onTick?: (simMs: number) => void; onPick?: (index: number | null) => void } = {},
  ) {
    this.container = container
    this.onTick = callbacks.onTick
    this.onPick = callbacks.onPick
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
      // rgba vertex colours: alpha 0 hides a point (alphaTest discards it).
      vertexColors: true,
      map: dotTexture(false),
      alphaTest: 0.5,
    })
    this.scene.add(new THREE.Points(this.geometry, this.pointsMaterial))

    const ringTexture = dotTexture(true)
    this.ringA = makeRing(ringTexture, RING_A, 22 * pr)
    this.ringB = makeRing(ringTexture, RING_B, 34 * pr)
    this.ringInspect = makeRing(ringTexture, RING_INSPECT, 26 * pr)
    this.ringGroup = makeRing(ringTexture, RING_GROUP, 30 * pr)
    this.ringGroup.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(MAX_GROUP * 3), 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    )
    this.scene.add(this.ringA, this.ringB, this.ringInspect, this.ringGroup)

    const lineGeometry = new THREE.BufferGeometry()
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
    this.missLine = new THREE.Line(
      lineGeometry,
      new THREE.LineDashedMaterial({ color: 0xffffff, depthTest: false, transparent: true }),
    )
    this.missLine.renderOrder = 1
    this.missLine.visible = false
    this.scene.add(this.missLine)

    this.missLabel = document.createElement('div')
    this.missLabel.className = 'globe-miss-label'
    this.missLabel.hidden = true
    container.appendChild(this.missLabel)

    const canvas = this.renderer.domElement
    canvas.addEventListener('pointerdown', this.handlePointerDown)
    canvas.addEventListener('pointerup', this.handlePointerUp)

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
    this.rgba = new Float32Array(objects.length * 4).fill(1)
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.rgba, 4))
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1000)
    this.fullPending = true
    this.clearFocusMarks()
    this.clearGroup()
    this.setInspected(null)
  }

  /**
   * Recolor in place: one rgba per catalog object, alpha 0 to hide it. No
   * re-propagation.
   */
  setColors(rgba: Float32Array) {
    if (rgba.length !== this.rgba.length) return
    this.rgba.set(rgba)
    ;(this.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true
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
    return simTimeAt(this.clock, Date.now())
  }

  /**
   * Freeze time at a conjunction's TCA, ring both objects, draw a dashed line
   * between them labelled `label`, and fly the camera to them. Returns false
   * if either object isn't in the loaded catalog.
   */
  focusPair(aId: number, bId: number, tcaMs: number, label: string): boolean {
    const a = this.indexById.get(aId)
    const b = this.indexById.get(bId)
    if (a === undefined || b === undefined || !this.satrecs[a] || !this.satrecs[b]) return false
    const date = new Date(tcaMs)
    const pa = this.positionOf(a, date)
    const pb = this.positionOf(b, date)
    if (!pa || !pb) return false

    this.clearGroup()
    this.focusIdx = [a, b]
    this.setClock({ kind: 'frozen', atMs: tcaMs }, true)
    this.missLabel.textContent = label
    this.updateFocusMarks(date)
    this.ringA.visible = this.ringB.visible = this.missLine.visible = true
    this.controls.minDistance = FOCUS_MIN_DISTANCE
    // Look down at the pair from just outside it, with Earth behind.
    const mid = pa.add(pb).multiplyScalar(0.5)
    this.animateCamera(mid.clone().add(mid.clone().normalize().multiplyScalar(0.9)), mid)
    return true
  }

  /**
   * Ring every piece of a multi-piece object (a space station's modules), fly
   * to them, and keep the camera following them as they move. The clock is
   * left alone. Returns the number of pieces marked (0 if none are loaded).
   */
  focusGroup(ids: number[]): number {
    const indices = ids
      .map((id) => this.indexById.get(id))
      .filter((i): i is number => i !== undefined && this.satrecs[i] !== null)
      .slice(0, MAX_GROUP)
    if (!indices.length || !this.updateGroupMarks(new Date(this.simTimeMs()), indices)) return 0
    this.clearFocusMarks()
    this.groupIdx = indices
    this.ringGroup.visible = true
    this.controls.minDistance = FOCUS_MIN_DISTANCE
    const c = this.groupCentre
    const offset = c.clone().normalize().multiplyScalar(0.25)
    this.animateCamera(c.clone().add(offset), c.clone())
    if (this.camAnim) this.camAnim.followOffset = offset
    return indices.length
  }

  /** Back to the free-roam view of the whole globe. The caller sets the clock. */
  resetView() {
    this.clearFocusMarks()
    this.clearGroup()
    this.animateCamera(DEFAULT_CAMERA.clone(), new THREE.Vector3(), () => {
      this.resetLimits()
      this.camera.up.set(0, 1, 0)
    })
  }

  /** Ring one object for the inspect panel, or clear with null. */
  setInspected(index: number | null) {
    this.inspectIdx = index !== null && this.satrecs[index] ? index : null
    this.ringInspect.visible = this.inspectIdx !== null
  }

  /**
   * The object nearest the inspected one at the displayed moment, from a
   * fresh propagation of the whole catalog (one heavier call, on click only;
   * render positions are frame-sliced and can be ~9 frames stale). Every
   * object counts, including ones hidden by filters.
   */
  nearestNeighbor(): Neighbor | null {
    const index = this.inspectIdx
    if (index === null) return null
    const atMs = this.simTimeMs()
    const date = new Date(atMs)
    const n = this.satrecs.length
    const pos = new Float64Array(n * 3)
    const ok = new Uint8Array(n)
    for (let i = 0; i < n; i++) {
      const rec = this.satrecs[i]
      const pv = rec && propagate(rec, date)
      if (!pv) continue
      pos[i * 3] = pv.position.x
      pos[i * 3 + 1] = pv.position.y
      pos[i * 3 + 2] = pv.position.z
      ok[i] = 1
    }
    if (!ok[index]) return null
    const nearest = nearestTo(pos, index, (i) => ok[i] === 1)
    return nearest && { index: nearest.index, km: nearest.distance, atMs }
  }

  /** The inspected object's position at the displayed moment. */
  inspectedPosition(): InspectedPosition | null {
    const rec = this.inspectIdx === null ? null : this.satrecs[this.inspectIdx]
    if (!rec) return null
    const date = new Date(this.simTimeMs())
    const pv = propagate(rec, date)
    if (!pv) return null
    const geo = eciToGeodetic(pv.position, gstime(date))
    return {
      latDeg: degreesLat(geo.latitude),
      lonDeg: degreesLong(geo.longitude),
      altKm: geo.height,
    }
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.resizeObserver.disconnect()
    this.controls.dispose()
    const canvas = this.renderer.domElement
    canvas.removeEventListener('pointerdown', this.handlePointerDown)
    canvas.removeEventListener('pointerup', this.handlePointerUp)
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.Line) {
        obj.geometry.dispose()
        const m = obj.material as THREE.MeshBasicMaterial | THREE.PointsMaterial
        m.map?.dispose()
        m.dispose()
      }
    })
    this.renderer.dispose()
    canvas.remove()
    this.missLabel.remove()
  }

  private handlePointerDown = (e: PointerEvent) => {
    this.pointerDown = e.isPrimary && e.button === 0 ? { x: e.clientX, y: e.clientY } : null
  }

  // A click (not a drag-to-rotate) picks the nearest visible point within a
  // fixed screen-space radius.
  private handlePointerUp = (e: PointerEvent) => {
    const down = this.pointerDown
    this.pointerDown = null
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_MAX_MOVE_PX) return
    if (!this.satrecs.length) return
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.camera.updateMatrixWorld()
    const viewProj = new THREE.Matrix4().multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse,
    )
    const p = this.camera.position
    const index = pickNearest(
      this.positions,
      (i) => this.rgba[i * 4 + 3] > 0 && this.satrecs[i] !== null,
      { viewProj: viewProj.elements, camera: [p.x, p.y, p.z], width: rect.width, height: rect.height },
      e.clientX - rect.left,
      e.clientY - rect.top,
      e.pointerType === 'touch' ? PICK_PX_TOUCH : PICK_PX_MOUSE,
    )
    this.onPick?.(index)
  }

  private clearGroup() {
    this.groupIdx = null
    this.ringGroup.visible = false
  }

  // Ring positions and centre for a station's pieces at `date`.
  private updateGroupMarks(date: Date, indices = this.groupIdx): boolean {
    if (!indices) return false
    const attr = this.ringGroup.geometry.getAttribute('position') as THREE.BufferAttribute
    const c = new THREE.Vector3()
    let count = 0
    for (const i of indices) {
      const p = this.positionOf(i, date)
      if (!p) continue
      attr.setXYZ(count++, p.x, p.y, p.z)
      c.add(p)
    }
    if (!count) return false
    this.groupCentre.copy(c.divideScalar(count))
    this.ringGroup.geometry.setDrawRange(0, count)
    attr.needsUpdate = true
    return true
  }

  // Keep a followed station centred: move target and camera by the same step,
  // so the user's own orbit/zoom around it is preserved.
  private followGroup() {
    if (!this.groupIdx || this.camAnim) return
    const delta = this.groupCentre.clone().sub(this.controls.target)
    this.camera.position.add(delta)
    this.controls.target.copy(this.groupCentre)
  }

  private clearFocusMarks() {
    this.focusIdx = null
    this.ringA.visible = this.ringB.visible = this.missLine.visible = false
    this.missLabel.hidden = true
  }

  private resetLimits() {
    this.controls.minDistance = FREE_MIN_DISTANCE
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

  private setRing(ring: THREE.Points, p: THREE.Vector3) {
    const attr = ring.geometry.getAttribute('position') as THREE.BufferAttribute
    attr.setXYZ(0, p.x, p.y, p.z)
    attr.needsUpdate = true
  }

  // Rings and the miss line are propagated exactly at the displayed moment
  // every frame (not sliced), so they sit precisely on the objects.
  private updateFocusMarks(date: Date) {
    if (!this.focusIdx) return
    const pa = this.positionOf(this.focusIdx[0], date)
    const pb = this.positionOf(this.focusIdx[1], date)
    if (!pa || !pb) return
    this.setRing(this.ringA, pa)
    this.setRing(this.ringB, pb)
    const attr = this.missLine.geometry.getAttribute('position') as THREE.BufferAttribute
    attr.setXYZ(0, pa.x, pa.y, pa.z)
    attr.setXYZ(1, pb.x, pb.y, pb.z)
    attr.needsUpdate = true
    this.missLine.computeLineDistances()
    // About five dashes whatever the separation.
    const dash = Math.max(pa.distanceTo(pb) / 10, 1e-9)
    const material = this.missLine.material as THREE.LineDashedMaterial
    material.dashSize = dash
    material.gapSize = dash
  }

  private updateInspectRing(date: Date) {
    if (this.inspectIdx === null) return
    const p = this.positionOf(this.inspectIdx, date)
    if (p) this.setRing(this.ringInspect, p)
  }

  // Keep the miss label beside the pair on screen, hidden when the pair is
  // behind the Earth or the camera.
  private placeMissLabel() {
    if (!this.focusIdx || !this.missLine.visible) return
    const attr = this.missLine.geometry.getAttribute('position') as THREE.BufferAttribute
    const mid = new THREE.Vector3(
      (attr.getX(0) + attr.getX(1)) / 2,
      (attr.getY(0) + attr.getY(1)) / 2,
      (attr.getZ(0) + attr.getZ(1)) / 2,
    )
    const toMid = mid.clone().sub(this.camera.position)
    const ray = new THREE.Ray(this.camera.position, toMid.clone().normalize())
    const hit = ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), 1), new THREE.Vector3())
    const behindEarth = hit !== null && hit.distanceTo(this.camera.position) < toMid.length()
    const ndc = mid.clone().project(this.camera)
    if (behindEarth || ndc.z > 1) {
      this.missLabel.hidden = true
      return
    }
    const { clientWidth: w, clientHeight: h } = this.container
    this.missLabel.hidden = false
    this.missLabel.style.transform = `translate(${((ndc.x + 1) / 2) * w + 22}px, ${((1 - ndc.y) / 2) * h - 34}px)`
  }

  // Near and far planes follow the camera so replay can zoom to a few km
  // without clipping, while keeping depth precision at the default view.
  private updateClipPlanes() {
    const dist = this.camera.position.distanceTo(this.controls.target)
    const altitude = this.camera.position.length() - 1
    const near = Math.max(1e-6, Math.min(0.005, dist * 0.02, altitude * 0.5))
    const far = this.camera.position.length() + 40
    if (Math.abs(near - this.camera.near) > near * 0.05 || Math.abs(far - this.camera.far) > 1) {
      this.camera.near = near
      this.camera.far = far
      this.camera.updateProjectionMatrix()
    }
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
    if (a.followOffset && this.groupIdx) {
      // Aim at where the station is now, not where it was when the fly-to began.
      a.toTarget.copy(this.groupCentre)
      a.toPos.copy(this.groupCentre).add(a.followOffset)
    }
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
      this.updateFocusMarks(date)
      this.updateInspectRing(date)
      this.updateGroupMarks(date)
    }

    this.stepCamera(now)
    this.followGroup()
    this.controls.update()
    this.updateClipPlanes()
    this.placeMissLabel()
    this.renderer.render(this.scene, this.camera)
    this.onTick?.(simMs)
    this.raf = requestAnimationFrame(this.frame)
  }
}
