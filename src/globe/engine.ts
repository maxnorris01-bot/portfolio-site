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
import { dimExcept } from './colors'
import { formatKm } from './format'
import { EARTH_RADIUS_KM, earthRotationY, writeInertial } from './frames'
import { nearestCandidates, nearestTo } from './neighbors'
import { pickNearest } from './picking'
import { DAY_MS } from './timeline'
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
// Live nearest neighbour (2026-10-04). An exact full-catalog scan costs ~5 ms
// on an M5 and ~20 ms at 4x CPU throttling: fine once, too heavy every frame,
// and at 50x the neighbour must refresh every sim-second (about every frame).
// So candidates come from the render positions, which are at most SLICE
// frames stale. No tracked object moves faster than NEIGHBOR_MAX_SPEED_KM_S,
// so each stale position is off by at most speed x staleness, and only
// objects within the bound in nearestCandidates() can be the true nearest;
// only those are propagated exactly. After a large jump in displayed time the
// bound is too loose (over NEIGHBOR_CANDIDATE_CAP), so the refresh waits a few
// frames for the slices to catch up rather than scanning everything.
const NEIGHBOR_MAX_SPEED_KM_S = 11
// While one object is inspected or a near-miss pair is shown, every other
// point is drawn at this fraction of its normal alpha; the selected object and
// its live neighbour, or the pair's two objects, stay at full strength. A faint backdrop, not hidden: dimmed points stay pickable
// and stay eligible as the neighbour (those checks read the undimmed alpha).
const DIM_ALPHA = 0.2
const NEIGHBOR_CANDIDATE_CAP = 3000
const NEIGHBOR_REFRESH_SIM_MS = 1000
const NEIGHBOR_REFRESH_WALL_MS = 1000
// Most station pieces a group ring can mark at once.
const MAX_GROUP = 32
// Screen-space pick radius in CSS px; larger for touch. Points are ~2 px, and
// over the dense LEO shell a 10 px radius caught something on ~80% of clicks,
// leaving almost no "empty space" to click to deselect.
const PICK_PX_MOUSE = 6
const PICK_PX_TOUCH = 16
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
  // Markers move every frame, but three.js computes a bounding sphere once (at
  // the first render after the marker becomes visible) and frustum-culls
  // against it. A ring first shown at one conjunction was then culled at a
  // later conjunction elsewhere whenever that first spot was out of view
  // (rings and line missing, label still shown). A single ring is never worth
  // culling, so don't.
  ring.frustumCulled = false
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
  private readonly linkLine: THREE.Line
  private readonly linkLabel: HTMLDivElement
  private readonly resizeObserver: ResizeObserver

  private positions = new Float32Array(0)
  // Filter/colour state: alpha 0 = hidden by a filter, 1 = shown. The source
  // of truth for "visible" (picking, the neighbour search).
  private rgba = new Float32Array(0)
  // What's drawn: `rgba` with the inspect dimming layered on top, rebuilt
  // from `rgba` on selection or neighbour change, so un-dimming is exact.
  private drawRgba = new Float32Array(0)
  private satrecs: (SatRec | null)[] = []
  private indexById = new Map<number, number>()
  private clock: Clock = liveClock(Date.now())
  private sliceIndex = 0
  // Displayed time at which each render slice was last propagated.
  private readonly sliceSimMs = new Float64Array(SLICE)
  private neighbor: { index: number; km: number } | null = null
  private neighborRefresh = { simMs: 0, wallMs: 0, dirty: true, candidates: 0 }
  private fullPending = true
  // The dashed line between two objects: a near-miss pair (fixed label, the
  // report's miss distance) or the inspected object and its nearest neighbour
  // (live distance). Only one at a time, since selection is single.
  private link: { a: number; b: number; kind: 'pair' | 'neighbor'; label: string | null } | null =
    null
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
  private frameNo = 0
  // Frame number each marker was last actually rendered in (onBeforeRender
  // only fires for objects that survive frustum culling), for dev checks.
  private readonly drawnAt = { a: -1, b: -1, inspect: -1, group: -1, line: -1 }
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
      // rgba vertex colours: alpha 0 hides a point (filters; alphaTest
      // discards it), a fractional alpha dims it (inspect). Blended without
      // depth writes, so a faint point can't block a bright one behind it;
      // points still depth-test against the Earth.
      vertexColors: true,
      map: dotTexture(false),
      alphaTest: 0.01,
      transparent: true,
      depthWrite: false,
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
    this.linkLine = new THREE.Line(
      lineGeometry,
      new THREE.LineDashedMaterial({ color: 0xffffff, depthTest: false, transparent: true }),
    )
    this.linkLine.renderOrder = 1
    this.linkLine.visible = false
    this.linkLine.frustumCulled = false // moved every frame; see makeRing
    this.scene.add(this.linkLine)

    this.linkLabel = document.createElement('div')
    this.linkLabel.className = 'globe-miss-label'
    this.linkLabel.hidden = true
    container.appendChild(this.linkLabel)

    const stamp = (key: keyof typeof this.drawnAt) => () => {
      this.drawnAt[key] = this.frameNo
    }
    this.ringA.onBeforeRender = stamp('a')
    this.ringB.onBeforeRender = stamp('b')
    this.ringInspect.onBeforeRender = stamp('inspect')
    this.ringGroup.onBeforeRender = stamp('group')
    this.linkLine.onBeforeRender = stamp('line')

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
    this.drawRgba = this.rgba.slice()
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.drawRgba, 4))
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1000)
    this.fullPending = true
    this.link = null
    this.ringA.visible = this.ringB.visible = this.linkLine.visible = false
    this.linkLabel.hidden = true
    this.clearGroup()
    this.inspectIdx = null
    this.ringInspect.visible = false
    this.neighbor = null
    this.applyDim()
  }

  /**
   * Recolor in place: one rgba per catalog object, alpha 0 to hide it. No
   * re-propagation.
   */
  setColors(rgba: Float32Array) {
    if (rgba.length !== this.rgba.length) return
    this.rgba.set(rgba)
    this.neighborRefresh.dirty = true // visibility may have changed
    this.applyDim()
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

  getClock(): Clock {
    return this.clock
  }

  // Live at 50x reaches the end of the ~24 h forward range (the slider's
  // limit) in about half an hour; pause there rather than run past it.
  private clampLive(simMs: number): number {
    const endMs = Date.now() + DAY_MS
    if (this.clock.kind !== 'live' || simMs <= endMs) return simMs
    this.clock = { kind: 'frozen', atMs: endMs }
    return endMs
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

    this.clearSelection(false)
    this.link = { a, b, kind: 'pair', label }
    this.applyDim()
    this.setClock({ kind: 'frozen', atMs: tcaMs }, true)
    this.updateLink(date)
    this.ringA.visible = this.ringB.visible = this.linkLine.visible = true
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
    this.clearSelection(false)
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
    this.clearSelection(false)
    this.animateCamera(DEFAULT_CAMERA.clone(), new THREE.Vector3(), () => {
      this.resetLimits()
      this.camera.up.set(0, 1, 0)
    })
  }

  /**
   * Select one object for the inspect panel, replacing any other selection
   * (another object, a near-miss pair or a station); null clears it.
   */
  setInspected(index: number | null) {
    const next = index !== null && this.satrecs[index] ? index : null
    if (next !== null) this.clearSelection()
    else this.clearLink('neighbor')
    this.inspectIdx = next
    this.ringInspect.visible = next !== null
    this.neighbor = null
    this.neighborRefresh.dirty = true
    this.applyDim()
  }

  /**
   * The inspected object's current nearest visible neighbour (kept live):
   * null if there is none, undefined while a refresh is pending (just after a
   * selection or a jump in displayed time).
   */
  currentNeighbor(): { index: number; km: number } | null | undefined {
    if (this.inspectIdx === null) return null
    return this.neighborRefresh.dirty ? undefined : this.neighbor
  }

  // Draw the dashed line from the inspected object to `index`, or remove it.
  private showNeighbor(index: number | null) {
    this.clearLink('neighbor')
    if (index === null || this.inspectIdx === null || !this.satrecs[index]) return
    this.link = { a: this.inspectIdx, b: index, kind: 'neighbor', label: null }
    this.updateLink(new Date(this.simTimeMs()))
    this.ringA.visible = this.linkLine.visible = true
  }

  /**
   * Clear every selection mark (object, neighbour line, pair, station). If the
   * camera was focused on one, ease back to free roam from where it is rather
   * than flying home; the clock is left alone. Callers that are about to fly
   * the camera somewhere else pass `release = false`, so two camera
   * animations never race.
   */
  clearSelection(release = true) {
    const wasFocused = this.link?.kind === 'pair' || this.groupIdx !== null
    this.clearLink()
    this.clearGroup()
    this.inspectIdx = null
    this.ringInspect.visible = false
    this.neighbor = null
    this.applyDim()
    if (wasFocused && release) this.releaseToFreeRoam()
  }

  // Rebuild the drawn colours from the filter state, dimming everything but
  // the near-miss pair's two objects, or the inspected object and its current
  // neighbour. Station views don't dim. Runs on selection, pair, filter and
  // neighbour changes only, never per frame.
  private applyDim() {
    const base = this.rgba
    const draw = this.drawRgba
    if (draw.length !== base.length) return
    const sel = this.inspectIdx
    if (this.link?.kind === 'pair') dimExcept(base, draw, [this.link.a, this.link.b], DIM_ALPHA)
    else if (sel !== null) dimExcept(base, draw, [sel, this.neighbor?.index ?? -1], DIM_ALPHA)
    else draw.set(base)
    const attr = this.geometry.getAttribute('color') as THREE.BufferAttribute | undefined
    if (attr) attr.needsUpdate = true
  }

  /**
   * The visible object nearest the inspected one at the displayed moment,
   * from an exact propagation of the whole catalog (~5-20 ms). The live
   * neighbour uses the cheaper bounded search in refreshNeighbor(); this is
   * the reference it's checked against.
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
    const nearest = nearestTo(pos, index, (i) => ok[i] === 1 && this.rgba[i * 4 + 3] > 0)
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

  /** Read-only state for dev-time checks (exposed on window in dev builds only). */
  debugState() {
    return {
      cameraFromCentre: this.camera.position.length(),
      cameraFromTarget: this.camera.position.distanceTo(this.controls.target),
      minDistance: this.controls.minDistance,
      inspected: this.inspectIdx,
      neighbor: this.neighbor,
      // Points drawn at full strength (all shown points when nothing is inspected).
      bright: (() => {
        const out: number[] = []
        for (let i = 0; i < this.rgba.length / 4; i++) {
          const a = this.rgba[i * 4 + 3]
          if (a > 0 && this.drawRgba[i * 4 + 3] === a) out.push(i)
          if (out.length > 50) break
        }
        return out.length > 50 ? 'many' : out
      })(),
      neighborCandidates: this.neighborRefresh.candidates,
      neighborRefreshedAtSimMs: this.neighborRefresh.simMs,
      simMs: this.simTimeMs(),
      link: this.link && { kind: this.link.kind, a: this.link.a, b: this.link.b },
      rings: {
        a: this.ringA.visible,
        b: this.ringB.visible,
        inspect: this.ringInspect.visible,
        group: this.ringGroup.visible,
      },
      line: this.linkLine.visible,
      // Markers actually rendered in the last frame (not frustum-culled).
      drawn: Object.fromEntries(
        Object.entries(this.drawnAt).map(([k, f]) => [k, f === this.frameNo]),
      ),
      label: !this.linkLabel.hidden,
      target: this.controls.target.toArray(),
      animating: this.camAnim !== null,
      controlsEnabled: this.controls.enabled,
      clock: this.clock.kind,
      linkMid: this.link
        ? (() => {
            const attr = this.linkLine.geometry.getAttribute('position') as THREE.BufferAttribute
            return [0, 1, 2].map((k) => (attr.getComponent(0, k) + attr.getComponent(1, k)) / 2)
          })()
        : null,
    }
  }

  /** Exact distance (km) between two objects at the displayed moment, for dev-time checks. */
  debugDistanceKm(i: number, j: number): number | null {
    const date = new Date(this.simTimeMs())
    const a = this.satrecs[i] && propagate(this.satrecs[i] as SatRec, date)
    const b = this.satrecs[j] && propagate(this.satrecs[j] as SatRec, date)
    if (!a || !b) return null
    return Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y, a.position.z - b.position.z)
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
    this.linkLabel.remove()
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

  private clearLink(kind?: 'pair' | 'neighbor') {
    if (!this.link || (kind && this.link.kind !== kind)) return
    this.link = null
    this.ringA.visible = this.ringB.visible = this.linkLine.visible = false
    this.linkLabel.hidden = true
  }

  // Leave a pair/station focus without jumping: aim back at Earth's centre and
  // step out to the free-roam floor if the camera is inside it.
  private releaseToFreeRoam() {
    const radius = Math.max(this.camera.position.length(), FREE_MIN_DISTANCE + 0.02)
    this.animateCamera(this.camera.position.clone().setLength(radius), new THREE.Vector3(), () =>
      this.resetLimits(),
    )
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

  // Rings and the link line are propagated exactly at the displayed moment
  // every frame (not sliced), so they sit precisely on the objects.
  private updateLink(date: Date) {
    const link = this.link
    if (!link) return
    const pa = this.positionOf(link.a, date)
    const pb = this.positionOf(link.b, date)
    if (!pa || !pb) return
    if (link.kind === 'pair') {
      this.setRing(this.ringA, pa)
      this.setRing(this.ringB, pb)
    } else {
      this.setRing(this.ringA, pb) // the neighbour; the inspect ring marks `a`
    }
    this.linkLabel.textContent = link.label ?? formatKm(pa.distanceTo(pb) * EARTH_RADIUS_KM)
    const attr = this.linkLine.geometry.getAttribute('position') as THREE.BufferAttribute
    attr.setXYZ(0, pa.x, pa.y, pa.z)
    attr.setXYZ(1, pb.x, pb.y, pb.z)
    attr.needsUpdate = true
    this.linkLine.computeLineDistances()
    // About five dashes whatever the separation.
    const dash = Math.max(pa.distanceTo(pb) / 10, 1e-9)
    const material = this.linkLine.material as THREE.LineDashedMaterial
    material.dashSize = dash
    material.gapSize = dash
  }

  // Keep the inspected object's nearest visible neighbour current: at least
  // once a second of wall time, every sim-second at higher speeds, and after
  // any jump, selection or visibility change.
  private maybeRefreshNeighbor(simMs: number) {
    const r = this.neighborRefresh
    if (this.inspectIdx === null) return
    const wall = performance.now()
    const due =
      r.dirty ||
      Math.abs(simMs - r.simMs) >= NEIGHBOR_REFRESH_SIM_MS ||
      wall - r.wallMs >= NEIGHBOR_REFRESH_WALL_MS
    if (!due) return
    const sel = this.inspectIdx
    let staleS = 0
    for (const t of this.sliceSimMs) staleS = Math.max(staleS, Math.abs(simMs - t) / 1000)
    const bound = (NEIGHBOR_MAX_SPEED_KM_S * staleS) / EARTH_RADIUS_KM // scene units
    const pos = this.positions
    const candidates = nearestCandidates(
      pos,
      sel,
      (i) =>
        this.rgba[i * 4 + 3] > 0 &&
        this.satrecs[i] !== null &&
        pos[i * 3] !== 0 &&
        pos[i * 3 + 1] !== 0, // failed propagations sit at the origin
      bound,
      NEIGHBOR_CANDIDATE_CAP,
    )
    if (candidates === null) {
      // Displayed time just jumped; slices catch up within SLICE frames.
      if (this.neighbor) {
        this.showNeighbor(null)
        this.neighbor = null
        this.applyDim()
      }
      r.dirty = true
      return
    }
    r.simMs = simMs
    r.wallMs = wall
    r.dirty = false
    r.candidates = candidates.length
    const date = new Date(simMs)
    const selPv = propagate(this.satrecs[sel] as SatRec, date)
    let best: { index: number; km: number } | null = null
    if (selPv) {
      const p = selPv.position
      for (const i of candidates) {
        const pv = propagate(this.satrecs[i] as SatRec, date)
        if (!pv) continue
        const km = Math.hypot(pv.position.x - p.x, pv.position.y - p.y, pv.position.z - p.z)
        if (!best || km < best.km) best = { index: i, km }
      }
    }
    const changed = best?.index !== this.neighbor?.index
    this.neighbor = best
    if (changed) {
      // Line, label and brightness move together, in this frame.
      this.showNeighbor(best?.index ?? null)
      this.applyDim()
    }
  }

  private updateInspectRing(date: Date) {
    if (this.inspectIdx === null) return
    const p = this.positionOf(this.inspectIdx, date)
    if (p) this.setRing(this.ringInspect, p)
  }

  // Keep the miss label beside the pair on screen, hidden when the pair is
  // behind the Earth or the camera.
  private placeMissLabel() {
    if (!this.link || !this.linkLine.visible) return
    const attr = this.linkLine.geometry.getAttribute('position') as THREE.BufferAttribute
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
      this.linkLabel.hidden = true
      return
    }
    const { clientWidth: w, clientHeight: h } = this.container
    this.linkLabel.hidden = false
    this.linkLabel.style.transform = `translate(${((ndc.x + 1) / 2) * w + 22}px, ${((1 - ndc.y) / 2) * h - 34}px)`
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
    this.frameNo++
    const simMs = this.clampLive(this.simTimeMs())
    const date = new Date(simMs)
    this.earth.rotation.y = earthRotationY(gstime(date))

    const n = this.satrecs.length
    if (n) {
      if (this.fullPending) {
        this.propagateRange(0, n, date)
        this.sliceSimMs.fill(simMs)
        this.fullPending = false
      } else {
        const from = Math.floor((this.sliceIndex * n) / SLICE)
        const to = Math.floor(((this.sliceIndex + 1) * n) / SLICE)
        this.propagateRange(from, to, date)
        this.sliceSimMs[this.sliceIndex] = simMs
      }
      this.sliceIndex = (this.sliceIndex + 1) % SLICE
      ;(this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
      this.maybeRefreshNeighbor(simMs)
      this.updateInspectRing(date)
      this.updateLink(date)
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
