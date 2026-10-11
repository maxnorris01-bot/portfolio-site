import * as THREE from 'three'
import { TrackballControls } from 'three/addons/controls/TrackballControls.js'
import { Line2 } from 'three/addons/lines/Line2.js'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import {
  degreesLat,
  degreesLong,
  eciToGeodetic,
  gstime,
  propagate,
  twoline2satrec,
  type SatRec,
} from 'satellite.js'
import { clampToEnd, liveClock, scrubClock, simTimeAt, type Clock } from './clock'
import { dimExcept } from './colors'
import { formatKm } from './format'
import { EARTH_RADIUS_KM, earthRotationY, writeInertial } from './frames'
import { nearestCandidates, nearestTo } from './neighbors'
import { pickNearest } from './picking'
import {
  DOME_RADIUS,
  directionLookAngles,
  enuToSky,
  lookAngles,
  observerFrame,
  skyDirection,
  toEnu,
  writeDome,
} from './sky'
import {
  geoBeltAzimuth,
  geoBeltElevation,
  placeLabels,
  ringLabelElevation,
  type LabelRequest,
  type Rect,
} from './layout'
import { SKY_BODIES, limbDirection, markerSizePx, showsLabel, type SkyBody } from './skybodies'
import { LEVEL_KM, minFovForImagery } from './gibs'
import {
  POV_FOV_DEFAULT,
  POV_FOV_MIN,
  POV_PITCH_MAX,
  applyLook,
  presetView,
  zoomFov,
  type PovPreset,
  type Vec3 as PovVec3,
} from './pov'
import { MAX_ORBITS, orbitNeedsRefresh, orbitPeriodMs, orbitTargets, sampleOrbit } from './orbit'
import { DAY_MS } from './timeline'
import { EARTH_FRAGMENT_SHADER, EARTH_VERTEX_SHADER } from './daynight'
import { sunDirectionScene } from './sun'
import { SKY_FRAGMENT_SHADER, SKY_VERTEX_SHADER, skyPalette } from './twilight'
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
// Sky view (Phase 1): vertical field of view limits and look sensitivity.
const SKY_FOV_MIN = 30
const SKY_FOV_MAX = 100
const SKY_FOV_DEFAULT = 70
// Look up to the zenith or down at the ground (2026-10-04 ground grid).
const SKY_PITCH_MAX = 89
// Sky ground: a muted slate, clearly lighter than the #05070d sky (1.51:1)
// but far darker than any point, so the points stay the brightest things.
const SKY_GROUND_COLOR = 0x26303c
// Perspective grid on a ground plane one eye-height below the observer.
// Cells of 0.6 eye-heights (about 1 m tiles for a 1.7 m eye height) span
// about 31 degrees straight down: enough lines to read as a floor without
// clutter. Lines fade from 3 to 18 eye-heights out (18 is about 3.2 degrees
// below the horizon), before converging lines pile into a bright band or
// shimmer.
const GRID_CELL = 0.6
const GRID_FADE_START = 3
const GRID_FADE_END = 18
const GRID_STEP = 0.25 // segment length along each line, so it curves correctly
const GRID_COLOR = [0x6c / 255, 0x7a / 255, 0x8d / 255] as const
const GRID_ALPHA = 0.14
// The dome grid (below) is the main depth cue. Compared with and without:
// with no floor grid at all the ground reads as a flat slab when looking at
// the horizon, so a very faint floor grid (GRID_ALPHA) stays.
const SKY_FLOOR_GRID = true
// Dome grid: elevation rings every 15 degrees and azimuth lines every 30,
// in the same blue-grey, on a sphere just outside the points (so, seen from
// the centre, it sits behind them with no z-fighting) and drawn first.
const DOME_GRID_RADIUS = DOME_RADIUS * 1.01
const DOME_RING_ALPHA = 0.28
const DOME_AZ_ALPHA = 0.25
const DOME_CARDINAL_ALPHA = 0.42
const DOME_AZ_FADE_START = 70 // azimuth lines fade out toward the zenith
const DOME_AZ_FADE_END = 84

export type ViewMode = 'globe' | 'sky' | 'pov'

export interface Observer {
  latDeg: number
  lonDeg: number
}

// Most station pieces a group ring can mark at once.
const MAX_GROUP = 32
// Screen-space pick radius in CSS px; larger for touch. Points are ~2 px, and
// over the dense LEO shell a 10 px radius caught something on ~80% of clicks,
// leaving almost no "empty space" to click to deselect.
const PICK_PX_MOUSE = 6
const PICK_PX_TOUCH = 16
const CLICK_MAX_MOVE_PX = 5
/**
 * How far an elevation label's centre keeps from the geostationary row, in
 * CSS px: half the label's height plus a gap, so the row's points stay clear.
 */
const LABEL_CLEAR_PX = 14

// Ring colours. The two objects of a near-miss pair get different colours and
// sizes so both stay visible as concentric rings when they're closer together
// than a pixel (most flagged misses are).
export const RING_A = '#ffffff'
export const RING_B = '#f2c14e'
export const RING_INSPECT = '#e85d3f'
export const RING_GROUP = '#7fd8ff'
// The selected object's orbit: a pale periwinkle blue. Every other line and
// ring colour is taken (white neighbour line and pair ring, gold, the
// orange-red selection ring); its nearest colour is the cyan station ring,
// which never shows alongside a selected object. 9.5:1 against the sky,
// 6.3:1 against the Sky ground.
export const ORBIT_COLOR = '#b0a8ff'
const ORBIT_OPACITY = 0.75
// CSS px. Plain WebGL lines are one device pixel (half a CSS pixel on a
// 2x screen), which disappears over the globe's point shell; wide lines don't.
const ORBIT_WIDTH_PX = 2
// On the Sky dome the orbit sits just behind the points (DOME_RADIUS) and in
// front of the dome grid; the ground hemisphere hides the part below the
// horizon.
const SKY_ORBIT_RADIUS = DOME_RADIUS * 1.005

export type { Clock } from './clock'

export interface Neighbor {
  index: number
  km: number
  atMs: number
}

export interface InspectedSky {
  azDeg: number
  elDeg: number
  rangeKm: number
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

// The Sky view's sun: a soft disc with a bright core (white; the marker's
// colour tints it).
function makeSunTexture(): THREE.Texture {
  const size = 64
  const c = size / 2
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(c, c, 0, c, c, c)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.45, 'rgba(255,255,255,1)')
  g.addColorStop(0.55, 'rgba(255,255,255,0.35)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// A planet's disc: a filled circle with a dark rim like the satellite points
// (white; the marker's colour tints it), so it reads on any sky.
function makeBodyTexture(): THREE.Texture {
  const size = 64
  const c = size / 2
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#05070d'
  ctx.beginPath()
  ctx.arc(c, c, c - 1, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(c, c, c * 0.78, 0, Math.PI * 2)
  ctx.fill()
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

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
  private readonly earthUniforms: {
    dayMap: { value: THREE.Texture | null }
    nightMap: { value: THREE.Texture }
    tint: { value: THREE.Color }
    sunDir: { value: THREE.Vector3 }
    enabled: { value: number }
    hasLights: { value: number }
  }
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
  // Velocity (scene units per second) from the same sliced propagation, used
  // by the Sky view to move each object forward over its slice's staleness.
  private velocities = new Float32Array(0)

  // Sky view: its own scene and camera, sharing the catalog, the colour/
  // filter buffer and the points material with the globe.
  private viewMode: ViewMode = 'globe'
  private observer: Observer | null = null
  private readonly skyScene = new THREE.Scene()
  private readonly skyCamera = new THREE.PerspectiveCamera(SKY_FOV_DEFAULT, 1, 0.1, 1000)
  private readonly skyGeometry = new THREE.BufferGeometry()
  private readonly skyPoints: THREE.Points
  private skyPositions = new Float32Array(0)
  private readonly skyLook = { yaw: 180, pitch: SKY_FOV_DEFAULT / 2 - 4 }
  // Satellite view (POV): the camera rides the viewpoint satellite in its
  // LVLH frame (pov.ts), a preset plus a drag offset.
  private readonly povCamera = new THREE.PerspectiveCamera(POV_FOV_DEFAULT, 1, 1e-3, 50)
  private povIdx: number | null = null
  private readonly povLook = { preset: 'down' as PovPreset, yaw: 0, pitch: 0 }
  private povState: {
    pos: PovVec3
    vel: PovVec3
    altKm: number
    speedKmS: number
    latDeg: number
    lonDeg: number
  } | null = null
  private povSun!: THREE.Points
  // NASA GIBS tiles for the satellite view's Earth (earthTiles.ts), loaded the
  // first time the view opens; and the narrowest zoom the imagery supports.
  private earthTiles: import('./earthTiles').EarthTiles | null = null
  private tilesModule: typeof import('./earthTiles') | null = null
  private tilesLoading = false
  private povMinFov = POV_FOV_MIN
  // Stands in for the Earth's material while the tiles cover the whole view:
  // only depth (the Earth still hides the Sun behind it), no shading.
  private readonly earthDepthOnly = new THREE.MeshBasicMaterial({ colorWrite: false })
  // The whole catalog's dots (hidden in the satellite view).
  private catalogPoints!: THREE.Points
  private readonly onPovLost?: () => void
  private skyAbove = 0
  private readonly skyLabels: {
    el: HTMLDivElement
    dir: THREE.Vector3
    grid: boolean
    /** For an elevation label ("30°"), the ring it marks; it may shift off the geostationary row. */
    ring?: { az: number; el: number }
  }[] = []
  private readonly domeGrid: THREE.LineSegments
  private readonly floorGrid: THREE.LineSegments
  private skyGridOn = true
  private readonly skyPointers = new Map<number, { x: number; y: number }>()
  private skyPinch = 0
  // One gesture in the Sky view: it only becomes a drag (look around) once it
  // has moved past CLICK_MAX_MOVE_PX, so a click never nudges the view, and a
  // gesture that ever had two pointers (a pinch) never selects.
  private skyGesture: { x: number; y: number; dragging: boolean; multi: boolean } | null = null
  private skySelScreen: { x: number; y: number } | null = null
  // Sky twilight: the sky dome's colours follow the Sun's elevation for the
  // observer (twilight.ts), with a sun marker while it's up.
  private readonly skyDomeUniforms = {
    zenith: { value: new THREE.Color() },
    horizon: { value: new THREE.Color() },
    glow: { value: new THREE.Color() },
    sunDir: { value: new THREE.Vector3() },
  }
  private readonly skySunMarker: THREE.Points
  // The Moon and planets (planets.ts, loaded lazily once there's an observer).
  private bodyEphem: typeof import('./planets') | null = null
  private bodyEphemLoading = false
  private skyBodyList: SkyBody[] = []
  private readonly bodyUpdate = { simMs: Number.NaN, realMs: 0, obsKey: '', costMs: 0 }
  private readonly bodyMarkers = new Map<string, { points: THREE.Points; label: HTMLDivElement }>()
  private readonly moonPhase: { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; k: number; rot: number }
  private selectedBody: string | null = null
  // Where each body's disc was drawn last frame (CSS px), for picking.
  private skyBodyScreen: { key: string; x: number; y: number; r: number }[] = []
  private readonly onPickBody?: (key: string) => void
  private readonly labelSizes = new Map<HTMLElement, { w: number; h: number }>()
  private readonly skySunLabel: HTMLDivElement
  private skySunAngles: { azDeg: number; elDeg: number } | null = null
  // Orbit lines for the current selection (orbitTargets in orbit.ts): one
  // slot per line, each sampled around its own `centreMs` and refreshed on its
  // own period. `skyPoints` holds the Sky line's dome points, one more than the
  // samples to close the loop.
  private readonly orbitSlots: {
    line: Line2
    sky: Line2
    skyPoints: Float32Array
    state: { idx: number; rec: SatRec; centreMs: number; periodMs: number; eci: Float32Array } | null
  }[] = []
  private readonly skyRingInspect: THREE.Points
  private readonly skyInspectLabel: HTMLDivElement
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
  private link: {
    a: number
    b: number
    kind: 'pair' | 'neighbor'
    label: string | null
    /** A pair's TCA: `label` (the reported miss distance) applies within a second of it. */
    tcaMs?: number
  } | null =
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
  private readonly drawnAt = {
    a: -1,
    b: -1,
    inspect: -1,
    group: -1,
    line: -1,
    orbit: -1,
    orbit2: -1,
    skyOrbit: -1,
    skyOrbit2: -1,
  }
  private disposed = false
  private readonly container: HTMLElement
  private readonly onTick?: (simMs: number) => void
  private readonly onPick?: (index: number | null) => void

  constructor(
    container: HTMLElement,
    textureUrl: string,
    callbacks: {
      onTick?: (simMs: number) => void
      onPick?: (index: number | null) => void
      onPickBody?: (key: string) => void
      /** The viewpoint satellite can no longer be propagated (e.g. it decayed). */
      onPovLost?: () => void
    } = {},
    /** City lights for the night side; loaded after the day texture, optional. */
    nightTextureUrl?: string,
  ) {
    this.container = container
    this.onTick = callbacks.onTick
    this.onPick = callbacks.onPick
    this.onPickBody = callbacks.onPickBody
    this.onPovLost = callbacks.onPovLost
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

    // Day/night: the Earth is lit in world space by the Sun's direction, which
    // is fixed in the inertial frame; the mesh already turns by GMST under it.
    // Off, it's the old uniformly lit look (daynight.ts). The city-lights
    // texture loads after the day texture so the globe still appears first;
    // until it arrives (or if it fails) the night side is plain darkened day.
    const loader = new THREE.TextureLoader()
    const anisotropy = this.renderer.capabilities.getMaxAnisotropy()
    this.earthUniforms = {
      dayMap: { value: null as THREE.Texture | null },
      nightMap: { value: new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1) },
      // Slightly dimmed so the points read above the surface (as before).
      tint: { value: new THREE.Color(0xc4c4c4) },
      sunDir: { value: new THREE.Vector3(1, 0, 0) },
      enabled: { value: 1 },
      hasLights: { value: 0 },
    }
    this.earthUniforms.nightMap.value.needsUpdate = true
    const loadNight = () => {
      if (!nightTextureUrl || this.disposed) return
      loader.load(nightTextureUrl, (night) => {
        if (this.disposed) return night.dispose()
        night.colorSpace = THREE.SRGBColorSpace
        night.anisotropy = anisotropy
        this.earthUniforms.nightMap.value.dispose()
        this.earthUniforms.nightMap.value = night
        this.earthUniforms.hasLights.value = 1
      })
    }
    const texture = loader.load(textureUrl, loadNight, undefined, loadNight)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = anisotropy
    this.earthUniforms.dayMap.value = texture
    this.earth = new THREE.Mesh(
      new THREE.SphereGeometry(1, 96, 64),
      new THREE.ShaderMaterial({
        uniforms: this.earthUniforms,
        vertexShader: EARTH_VERTEX_SHADER,
        fragmentShader: EARTH_FRAGMENT_SHADER,
      }),
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
    this.catalogPoints = new THREE.Points(this.geometry, this.pointsMaterial)
    this.scene.add(this.catalogPoints)

    const ringTexture = dotTexture(true)
    this.ringA = makeRing(ringTexture, RING_A, 22 * pr)
    this.ringB = makeRing(ringTexture, RING_B, 34 * pr)
    this.ringInspect = makeRing(ringTexture, RING_INSPECT, 26 * pr)
    this.skyRingInspect = makeRing(ringTexture, RING_INSPECT, 26 * pr)
    this.skyRingInspect.renderOrder = 4
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

    // Orbit lines for the selection: the inspected object, both objects of a
    // near-miss pair, or a station. Their own materials, so dimming never
    // touches them; not part of the point buffers, so they never affect
    // picking. Never frustum-culled: the geometry is replaced on every
    // recompute and a stale bounding sphere once hid moved markers. A pair's
    // two loops are drawn alike: the pair is symmetric, and each loop is told
    // apart by the ring (white or gold) its object sits in.
    const orbitMaterial = () =>
      new LineMaterial({
        color: new THREE.Color(ORBIT_COLOR).getHex(),
        linewidth: ORBIT_WIDTH_PX,
        transparent: true,
        opacity: ORBIT_OPACITY,
        depthWrite: false,
      })
    for (let k = 0; k < MAX_ORBITS; k++) {
      const line = new Line2(new LineGeometry(), orbitMaterial())
      const sky = new Line2(new LineGeometry(), orbitMaterial())
      for (const l of [line, sky]) {
        l.visible = false
        l.frustumCulled = false
      }
      this.scene.add(line)
      this.orbitSlots.push({ line, sky, skyPoints: new Float32Array(0), state: null })
    }

    this.linkLabel = document.createElement('div')
    this.linkLabel.className = 'globe-miss-label'
    this.linkLabel.hidden = true
    container.appendChild(this.linkLabel)

    // Sky scene: dark ground hemisphere below the horizon (it hides objects
    // that are below it), horizon and 30/60-degree rings, compass labels.
    this.skyPoints = new THREE.Points(this.skyGeometry, this.pointsMaterial)
    this.skyPoints.frustumCulled = false
    const ground = new THREE.Mesh(
      new THREE.SphereGeometry(DOME_RADIUS * 0.95, 64, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: SKY_GROUND_COLOR, side: THREE.BackSide }),
    )
    ground.renderOrder = 0
    this.floorGrid = this.makeGroundGrid(DOME_RADIUS * 0.94)
    this.floorGrid.visible = SKY_FLOOR_GRID
    this.domeGrid = this.makeDomeGrid()
    // Points draw last so they sit on top of the (farther) dome grid.
    this.skyPoints.renderOrder = 3
    this.skyScene.add(
      ground,
      this.floorGrid,
      this.domeGrid,
      ...this.orbitSlots.map((slot) => slot.sky),
      this.skyPoints,
      this.skyRingInspect,
    )
    // The sky itself: a dome just outside the grid, drawn first.
    const skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(DOME_RADIUS * 1.03, 48, 24),
      new THREE.ShaderMaterial({
        uniforms: this.skyDomeUniforms,
        vertexShader: SKY_VERTEX_SHADER,
        fragmentShader: SKY_FRAGMENT_SHADER,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    )
    skyDome.renderOrder = -1
    this.setSkyColours(-90)
    // The Sun while it's up: a soft warm disc, larger than any satellite, with
    // a label so it isn't mistaken for one. Never part of the pick buffers.
    this.skySunMarker = makeRing(makeSunTexture(), '#fff1c4', 30 * pr)
    this.skySunMarker.renderOrder = 1
    ;(this.skySunMarker.material as THREE.PointsMaterial).depthTest = true
    this.skyScene.add(skyDome, this.skySunMarker)
    // The Sun in the satellite view: a disc far out along the true direction,
    // depth-tested so the Earth hides it when the satellite is in shadow.
    this.povSun = makeRing(makeSunTexture(), '#fff1c4', 28 * pr)
    ;(this.povSun.material as THREE.PointsMaterial).depthTest = true
    this.povSun.renderOrder = 0
    this.scene.add(this.povSun)
    this.skySunLabel = document.createElement('div')
    this.skySunLabel.className = 'globe-sky-label is-body'
    this.skySunLabel.textContent = 'Sun'
    this.skySunLabel.hidden = true
    container.appendChild(this.skySunLabel)
    // The Moon and planets: a disc each (sized per update), and a name label.
    // The Moon's disc is drawn with its phase, lit limb toward the Sun.
    const moonCanvas = document.createElement('canvas')
    moonCanvas.width = moonCanvas.height = 128
    const moonTex = new THREE.CanvasTexture(moonCanvas)
    moonTex.colorSpace = THREE.SRGBColorSpace
    this.moonPhase = { canvas: moonCanvas, tex: moonTex, k: -1, rot: 0 }
    const bodyTex = makeBodyTexture()
    for (const def of SKY_BODIES) {
      if (def.key === 'sun') continue
      const points = makeRing(def.key === 'moon' ? moonTex : bodyTex, def.color, 10 * pr)
      // Under the satellites, so a satellite crossing the Moon stays visible.
      points.renderOrder = 2.5
      this.skyScene.add(points)
      const label = document.createElement('div')
      label.className = 'globe-sky-label is-body'
      label.textContent = def.name
      label.hidden = true
      container.appendChild(label)
      this.bodyMarkers.set(def.key, { points, label })
    }
    this.skyInspectLabel = document.createElement('div')
    this.skyInspectLabel.className = 'globe-sky-label is-selected'
    this.skyInspectLabel.hidden = true
    container.appendChild(this.skyInspectLabel)
    // The horizon: crisp, just in front of the ground.
    {
      const pts: THREE.Vector3[] = []
      for (let az = 0; az <= 360; az += 2) {
        pts.push(new THREE.Vector3(...skyDirection(az, 0)).multiplyScalar(DOME_RADIUS * 0.93))
      }
      const horizon = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0xc9d1dc, transparent: true, opacity: 0.85 }),
      )
      horizon.renderOrder = 2
      this.skyScene.add(horizon)
    }
    // Labels, all placed with skyDirection so east stays on the right. The
    // elevation labels sit on both the north and south meridians (the view
    // starts facing one of them); azimuth labels mark the 30-degree steps along
    // the horizon. Grid labels hide with the grid; N/E/S/W and the zenith don't.
    const labels: [string, number, number, string, boolean][] = [
      ['N', 0, 2, '', false],
      ['E', 90, 2, '', false],
      ['S', 180, 2, '', false],
      ['W', 270, 2, '', false],
      ['Zenith', 0, 90, ' is-ring', false],
    ]
    for (const az of [0, 180]) {
      labels.push(['30°', az, 30, ' is-ring', true], ['60°', az, 60, ' is-ring', true])
    }
    for (let az = 30; az < 360; az += 30) {
      if (az % 90) labels.push([`${az}°`, az, 2, ' is-ring is-azimuth', true])
    }
    for (const [text, az, el, cls, grid] of labels) {
      const label = document.createElement('div')
      label.className = `globe-sky-label${cls}`
      label.textContent = text
      label.hidden = true
      container.appendChild(label)
      this.skyLabels.push({
        el: label,
        dir: new THREE.Vector3(...skyDirection(az, el)).multiplyScalar(DOME_RADIUS),
        grid,
        ring: text === '30°' || text === '60°' ? { az, el } : undefined,
      })
    }

    const stamp = (key: keyof typeof this.drawnAt) => () => {
      this.drawnAt[key] = this.frameNo
    }
    this.ringA.onBeforeRender = stamp('a')
    this.ringB.onBeforeRender = stamp('b')
    this.ringInspect.onBeforeRender = stamp('inspect')
    this.ringGroup.onBeforeRender = stamp('group')
    this.linkLine.onBeforeRender = stamp('line')
    this.orbitSlots.forEach((slot, k) => {
      slot.line.onBeforeRender = stamp(k ? 'orbit2' : 'orbit')
      slot.sky.onBeforeRender = stamp(k ? 'skyOrbit2' : 'skyOrbit')
    })

    const canvas = this.renderer.domElement
    canvas.addEventListener('pointerdown', this.handlePointerDown)
    canvas.addEventListener('pointerup', this.handlePointerUp)
    canvas.addEventListener('pointermove', this.handleSkyPointerMove)
    canvas.addEventListener('pointercancel', this.handleSkyPointerEnd)
    canvas.addEventListener('wheel', this.handleSkyWheel, { passive: false })

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
    this.velocities = new Float32Array(objects.length * 3)
    this.rgba = new Float32Array(objects.length * 4).fill(1)
    this.drawRgba = this.rgba.slice()
    const color = new THREE.BufferAttribute(this.drawRgba, 4)
    this.geometry.setAttribute('color', color)
    // The Sky points share the same colour buffer, so filters, colour modes
    // and dimming apply to both views without copying.
    this.skyPositions = new Float32Array(objects.length * 3)
    this.skyGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.skyPositions, 3).setUsage(THREE.DynamicDrawUsage),
    )
    this.skyGeometry.setAttribute('color', color)
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1000)
    this.fullPending = true
    this.link = null
    this.ringA.visible = this.ringB.visible = this.linkLine.visible = false
    this.linkLabel.hidden = true
    this.clearGroup()
    this.inspectIdx = null
    this.ringInspect.visible = false
    this.neighbor = null
    this.povIdx = null
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

  // Playback (live or from a scrubbed time) at 50x reaches the end of the
  // ~24 h forward range (the slider's limit) in about half an hour; pause
  // there, keeping the speed, rather than run past it.
  private clampToEnd(): number {
    const now = Date.now()
    const { clock, simMs } = clampToEnd(this.clock, now, now + DAY_MS)
    this.clock = clock
    return simMs
  }

  /**
   * Jump to a conjunction's TCA, ring both objects, draw a dashed line between
   * them labelled `label` (the reported miss distance; away from the TCA the
   * label shows their live separation), and fly the camera to them. Time
   * holds at the TCA during the fly-in, then plays on from it at the selected
   * speed. Returns false if either object isn't in the loaded catalog.
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
    const link = { a, b, kind: 'pair' as const, label, tcaMs }
    this.link = link
    this.applyDim()
    this.setClock({ kind: 'frozen', speed: this.clock.speed, atMs: tcaMs }, true)
    this.updateLink(date)
    this.ringA.visible = this.ringB.visible = this.linkLine.visible = true
    this.controls.minDistance = FOCUS_MIN_DISTANCE
    // Look down at the pair from just outside it, with Earth behind.
    const mid = pa.add(pb).multiplyScalar(0.5)
    this.animateCamera(mid.clone().add(mid.clone().normalize().multiplyScalar(0.9)), mid, () => {
      // Still this replay, still held at its TCA: play on from there.
      if (this.link === link && this.clock.kind === 'frozen' && this.clock.atMs === tcaMs) {
        this.setClock(scrubClock(tcaMs, this.clock.speed))
      }
    })
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
    if (this.viewMode === 'pov') {
      // No catalog is drawn in the satellite view, so nothing to dim.
      draw.set(base)
    } else if (this.link?.kind === 'pair') dimExcept(base, draw, [this.link.a, this.link.b], DIM_ALPHA)
    else if (sel !== null) {
      // The live neighbour (and its line) are globe-only; in the Sky view only
      // the selected object stays bright.
      const nb = this.viewMode === 'globe' ? (this.neighbor?.index ?? -1) : -1
      dimExcept(base, draw, [sel, nb], DIM_ALPHA)
    }
    // A selected planet, Moon or Sun dims every satellite, like any selection.
    else if (this.selectedBody !== null && this.viewMode === 'sky') dimExcept(base, draw, [], DIM_ALPHA)
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

  /**
   * Switch between the globe and the overhead Sky view. Same renderer, catalog,
   * clock, filters and colours; only the camera, scene and overlays change.
   * An inspected object stays selected across the switch; a near-miss pair or
   * station view (globe camera modes) is the caller's to end first.
   */
  setViewMode(mode: ViewMode) {
    if (mode === this.viewMode) return
    const leavingPov = this.viewMode === 'pov'
    this.viewMode = mode
    // The satellite view pauses the catalog: coming back, propagate everything
    // at once and refresh the neighbour, so the dots and the neighbour line
    // are exactly current.
    if (leavingPov) {
      this.fullPending = true
      this.neighborRefresh.dirty = true
      // No tile requests outside the satellite view.
      this.earthTiles?.pause()
    }
    this.controls.enabled = mode === 'globe' && this.camAnim === null
    this.povSun.visible = false
    this.skyPointers.clear()
    this.skyGesture = null
    this.linkLabel.hidden = true
    for (const l of this.skyLabels) l.el.hidden = mode !== 'sky'
    this.skyInspectLabel.hidden = true
    // Bodies exist only in the Sky view: a body selection ends with it.
    if (mode !== 'sky') {
      this.selectedBody = null
      this.skySunLabel.hidden = true
      for (const m of this.bodyMarkers.values()) m.label.hidden = true
    }
    this.applyDim()
  }

  /**
   * Enter (or move) the satellite view at catalog index `index`. A new
   * viewpoint starts looking down at the Earth with no drag offset.
   */
  enterPov(index: number) {
    if (this.povIdx !== index || this.viewMode !== 'pov') {
      this.povLook.preset = 'down'
      this.povLook.yaw = 0
      this.povLook.pitch = 0
    }
    this.povIdx = index
    this.povState = null
    if (!this.tilesModule && !this.tilesLoading) {
      this.tilesLoading = true
      import('./earthTiles')
        .then((m) => {
          if (this.disposed) return
          this.tilesModule = m
          this.earthTiles = new m.EarthTiles(
            this.earth,
            this.earthUniforms,
            this.renderer.capabilities.getMaxAnisotropy(),
            this.tileCaps()!,
            this.renderer,
          )
        })
        .catch(() => {
          // No tiles this time: the 2K texture stays.
          this.tilesLoading = false
        })
    }
    if (this.viewMode === 'pov') this.applyDim()
    else this.setViewMode('pov')
  }

  // Phones (a narrow stage) get a lower finest level and a smaller cache.
  private tileCaps(): import('./earthTiles').TileCaps | null {
    const m = this.tilesModule
    if (!m) return null
    return this.container.clientWidth < 640 ? m.PHONE_CAPS : m.DESKTOP_CAPS
  }

  /** Pick a look preset; the drag offset resets. */
  setPovPreset(preset: PovPreset) {
    this.povLook.preset = preset
    this.povLook.yaw = 0
    this.povLook.pitch = 0
  }

  /** Turn the satellite view (keyboard): degrees right and up. */
  povNudge(yawDeg: number, pitchDeg: number) {
    this.povLook.yaw = ((((this.povLook.yaw + yawDeg + 180) % 360) + 360) % 360) - 180
    this.povLook.pitch = Math.max(-POV_PITCH_MAX, Math.min(POV_PITCH_MAX, this.povLook.pitch + pitchDeg))
  }

  /** Zoom the satellite view's field of view by a factor (below 1 narrows). */
  povZoom(factor: number) {
    this.povCamera.fov = zoomFov(this.povCamera.fov, factor, this.povMinFov)
    this.povCamera.updateProjectionMatrix()
  }

  /** The satellite view's viewpoint and look, for the panel; null outside it. */
  povInfo() {
    if (this.viewMode !== 'pov' || !this.povState) return null
    const { altKm, speedKmS, latDeg, lonDeg } = this.povState
    const imagery = this.earthTiles?.status() ?? { date: null, state: 'starting' as const }
    return {
      altKm,
      speedKmS,
      latDeg,
      lonDeg,
      ...this.povLook,
      fov: this.povCamera.fov,
      minFov: this.povMinFov,
      imagery,
    }
  }

  // The satellite view: the viewpoint propagated exactly (never the sliced
  // positions, which would jitter), the camera on its LVLH frame, and the
  // globe scene drawn from there without the selection's own markers.
  private renderPov(date: Date) {
    const cam = this.povCamera
    const idx = this.povIdx
    const rec = idx === null ? null : this.satrecs[idx]
    const pv = rec ? propagate(rec, date) : null
    const ok = pv && pv.position && Number.isFinite(pv.position.x) && pv.velocity
    if (!ok) {
      if (rec && this.povState !== null) this.onPovLost?.()
      this.povState = null
      this.renderer.render(this.scene, cam)
      return
    }
    const p = new Float32Array(3)
    const v = new Float32Array(3)
    writeInertial(p, 0, pv.position.x, pv.position.y, pv.position.z)
    writeInertial(v, 0, pv.velocity.x, pv.velocity.y, pv.velocity.z)
    const pos: PovVec3 = [p[0], p[1], p[2]]
    const vel: PovVec3 = [v[0], v[1], v[2]]
    const geo = eciToGeodetic(pv.position, gstime(date))
    this.povState = {
      pos,
      vel,
      altKm: geo.height,
      speedKmS: Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z),
      latDeg: degreesLat(geo.latitude),
      lonDeg: degreesLong(geo.longitude),
    }
    const view = applyLook(presetView(this.povLook.preset, pos, vel), this.povLook.yaw, this.povLook.pitch)
    cam.position.set(...pos)
    cam.up.set(...view.up)
    cam.lookAt(pos[0] + view.look[0], pos[1] + view.look[1], pos[2] + view.look[2])
    cam.updateMatrixWorld()
    // Near plane: a fifth of the altitude (only the Earth and the Sun are
    // drawn here), between about 60 m and 60 km; far plane past the Earth's
    // far side and the Sun disc.
    const near = Math.max(1e-5, Math.min(1e-2, (Math.hypot(...pos) - 1) * 0.2))
    const far = Math.hypot(...pos) + 25
    if (Math.abs(near - cam.near) > near * 0.05 || Math.abs(far - cam.far) > 1) {
      cam.near = near
      cam.far = far
      cam.updateProjectionMatrix()
    }
    this.updatePovTiles(date, pos)
    const sun = this.earthUniforms.sunDir.value
    this.setRing(this.povSun, new THREE.Vector3(pos[0] + sun.x * 20, pos[1] + sun.y * 20, pos[2] + sun.z * 20))
    this.povSun.visible = true
    // Only the Earth and the Sun: the catalog's dots, rings, the neighbour line
    // and orbit lines are hidden for this render (and restored after, so the
    // globe and Sky views find them as they were).
    this.linkLabel.hidden = true
    const hidden = [
      this.catalogPoints,
      this.ringA,
      this.ringB,
      this.ringInspect,
      this.ringGroup,
      this.linkLine,
      ...this.orbitSlots.map((s2) => s2.line),
    ].filter((o) => o.visible)
    for (const o of hidden) o.visible = false
    const earthMaterial = this.earth.material
    if (this.earthTiles?.coversView()) this.earth.material = this.earthDepthOnly
    this.renderer.render(this.scene, cam)
    this.earth.material = earthMaterial
    for (const o of hidden) o.visible = true
  }

  // Feed the tiles the camera in the Earth's own (rotating) axes, and set the
  // narrowest zoom from the finest imagery level allowed here and the altitude.
  private updatePovTiles(date: Date, pos: PovVec3) {
    const tiles = this.earthTiles
    const cam = this.povCamera
    const h = Math.max(1, this.container.clientHeight)
    const caps = tiles ? this.tileCaps() : null
    if (tiles && caps) {
      tiles.setCaps(caps)
      this.earth.updateMatrixWorld()
      const camLocal = this.earth.worldToLocal(cam.position.clone())
      const ahead = this.earth.worldToLocal(
        cam.position.clone().add(new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion)),
      )
      const dir = ahead.sub(camLocal).normalize()
      const tanV = Math.tan((cam.fov * Math.PI) / 360)
      tiles.update(
        {
          cam: [camLocal.x, camLocal.y, camLocal.z],
          dir: [dir.x, dir.y, dir.z],
          fovDeg: cam.fov,
          halfDiagDeg: (Math.atan(tanV * Math.hypot(1, cam.aspect)) * 180) / Math.PI,
          screenPx: h,
        },
        date.getTime(),
        this.povGroundKmPerSec(pos),
      )
    }
    const altKm = (Math.hypot(...pos) - 1) * EARTH_RADIUS_KM
    const online = tiles !== null && caps !== null && tiles.status().state !== 'offline'
    this.povMinFov = online && caps ? minFovForImagery(altKm, LEVEL_KM(caps.maxLevel), h) : POV_FOV_MIN
    if (cam.fov < this.povMinFov) {
      cam.fov = this.povMinFov
      cam.updateProjectionMatrix()
    }
  }

  // How fast the view sweeps over the ground: the sub-satellite speed (orbital
  // speed scaled to the surface) times the playback speed; 0 when paused.
  private povGroundKmPerSec(pos: PovVec3): number {
    const st = this.povState
    if (!st || this.clock.kind === 'frozen') return 0
    return st.speedKmS * (1 / Math.hypot(...pos)) * this.clock.speed
  }

  /** Select a sky body (Sun, Moon or planet key) in the Sky view, or null. */
  setSelectedBody(key: string | null) {
    this.selectedBody = key
    this.applyDim()
  }

  /** The Sun, Moon and planets for the observer at the displayed time (empty until loaded). */
  skyBodiesNow(): SkyBody[] {
    return this.observer ? this.skyBodyList : []
  }

  // Recompute the bodies at most every 100 ms of real time and only once the
  // displayed time has moved a second (they move slowly); at once for a new
  // observer or a jump of more than a minute.
  private updateSkyBodies(simMs: number, date: Date) {
    const obs = this.observer
    if (!obs || !this.bodyEphem) return
    const u = this.bodyUpdate
    const key = `${obs.latDeg},${obs.lonDeg}`
    const now = performance.now()
    const dSim = Math.abs(simMs - u.simMs)
    const due = key !== u.obsKey || !(dSim < 60_000) || (dSim >= 1000 && now - u.realMs >= 100)
    if (!due) return
    this.skyBodyList = this.bodyEphem.computeSkyBodies(date, obs.latDeg, obs.lonDeg)
    u.simMs = simMs
    u.realMs = now
    u.obsKey = key
    u.costMs = performance.now() - now
  }

  // A label's size, measured once (labels don't change text).
  private labelSize(el: HTMLElement): { w: number; h: number } {
    const known = this.labelSizes.get(el)
    if (known && known.w > 0) return known
    const wasHidden = el.hidden
    el.style.visibility = 'hidden'
    el.hidden = false
    const size = { w: el.offsetWidth, h: el.offsetHeight }
    el.hidden = wasHidden
    el.style.visibility = ''
    this.labelSizes.set(el, size)
    return size
  }

  // Redraw the Moon's disc: lit fraction k, lit limb toward `rot` (radians,
  // canvas angle, 0 = right, clockwise). The marker's tint colours it.
  private drawMoon(k: number, rot: number) {
    const { canvas, tex } = this.moonPhase
    const ctx = canvas.getContext('2d')!
    const c = canvas.width / 2
    const r = c - 6
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.translate(c, c)
    ctx.rotate(rot)
    ctx.fillStyle = '#05070d' // a dark rim, as on the satellite points
    ctx.beginPath()
    ctx.arc(0, 0, r + 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#4a505c' // the unlit part: faint, so a thin crescent still reads as a disc
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, Math.PI * 2)
    ctx.fill()
    // Lit part, bright limb toward +x: the right half-disc, closed by the
    // terminator, a half-ellipse of x radius r|1 - 2k| (bulging toward the
    // lit limb for a crescent, away from it past half).
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false)
    const rx = Math.max(r * Math.abs(1 - 2 * k), 0.01)
    if (k < 0.5) ctx.ellipse(0, 0, rx, r, 0, Math.PI / 2, -Math.PI / 2, true)
    else ctx.ellipse(0, 0, rx, r, 0, Math.PI / 2, (3 * Math.PI) / 2, false)
    ctx.fill()
    ctx.restore()
    tex.needsUpdate = true
  }


  /**
   * End a near-miss pair or station view without touching an inspected
   * object (used when switching to the Sky view). The globe camera eases
   * back to free roam from where it is.
   */
  clearFocusKeepInspect() {
    const wasFocused = this.link?.kind === 'pair' || this.groupIdx !== null
    if (this.link?.kind === 'pair') this.clearLink()
    this.clearGroup()
    this.applyDim()
    if (wasFocused) this.releaseToFreeRoam()
  }

  /** The name shown beside the selected object's ring in the Sky view. */
  setInspectedName(name: string | null) {
    this.skyInspectLabel.textContent = name ?? ''
  }

  /** Back to the Sky view's initial look: facing the equator, default field of view. */
  resetSkyView() {
    this.setSkyFov(SKY_FOV_DEFAULT)
    this.skyLook.yaw = (this.observer?.latDeg ?? 0) >= 0 ? 180 : 0
    this.skyLook.pitch = Math.max(0, this.skyCamera.fov / 2 - 4)
  }

  /**
   * The inspected object's azimuth, elevation and range from the observer at
   * the displayed moment, from an exact propagation (not the sliced
   * positions). Null without an observer or a selection.
   */
  inspectedSky(): InspectedSky | null {
    const rec = this.inspectIdx === null ? null : this.satrecs[this.inspectIdx]
    const obs = this.observer
    if (!rec || !obs) return null
    const date = new Date(this.simTimeMs())
    const pv = propagate(rec, date)
    if (!pv) return null
    const p = new Float32Array(3)
    writeInertial(p, 0, pv.position.x, pv.position.y, pv.position.z)
    return lookAngles(observerFrame(obs.latDeg, obs.lonDeg, gstime(date)), [p[0], p[1], p[2]])
  }

  /**
   * Where the selected object's ring is drawn in the Sky view, in CSS pixels
   * from the canvas's top left; null when it isn't on screen (below the
   * horizon, out of view, or in the Globe view).
   */
  inspectedSkyScreen(): { x: number; y: number } | null {
    return this.viewMode === 'sky' ? this.skySelScreen : null
  }

  /** The selected object's orbital period in ms, or null without a drawn orbit. */
  inspectedOrbitPeriodMs(): number | null {
    const o = this.orbitSlots[0].state
    return o && o.idx === this.inspectIdx ? o.periodMs : null
  }

  /** Day/night shading on the globe (on by default); off is the old uniform lighting. */
  setDayNight(on: boolean) {
    this.earthUniforms.enabled.value = on ? 1 : 0
  }

  /** Show or hide the Sky view's dome grid and its degree labels. */
  setSkyGrid(on: boolean) {
    this.skyGridOn = on
    this.domeGrid.visible = on
  }

  getViewMode(): ViewMode {
    return this.viewMode
  }

  /**
   * Where the Sky view is seen from (altitude 0), or null for none yet. A new
   * observer resets the look to face the equator, horizon near the bottom.
   */
  setObserver(observer: Observer | null) {
    this.observer = observer
    if (observer && !this.bodyEphem && !this.bodyEphemLoading) {
      this.bodyEphemLoading = true
      import('./planets')
        .then((m) => {
          if (!this.disposed) this.bodyEphem = m
        })
        .catch(() => {
          // No planets this time; the Sky view works without them.
          this.bodyEphemLoading = false
        })
    }
    if (observer) {
      // Face the equator (south from the northern hemisphere, north from the
      // southern): stable, and where the geostationary belt and most of the
      // low-orbit traffic cross the sky. The highest object changes every few
      // seconds, so it would make a jumpy starting point.
      this.skyLook.yaw = observer.latDeg >= 0 ? 180 : 0
      this.skyLook.pitch = Math.max(0, this.skyCamera.fov / 2 - 4)
    }
  }

  /** Shown (not filtered) objects above the observer's horizon right now. */
  /** The Sun's azimuth and elevation for the Sky view's observer, or null without one. */
  skySun(): { azDeg: number; elDeg: number } | null {
    return this.observer ? this.skySunAngles : null
  }

  // The sky dome's colours for a solar elevation (linear, from twilight.ts).
  private setSkyColours(elDeg: number) {
    const { zenith, horizon, glow } = skyPalette(elDeg)
    this.skyDomeUniforms.zenith.value.setRGB(...zenith)
    this.skyDomeUniforms.horizon.value.setRGB(...horizon)
    this.skyDomeUniforms.glow.value.setRGB(...glow)
  }

  skyAboveHorizon(): number {
    return this.observer ? this.skyAbove : 0
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
      orbits: this.orbitSlots
        .map((slot) => slot.state)
        .filter((o) => o !== null)
        .map((o) => ({
          index: o.idx,
          centreMs: o.centreMs,
          periodMs: o.periodMs,
          points: o.eci.length / 3,
        })),
      // Markers actually rendered in the last frame (not frustum-culled).
      drawn: Object.fromEntries(
        Object.entries(this.drawnAt).map(([k, f]) => [k, f === this.frameNo]),
      ),
      label: !this.linkLabel.hidden,
      viewMode: this.viewMode,
      sky: { look: { ...this.skyLook, fov: this.skyCamera.fov }, above: this.skyAbove, observer: this.observer },
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
    canvas.removeEventListener('pointermove', this.handleSkyPointerMove)
    canvas.removeEventListener('pointercancel', this.handleSkyPointerEnd)
    canvas.removeEventListener('wheel', this.handleSkyWheel)
    for (const l of this.skyLabels) l.el.remove()
    this.skyInspectLabel.remove()
    this.skySunLabel.remove()
    for (const m of this.bodyMarkers.values()) m.label.remove()
    this.moonPhase.tex.dispose()
    this.skyScene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
        obj.geometry.dispose()
        ;(obj.material as THREE.Material).dispose()
      }
    })
    this.skyGeometry.dispose()
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.Line) {
        obj.geometry.dispose()
        const m = obj.material as THREE.MeshBasicMaterial | THREE.PointsMaterial
        m.map?.dispose()
        m.dispose()
      }
    })
    this.earthTiles?.dispose()
    this.earthDepthOnly.dispose()
    // The Earth's shader material holds its textures in uniforms, not `map`.
    this.earthUniforms.dayMap.value?.dispose()
    this.earthUniforms.nightMap.value.dispose()
    this.renderer.dispose()
    canvas.remove()
    this.linkLabel.remove()
  }

  private handlePointerDown = (e: PointerEvent) => {
    if (this.viewMode === 'sky' || this.viewMode === 'pov') {
      this.skyPointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      this.renderer.domElement.setPointerCapture?.(e.pointerId)
      this.skyPinch = this.pinchDistance()
      if (this.skyPointers.size === 1) {
        this.skyGesture = { x: e.clientX, y: e.clientY, dragging: false, multi: false }
      } else if (this.skyGesture) {
        this.skyGesture.multi = true
      }
      return
    }
    this.pointerDown = e.isPrimary && e.button === 0 ? { x: e.clientX, y: e.clientY } : null
  }

  private pinchDistance(): number {
    const [a, b] = [...this.skyPointers.values()]
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
  }

  private setSkyFov(fov: number) {
    this.skyCamera.fov = Math.min(SKY_FOV_MAX, Math.max(SKY_FOV_MIN, fov))
    this.skyCamera.updateProjectionMatrix()
  }

  // Sky: one-finger/mouse drag looks around (the sky follows the pointer),
  // two-finger pinch changes the field of view.
  private handleSkyPointerMove = (e: PointerEvent) => {
    if (this.viewMode !== 'sky' && this.viewMode !== 'pov') return
    const pov = this.viewMode === 'pov'
    const prev = this.skyPointers.get(e.pointerId)
    if (!prev) return
    this.skyPointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (this.skyPointers.size >= 2) {
      const d = this.pinchDistance()
      if (this.skyPinch > 0 && d > 0) {
        if (pov) this.povZoom(this.skyPinch / d)
        else this.setSkyFov(this.skyCamera.fov * (this.skyPinch / d))
      }
      this.skyPinch = d
      return
    }
    // Only a real drag looks around; small jitter during a click does nothing.
    const g = this.skyGesture
    if (g && !g.dragging) {
      if (Math.hypot(e.clientX - g.x, e.clientY - g.y) <= CLICK_MAX_MOVE_PX) return
      g.dragging = true
    }
    if (pov) {
      // The view follows the pointer, as in Sky.
      const deg = this.povCamera.fov / Math.max(1, this.container.clientHeight)
      this.povNudge(-(e.clientX - prev.x) * deg, (e.clientY - prev.y) * deg)
      return
    }
    const degPerPx = this.skyCamera.fov / Math.max(1, this.container.clientHeight)
    this.skyLook.yaw = (this.skyLook.yaw - (e.clientX - prev.x) * degPerPx + 360) % 360
    this.skyLook.pitch = Math.min(
      SKY_PITCH_MAX,
      Math.max(-SKY_PITCH_MAX, this.skyLook.pitch + (e.clientY - prev.y) * degPerPx),
    )
  }

  // A click or tap in the Sky view picks the nearest visible object above the
  // horizon within the same screen-space radius as the globe.
  private pickSky(e: PointerEvent) {
    if (!this.observer) return
    const rect = this.renderer.domElement.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const tolerance = e.pointerType === 'touch' ? PICK_PX_TOUCH : PICK_PX_MOUSE
    // Pick priority: a click inside a body's disc picks the body; otherwise
    // the nearest satellite within the usual radius; otherwise a body within
    // that radius of its disc's edge.
    const bodyAt = (extra: number) => {
      let best: string | null = null
      let bestD = Infinity
      for (const b of this.skyBodyScreen) {
        const d = Math.hypot(px - b.x, py - b.y) - b.r
        if (d <= extra && d < bestD) {
          best = b.key
          bestD = d
        }
      }
      return best
    }
    const inDisc = bodyAt(0)
    if (inDisc) return this.onPickBody?.(inDisc)
    if (!this.satrecs.length) {
      const near = bodyAt(tolerance)
      return near ? this.onPickBody?.(near) : this.onPick?.(null)
    }
    const cam = this.skyCamera
    cam.updateMatrixWorld()
    const viewProj = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
    const sky = this.skyPositions
    const index = pickNearest(
      sky,
      (i) => this.rgba[i * 4 + 3] > 0 && this.satrecs[i] !== null && sky[i * 3 + 1] > 0,
      // The sky camera sits at the origin, inside the unit "Earth" sphere the
      // picker tests for occlusion, so nothing is ever treated as occluded.
      { viewProj: viewProj.elements, camera: [0, 0, 0], width: rect.width, height: rect.height },
      px,
      py,
      tolerance,
    )
    if (index === null) {
      const near = bodyAt(tolerance)
      if (near) return this.onPickBody?.(near)
    }
    this.onPick?.(index)
  }

  private handleSkyPointerEnd = (e: PointerEvent) => {
    this.skyPointers.delete(e.pointerId)
    this.skyPinch = this.pinchDistance()
  }

  // Sky: the wheel (and trackpad pinch, which arrives as ctrl+wheel) zooms
  // the field of view.
  private handleSkyWheel = (e: WheelEvent) => {
    if (this.viewMode !== 'sky' && this.viewMode !== 'pov') return
    e.preventDefault()
    if (this.viewMode === 'pov') this.povZoom(Math.exp(e.deltaY * 0.001))
    else this.setSkyFov(this.skyCamera.fov * Math.exp(e.deltaY * 0.001))
  }

  // A click (not a drag-to-rotate) picks the nearest visible point within a
  // fixed screen-space radius.
  private handlePointerUp = (e: PointerEvent) => {
    if (this.viewMode === 'pov') {
      // Satellite view: drags and pinches only (picking comes later).
      this.handleSkyPointerEnd(e)
      if (this.skyPointers.size === 0) this.skyGesture = null
      return
    }
    if (this.viewMode === 'sky') {
      const g = this.skyGesture
      const wasOnly = this.skyPointers.size === 1 && this.skyPointers.has(e.pointerId)
      this.handleSkyPointerEnd(e)
      if (this.skyPointers.size === 0) this.skyGesture = null
      if (g && wasOnly && !g.dragging && !g.multi && e.button === 0) this.pickSky(e)
      return
    }
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
    for (const slot of this.orbitSlots) {
      slot.line.material.resolution.set(w, h)
      slot.sky.material.resolution.set(w, h)
    }
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.skyCamera.aspect = w / h
    this.skyCamera.updateProjectionMatrix()
    this.povCamera.aspect = w / h
    this.povCamera.updateProjectionMatrix()
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
    const vel = this.velocities
    for (let i = from; i < to; i++) {
      const rec = this.satrecs[i]
      const pv = rec && propagate(rec, date)
      if (pv) {
        writeInertial(pos, i, pv.position.x, pv.position.y, pv.position.z)
        writeInertial(vel, i, pv.velocity.x, pv.velocity.y, pv.velocity.z)
      } else {
        pos[i * 3] = pos[i * 3 + 1] = pos[i * 3 + 2] = 0 // hidden inside Earth
        vel[i * 3] = vel[i * 3 + 1] = vel[i * 3 + 2] = 0
      }
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
    const atTca = link.tcaMs !== undefined && Math.abs(date.getTime() - link.tcaMs) < 1000
    this.linkLabel.textContent =
      link.label !== null && (link.tcaMs === undefined || atTca)
        ? link.label
        : formatKm(pa.distanceTo(pb) * EARTH_RADIUS_KM)
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

  // The dome grid: elevation rings every 15 degrees (the horizon is drawn
  // separately, crisper) and azimuth lines every 30 from the horizon to the
  // zenith, N/E/S/W a little stronger, fading out above DOME_AZ_FADE_START so
  // they don't clump overhead. One line set with per-vertex alpha.
  private makeDomeGrid(): THREE.LineSegments {
    const pos: number[] = []
    const col: number[] = []
    const at = (az: number, el: number) =>
      new THREE.Vector3(...skyDirection(az, el)).multiplyScalar(DOME_GRID_RADIUS)
    const seg = (a: THREE.Vector3, b: THREE.Vector3, alphaA: number, alphaB: number) => {
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z)
      col.push(...GRID_COLOR, alphaA, ...GRID_COLOR, alphaB)
    }
    for (let el = 15; el < 90; el += 15) {
      for (let az = 0; az < 360; az += 2) seg(at(az, el), at(az + 2, el), DOME_RING_ALPHA, DOME_RING_ALPHA)
    }
    const fade = (el: number) => {
      if (el <= DOME_AZ_FADE_START) return 1
      const t = Math.min(1, (el - DOME_AZ_FADE_START) / (DOME_AZ_FADE_END - DOME_AZ_FADE_START))
      return 1 - t * t * (3 - 2 * t)
    }
    for (let az = 0; az < 360; az += 30) {
      const base = az % 90 === 0 ? DOME_CARDINAL_ALPHA : DOME_AZ_ALPHA
      for (let el = 0; el < DOME_AZ_FADE_END; el += 2) {
        seg(at(az, el), at(az, el + 2), base * fade(el), base * fade(el + 2))
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 4))
    const grid = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }),
    )
    grid.renderOrder = 1
    grid.frustumCulled = false
    return grid
  }

  // A north/south, east/west grid on a ground plane one eye-height below the
  // observer, seen in true perspective. The camera sits at the origin, so
  // pushing each plane point out along its own direction onto a sphere just
  // inside the ground keeps exactly the same image (lines converge toward the
  // horizon) while staying in front of the ground and behind nothing else.
  // Built once; decoration only, not part of the sky geometry.
  private makeGroundGrid(radius: number): THREE.LineSegments {
    const pos: number[] = []
    const col: number[] = []
    const fade = (d: number) => {
      if (d <= GRID_FADE_START) return 1
      if (d >= GRID_FADE_END) return 0
      const t = (d - GRID_FADE_START) / (GRID_FADE_END - GRID_FADE_START)
      return 1 - t * t * (3 - 2 * t) // smoothstep
    }
    const push = (x: number, z: number) => {
      const len = Math.hypot(x, 1, z) // plane at y = -1 (one eye-height down)
      pos.push((x / len) * radius, (-1 / len) * radius, (z / len) * radius)
      col.push(...GRID_COLOR, GRID_ALPHA * fade(Math.hypot(x, z)))
    }
    const n = Math.floor(GRID_FADE_END / GRID_CELL)
    for (let k = -n; k <= n; k++) {
      const c = k * GRID_CELL
      const half = Math.sqrt(Math.max(0, GRID_FADE_END ** 2 - c * c))
      for (let t = -half; t < half; t += GRID_STEP) {
        const t2 = Math.min(half, t + GRID_STEP)
        // Line of constant east-west offset (runs north-south: along z)...
        push(c, t)
        push(c, t2)
        // ...and of constant north-south offset (runs east-west: along x).
        push(t, c)
        push(t2, c)
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 4))
    const grid = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }),
    )
    grid.renderOrder = 1
    grid.frustumCulled = false
    return grid
  }

  // The Sky view: every object's dome position from the sliced positions
  // (moved forward by velocity over each slice's staleness), the camera from
  // the look angles, then the compass labels.
  private renderSky(simMs: number, date: Date) {
    const obs = this.observer
    this.skyPoints.visible = obs !== null && this.satrecs.length > 0
    const obsFrame = obs ? observerFrame(obs.latDeg, obs.lonDeg, gstime(date)) : null
    // The sky for the Sun's elevation; without an observer, the old night sky.
    this.skySunAngles = obsFrame ? directionLookAngles(obsFrame, sunDirectionScene(date)) : null
    const sun = this.skySunAngles
    this.setSkyColours(sun ? sun.elDeg : -90)
    if (sun) {
      const dir = skyDirection(sun.azDeg, sun.elDeg)
      this.skyDomeUniforms.sunDir.value.set(...dir)
      this.setRing(this.skySunMarker, new THREE.Vector3(...dir).multiplyScalar(DOME_RADIUS * 1.02))
    }
    // Shown while any of the disc is above the horizon; the ground hides the rest.
    this.skySunMarker.visible = sun !== null && sun.elDeg > -1
    for (const slot of this.orbitSlots) {
      if (obsFrame) this.placeSkyOrbit(slot, obsFrame)
      else slot.sky.visible = false
    }
    if (obs && obsFrame && this.satrecs.length) {
      const dt = Array.from(this.sliceSimMs, (t) => (simMs - t) / 1000)
      const pos = this.positions
      this.skyAbove = writeDome(
        this.skyPositions,
        pos,
        this.velocities,
        dt,
        obsFrame,
        (i) => this.satrecs[i] !== null && (pos[i * 3] !== 0 || pos[i * 3 + 1] !== 0),
        (i) => this.rgba[i * 4 + 3] > 0,
      )
      ;(this.skyGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
    } else {
      this.skyAbove = 0
    }
    const cam = this.skyCamera
    const { clientWidth: w, clientHeight: h } = this.container
    cam.up.set(0, 1, 0)
    cam.lookAt(new THREE.Vector3(...skyDirection(this.skyLook.yaw, this.skyLook.pitch)))
    cam.updateMatrixWorld()
    // The selected object's ring and name, hidden while it's below the horizon.
    const sel = this.inspectIdx
    const sp = this.skyPositions
    const showSel = obs !== null && sel !== null && sp.length > sel * 3 && sp[sel * 3 + 1] > 0
    this.skyRingInspect.visible = showSel
    this.skyInspectLabel.hidden = true
    this.skySelScreen = null
    if (showSel && sel !== null) {
      const at = new THREE.Vector3(sp[sel * 3], sp[sel * 3 + 1], sp[sel * 3 + 2])
      this.setRing(this.skyRingInspect, at)
      const v = at.project(cam)
      if (v.z <= 1 && Math.abs(v.x) <= 1.05 && Math.abs(v.y) <= 1.05) {
        this.skyInspectLabel.hidden = !this.skyInspectLabel.textContent
        this.skySelScreen = { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h }
        this.skyInspectLabel.style.transform = `translate(${((v.x + 1) / 2) * w + 18}px, ${((1 - v.y) / 2) * h}px) translate(0, -50%)`
      }
    }
    // Keep the elevation labels on the belt's meridian off the geostationary
    // row: the clearance is a fixed on-screen distance, so it holds at any
    // field of view.
    const belt = obs ? geoBeltElevation(obs.latDeg) : null
    const beltAz = obs ? geoBeltAzimuth(obs.latDeg) : null
    const clearanceDeg = (LABEL_CLEAR_PX * cam.fov) / Math.max(h, 1)
    for (const l of this.skyLabels) {
      if (l.ring) {
        const el = l.ring.az === beltAz ? ringLabelElevation(l.ring.el, belt, clearanceDeg) : l.ring.el
        l.dir.set(...skyDirection(l.ring.az, el)).multiplyScalar(DOME_RADIUS)
      }
      const v = l.dir.clone().project(cam)
      const off =
        v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05 || (l.grid && !this.skyGridOn)
      l.el.hidden = off
      if (!off) {
        l.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -50%)`
      }
    }
    this.placeSkyBodies(simMs, date, cam, w, h)
    this.renderer.render(this.skyScene, cam)
  }

  // Sun, Moon and planets: markers, the Moon's phase, the selected body's
  // ring, and labels placed clear of the grid labels and of each other.
  private placeSkyBodies(simMs: number, date: Date, cam: THREE.PerspectiveCamera, w: number, h: number) {
    this.updateSkyBodies(simMs, date)
    const pr = this.renderer.getPixelRatio()
    const sun = this.skySunAngles
    const toScreen = (dir: THREE.Vector3) => {
      const v = dir.clone().project(cam)
      return v.z <= 1 && Math.abs(v.x) <= 1.05 && Math.abs(v.y) <= 1.05
        ? { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h }
        : null
    }
    const narrow = w < 640
    const screen: typeof this.skyBodyScreen = []
    const requests: (LabelRequest & { el: HTMLDivElement })[] = []
    // Bodies in label priority: the selected one, then by brightness (Sun,
    // Moon, then planets).
    const order = [...this.skyBodyList].sort((a, b) =>
      a.key === this.selectedBody ? -1 : b.key === this.selectedBody ? 1 : a.mag - b.mag,
    )
    if (!this.observer || !order.length) this.skySunLabel.hidden = true
    for (const b of order) {
      const isSun = b.key === 'sun'
      const marker = isSun ? null : this.bodyMarkers.get(b.key)
      if (!isSun && !marker) continue
      // The Sun's marker is placed by the twilight code (sun.ts); use its angles.
      const az = isSun && sun ? sun.azDeg : b.azDeg
      const el = isSun && sun ? sun.elDeg : b.elDeg
      const up = this.observer !== null && el > 0
      const dir = new THREE.Vector3(...skyDirection(az, el))
      const size = markerSizePx(b.kind, b.mag)
      if (marker) {
        marker.points.visible = up
        if (up) {
          this.setRing(marker.points, dir.clone().multiplyScalar(DOME_RADIUS * 0.998))
          ;(marker.points.material as THREE.PointsMaterial).size = size * pr
        }
      }
      const at = up ? toScreen(dir.clone().multiplyScalar(DOME_RADIUS)) : null
      if (b.key === 'moon' && up && at && sun) {
        // The lit limb faces the Sun along the sky: draw it toward where a
        // small step from the Moon toward the Sun lands on screen.
        const m = skyDirection(az, el)
        const t = limbDirection(m, skyDirection(sun.azDeg, sun.elDeg))
        const step = toScreen(
          new THREE.Vector3(m[0] + t[0] * 0.01, m[1] + t[1] * 0.01, m[2] + t[2] * 0.01).multiplyScalar(
            DOME_RADIUS,
          ),
        )
        const rot = step ? Math.atan2(step.y - at.y, step.x - at.x) : 0
        const k = b.illuminated ?? 0
        const dRot = Math.abs(((rot - this.moonPhase.rot + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
        if (Math.abs(k - this.moonPhase.k) > 0.003 || dRot > (2 * Math.PI) / 180) {
          this.moonPhase.k = k
          this.moonPhase.rot = rot
          this.drawMoon(k, rot)
        }
      }
      const label = isSun ? this.skySunLabel : marker!.label
      if (!at) {
        label.hidden = true
        continue
      }
      screen.push({ key: b.key, x: at.x, y: at.y, r: size / 2 })
      if (showsLabel(b, narrow, this.selectedBody)) {
        const { w: lw, h: lh } = this.labelSize(label)
        requests.push({
          id: b.key,
          x: at.x,
          y: at.y,
          r: size / 2,
          w: lw,
          h: lh,
          force: b.key === this.selectedBody,
          el: label,
        })
      } else {
        label.hidden = true
      }
    }
    this.skyBodyScreen = screen

    // The selected body's ring (sized to clear its disc), and its screen spot
    // for the phone panel dock.
    const ringMat = this.skyRingInspect.material as THREE.PointsMaterial
    if (this.selectedBody) {
      const selected = screen.find((x) => x.key === this.selectedBody)
      this.skyRingInspect.visible = selected !== undefined
      this.skySelScreen = selected ? { x: selected.x, y: selected.y } : null
      const b = this.skyBodyList.find((x) => x.key === this.selectedBody)
      if (selected && b) {
        const az = b.key === 'sun' && sun ? sun.azDeg : b.azDeg
        const el = b.key === 'sun' && sun ? sun.elDeg : b.elDeg
        this.setRing(this.skyRingInspect, new THREE.Vector3(...skyDirection(az, el)).multiplyScalar(DOME_RADIUS))
        ringMat.size = Math.max(26, selected.r * 2 + 14) * pr
      }
    } else if (ringMat.size !== 26 * pr) {
      ringMat.size = 26 * pr
    }

    // Labels: obstacles are the visible grid and compass labels, every body
    // disc, and the selected satellite's name.
    const obstacles: Rect[] = []
    for (const l of this.skyLabels) {
      if (l.el.hidden) continue
      const v = l.dir.clone().project(cam)
      const { w: lw, h: lh } = this.labelSize(l.el)
      obstacles.push({ x: ((v.x + 1) / 2) * w - lw / 2, y: ((1 - v.y) / 2) * h - lh / 2, w: lw, h: lh })
    }
    for (const s2 of screen) obstacles.push({ x: s2.x - s2.r, y: s2.y - s2.r, w: s2.r * 2, h: s2.r * 2 })
    if (!this.skyInspectLabel.hidden && this.skySelScreen && this.selectedBody === null) {
      const { w: lw, h: lh } = this.labelSize(this.skyInspectLabel)
      obstacles.push({ x: this.skySelScreen.x + 18, y: this.skySelScreen.y - lh / 2, w: lw, h: lh })
    }
    // Labels stay in the sky: a spot whose centre is below the horizon (on
    // the ground) is skipped.
    const probe = new THREE.Vector3()
    const inSky = (r: Rect) => {
      probe.set(((r.x + r.w / 2) / w) * 2 - 1, 1 - ((r.y + r.h / 2) / h) * 2, 0.5).unproject(cam)
      return probe.y > 0 // the camera sits at the origin, so this is the direction's "up" part
    }
    const placed = placeLabels(requests, obstacles, { w, h }, inSky)
    for (const q of requests) {
      const r = placed.get(q.id)
      q.el.hidden = !r
      q.el.classList.toggle('is-active', q.id === this.selectedBody)
      if (r) q.el.style.transform = `translate(${r.x}px, ${r.y}px)`
    }
  }

  // Keep the orbit lines on the selection (orbitTargets): each slot is
  // rebuilt when its object or the loaded snapshot changes, or when the
  // displayed time has moved more than half that object's period from the
  // moment it was sampled around (orbit.ts). A near-miss pair jumps the clock
  // to its closest approach, so its loops are sampled around that moment. Runs
  // every frame but almost always returns at the first checks.
  private syncOrbits(simMs: number) {
    const targets = orbitTargets({
      inspect: this.inspectIdx,
      pair: this.link?.kind === 'pair' ? [this.link.a, this.link.b] : null,
      group: this.groupIdx,
    })
    this.orbitSlots.forEach((slot, k) => this.syncOrbitSlot(slot, targets[k] ?? null, simMs))
  }

  private syncOrbitSlot(slot: (typeof this.orbitSlots)[number], idx: number | null, simMs: number) {
    const rec = idx === null ? null : this.satrecs[idx]
    const o = slot.state
    if (o && o.idx === idx && o.rec === rec && !orbitNeedsRefresh(o.centreMs, simMs, o.periodMs)) return
    if (!o && !rec) return
    slot.state = null
    const periodMs = rec ? orbitPeriodMs(rec) : null
    const eci = rec && periodMs ? sampleOrbit(rec, simMs) : null
    slot.line.geometry.dispose()
    slot.sky.geometry.dispose()
    slot.line.geometry = new LineGeometry()
    slot.sky.geometry = new LineGeometry()
    if (idx !== null && rec && periodMs && eci) {
      slot.state = { idx, rec, centreMs: simMs, periodMs, eci }
      // Wide lines are open polylines: repeat the first point to close the loop.
      const closed = new Float32Array(eci.length + 3)
      closed.set(eci)
      closed.set(eci.subarray(0, 3), eci.length)
      slot.line.geometry.setPositions(closed)
      slot.skyPoints = new Float32Array(closed.length)
      slot.sky.geometry.setPositions(slot.skyPoints)
    }
    slot.line.visible = slot.state !== null
    slot.sky.visible = false // placed each Sky frame
  }

  // An orbit on the Sky dome: each sample's direction from the observer, at
  // the displayed moment (the Earth turns under the fixed orbit).
  private placeSkyOrbit(
    slot: (typeof this.orbitSlots)[number],
    frame: ReturnType<typeof observerFrame>,
  ) {
    const o = slot.state
    const start = slot.sky.geometry.getAttribute('instanceStart') as
      | THREE.InterleavedBufferAttribute
      | undefined
    if (!o || !start) {
      slot.sky.visible = false
      return
    }
    const src = o.eci
    const pts = slot.skyPoints
    for (let i = 0; i < src.length; i += 3) {
      const [x, y, z] = enuToSky(...toEnu(frame, src[i], src[i + 1], src[i + 2]))
      const k = SKY_ORBIT_RADIUS / (Math.hypot(x, y, z) || 1)
      pts[i] = x * k
      pts[i + 1] = y * k
      pts[i + 2] = z * k
    }
    pts.set(pts.subarray(0, 3), src.length)
    // Segment i runs from point i to point i + 1, stored as start/end pairs.
    const seg = start.data.array as Float32Array
    for (let i = 0; i + 3 < pts.length; i += 3) {
      seg.set(pts.subarray(i, i + 6), i * 2)
    }
    start.data.needsUpdate = true
    slot.sky.visible = true
  }

  private updateInspectRing(date: Date) {
    if (this.inspectIdx === null) return
    const p = this.positionOf(this.inspectIdx, date)
    if (p) this.setRing(this.ringInspect, p)
  }

  // Keep the miss label beside the pair on screen, hidden when the pair is
  // behind the Earth or the camera.
  private placeMissLabel(cam: THREE.PerspectiveCamera = this.camera) {
    if (!this.link || !this.linkLine.visible) {
      this.linkLabel.hidden = true
      return
    }
    const attr = this.linkLine.geometry.getAttribute('position') as THREE.BufferAttribute
    const mid = new THREE.Vector3(
      (attr.getX(0) + attr.getX(1)) / 2,
      (attr.getY(0) + attr.getY(1)) / 2,
      (attr.getZ(0) + attr.getZ(1)) / 2,
    )
    const toMid = mid.clone().sub(cam.position)
    const ray = new THREE.Ray(cam.position, toMid.clone().normalize())
    const hit = ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), 1), new THREE.Vector3())
    const behindEarth = hit !== null && hit.distanceTo(cam.position) < toMid.length()
    const ndc = mid.clone().project(cam)
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
      this.controls.enabled = this.viewMode === 'globe'
      this.camAnimDone?.()
      this.camAnimDone = undefined
    }
  }

  private frame = (now: number) => {
    if (this.disposed) return
    this.frameNo++
    const simMs = this.clampToEnd()
    const date = new Date(simMs)
    this.syncOrbits(simMs)
    this.earth.rotation.y = earthRotationY(gstime(date))
    this.earthUniforms.sunDir.value.set(...sunDirectionScene(date))

    // The satellite view draws no catalog: skip its propagation, the neighbour
    // search and the markers there (setViewMode catches up on the way out).
    const n = this.viewMode === 'pov' ? 0 : this.satrecs.length
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

    if (this.viewMode === 'sky') {
      this.renderSky(simMs, date)
      this.onTick?.(simMs)
      this.raf = requestAnimationFrame(this.frame)
      return
    }
    if (this.viewMode === 'pov') {
      this.renderPov(date)
      this.onTick?.(simMs)
      this.raf = requestAnimationFrame(this.frame)
      return
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
