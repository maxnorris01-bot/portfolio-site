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
import { EOX_LEVEL_KM } from './eox'
import { SPACE_FOV_MIN } from './stars'
import { bodiesFromSatellite, pickBody, sceneKm } from './spacebodies'
import { SKY_RADIUS as SKY_RADIUS_UNITS, STAR_PICK_PX } from './stars'
import {
  hipIndex,
  nameTable,
  readStarDetails,
  recordAt,
  starName,
  type IauName,
  type NameTable,
  type StarDetails,
  type StarRecord,
} from './stardetails'
import type { ConstellationToggle, Rect as LabelRect, ResolvedFigure } from './constellations'
import type { ConstellationLayer } from './constellationlayer'
import type { DecodedTile, GaiaDetail, GaiaDetails, Manifest } from './gaiatiles'
import type { SimbadClient, SimbadState } from './simbad'
import type { GaiaStars } from './gaiastars'
import type { FrameGuard, TileStreamer } from './tilestream'
import { starDataUrl } from './stardataurl'
import { SKY_DIM_DEFAULT, stepSkyDim, type SkyDimState, type SkyDimTargets } from './skydim'
import { LEVEL_KM, minFovForImagery, nightStreamWorthIt, tileFullyLit } from './gibs'
import { overlayFade } from './imagery'
import {
  DESCEND_FOV,
  DOUBLE_CLICK_ZOOM,
  detachFrom,
  easeInOut as easeView,
  groundAt,
  keepUnder,
  lerpPose,
  minAltitudeKm,
  northOnScreenDeg,
  northUpFor,
  oriented,
  panSurface,
  rayThrough,
  surfacePose,
  transitionMs,
  zoomLockedToward,
  zoomSurfaceToward,
  type Orientation,
  type Pose,
  type SurfaceCam,
} from './descend'
import {
  POV_FOV_DEFAULT,
  POV_FOV_MIN,
  POV_PITCH_MAX,
  applyLook,
  lookToward,
  presetView,
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
/** The star catalogue (scripts/build-hipparcos.mjs; licence in public/data/stars/ATTRIBUTION.md). */
const STAR_CATALOG_URL = '/data/stars/hipparcos.bin'
/** HIP numbers, parallax, spectral types (lazy, on the first star selection) and IAU names. */
const STAR_DETAILS_URL = '/data/stars/hipparcos-details.bin'
const STAR_NAMES_URL = '/data/stars/iau-names.json'
const CONSTELLATIONS_URL = '/data/stars/constellations.json'
/** The faintest V-equivalent magnitude the streamed Gaia stars (G < 13) reach. */
const GAIA_LIMIT = 14
const CONSTELLATION_BOUNDS_URL = '/data/stars/constellation-bounds.json'
// Two taps or clicks this close in time and place are a double tap (zoom in).
const DOUBLE_TAP_MS = 350
const DOUBLE_TAP_PX = 30
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
  private povIdOf: number | null = null
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
  // The satellite view's Earth imagery (earthTiles.ts), loaded the first time
  // the view opens: EOX Sentinel-2 cloudless 2016 as the base surface, and
  // NASA GIBS's daily mosaic over it while "Today's imagery" is on; and the
  // narrowest zoom the base imagery supports.
  private baseTiles: import('./earthTiles').EarthTiles | null = null
  private overlayTiles: import('./earthTiles').EarthTiles | null = null
  // Streamed night lights (NASA Black Marble) over the dark side, and whether
  // the bundled night texture has loaded (its lights switch off once the
  // streamed ones cover the view, so they don't add up).
  private nightTiles: import('./earthTiles').EarthTiles | null = null
  private nightTextureReady = false
  // The satellite view's sky (space.ts) and its star catalogue, loaded the
  // first time the view opens; and the files they come from.
  private space: import('./space').SpaceView | null = null
  private spaceLoading = false
  // The streamed Gaia stars: the manifest, the streamer and the layer, loaded
  // after the Hipparcos stars; 'unavailable' falls back to Hipparcos alone.
  private gaiaState: 'off' | 'loading' | 'ready' | 'unavailable' = 'off'
  private gaiaManifest: Manifest | null = null
  private gaiaStars: GaiaStars | null = null
  private gaiaStreamer: TileStreamer<DecodedTile> | null = null
  private gaiaGuard: FrameGuard | null = null
  private gaiaBudget = 0
  private gaiaBase = ''
  private gaiaDrawn = 0
  private gaiaPlanAt = 0
  private gaiaPlanView: { dir: [number, number, number]; fov: number } | null = null
  private gaiaFrameAt = 0
  /**
   * How much the satellite view dims the sky when it looks at the Earth (the
   * glow and the stars, never the Sun, Moon, planets, constellations or the
   * selection), as multipliers with the Earth filling the view, sunlit or on
   * the night side. A plain object so it can be retuned from the console:
   * __globe.skyDim.glowSunlit = 0.3 (see skydim.ts).
   */
  skyDim: SkyDimTargets = { ...SKY_DIM_DEFAULT }
  private skyDimState: SkyDimState | null = null
  private skyDimAt = 0
  // A selected Gaia star (its tile and place in it, and what the tile gives
  // for the card at once), its details (loaded on demand) and the SIMBAD
  // lookup for its name; selecting anything else clears them.
  private gaiaSel: {
    ipix: number
    i: number
    g: number
    cq: number
    mag: number
    dirJ2000: [number, number, number]
    raDeg: number
    decDeg: number
    constellation: { name: string; symbol: string } | null
  } | null = null
  private gaiaDetail: GaiaDetail | null = null
  private gaiaDetailState: 'idle' | 'loading' | 'ready' | 'failed' = 'idle'
  private readonly gaiaDetailCache = new Map<number, Promise<GaiaDetails>>()
  private simbadClient: SimbadClient | null = null
  private simbadState: SimbadState = { kind: 'idle' }
  private cardMod: typeof import('./gaiacard') | null = null
  private starCount = 0
  private glowShown = false
  // The Sun, Moon and planets from the satellite: refreshed a few times a
  // second, laid out each frame; the selected one and each one's screen spot.
  private spaceBodyAt = 0
  private spaceSelected: string | null = null
  // The selected star (catalogue index, or -1), its constellation, and the
  // lazily loaded details and IAU names (fetched when a star is first selected
  // or searched for).
  private spaceStar = -1
  // The Out view is locked to the orbit, so the sky sweeps past at about
  // 0.065 degrees a second; a found star is tracked (kept centred) so zooming
  // in on it works. A drag, a preset change or another selection ends it.
  private track: { kind: 'star' } | { kind: 'figure'; index: number } | null = null
  private spaceStarConstellation: { index: number; name: string; symbol: string } | null = null
  private starDetails: StarDetails | null = null
  private starNames: NameTable | null = null
  private starHipIndex: Map<number, number> | null = null
  private starDetailsLoading: Promise<void> | null = null
  private starDetailsError = false
  private spaceStarRing: HTMLDivElement | null = null
  private spaceStarLabel: HTMLDivElement | null = null
  private spaceScreen: import('./space').ScreenBody[] = []
  // Constellations: the figure and boundary files load the first time the
  // switch is turned on, a star is selected or a figure is asked for. The
  // layer draws the lines; labels are DOM, like the bodies'. The selected
  // star's own figure is highlighted while its card shows, even with the
  // switch off.
  private constToggle: ConstellationToggle = { on: false, names: false, boundaries: false }
  private constMod: typeof import('./constellations') | null = null
  private constLayer: ConstellationLayer | null = null
  private constLoading: Promise<void> | null = null
  private constBoundsLoading = false
  private constError = false
  private constFigures: ResolvedFigure[] = []
  private constByAbbr = new Map<string, number>()
  private spaceConstellation = -1
  private constLabels: HTMLDivElement[] = []
  private constLabelSize: ({ w: number; h: number } | null)[] = []
  private constLabelRects: (LabelRect & { index: number })[] = []
  /** Per figure: its stars bright enough to take a tap from the name beside them. */
  private constBright: number[][] = []
  private spaceObstacles: LabelRect[] = []
  private constFrameAt = 0
  private readonly spaceLabels = new Map<string, HTMLDivElement>()
  private todayImagery = false
  /** Today's imagery's fade with zoom (1 shown, 0 faded out up close). */
  private overlayFadeNow = 1
  private tilesModule: typeof import('./earthTiles') | null = null
  private tilesLoading = false
  private povMinFov = POV_FOV_MIN
  // Descend zoom (descend.ts): once the user zooms in past DESCEND_FOV or
  // double-clicks, the camera holds over a ground point (Earth-fixed, so it
  // turns with the Earth), at `povDetachedFov`. Null while riding the satellite.
  private povDetached: SurfaceCam | null = null
  private povDetachedFov = DESCEND_FOV
  // Heading up (the satellite's point of view, the default) or north up.
  private povOrientation: Orientation = 'heading'
  // The field of view the projection matrix was last built with.
  private povRenderFov = 0
  // A view change in progress: from the camera's pose (world frame) and field
  // of view when it started, toward the live target pose.
  private povAnim: { from: Pose; fromFov: number; start: number; dur: number } | null = null
  // The last tap or click in the satellite view, for double-tap detection.
  private povLastTap: { t: number; x: number; y: number } | null = null
  private readonly reducedMotion =
    typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null
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
  private idByIndex: number[] = []
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
        this.nightTextureReady = true
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
    this.idByIndex = objects.map((o) => o.norad_id)
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
      this.baseTiles?.pause()
      this.overlayTiles?.pause()
      this.nightTiles?.pause()
      // Back to the bundled night texture's lights alone.
      this.earthUniforms.hasLights.value = this.nightTextureReady ? 1 : 0
      // Leaving the satellite view (Back) also leaves a held ground view.
      this.povDetached = null
      this.povAnim = null
      this.space?.hide()
      this.skyDimState = null
      this.skyDimAt = 0
      for (const el of this.spaceLabels.values()) el.hidden = true
      for (const el of this.constLabels) el.hidden = true
      this.constLabelRects = []
      this.spaceSelected = null
      this.spaceStar = -1
      this.clearGaiaSelection()
      this.spaceConstellation = -1
      this.track = null
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
    // A new snapshot moves the same satellite to a new index: keep the view
    // (look, zoom, a held ground view). Only a different satellite resets it.
    const id = this.idByIndex[index] ?? null
    const sameObject = id !== null && id === this.povIdOf
    this.povIdOf = id
    if (!sameObject || this.viewMode !== 'pov') {
      this.povLook.preset = 'down'
      this.povLook.yaw = 0
      this.povLook.pitch = 0
      this.povDetached = null
      this.povAnim = null
    }
    this.povIdx = index
    this.povState = null
    if (!this.tilesModule && !this.tilesLoading) {
      this.tilesLoading = true
      import('./earthTiles')
        .then((m) => {
          if (this.disposed) return
          this.tilesModule = m
          this.baseTiles = this.makeTiles(m.EOX_SOURCE)
        })
        .catch(() => {
          // No tiles this time: the 2K texture stays.
          this.tilesLoading = false
        })
    }
    if (!this.space && !this.spaceLoading) this.loadSpace()
    if (this.viewMode === 'pov') this.applyDim()
    else this.setViewMode('pov')
  }

  // The sky for the satellite view: space.ts, the ephemeris (for the J2000
  // to date rotation) and the star catalogue, all lazy. Phones keep the
  // stars down to magnitude 8, desktops all ~118,000.
  private loadSpace() {
    this.spaceLoading = true
    const phone = this.container.clientWidth < 640 || this.container.clientHeight < 500
    Promise.all([import('./space'), this.bodyEphem ? Promise.resolve(this.bodyEphem) : import('./planets')])
      .then(async ([m, ephem]) => {
        if (this.disposed) return
        this.bodyEphem ??= ephem
        const space = new m.SpaceView(this.scene)
        this.space = space
        const tier = phone ? m.STAR_TIERS.phone : m.STAR_TIERS.desktop
        const catalog = await m.loadStarCatalog(STAR_CATALOG_URL, tier.maxMag)
        if (this.disposed) return
        space.setStars(new m.StarField(catalog, this.renderer.getPixelRatio()))
        this.starCount = catalog.count
        void this.startGaia(space, tier)
      })
      .catch((err: unknown) => {
        // No stars this time: the satellite view works without them.
        if (import.meta.env.DEV) console.warn('satellite view sky:', err)
        this.spaceLoading = false
      })
  }

  private makeTiles(source: import('./earthTiles').ImagerySource) {
    const m = this.tilesModule!
    return new m.EarthTiles(
      this.earth,
      this.earthUniforms,
      this.renderer.capabilities.getMaxAnisotropy(),
      source,
      this.tileCaps(source),
      this.renderer,
    )
  }

  // Phones (a narrow stage) get a lower finest level and a smaller cache.
  private tileCaps(source: import('./earthTiles').ImagerySource): import('./earthTiles').TileCaps {
    return this.container.clientWidth < 640 ? source.phone : source.desktop
  }

  /**
   * "Today's imagery": draw NASA GIBS's daily mosaic (following the displayed
   * date) over the EOX base in the satellite view. Off by default.
   */
  setTodayImagery(on: boolean) {
    this.todayImagery = on
    if (!on) this.overlayTiles?.pause()
  }

  /** Pick a look preset (riding the satellite again if detached); the drag offset resets. */
  setPovPreset(preset: PovPreset) {
    this.track = null
    this.startPovAnim()
    this.povDetached = null
    this.povLook.preset = preset
    this.povLook.yaw = 0
    this.povLook.pitch = 0
  }

  /**
   * Keyboard look: degrees right and up. Riding the satellite it turns the
   * view; held over the ground it pans (a 5 degree step moves the view by
   * about a tenth of its width).
   */
  povNudge(yawDeg: number, pitchDeg: number) {
    if (this.povDetached) {
      const k = 0.15 / 5
      this.povDetached = this.onShown(this.povDetached, (s) =>
        panSurface(s, [0, 0], [-yawDeg * k, -pitchDeg * k], this.povDetachedFov, this.povCamera.aspect),
      )
      return
    }
    this.track = null
    this.povLook.yaw = ((((this.povLook.yaw + yawDeg + 180) % 360) + 360) % 360) - 180
    this.povLook.pitch = Math.max(-POV_PITCH_MAX, Math.min(POV_PITCH_MAX, this.povLook.pitch + pitchDeg))
  }

  /** Zoom toward the centre of the view (keyboard +/-), animated. */
  povZoom(factor: number) {
    this.povZoomAt(factor, 0, 0, true)
  }

  /**
   * Zoom by `factor` (below 1 zooms in) toward the screen point (nx, ny) in
   * -1..1: the ground (or sky) under it stays under it. Riding the satellite
   * this narrows the field of view down to DESCEND_FOV; zooming in past that
   * over the ground detaches the camera, which then descends toward the
   * point, easing to a stop at the finest imagery level.
   */
  povZoomAt(factor: number, nx: number, ny: number, animate = false) {
    const cam = this.povCamera
    const aspect = cam.aspect
    if (this.povDetached) {
      if (animate) this.startPovAnim()
      const limits = this.povAltitudeLimits()
      this.povDetached = this.onShown(this.povDetached, (s) =>
        zoomSurfaceToward(s, factor, nx, ny, this.povDetachedFov, aspect, limits),
      )
      return
    }
    const st = this.povState
    if (!st) return
    const base = presetView(this.povLook.preset, st.pos, st.vel)
    const look = { yaw: this.povLook.yaw, pitch: this.povLook.pitch, fov: cam.fov }
    const pose: Pose = this.ridingPose(st.pos, st.vel)
    const overGround = groundAt(pose, cam.fov, aspect, nx, ny) !== null
    if (animate) this.startPovAnim()
    if (factor < 1 && overGround && cam.fov * factor < DESCEND_FOV) {
      // Narrow to DESCEND_FOV toward the pointer, then hand over to the
      // surface camera at the centre of that view (an animated turn to
      // straight down, north up), and descend by what's left of the step.
      const fovBefore = cam.fov
      const [ux, uy] = this.unrolledNdc(pose, base, look, nx, ny)
      const r = zoomLockedToward(base, look, DESCEND_FOV / fovBefore, ux, uy, aspect, DESCEND_FOV)
      this.applyLockedLook(r)
      const local = this.toEarth(this.ridingPose(st.pos, st.vel))
      const under = groundAt(local, DESCEND_FOV, aspect, nx, ny)
      const centre = detachFrom(local, DESCEND_FOV, aspect)
      if (!centre || !under) return
      if (!animate) this.startPovAnim()
      this.povDetachedFov = DESCEND_FOV
      // The held view takes the riding view's screen-up as its heading (no
      // swing), and the point under the pointer stays under it.
      const s = this.onShown(centre, (c) => keepUnder(c, under, DESCEND_FOV, aspect, nx, ny))
      const rest = (fovBefore * factor) / DESCEND_FOV
      const limits = this.povAltitudeLimits(s)
      this.povDetached = this.onShown(s, (c) => zoomSurfaceToward(c, rest, nx, ny, DESCEND_FOV, aspect, limits))
      return
    }
    // Over the ground the riding zoom stops at DESCEND_FOV (then descends);
    // looking out at space it narrows much further, to examine stars and planets.
    const minFov = overGround ? DESCEND_FOV : SPACE_FOV_MIN
    const [ux, uy] = this.unrolledNdc(pose, base, look, nx, ny)
    this.applyLockedLook(zoomLockedToward(base, look, factor, ux, uy, aspect, minFov))
  }

  /** Pan the held ground view with a drag from one screen point to another (-1..1). */
  povPan(from: [number, number], to: [number, number]) {
    if (!this.povDetached) return
    this.povDetached = this.onShown(this.povDetached, (s) => panSurface(s, from, to, this.povDetachedFov, this.povCamera.aspect))
  }

  /**
   * Heading up (default) or north up. Switching turns the view about the
   * vertical (animated); heading up goes back to the heading captured when
   * the camera detached, or riding the satellite to its ground track.
   */
  setPovOrientation(o: Orientation) {
    if (o === this.povOrientation) return
    this.startPovAnim()
    this.povOrientation = o
  }

  // Zoom and pan act on the camera as shown (north up drops the heading),
  // but the held view keeps its captured heading for switching back.
  private onShown(s: SurfaceCam, f: (shown: SurfaceCam) => SurfaceCam): SurfaceCam {
    return { ...f(oriented(s, this.povOrientation)), headingDeg: s.headingDeg }
  }

  // North's direction on screen at the centre of the view, as rendered.
  private povNorthOnScreen(): number | null {
    const cam = this.povCamera
    const look = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion)
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion)
    const local = this.toEarth({ pos: cam.position.toArray() as PovVec3, look: look.toArray() as PovVec3, up: up.toArray() as PovVec3 })
    return northOnScreenDeg(local, this.povRenderFov || cam.fov, cam.aspect)
  }

  /** Back to riding the satellite from a held ground view, animated. */
  returnToSatellite() {
    if (!this.povDetached) return
    this.startPovAnim()
    this.povDetached = null
  }

  private applyLockedLook(r: { yaw: number; pitch: number; fov: number }) {
    this.povLook.yaw = r.yaw
    this.povLook.pitch = Math.max(-POV_PITCH_MAX, Math.min(POV_PITCH_MAX, r.pitch))
    if (r.fov !== this.povCamera.fov) {
      this.povCamera.fov = r.fov
      this.povCamera.updateProjectionMatrix()
    }
  }

  // The descent's altitude range: down to where one pixel of the finest base
  // imagery level in use covers one CSS pixel (MAX_SOURCE_PX_PER_CSS_PX; the
  // view's CSS height, not its device-pixel height), up to twice the
  // satellite's altitude (or the starting altitude, if higher).
  private povAltitudeLimits(s: SurfaceCam | null = this.povDetached) {
    const caps = this.baseTiles ? this.tileCaps(this.baseTiles.source) : null
    const kmPerPx = caps ? EOX_LEVEL_KM(caps.maxLevel) : 20 // the 2K texture: ~20 km per pixel
    const minKm = minAltitudeKm(kmPerPx, this.povDetachedFov, Math.max(1, this.container.clientHeight))
    const maxKm = Math.max(2 * (this.povState?.altKm ?? 400), s?.altKm ?? 0, minKm * 2)
    return { minKm, maxKm }
  }

  // A screen point in the riding view as shown (possibly rolled to north up),
  // as the same direction's screen point in the unrolled preset frame the
  // look offsets are kept in.
  private unrolledNdc(
    shown: Pose,
    base: { look: PovVec3; up: PovVec3 },
    look: { yaw: number; pitch: number; fov: number },
    nx: number,
    ny: number,
  ): [number, number] {
    const aspect = this.povCamera.aspect
    const plain = applyLook(base, look.yaw, look.pitch)
    const d = rayThrough(shown, look.fov, aspect, nx, ny)
    const right: PovVec3 = [
      plain.look[1] * plain.up[2] - plain.look[2] * plain.up[1],
      plain.look[2] * plain.up[0] - plain.look[0] * plain.up[2],
      plain.look[0] * plain.up[1] - plain.look[1] * plain.up[0],
    ]
    const dl = d[0] * plain.look[0] + d[1] * plain.look[1] + d[2] * plain.look[2]
    const t = Math.tan((look.fov * Math.PI) / 360)
    const x = (d[0] * right[0] + d[1] * right[1] + d[2] * right[2]) / dl / (t * aspect)
    const y = (d[0] * plain.up[0] + d[1] * plain.up[1] + d[2] * plain.up[2]) / dl / t
    return [x, y]
  }

  // The view riding the satellite: the preset and drag offset, with north
  // rolled to the top when north up is chosen and the view looks down at the
  // ground (Forward and Out keep a level horizon).
  private ridingPose(pos: PovVec3, vel: PovVec3): Pose {
    const view = applyLook(presetView(this.povLook.preset, pos, vel), this.povLook.yaw, this.povLook.pitch)
    const pose: Pose = { pos, ...view }
    if (this.povOrientation !== 'north' || this.povLook.preset !== 'down') return pose
    const local = this.toEarth(pose)
    const up = northUpFor(local, this.povCamera.fov, this.povCamera.aspect)
    return up ? this.toWorld({ ...local, up }) : pose
  }

  // Earth-fixed <-> world (inertial scene) frames: the Earth mesh's rotation.
  private toEarth(p: Pose): Pose {
    this.earth.updateMatrixWorld()
    const inv = new THREE.Matrix4().copy(this.earth.matrixWorld).invert()
    const pt = (v: PovVec3) => new THREE.Vector3(...v).applyMatrix4(inv).toArray() as PovVec3
    const dir = (v: PovVec3) => new THREE.Vector3(...v).transformDirection(inv).toArray() as PovVec3
    return { pos: pt(p.pos), look: dir(p.look), up: dir(p.up) }
  }

  private toWorld(p: Pose): Pose {
    this.earth.updateMatrixWorld()
    const m = this.earth.matrixWorld
    const pt = (v: PovVec3) => new THREE.Vector3(...v).applyMatrix4(m).toArray() as PovVec3
    const dir = (v: PovVec3) => new THREE.Vector3(...v).transformDirection(m).toArray() as PovVec3
    return { pos: pt(p.pos), look: dir(p.look), up: dir(p.up) }
  }

  // Start a view transition from wherever the camera is now.
  private startPovAnim() {
    const cam = this.povCamera
    const look = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion)
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion)
    const dur = transitionMs(this.reducedMotion?.matches ?? false)
    this.povAnim = dur > 0 && this.povState
      ? { from: { pos: cam.position.toArray() as PovVec3, look: look.toArray() as PovVec3, up: up.toArray() as PovVec3 }, fromFov: cam.fov, start: performance.now(), dur }
      : null
  }

  /** For the ?debug=1 overlay: how much the sky is dimmed for the Earth in view. */
  debugSkyDim(): string {
    const s = this.skyDimState
    if (!s) return 'sky dim: not in the satellite view'
    return `sky dim: glow ×${s.glow.toFixed(2)}, stars ×${s.stars.toFixed(2)} (Earth in view ${s.e.toFixed(2)}, sunlit ${s.lit.toFixed(2)})`
  }

  /** For the ?debug=1 overlay: the engine's own view and selection state. */
  debugSelection(): string {
    return `${this.viewMode}, inspect ${this.inspectIdx}, group ${this.groupIdx?.length ?? 0} pieces, pov ${this.povIdx}`
  }

  /**
   * For the ?debug=1 overlay: whether catalog index `index` has elements the
   * engine could parse and whether they propagate at the displayed time.
   */
  debugObject(index: number): { satrec: boolean; propagated: boolean; error: string | null } {
    const rec = this.satrecs[index] ?? null
    if (!rec) return { satrec: false, propagated: false, error: 'no satrec (unparsed or dropped)' }
    const pv = propagate(rec, new Date(this.simTimeMs()))
    const ok = !!pv && !!pv.position && typeof pv.position !== 'boolean' && Number.isFinite(pv.position.x)
    return { satrec: true, propagated: ok, error: ok ? null : `SGP4 error ${rec.error}` }
  }

  /** The satellite view's viewpoint and look, for the panel; null outside it. */
  povInfo() {
    if (this.viewMode !== 'pov' || !this.povState) return null
    const { altKm, speedKmS, latDeg, lonDeg } = this.povState
    const starting = { date: null, state: 'starting' as const, drawn: 0 }
    const imagery = {
      night: this.nightTiles ? this.nightTiles.status() : null,
      base: this.baseTiles?.status() ?? starting,
      overlay: this.todayImagery ? { ...(this.overlayTiles?.status() ?? starting), fade: this.overlayFadeNow } : null,
    }
    return {
      altKm,
      speedKmS,
      latDeg,
      lonDeg,
      ...this.povLook,
      fov: this.povDetached ? this.povDetachedFov : this.povCamera.fov,
      minFov: this.povMinFov,
      imagery,
      /** Held over the ground (descended or panned), or null while riding the satellite. */
      detached: this.povDetached ? { ...this.povDetached, minKm: this.povAltitudeLimits().minKm } : null,
      orientation: this.povOrientation,
      /** What's drawn in the sky (for the footnote's credits). */
      sky: {
        stars: this.starCount,
        glow: this.glowShown,
        gaia: this.gaiaInfo(),
        gaiaStar: this.gaiaStarInfo(),
        simbad: !!this.gaiaSel && this.simbadState.kind === 'found',
        names: this.starNames !== null,
        starSelected: this.spaceStar >= 0,
        star: this.starInfo(),
        constellations: {
          /** Figures drawn or fading (for the credit). */
          lines: !!this.constLayer && this.constLayer.opacity.lines + this.constLayer.opacity.highlight > 0.01,
          boundaries: !!this.constLayer && this.constLayer.opacity.boundaries > 0.01,
          on: this.constToggle.on,
          loading: this.constLoading !== null,
          failed: this.constError,
          /** The figure highlighted for the selected star (IAU abbreviation), or null. */
          highlighted: this.constFigures[this.activeFigure()]?.abbr ?? null,
          selected: this.constellationInfo(),
        },
        selected: this.spaceSelected,
        bodies:
          this.space?.bodies.current.map((v) => ({
            key: v.key,
            name: SKY_BODIES.find((d) => d.key === v.key)?.name ?? v.key,
            kind: SKY_BODIES.find((d) => d.key === v.key)?.kind ?? 'planet',
            mag: v.mag,
            distKm: v.distKm,
            angDiameterDeg: v.angDiameterDeg,
            illuminated: v.illuminated,
            waxing: v.waxing,
            parallaxDeg: v.parallaxDeg,
          })) ?? [],
      },
      /** Where north points on screen, degrees clockwise from up (null: the centre is sky). */
      northDeg: this.povNorthOnScreen(),
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
    // Where the camera should be: riding the satellite, or held over the
    // ground (Earth-fixed, so it turns with the Earth); part-way there while a
    // view change animates.
    this.trackStar(pos, vel)
    const target: Pose = this.povDetached
      ? this.toWorld(surfacePose(oriented(this.povDetached, this.povOrientation)))
      : this.ridingPose(pos, vel)
    // Zoomed in on the sky past DESCEND_FOV and then turned to the Earth: ease
    // back out to the ground's riding limit (the Earth isn't sharp that close).
    if (!this.povDetached && cam.fov < DESCEND_FOV && groundAt(target, cam.fov, cam.aspect, 0, 0)) {
      this.startPovAnim()
      cam.fov = DESCEND_FOV
      cam.updateProjectionMatrix()
    }
    const targetFov = this.povDetached ? this.povDetachedFov : cam.fov
    let pose = target
    let fov = targetFov
    const anim = this.povAnim
    if (anim) {
      const t = (performance.now() - anim.start) / anim.dur
      if (t >= 1) this.povAnim = null
      else {
        const e = easeView(t)
        pose = lerpPose(anim.from, target, e)
        fov = Math.exp(Math.log(anim.fromFov) + (Math.log(targetFov) - Math.log(anim.fromFov)) * e)
      }
    }
    const eye = pose.pos
    cam.position.set(...eye)
    cam.up.set(...pose.up)
    cam.lookAt(eye[0] + pose.look[0], eye[1] + pose.look[1], eye[2] + pose.look[2])
    cam.updateMatrixWorld()
    // Near plane: a fifth of the altitude (only the Earth and the Sun are
    // drawn here), between about 60 m and 60 km; far plane past the Earth's
    // far side and the Sun disc.
    const near = Math.max(1e-5, Math.min(1e-2, (Math.hypot(...eye) - 1) * 0.2))
    const far = Math.hypot(...eye) + 25
    if (Math.abs(near - cam.near) > near * 0.05 || Math.abs(far - cam.far) > 1 || fov !== this.povRenderFov) {
      cam.near = near
      cam.far = far
      this.povRenderFov = fov
      const keep = cam.fov
      cam.fov = fov
      cam.updateProjectionMatrix()
      // cam.fov holds the locked zoom; the render may use another for a moment.
      cam.fov = keep
    }
    this.updatePovTiles(date, pos)
    const sun = this.earthUniforms.sunDir.value
    this.setRing(this.povSun, new THREE.Vector3(eye[0] + sun.x * 20, eye[1] + sun.y * 20, eye[2] + sun.z * 20))
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
    if (this.space && this.bodyEphem) {
      this.space.setDate(date, this.bodyEphem.j2000ToDateMatrix)
      // The Earth in view dims the glow and the stars (not the bodies, the lines or the selection).
      const dimNow = performance.now()
      const dt = this.skyDimAt ? Math.min(0.25, (dimNow - this.skyDimAt) / 1000) : 0
      this.skyDimAt = dimNow
      const look = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion)
      const sunV = this.earthUniforms.sunDir.value
      this.skyDimState = stepSkyDim(
        this.skyDimState,
        [cam.position.x, cam.position.y, cam.position.z],
        [look.x, look.y, look.z],
        [sunV.x, sunV.y, sunV.z],
        fov,
        dt,
        this.reducedMotion?.matches ?? false,
        this.skyDim,
      )
      this.space.setSkyDim(this.skyDimState.glow, this.skyDimState.stars)
      this.space.update(cam, fov, date)
      this.updateGaia(cam, fov)
      this.updateSpaceBodies(date, pos, cam, fov)
      this.space.glow.update(cam.position, this.earthUniforms.sunDir.value)
    }
    const earthMaterial = this.earth.material
    if (this.baseTiles?.coversView()) this.earth.material = this.earthDepthOnly
    this.renderer.render(this.scene, cam)
    this.earth.material = earthMaterial
    for (const o of hidden) o.visible = true
  }

  // Feed the tiles the camera in the Earth's own (rotating) axes, and set the
  // narrowest zoom from the finest imagery level allowed here and the altitude.
  // `pos` is the satellite (for the zoom limit); the tiles follow the camera
  // as rendered (the satellite, or held over the ground, or mid-transition).
  private updatePovTiles(date: Date, pos: PovVec3) {
    const base = this.baseTiles
    const cam = this.povCamera
    const h = Math.max(1, this.container.clientHeight)
    if (base) {
      this.earth.updateMatrixWorld()
      const camLocal = this.earth.worldToLocal(cam.position.clone())
      const ahead = this.earth.worldToLocal(
        cam.position.clone().add(new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion)),
      )
      const dir = ahead.sub(camLocal).normalize()
      const fovNow = this.povRenderFov || cam.fov
      const tanV = Math.tan((fovNow * Math.PI) / 360)
      const view = {
        cam: [camLocal.x, camLocal.y, camLocal.z] as [number, number, number],
        dir: [dir.x, dir.y, dir.z] as [number, number, number],
        fovDeg: fovNow,
        halfDiagDeg: (Math.atan(tanV * Math.hypot(1, cam.aspect)) * 180) / Math.PI,
        screenPx: h,
      }
      // Held over the ground the view doesn't move with the satellite: full detail at any speed.
      const ground = this.povDetached ? 0 : this.povGroundKmPerSec(pos)
      base.setCaps(this.tileCaps(base.source))
      base.update(view, date.getTime(), ground)
      this.updateNightTiles(view, date, ground)
      if (this.todayImagery && this.tilesModule) {
        this.overlayTiles ??= this.makeTiles(this.tilesModule.GIBS_SOURCE)
        const caps = this.tileCaps(this.overlayTiles.source)
        this.overlayTiles.setCaps(caps)
        // Fade it out as the view gets closer than its finest level supports;
        // fully faded, it's hidden and fetches nothing.
        this.overlayFadeNow = overlayFade(this.groundKmPerPxAtCentre(fovNow, h), LEVEL_KM(caps.maxLevel))
        if (this.overlayFadeNow > 0) {
          this.overlayTiles.setLayerOpacity(this.overlayFadeNow)
          this.overlayTiles.update(view, date.getTime(), ground)
        } else this.overlayTiles.pause()
      }
    }
    // The zoom limit follows the base imagery (EOX, ~10 m at its finest level);
    // the daily overlay just gets softer when zoomed past its own ~244 m.
    const altKm = (Math.hypot(...pos) - 1) * EARTH_RADIUS_KM
    const online = base !== null && base.status().state !== 'offline'
    this.povMinFov = online
      ? minFovForImagery(altKm, EOX_LEVEL_KM(this.tileCaps(base.source).maxLevel), h)
      : POV_FOV_MIN
  }

  // The ground size of one screen pixel at the centre of the view, km (very
  // large when the centre is sky).
  private groundKmPerPxAtCentre(fovDeg: number, screenPx: number): number {
    const cam = this.povCamera
    const o = cam.position
    const d = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion)
    const b = o.dot(d)
    const disc = b * b - (o.dot(o) - 1)
    if (disc < 0) return Infinity
    const t = -b - Math.sqrt(disc)
    if (t < 0) return Infinity
    return (t * EARTH_RADIUS_KM * 2 * Math.tan((fovDeg * Math.PI) / 360)) / screenPx
  }

  // Night lights streamed over the dark side: tiles fully in daylight aren't
  // fetched, and once they cover the view the bundled texture's lights are
  // switched off (so they don't add up). Needs day/night shading on.
  private updateNightTiles(view: import('./gibs').View, date: Date, ground: number) {
    const u = this.earthUniforms
    const tiles = this.tilesModule
    // Only once a screen pixel is finer than the bundled texture's: wider
    // than that, the 2K lights are as sharp as the screen shows.
    const kmPerPx = this.groundKmPerPxAtCentre(view.fovDeg, view.screenPx)
    if (!tiles || u.enabled.value <= 0 || !nightStreamWorthIt(kmPerPx)) {
      this.nightTiles?.pause()
      u.hasLights.value = this.nightTextureReady ? 1 : 0
      return
    }
    this.nightTiles ??= this.makeTiles(tiles.NIGHT_SOURCE)
    this.nightTiles.setCaps(this.tileCaps(this.nightTiles.source))
    // The Sun's direction in the Earth's own axes, to tell dark tiles from day ones.
    this.earth.updateMatrixWorld()
    const sunLocal = u.sunDir.value.clone().transformDirection(new THREE.Matrix4().copy(this.earth.matrixWorld).invert())
    // Fully lit (the whole tile above +4 degrees; the shading's full day is +3) has no lights to show.
    const sun: [number, number, number] = [sunLocal.x, sunLocal.y, sunLocal.z]
    const keep = (t: import('./gibs').TileKey) => !tileFullyLit(t, sun)
    this.nightTiles.update(view, date.getTime(), ground, keep)
    u.hasLights.value = this.nightTextureReady && !this.nightTiles.coversView() ? 1 : 0
  }

  // The Sun, Moon and planets from the viewpoint satellite (not the Earth's
  // centre: the Moon's parallax from low orbit is about a degree).
  private updateSpaceBodies(date: Date, satPos: PovVec3, cam: THREE.PerspectiveCamera, fov: number) {
    const space = this.space
    const ephem = this.bodyEphem
    if (!space || !ephem) return
    const now = performance.now()
    if (now - this.spaceBodyAt > 100 || space.bodies.current.length === 0) {
      this.spaceBodyAt = now
      space.bodies.set(
        bodiesFromSatellite(ephem.geocentricBodies(date), sceneKm(satPos), ephem.j2000ToDateMatrix(date)),
      )
    }
    const w = Math.max(1, this.container.clientWidth)
    const h = Math.max(1, this.container.clientHeight)
    this.spaceScreen = space.bodies.layout(cam, fov, w, h)
    this.spaceObstacles = []
    this.updateStarMarker(cam, w, h)
    // The riding view's own Sun marker is replaced by the real disc and glare.
    this.povSun.visible = false
    const narrow = w < 640
    for (const sb of this.spaceScreen) {
      let el = this.spaceLabels.get(sb.key)
      if (!el) {
        el = document.createElement('div')
        el.className = 'globe-sky-label is-body'
        el.textContent = SKY_BODIES.find((d) => d.key === sb.key)?.name ?? sb.key
        el.hidden = true
        this.container.appendChild(el)
        this.spaceLabels.set(sb.key, el)
      }
      const view = space.bodies.current.find((v) => v.key === sb.key)
      const def = SKY_BODIES.find((d) => d.key === sb.key)
      const show =
        sb.visible &&
        !!view &&
        !!def &&
        showsLabel({ kind: def.kind, mag: view.mag, key: sb.key } as Pick<SkyBody, 'kind' | 'mag' | 'key'>, narrow, this.spaceSelected)
      el.hidden = !show
      el.classList.toggle('is-selected', sb.key === this.spaceSelected)
      if (show) {
        el.style.left = `${sb.x}px`
        el.style.top = `${sb.y + sb.r + 10}px`
        this.spaceObstacles.push({ x: sb.x, y: sb.y + sb.r + 10, w: 8 + 7 * (el.textContent?.length ?? 6), h: 18 })
      }
      if (sb.visible) this.spaceObstacles.push({ x: sb.x - sb.r, y: sb.y - sb.r, w: sb.r * 2, h: sb.r * 2 })
    }
    this.updateConstellations(cam, fov, w, h)
  }

  // The selection ring and name beside the selected star, following it as the
  // view moves; hidden when it's off screen, behind the Earth or closer to
  // the screen's edge than the labels can fit.
  private updateStarMarker(cam: THREE.PerspectiveCamera, widthPx: number, heightPx: number) {
    const stars = this.space?.stars
    let ring = this.spaceStarRing
    let label = this.spaceStarLabel
    if (!ring) {
      ring = document.createElement('div')
      ring.className = 'globe-star-ring'
      ring.hidden = true
      this.container.appendChild(ring)
      this.spaceStarRing = ring
      label = document.createElement('div')
      label.className = 'globe-sky-label is-body is-selected'
      label.hidden = true
      this.container.appendChild(label)
      this.spaceStarLabel = label
    }
    const gaia = this.gaiaSel
    const gaiaDir = gaia ? this.space?.j2000ToSceneDir(gaia.dirJ2000) ?? null : null
    const hipSelected = !!stars && this.spaceStar >= 0 && this.spaceStar < stars.count
    if ((!hipSelected && !gaiaDir) || this.viewMode !== 'pov') {
      ring.hidden = true
      if (label) label.hidden = true
      return
    }
    const d = gaiaDir ?? stars!.direction(this.spaceStar)
    const eye = cam.position
    const p = new THREE.Vector3(d[0], d[1], d[2]).multiplyScalar(SKY_RADIUS_UNITS).add(eye).project(cam)
    const b = eye.x * d[0] + eye.y * d[1] + eye.z * d[2]
    const c = eye.lengthSq() - 1
    const hidden = eye.length() > 1 && b * b - c >= 0 && -b - Math.sqrt(b * b - c) > 0
    const on = p.z < 1 && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && !hidden
    ring.hidden = !on
    if (label) label.hidden = !on
    if (!on || !label) return
    const x = ((p.x + 1) / 2) * widthPx
    const y = ((1 - p.y) / 2) * heightPx
    ring.style.left = `${x}px`
    ring.style.top = `${y}px`
    label.style.left = `${x}px`
    label.style.top = `${y + 22}px`
    if (gaia) {
      label.textContent = this.cardMod ? this.cardMod.gaiaStarLabel(this.gaiaDetail, this.simbadState) : 'Gaia star'
    } else {
      const hip = this.starDetails ? this.starDetails.hip[this.spaceStar] : null
      label.textContent = hip === null ? 'Star' : starName(hip, this.starNames)
    }
    this.spaceObstacles.push(
      { x: x - 13, y: y - 13, w: 26, h: 26 },
      { x, y: y + 22, w: 8 + 7.5 * (label.textContent?.length ?? 4), h: 20 },
    )
  }

  /** Select a Sun, Moon or planet in the satellite view (null clears it). */
  setSpaceSelected(key: string | null) {
    this.spaceSelected = key
    if (key) this.selectStar(-1)
  }

  // The selected star for the card: the catalogue's own values (position,
  // magnitude, colour) at once, the details and name once they've loaded.
  private starInfo(): {
    index: number
    vmag: number
    bv: number
    raDeg: number
    decDeg: number
    constellation: { name: string; symbol: string } | null
    record: StarRecord | null
    name: string
    iau: boolean
    designation: string
    loading: boolean
    failed: boolean
  } | null {
    const stars = this.space?.stars
    const i = this.spaceStar
    if (!stars || i < 0 || i >= stars.count) return null
    const cat = stars.catalog
    const x = cat.dirJ2000[i * 3]
    const y = cat.dirJ2000[i * 3 + 1]
    const z = cat.dirJ2000[i * 3 + 2]
    const raDeg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
    const decDeg = (Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI
    if (!this.spaceStarConstellation || this.spaceStarConstellation.index !== i) {
      const c = this.bodyEphem?.constellationOf(raDeg, decDeg)
      this.spaceStarConstellation = c ? { index: i, ...c } : null
    }
    const record = this.starDetails ? recordAt(this.starDetails, i) : null
    const named = record ? this.starNames?.byHip.get(record.hip) : undefined
    return {
      index: i,
      vmag: cat.mag[i],
      bv: cat.bv[i],
      raDeg,
      decDeg,
      constellation: this.spaceStarConstellation
        ? { name: this.spaceStarConstellation.name, symbol: this.spaceStarConstellation.symbol }
        : null,
      record,
      name: record ? starName(record.hip, this.starNames) : 'Star',
      iau: !!named,
      designation: named ? [named[2], named[3]].filter(Boolean).join(' ') : '',
      loading: !record && !this.starDetailsError,
      failed: this.starDetailsError,
    }
  }

  // ---- Streamed Gaia stars ----

  // Fetch the manifest and set up streaming. Any failure (offline, the data
  // not uploaded, a bad file) leaves the Hipparcos stars alone and says so.
  private async startGaia(space: import('./space').SpaceView, tier: (typeof import('./space'))['STAR_TIERS'][keyof (typeof import('./space'))['STAR_TIERS']]) {
    if (this.gaiaState !== 'off' || !space.stars) return
    this.gaiaState = 'loading'
    const base = starDataUrl({ env: import.meta.env.VITE_STAR_DATA_URL as string | undefined, search: window.location.search, dev: import.meta.env.DEV })
    this.gaiaBase = base
    try {
      const [tiles, gaia, stream, healpix, card, simbad] = await Promise.all([
        import('./gaiatiles'),
        import('./gaiastars'),
        import('./tilestream'),
        import('./healpix'),
        import('./gaiacard'),
        import('./simbad'),
      ])
      const res = await fetch(`${base}/manifest.json`)
      if (!res.ok) throw new Error(`manifest: HTTP ${res.status}`)
      const manifest = tiles.readManifest(await res.json())
      if (this.disposed || this.space !== space || !space.stars) return
      const layer = new gaia.GaiaStars(space.stars.starMaterial)
      space.addRotating(layer)
      space.stars.setCatalogLimit(GAIA_LIMIT)
      this.gaiaManifest = manifest
      this.cardMod = card
      this.simbadClient = new simbad.SimbadClient((id, state) => {
        if (this.gaiaDetail?.sourceId === id) this.simbadState = state
      })
      this.gaiaStars = layer
      this.gaiaBudget = tier.gaiaBudget
      this.gaiaGuard = new stream.FrameGuard()
      this.gaiaStreamer = new stream.TileStreamer<DecodedTile>({
        manifest,
        geometry: healpix.tileGeometry(manifest.order),
        load: async (entry, signal) => {
          const r = await fetch(`${base}/${entry.file}`, { signal })
          if (!r.ok) throw new Error(`tile ${entry.ipix}: HTTP ${r.status}`)
          return tiles.decodeTile(await tiles.maybeGunzip(await r.arrayBuffer()))
        },
        starsOf: (t) => t.count,
        budgetStars: tier.gaiaBudget,
        cacheStars: tier.gaiaCache,
        concurrency: tier.concurrency,
        onLoaded: (ipix, tile) => layer.add(ipix, tile),
        onEvicted: (ipix) => layer.remove(ipix),
        onUnavailable: () => {
          this.gaiaState = 'unavailable'
        },
      })
      this.gaiaState = 'ready'
      void this.loadGlow(space, base)
    } catch (err) {
      this.gaiaState = 'unavailable'
      if (import.meta.env.DEV) console.warn('streamed stars:', err)
    }
  }

  // The Milky Way's glow from the Gaia atlas (a 40 kB JPEG): decoded, turned into a
  // longitude-latitude texture in slices (so no frame is held up), and added as the
  // sky's backdrop. If it can't load the sky is simply the stars on black.
  private async loadGlow(space: import('./space').SpaceView, base: string) {
    try {
      const [glow, layer] = await Promise.all([import('./glow'), import('./glowlayer')])
      const res = await fetch(`${base}/glow-o7.jpg`)
      if (!res.ok) throw new Error(`glow: HTTP ${res.status}`)
      const bitmap = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none' })
      if (bitmap.width !== glow.GLOW_ATLAS_WIDTH || bitmap.height !== glow.GLOW_ATLAS_HEIGHT) throw new Error('glow: unexpected size')
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) throw new Error('glow: no 2d canvas')
      ctx.drawImage(bitmap, 0, 0)
      bitmap.close()
      const atlas = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      const w = 1024
      const h = 512
      const out = new Uint8Array(w * h * 4)
      for (let y = 0; y < h; y += 32) {
        glow.fillGlowRows(atlas, out, w, h, y, Math.min(h, y + 32))
        await new Promise((r) => setTimeout(r, 0))
        if (this.disposed || this.space !== space) return
      }
      space.addBackdrop(new layer.GlowLayer(out, w, h))
      this.glowShown = true
    } catch (err) {
      if (import.meta.env.DEV) console.warn('glow atlas:', err)
    }
  }

  // Each frame in the satellite view: plan the tiles for the view (a few
  // times a second, or when the view moves), keep the frame rate up by
  // scaling the budget, and draw the stars brighter than the limit.
  private updateGaia(cam: THREE.PerspectiveCamera, fov: number) {
    const stars = this.gaiaStars
    const streamer = this.gaiaStreamer
    const space = this.space
    if (!stars || !streamer || !space || this.gaiaState !== 'ready') return
    const now = performance.now()
    if (this.gaiaFrameAt) {
      const scale = this.gaiaGuard?.observe(now - this.gaiaFrameAt, now) ?? 1
      const budget = Math.round(this.gaiaBudgetNominal() * scale)
      if (budget !== this.gaiaBudget) {
        this.gaiaBudget = budget
        streamer.setBudget(budget)
      }
    }
    this.gaiaFrameAt = now
    const look = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion)
    const dir = space.sceneToJ2000Dir([look.x, look.y, look.z])
    const prev = this.gaiaPlanView
    const radius = this.gaiaViewRadius(fov, cam.aspect)
    const moved = prev ? Math.acos(Math.min(1, dir[0] * prev.dir[0] + dir[1] * prev.dir[1] + dir[2] * prev.dir[2])) * (180 / Math.PI) : 99
    const zoomed = prev ? Math.abs(Math.log(fov / prev.fov)) > 0.03 : true
    if (now - this.gaiaPlanAt > 400 || (now - this.gaiaPlanAt > 100 && (moved > radius * 0.08 || zoomed))) {
      this.gaiaPlanAt = now
      this.gaiaPlanView = { dir, fov }
      streamer.update({ centre: dir, radiusDeg: radius, limitMag: this.gaiaLimitMag(fov) })
    }
    const limit = Math.min(this.gaiaLimitMag(fov), streamer.effectiveLimit)
    this.gaiaDrawn = stars.setLimit(limit, new Set(streamer.inView))
  }

  private gaiaBudgetNominal() {
    const phone = this.container.clientWidth < 640 || this.container.clientHeight < 500
    return phone ? 300_000 : 1_500_000
  }

  private gaiaViewRadius(fov: number, aspect: number) {
    const v = Math.tan((fov * Math.PI) / 360)
    return Math.min(180, (Math.atan(Math.hypot(v, v * Math.max(0.1, aspect))) * 180) / Math.PI)
  }

  private gaiaLimitMag(fov: number) {
    // The rule the Hipparcos stars use, extended to the tiles' depth.
    return Math.min(GAIA_LIMIT, Math.max(5, 6.5 + 2.5 * Math.log10(60 / Math.max(fov, 1e-3))))
  }

  /** The streamed stars' state for the panel readout and the footnote credit. */
  private gaiaInfo() {
    const st = this.gaiaStreamer?.stats
    return {
      state: this.gaiaState,
      /** Gaia stars drawn in the view now. */
      drawn: this.gaiaDrawn,
      tilesLoaded: this.gaiaStars?.tileCount ?? 0,
      tilesInView: this.gaiaStreamer?.inView.length ?? 0,
      heldStars: this.gaiaStars?.heldStars ?? 0,
      inFlight: st?.inFlight ?? 0,
      requests: st?.requests ?? 0,
      aborted: st?.aborted ?? 0,
      failed: st?.failed ?? 0,
      evicted: st?.evicted ?? 0,
      budget: this.gaiaBudget,
      limit: this.gaiaStreamer?.effectiveLimit ?? 0,
      credit: this.gaiaManifest?.attribution.credit ?? null,
      source: this.gaiaBase,
    }
  }

  // ---- A selected Gaia star ----

  private clearGaiaSelection() {
    this.gaiaSel = null
    this.gaiaDetail = null
    this.gaiaDetailState = 'idle'
    this.simbadState = { kind: 'idle' }
    this.simbadClient?.cancel()
  }

  /** Select a streamed Gaia star: its card shows the tile's values at once; details and SIMBAD follow. */
  selectGaiaStar(ipix: number, i: number) {
    const tile = this.gaiaStars?.tile(ipix)
    if (!tile || i < 0 || i >= tile.count) return
    this.selectStar(-1)
    this.spaceSelected = null
    this.spaceConstellation = -1
    const d: [number, number, number] = [tile.dir[i * 3], tile.dir[i * 3 + 1], tile.dir[i * 3 + 2]]
    const raDeg = ((Math.atan2(d[1], d[0]) * 180) / Math.PI + 360) % 360
    const decDeg = (Math.asin(Math.max(-1, Math.min(1, d[2]))) * 180) / Math.PI
    this.gaiaSel = {
      ipix,
      i,
      g: (tile.gq[i] / 11) - 1,
      cq: tile.cq[i],
      mag: tile.mag[i],
      dirJ2000: d,
      raDeg,
      decDeg,
      constellation: this.bodyEphem?.constellationOf(raDeg, decDeg) ?? null,
    }
    this.gaiaDetailState = 'loading'
    const sel = this.gaiaSel
    void this.loadGaiaDetails(ipix)
      .then((details) => {
        if (this.gaiaSel !== sel) return
        this.gaiaDetail = details.at(i)
        this.gaiaDetailState = 'ready'
        // The star's source ID is known: one SIMBAD lookup (debounced, cached).
        this.simbadClient?.lookup(this.gaiaDetail.sourceId)
      })
      .catch(() => {
        if (this.gaiaSel === sel) this.gaiaDetailState = 'failed'
      })
    // Its constellation's figure is highlighted while the card shows, as for a Hipparcos star.
    void this.ensureConstellations()
  }

  // A tile's details file (source IDs, parallax), fetched when one of its stars is selected and kept for a few tiles.
  private loadGaiaDetails(ipix: number): Promise<GaiaDetails> {
    const cached = this.gaiaDetailCache.get(ipix)
    if (cached) return cached
    const entry = this.gaiaManifest?.tiles.get(ipix)
    if (!entry) return Promise.reject(new Error('no such tile'))
    const p = import('./gaiatiles').then(async (m) => {
      const res = await fetch(`${this.gaiaBase}/${entry.detailsFile}`)
      if (!res.ok) throw new Error(`details ${ipix}: HTTP ${res.status}`)
      const details = m.readGaiaDetails(await m.maybeGunzip(await res.arrayBuffer()))
      if (details.count !== entry.count) throw new Error('details do not match their tile')
      return details
    })
    p.catch(() => this.gaiaDetailCache.delete(ipix))
    this.gaiaDetailCache.set(ipix, p)
    while (this.gaiaDetailCache.size > 6) this.gaiaDetailCache.delete(this.gaiaDetailCache.keys().next().value as number)
    return p
  }

  // The selected Gaia star for the card.
  private gaiaStarInfo() {
    const sel = this.gaiaSel
    const card = this.cardMod
    if (!sel || !card) return null
    const bprp = sel.cq === 0 ? null : sel.cq / 25 - 1
    const input = {
      g: sel.g,
      bprp,
      raDeg: sel.raDeg,
      decDeg: sel.decDeg,
      constellation: sel.constellation,
      detail: this.gaiaDetail,
      detailLoading: this.gaiaDetailState === 'loading',
      detailFailed: this.gaiaDetailState === 'failed',
      simbad: this.simbadState,
    }
    return {
      name: card.gaiaStarName(this.gaiaDetail, this.simbadState),
      rows: card.gaiaCardRows(input),
      constellation: sel.constellation,
      sourceId: this.gaiaDetail?.sourceId ?? null,
      simbadFound: this.simbadState.kind === 'found',
    }
  }

  // The star (Hipparcos or streamed Gaia) a client point selects: both layers use the same radius and the same
  // score (pixels plus 1.5 per magnitude), so the better candidate wins whichever layer it is in.
  private pickAnyStar(clientX: number, clientY: number, touch: boolean):
    | { kind: 'hip'; index: number; mag: number }
    | { kind: 'gaia'; ipix: number; i: number; mag: number }
    | null {
    const stars = this.space?.stars
    if (!stars) return null
    const cam = this.povCamera
    const [nx, ny] = this.povNdc(clientX, clientY)
    const p = new THREE.Vector3(nx, ny, 0.5).unproject(cam).sub(cam.position).normalize()
    const h = Math.max(1, this.container.clientHeight)
    const fov = this.povRenderFov || cam.fov
    const radius = touch ? STAR_PICK_PX.touch : STAR_PICK_PX.mouse
    const ray: [number, number, number] = [p.x, p.y, p.z]
    const hip = stars.pickScored(ray, fov, h, radius)
    const gaia = this.gaiaStars?.pick(ray, fov, h, radius) ?? null
    if (gaia && (hip.index < 0 || gaia.score < hip.score)) {
      const mag = this.gaiaStars?.tile(gaia.ipix)?.mag[gaia.i] ?? 99
      return { kind: 'gaia', ipix: gaia.ipix, i: gaia.i, mag }
    }
    return hip.index >= 0 ? { kind: 'hip', index: hip.index, mag: stars.catalog.mag[hip.index] } : null
  }

  // ---- Constellations ----

  /** The panel's switch and its two sub-options. */
  setConstellations(t: ConstellationToggle) {
    this.constToggle = t
    if (t.on) {
      void this.ensureConstellations().then(() => {
        if (this.constToggle.on && this.constToggle.boundaries) void this.ensureBounds()
      })
    }
  }

  /**
   * Fetch the figure file and tie it to the stars: the HIP numbers of the
   * leading stars of the details file (a ranged request for a few tens of kB
   * when the full details aren't loaded), then the figure layer. Once.
   */
  ensureConstellations(): Promise<void> {
    if (this.constLayer) return Promise.resolve()
    if (this.constLoading) return this.constLoading
    this.constLoading = (async () => {
      // The stars may still be on their way (the switch can be flipped at once).
      for (let waited = 0; !this.disposed && !this.space?.stars && waited < 300; waited++) {
        await new Promise((r) => setTimeout(r, 200))
      }
      const space = this.space
      if (this.disposed || !space?.stars) throw new Error('no stars')
      const [m, layerMod, json] = await Promise.all([
        import('./constellations'),
        import('./constellationlayer'),
        fetch(CONSTELLATIONS_URL).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))),
      ])
      const file = m.readFigureFile(json)
      let hips: ArrayLike<number>
      if (this.starDetails) hips = this.starDetails.hip
      else {
        const res = await fetch(STAR_DETAILS_URL, { headers: { Range: `bytes=0-${32 + 3 * file.stars - 1}` } })
        if (!res.ok) throw new Error(`details: HTTP ${res.status}`)
        hips = m.readHipPrefix(await res.arrayBuffer(), file.stars)
      }
      if (this.disposed || this.space !== space) return
      const limit = Math.min(hips.length, space.stars.count)
      const byHip = new Map<number, number>()
      for (let i = 0; i < limit; i++) byHip.set(hips[i], i)
      const figures = m.resolveFigures(file, byHip)
      const layer = new layerMod.ConstellationLayer(figures, space.stars.catalog.dirJ2000, this.renderer.getPixelRatio())
      space.addRotating(layer)
      this.constMod = m
      this.constFigures = figures
      this.constByAbbr = new Map(figures.map((f) => [f.abbr, f.index]))
      this.constLayer = layer
    })()
      .catch((err: unknown) => {
        // The sky works without figures; the toggle just shows nothing.
        this.constError = true
        if (import.meta.env.DEV) console.warn('constellations:', err)
      })
      .finally(() => {
        this.constLoading = null
      })
    return this.constLoading
  }

  // The boundary file, fetched the first time Boundaries is turned on.
  private async ensureBounds() {
    const layer = this.constLayer
    const m = this.constMod
    if (!layer || !m || layer.hasBounds || this.constBoundsLoading) return
    this.constBoundsLoading = true
    try {
      const res = await fetch(CONSTELLATION_BOUNDS_URL)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const file = m.readBoundsFile(await res.json())
      if (!this.disposed && this.constLayer === layer) layer.setBounds(file)
    } catch (err) {
      if (import.meta.env.DEV) console.warn('constellation boundaries:', err)
    } finally {
      this.constBoundsLoading = false
    }
  }

  /** The figure to emphasise: the selected star's constellation, else the one a label tap selected; -1 for none. */
  private activeFigure(): number {
    if (this.gaiaSel) return this.constByAbbr.get(this.gaiaSel.constellation?.symbol ?? '') ?? -1
    if (this.spaceStar >= 0) {
      const c = this.spaceStarConstellation
      if (c && c.index === this.spaceStar) return this.constByAbbr.get(c.symbol) ?? -1
      return -1
    }
    return this.spaceConstellation
  }

  // Each frame: ease the lines, then place the names the rules allow.
  private updateConstellations(cam: THREE.PerspectiveCamera, fov: number, w: number, h: number) {
    const layer = this.constLayer
    const m = this.constMod
    if (!layer || !m) return
    const now = performance.now()
    const dt = this.constFrameAt ? Math.min(0.25, (now - this.constFrameAt) / 1000) : 0.016
    this.constFrameAt = now
    const active = this.activeFigure()
    layer.update({
      toggle: this.constToggle,
      active,
      highlight: active >= 0,
      fovDeg: fov,
      widthPx: w,
      heightPx: h,
      dtSec: dt,
      reducedMotion: this.reducedMotion?.matches ?? false,
    })
    const names = layer.opacity.names
    if (names < 0.01) {
      for (const el of this.constLabels) el.hidden = true
      this.constLabelRects = []
      return
    }
    if (!this.constLabels.length) {
      this.constLabels = layer.views.map((v) => {
        const el = document.createElement('div')
        el.className = 'globe-sky-label is-constellation'
        el.textContent = v.name
        el.hidden = true
        this.container.appendChild(el)
        return el
      })
      this.constLabelSize = layer.views.map(() => null)
      const cat = this.space?.stars?.catalog
      this.constBright = this.constFigures.map((f) => f.stars.filter((i) => (cat?.mag[i] ?? 99) <= m.LABEL_YIELD_MAG))
    }
    const stars = this.space?.stars
    const eye = cam.position
    const eyeLen2 = eye.lengthSq()
    const p = new THREE.Vector3()
    const candidates: import('./constellations').LabelCandidate[] = []
    for (const v of layer.views) {
      if (!m.labelAllowedAtFov(v.extentDeg, fov)) continue
      const d = v.centre
      p.set(d[0], d[1], d[2]).multiplyScalar(SKY_RADIUS_UNITS).add(eye).project(cam)
      if (p.z >= 1 || Math.abs(p.x) > 1.05 || Math.abs(p.y) > 1.05) continue
      const b = eye.x * d[0] + eye.y * d[1] + eye.z * d[2]
      if (eyeLen2 > 1 && b * b - (eyeLen2 - 1) >= 0 && -b - Math.sqrt(b * b - (eyeLen2 - 1)) > 0) continue
      const x = ((p.x + 1) / 2) * w
      const y = ((1 - p.y) / 2) * h
      let size = this.constLabelSize[v.index]
      if (!size) {
        const el = this.constLabels[v.index]
        el.hidden = false
        size = { w: el.offsetWidth || 8 + 7 * v.name.length, h: el.offsetHeight || 18 }
        this.constLabelSize[v.index] = size
      }
      // The figure's middle is often right on a bright star (Orion's belt),
      // which would take the name's taps: slide the name clear of those.
      const bright: { x: number; y: number }[] = []
      if (stars) {
        for (const si of this.constBright[v.index] ?? []) {
          const sd = stars.direction(si)
          p.set(sd[0], sd[1], sd[2]).multiplyScalar(SKY_RADIUS_UNITS).add(eye).project(cam)
          if (p.z < 1) bright.push({ x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h })
        }
      }
      const clear = (cx: number, cy: number) =>
        bright.every((b) => Math.abs(b.x - cx) > size.w / 2 + 8 || Math.abs(b.y - cy) > size.h / 2 + 8)
      const dx = size.w * 0.55
      const dy = size.h + 6
      const options: [number, number][] = [[0, 0], [0, dy], [0, -dy], [dx + 20, 0], [-dx - 20, 0], [0, 2 * dy], [0, -2 * dy]]
      const [ox, oy] = options.find(([ax, ay]) => clear(x + ax, y + ay)) ?? [0, 0]
      candidates.push({
        key: String(v.index),
        x: x + ox - size.w / 2,
        y: y + oy - size.h / 2,
        w: size.w,
        h: size.h,
        priority: m.labelPriority(v.areaSqDeg, v.index === active),
      })
    }
    const kept = m.placeLabels(candidates, this.spaceObstacles, w, h)
    this.constLabelRects = []
    for (const el of this.constLabels) el.hidden = true
    for (const c of candidates) {
      if (!kept.has(c.key)) continue
      const index = Number(c.key)
      const el = this.constLabels[index]
      el.hidden = false
      el.style.left = `${c.x + c.w / 2}px`
      el.style.top = `${c.y + c.h / 2}px`
      el.style.opacity = String(names)
      el.classList.toggle('is-selected', index === this.spaceConstellation)
      this.constLabelRects.push({ index, x: c.x, y: c.y, w: c.w, h: c.h })
    }
  }

  /** Select a constellation (a name label's tap), or -1 to clear. Shows its small card. */
  selectConstellation(index: number) {
    this.spaceConstellation = index
    if (index >= 0) {
      this.spaceSelected = null
      this.selectStar(-1)
      this.spaceConstellation = index
      void this.ensureStarNames()
    }
  }

  // The IAU names alone (a few kB), for naming a figure's brightest star.
  private ensureStarNames() {
    if (this.starNames) return
    void fetch(STAR_NAMES_URL)
      .then((r) => (r.ok ? (r.json() as Promise<IauName[]>) : Promise.reject(new Error(String(r.status)))))
      .then((names) => {
        if (!this.disposed && !this.starNames) this.starNames = nameTable(names)
      })
      .catch(() => {})
  }

  /** The index of a constellation by IAU abbreviation, or -1 (before the figures load). */
  constellationIndex(abbr: string): number {
    return this.constByAbbr.get(abbr) ?? -1
  }

  /**
   * Turn the view to a constellation: the Out view with its figure fitted to
   * the screen (animated; instant under reduced motion), and kept centred
   * while the orbit carries the frame round, until a drag or another look.
   */
  goToConstellation(index: number) {
    const layer = this.constLayer
    const m = this.constMod
    const st = this.povState
    const v = layer?.views[index]
    if (!layer || !m || !st || !v) return
    this.setPovPreset('outward')
    const { yaw, pitch } = lookToward(presetView('outward', st.pos, st.vel), v.centre)
    this.startPovAnim()
    this.povLook.yaw = yaw
    this.povLook.pitch = pitch
    this.povCamera.fov = Math.max(SPACE_FOV_MIN, m.fitFov(v.extentDeg, this.povCamera.aspect))
    this.povCamera.updateProjectionMatrix()
    this.track = { kind: 'figure', index }
  }

  // The small card of the tapped constellation, for the panel.
  private constellationInfo() {
    const i = this.spaceConstellation
    const f = this.constFigures[i]
    const m = this.constMod
    if (i < 0 || !f || !m) return null
    const brightest = starName(f.brightestHip, this.starNames)
    return {
      index: i,
      abbr: f.abbr,
      name: f.name,
      rows: m.constellationCardRows({
        name: f.name,
        abbr: f.abbr,
        areaSqDeg: f.areaSqDeg,
        brightestName: brightest,
        stars: f.stars.length,
      }),
    }
  }

  /** Select a star by catalogue index (-1 clears it); loads its details. */
  selectStar(index: number) {
    if (index !== this.spaceStar) this.track = null
    this.clearGaiaSelection()
    this.spaceStar = index
    this.spaceStarConstellation = null
    if (index >= 0) {
      this.spaceSelected = null
      this.spaceConstellation = -1
      // The star's figure is highlighted while its card shows, so the
      // figure file (and the leading HIP numbers it needs) loads here too.
      void this.ensureStarDetails().finally(() => void this.ensureConstellations())
    }
  }

  /** Fetch the star details and IAU names once (the first selection or search). */
  ensureStarDetails(): Promise<void> {
    if (this.starDetails) return Promise.resolve()
    if (this.starDetailsLoading) return this.starDetailsLoading
    const count = this.space?.stars?.count ?? Infinity
    this.starDetailsLoading = Promise.all([
      fetch(STAR_DETAILS_URL).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status))))),
      fetch(STAR_NAMES_URL).then((r) => (r.ok ? (r.json() as Promise<IauName[]>) : Promise.reject(new Error(String(r.status))))),
    ])
      .then(([buf, names]) => {
        if (this.disposed) return
        // The same stars as the star file (phones read a prefix of it).
        this.starDetails = readStarDetails(buf, count)
        this.starHipIndex = hipIndex(this.starDetails)
        this.starNames = nameTable(names)
      })
      .catch(() => {
        // The card still shows the catalogue's position, magnitude and colour.
        this.starDetailsError = true
      })
      .finally(() => {
        this.starDetailsLoading = null
      })
    return this.starDetailsLoading
  }

  /** Catalogue index of a Hipparcos number (after details have loaded), or -1. */
  starIndexOfHip(hip: number): number {
    return this.starHipIndex?.get(hip) ?? -1
  }

  /** The IAU names and whether a HIP number is in the loaded catalogue, for search. */
  starSearch(): { names: NameTable; has: (hip: number) => boolean } | null {
    const idx = this.starHipIndex
    return this.starNames && idx ? { names: this.starNames, has: (h) => idx.has(h) } : null
  }

  /**
   * Turn the view to a star and select it: the Out view, with the star
   * centred (animated; instant under reduced motion). Field of view and
   * zoom are kept, narrowed to at most 20 degrees so the star isn't lost.
   */
  goToStar(index: number) {
    const space = this.space
    const st = this.povState
    if (!space?.stars || !st || index < 0 || index >= space.stars.count) return
    this.setPovPreset('outward')
    const base = presetView('outward', st.pos, st.vel)
    const { yaw, pitch } = lookToward(base, space.stars.direction(index))
    this.startPovAnim()
    this.povLook.yaw = yaw
    this.povLook.pitch = pitch
    if (this.povCamera.fov > 20) {
      this.povCamera.fov = 20
      this.povCamera.updateProjectionMatrix()
    }
    this.selectStar(index)
    this.track = { kind: 'star' }
  }

  // Keep the tracked star centred as the orbit carries the frame round.
  private trackStar(pos: PovVec3, vel: PovVec3) {
    const stars = this.space?.stars
    const t = this.track
    if (!t || this.povLook.preset !== 'outward' || this.povDetached) return
    const dir: PovVec3 | null =
      t.kind === 'star'
        ? stars && this.spaceStar >= 0
          ? stars.direction(this.spaceStar)
          : null
        : (this.constLayer?.views[t.index]?.centre ?? null)
    if (!dir) return
    const { yaw, pitch } = lookToward(presetView('outward', pos, vel), dir)
    this.povLook.yaw = yaw
    this.povLook.pitch = pitch
  }

  /** The body under a tap (canvas px), by the Sky view's pick rules; null when none. */
  private pickSpaceBody(x: number, y: number, touch: boolean): string | null {
    const bodies = this.spaceScreen.filter((b) => b.visible).map((b) => ({ key: b.key, x: b.x, y: b.y, r: b.r }))
    return pickBody(x, y, bodies, touch ? PICK_PX_TOUCH : PICK_PX_MOUSE)
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
    this.baseTiles?.dispose()
    this.overlayTiles?.dispose()
    this.nightTiles?.dispose()
    this.space?.dispose()
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

  // A client-space point as -1..1 across the canvas (right and up).
  private povNdc(x: number, y: number): [number, number] {
    const r = this.renderer.domElement.getBoundingClientRect()
    return [((x - r.left) / Math.max(1, r.width)) * 2 - 1, 1 - ((y - r.top) / Math.max(1, r.height)) * 2]
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
        if (pov) {
          // Pinch zooms toward the point between the fingers.
          const [a, b] = [...this.skyPointers.values()]
          const [nx, ny] = this.povNdc((a.x + b.x) / 2, (a.y + b.y) / 2)
          this.povZoomAt(this.skyPinch / d, nx, ny)
        } else this.setSkyFov(this.skyCamera.fov * (this.skyPinch / d))
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
    if (pov && this.povDetached) {
      // Held over the ground: the ground follows the pointer.
      this.povPan(this.povNdc(prev.x, prev.y), this.povNdc(e.clientX, e.clientY))
      return
    }
    if (pov) {
      // The view follows the pointer, as in Sky (and stops tracking a star).
      this.track = null
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
    if (this.viewMode === 'pov') {
      const [nx, ny] = this.povNdc(e.clientX, e.clientY)
      this.povZoomAt(Math.exp(e.deltaY * 0.001), nx, ny)
    } else this.setSkyFov(this.skyCamera.fov * Math.exp(e.deltaY * 0.001))
  }

  // A click (not a drag-to-rotate) picks the nearest visible point within a
  // fixed screen-space radius.
  private handlePointerUp = (e: PointerEvent) => {
    if (this.viewMode === 'pov') {
      // Satellite view: drags, pinches, and a double click or tap zooms in on
      // that point (no picking here).
      const g = this.skyGesture
      this.handleSkyPointerEnd(e)
      if (this.skyPointers.size === 0) {
        if (g && !g.dragging && !g.multi) {
          // A tap selects what's under it: a Sun, Moon or planet disc first,
          // then the nearest star (brighter ones preferred); a second quick
          // tap zooms in without changing the selection.
          const now = performance.now()
          const last = this.povLastTap
          const isDouble =
            !!last && now - last.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - last.x, e.clientY - last.y) < DOUBLE_TAP_PX
          if (!isDouble) {
            const r = this.renderer.domElement.getBoundingClientRect()
            const touch = e.pointerType === 'touch'
            const body = this.pickSpaceBody(e.clientX - r.left, e.clientY - r.top, touch)
            const picked = body ? null : this.pickAnyStar(e.clientX, e.clientY, touch)
            const star = picked ? 0 : -1
            // A bright star beats a figure's name label, a faint one does not;
            // figure lines are not targets (see resolveTap).
            const label =
              body || !this.constMod
                ? -1
                : this.constMod.pickLabel(e.clientX - r.left, e.clientY - r.top, this.constLabelRects, touch ? 14 : 6)
            const starMag = picked ? picked.mag : 0
            const hit = this.constMod
              ? this.constMod.resolveTap(body, star, label, starMag)
              : body
                ? ({ kind: 'body', key: body } as const)
                : star >= 0
                  ? ({ kind: 'star', index: star } as const)
                  : ({ kind: 'none' } as const)
            if (hit.kind === 'body') {
              this.spaceSelected = hit.key
              this.selectStar(-1)
              this.spaceConstellation = -1
            } else if (hit.kind === 'constellation') {
              this.selectConstellation(hit.index)
            } else if (hit.kind === 'star' && picked?.kind === 'gaia') {
              this.selectGaiaStar(picked.ipix, picked.i)
            } else {
              this.spaceSelected = null
              this.spaceConstellation = -1
              this.selectStar(hit.kind === 'star' && picked?.kind === 'hip' ? picked.index : -1)
            }
          }
          if (isDouble) {
            const [nx, ny] = this.povNdc(e.clientX, e.clientY)
            this.povZoomAt(DOUBLE_CLICK_ZOOM, nx, ny, true)
            this.povLastTap = null
          } else this.povLastTap = { t: now, x: e.clientX, y: e.clientY }
        }
        this.skyGesture = null
      }
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
