// The 3D globe (Phases 1, 1b and 1c of the visualization plan, satellite-
// conjunction-screening working notes 2026-10-03). Lazy-loaded by
// SatelliteTool so three.js and satellite.js stay out of the main bundle.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SPEEDS, canPlay, isPaused, liveClock, scrubClock, togglePlay, withSpeed, type Clock } from '../globe/clock'
import { colorize, describeType, withVisibility, type ColorMode } from '../globe/colors'
import { loadHistoryDates, loadObjects } from '../globe/data'
import { formatKm } from '../globe/format'
import {
  GlobeEngine,
  ORBIT_COLOR,
  RING_A,
  RING_B,
  RING_GROUP,
  RING_INSPECT,
  type InspectedPosition,
  type InspectedSky,
  type ViewMode,
} from '../globe/engine'
import { NAME_GROUPS, OTHER_GROUP, OTHER_LABEL, STATIONS, groupOf, viewpointFor } from '../globe/groups'
import { SUGGESTED_STARS, searchStars, starCardRows, type StarMatch } from '../globe/stardetails'
import {
  IMAGERY_EXPLAINER,
  TODAY_FADE_NOTE,
  TODAY_IMAGERY_DEFAULT,
  imageryCredits,
  imageryLine,
  skyCredits,
} from '../globe/imagery'
import { geocodePlace } from '../globe/geocode'
import { PHASE_LABEL, twilightPhase } from '../globe/twilight'
import { aboveHorizon, moonPhaseName, nextSelection, type SkyBody } from '../globe/skybodies'
import { phoneSideDock } from '../globe/layout'
import { DAY_MS, HOUR_MS, datasetFor, sliderBounds } from '../globe/timeline'
import type { DatasetKey, FocusRequest, ObjectsFile } from '../globe/types'
import { FULLSCREEN_OFF, fullscreenStep, type FullscreenEffects, type FullscreenEvent } from '../globe/fullscreen'
import CollisionHistory from './CollisionHistory'
import './SatelliteGlobe.css'

const TEXTURE_URL = '/textures/earth-day-2k.jpg'
// NASA Black Marble 2016 city lights, 2048x1024, for the night side.
const NIGHT_TEXTURE_URL = '/textures/earth-night-2k.jpg'
const TICK_MS = 250
// An orbital period for the panel: minutes under two hours, else hours.
const formatPeriod = (ms: number) => {
  const min = ms / 60_000
  return min < 120 ? `${min.toFixed(1)} min period` : `${(min / 60).toFixed(1)} h period`
}
/** Matches the stylesheet's phone breakpoint. */
const PHONE_QUERY = '(max-width: 640px)'
const NO_HIDDEN: ReadonlySet<string> = new Set()
const ALL_GROUPS = [
  ...NAME_GROUPS.map((g) => ({ key: g.key, label: g.label })),
  { key: OTHER_GROUP, label: OTHER_LABEL },
]
// Below this, the nearest object is effectively at the same place: a docked
// module or a co-located pair.
const COLOCATED_KM = 0.05

const onlyGroups = (keys: string[]): ReadonlySet<string> =>
  new Set(ALL_GROUPS.map((g) => g.key).filter((k) => !keys.includes(k)))
const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  a.size === b.size && [...a].every((k) => b.has(k))

const COLOR_MODES: { mode: ColorMode; label: string }[] = [
  { mode: 'type', label: 'Type' },
  { mode: 'owner', label: 'Owner' },
  { mode: 'flat', label: 'Flat' },
  { mode: 'age', label: 'Age' },
]

const fmt = (n: number) => n.toLocaleString('en-US')
const fmtKm = formatKm

function formatUtc(ms: number) {
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZone: 'UTC',
  })
}

function formatOffset(deltaMs: number) {
  // Round to whole minutes first, so 23 h 59.6 m reads "1d 0h", not "23h 60m".
  const totalMin = Math.round(Math.abs(deltaMs) / 60_000)
  const d = Math.floor(totalMin / (DAY_MS / 60_000))
  const h = Math.floor((totalMin % (DAY_MS / 60_000)) / (HOUR_MS / 60_000))
  const m = totalMin % (HOUR_MS / 60_000)
  const parts = d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`
  return deltaMs < 0 ? `${parts} ago` : `in ${parts}`
}

function formatLatLon(p: InspectedPosition) {
  const lat = `${Math.abs(p.latDeg).toFixed(2)}° ${p.latDeg >= 0 ? 'N' : 'S'}`
  const lon = `${Math.abs(p.lonDeg).toFixed(2)}° ${p.lonDeg >= 0 ? 'E' : 'W'}`
  return `${lat}, ${lon}`
}

interface Props {
  /** A near-miss to replay, or null for the free-roam view. */
  focus: FocusRequest | null
  /** Called when the globe leaves focus mode on its own (slider, Live, back). */
  onExitFocus: () => void
  /** The snapshot the globe is showing, so the page can show its near misses. */
  onDatasetChange: (key: DatasetKey) => void
  /** Conjunctions in the latest run, for the collision-history context. */
  conjunctionsFlagged?: number
  /** Globe, Sky or the satellite view, chosen by the toggle in the page's section header. */
  viewMode?: ViewMode
  /** Whether one satellite is selected, so the page can offer the satellite view. */
  onCanPovChange?: (can: boolean) => void
  /** Ask the page to enter the satellite view, or go back to the view it came from. */
  onViewRequest?: (req: 'pov' | 'back') => void
}

export default function SatelliteGlobe({
  focus,
  onExitFocus,
  onDatasetChange,
  conjunctionsFlagged,
  viewMode = 'globe',
  onCanPovChange,
  onViewRequest,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const legendRef = useRef<HTMLDivElement>(null)
  const sideRef = useRef<HTMLDivElement>(null)

  // Full-screen map mode (fullscreen.ts): a CSS full-viewport mode everywhere,
  // plus the Fullscreen API where it exists. The browser's back button, Esc
  // and the browser leaving native full screen by itself all exit it.
  const rootRef = useRef<HTMLDivElement>(null)
  const fsButtonRef = useRef<HTMLButtonElement>(null)
  const [fullscreen, setFullscreen] = useState(FULLSCREEN_OFF)
  const fsRef = useRef(FULLSCREEN_OFF)
  const fsScrollRef = useRef(0)
  // On a phone in full screen the info panel is a bottom sheet: a peek, or opened up.
  const [sheetOpen, setSheetOpen] = useState(false)
  const applyFsEffects = useCallback((fx: FullscreenEffects) => {
    const root = rootRef.current
    if (fx.lockScroll) {
      fsScrollRef.current = window.scrollY
      document.documentElement.classList.add('globe-fs-lock')
    }
    if (fx.pushHistory) window.history.pushState({ ...(window.history.state ?? {}), globeFullscreen: true }, '')
    if (fx.requestNative && root?.requestFullscreen) {
      root.requestFullscreen({ navigationUI: 'hide' }).catch(() => {
        // Refused (no user gesture, or not allowed here): the CSS mode stays.
      })
    }
    if (fx.exitNative && document.fullscreenElement) document.exitFullscreen().catch(() => {})
    if (fx.popHistory && window.history.state?.globeFullscreen) window.history.back()
    if (fx.unlockScroll) {
      document.documentElement.classList.remove('globe-fs-lock')
      const y = fsScrollRef.current
      const restore = () => window.scrollTo(0, y)
      requestAnimationFrame(() => {
        restore()
        fsButtonRef.current?.focus({ preventScroll: true })
      })
      // Leaving native full screen resizes the viewport a moment later, which
      // can clamp the scroll position: put it back once that has settled.
      setTimeout(restore, 350)
    }
  }, [])
  const dispatchFs = useCallback(
    (e: FullscreenEvent) => {
      const { state, effects } = fullscreenStep(fsRef.current, e)
      fsRef.current = state
      setFullscreen(state)
      applyFsEffects(effects)
    },
    [applyFsEffects],
  )
  const enterFullscreen = () => {
    setSheetOpen(false)
    dispatchFs({ type: 'enter', nativeAvailable: !!document.fullscreenEnabled && !!rootRef.current?.requestFullscreen })
  }
  useEffect(() => {
    const onChange = () => {
      if (document.fullscreenElement && document.fullscreenElement === rootRef.current) dispatchFs({ type: 'nativeEntered' })
      else if (!document.fullscreenElement) dispatchFs({ type: 'nativeLeft' })
    }
    const onPop = () => dispatchFs({ type: 'back' })
    const onKey = (e: KeyboardEvent) => {
      // Esc leaves the CSS-only mode (native full screen handles its own Esc),
      // unless the satellite view used it (returning to the satellite).
      if (e.key === 'Escape' && fsRef.current.on && !fsRef.current.native && !e.defaultPrevented) dispatchFs({ type: 'exit' })
    }
    document.addEventListener('fullscreenchange', onChange)
    window.addEventListener('popstate', onPop)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('keydown', onKey)
      if (fsRef.current.on) {
        document.documentElement.classList.remove('globe-fs-lock')
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
      }
    }
  }, [dispatchFs])
  const engineRef = useRef<GlobeEngine | null>(null)
  const [time, setTime] = useState(() => ({ simMs: 0, nowMs: 0 }))
  const [clock, setClockState] = useState<Clock>(() => liveClock(Date.now()))
  const [colorMode, setColorMode] = useState<ColorMode>('type')
  const [hidden, setHidden] = useState<Record<ColorMode, ReadonlySet<string>>>({
    type: NO_HIDDEN,
    owner: NO_HIDDEN,
    flat: NO_HIDDEN,
    age: NO_HIDDEN,
  })
  const [historyDates, setHistoryDates] = useState<string[]>([])
  const [current, setCurrent] = useState<ObjectsFile | null>(null)
  const [loaded, setLoaded] = useState<{ key: DatasetKey; file: ObjectsFile } | null>(null)
  const [loadError, setLoadError] = useState<DatasetKey | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [focusMissing, setFocusMissing] = useState(false)
  const [inspect, setInspect] = useState<number | null>(null)
  const [inspectPos, setInspectPos] = useState<InspectedPosition | null>(null)
  const [neighbor, setNeighbor] = useState<{ index: number; km: number } | null | undefined>(
    null,
  )
  const [hiddenGroups, setHiddenGroups] = useState<ReadonlySet<string>>(NO_HIDDEN)
  const [station, setStation] = useState<string | null>(null)
  // Sky view (Phase 1). The observer lives only in this component's state:
  // never stored, logged or sent anywhere (a typed place goes to the geocoder).
  const [observer, setObserver] = useState<{
    latDeg: number
    lonDeg: number
    label: string
  } | null>(null)
  const [skyBusy, setSkyBusy] = useState<'locating' | 'searching' | null>(null)
  const [skyError, setSkyError] = useState<string | null>(null)
  const [placeQuery, setPlaceQuery] = useState('')
  const [skyAbove, setSkyAbove] = useState(0)
  // After a location is found the panel folds to a one-line summary so the
  // dome stays visible (it would cover most of it on a phone).
  const [skyPanelOpen, setSkyPanelOpen] = useState(true)
  const [skyGrid, setSkyGrid] = useState(true)
  // Day/night shading on the globe; on by default.
  const [dayNight, setDayNight] = useState(true)
  // The satellite view's "Today's imagery" switch: NASA GIBS's daily mosaic
  // over the EOX base. Off by default.
  const [todayImagery, setTodayImagery] = useState(TODAY_IMAGERY_DEFAULT)
  // The satellite view's orientation: the satellite's heading up (default) or north up.
  const [povOrientation, setPovOrientation] = useState<'heading' | 'north'>('heading')
  // "Find a star": the query, and the IAU names and catalogue membership once loaded.
  const [starQuery, setStarQuery] = useState('')
  const [starTools, setStarTools] = useState<ReturnType<GlobeEngine['starSearch']>>(null)
  const [inspectSky, setInspectSky] = useState<InspectedSky | null>(null)
  const [orbitPeriodMs, setOrbitPeriodMs] = useState<number | null>(null)
  // The Sky view's Sun, Moon and planets, and the selected one (a body
  // selection and a satellite selection replace each other: nextSelection).
  const [skyBodies, setSkyBodies] = useState<SkyBody[]>([])
  const [skyBody, setSkyBody] = useState<string | null>(null)
  // The satellite view's read-out (static text, refreshed on the tick) and the
  // note shown when it had to close on its own.
  const [povInfo, setPovInfo] = useState<ReturnType<GlobeEngine['povInfo']>>(null)
  const [povNote, setPovNote] = useState<string | null>(null)
  const onViewRequestRef = useRef(onViewRequest)
  useEffect(() => {
    onViewRequestRef.current = onViewRequest
  })
  // On a phone the body panel folds like the satellite one; the open one's key.
  const [bodyDetailsFor, setBodyDetailsFor] = useState<string | null>(null)
  const [skySun, setSkySun] = useState<{ azDeg: number; elDeg: number } | null>(null)
  // On a phone in the Sky view the selected object's panel starts as a
  // two-line summary; this holds the object whose full details are open.
  const [detailsFor, setDetailsFor] = useState<number | null>(null)
  // On a phone in the Sky view the legend folds to one line, so it doesn't
  // cover the dome (or the selected ring); folded until opened.
  const [legendOpen, setLegendOpen] = useState(false)
  // On a phone in the Sky view, the side column's top offset when it has
  // moved up under the legend to keep the selected ring uncovered (null:
  // docked along the bottom). The ref mirrors it for the engine's tick.
  const [sideDock, setSideDock] = useState<number | null>(null)
  const sideDockRef = useRef<number | null>(null)
  const [stationPieces, setStationPieces] = useState(0)

  // Selection is single: picking an object replaces a near-miss pair or a
  // station, and a click on no object clears whatever is selected. The engine
  // has already cleared its marks and eased the camera out; `releasedRef`
  // tells the replay/station effects not to also fly home. The handler is
  // called from engine events, so it reads current props through a ref.
  const releasedRef = useRef(false)
  // The replay and station currently shown by the engine (see their effects).
  const focusedRef = useRef<FocusRequest | null>(null)
  const stationRef = useRef<string | null>(null)
  const handlePick = useRef<(index: number | null) => void>(() => {})
  const handlePickBody = useRef<(key: string) => void>(() => {})
  useEffect(() => {
    handlePick.current = (index) => {
      if (focus || station) releasedRef.current = true
      if (focus) onExitFocus()
      if (station) setStation(null)
      if (index === null) engineRef.current?.clearSelection()
      const next = nextSelection({ satellite: inspect, body: skyBody }, { type: 'pickSatellite', index })
      setSkyBody(next.body)
      setInspect(next.satellite)
    }
    handlePickBody.current = (key) => {
      const next = nextSelection({ satellite: inspect, body: skyBody }, { type: 'pickBody', key })
      engineRef.current?.clearSelection()
      setInspect(next.satellite)
      setSkyBody(next.body)
    }
  })

  // Engine lifetime: one WebGL context per mount.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let lastTick = 0
    const engine = new GlobeEngine(
      container,
      TEXTURE_URL,
      {
        onTick: (simMs) => {
          const now = performance.now()
          if (now - lastTick < TICK_MS) return
          lastTick = now
          setTime({ simMs, nowMs: Date.now() })
          setInspectPos(engineRef.current?.inspectedPosition() ?? null)
          setNeighbor(engineRef.current?.currentNeighbor())
          setSkyAbove(engineRef.current?.skyAboveHorizon() ?? 0)
          setInspectSky(engineRef.current?.inspectedSky() ?? null)
          setOrbitPeriodMs(engineRef.current?.inspectedOrbitPeriodMs() ?? null)
          setSkySun(engineRef.current?.skySun() ?? null)
          setSkyBodies(engineRef.current?.skyBodiesNow() ?? [])
          setPovInfo(engineRef.current?.povInfo() ?? null)
          const stage = stageRef.current
          const side = sideRef.current
          const legend = legendRef.current
          const dock =
            stage && side && window.matchMedia(PHONE_QUERY).matches
              ? phoneSideDock({
                  ringY: engineRef.current?.inspectedSkyScreen()?.y ?? null,
                  stageHeight: stage.clientHeight,
                  sideHeight: side.offsetHeight,
                  legendBottom: legend ? legend.offsetTop + legend.offsetHeight : 0,
                  current: sideDockRef.current,
                })
              : null
          sideDockRef.current = dock
          setSideDock(dock)
          // The engine may change the clock itself (Live pausing at the end of
          // the forward range); keep the controls in step.
          const engineClock = engineRef.current?.getClock()
          if (engineClock) setClockState(engineClock)
        },
        onPick: (index) => handlePick.current(index),
          onPickBody: (key) => handlePickBody.current(key),
          onPovLost: () => {
            setPovNote('The viewpoint satellite can’t be propagated at this time, so the view closed.')
            onViewRequestRef.current?.('back')
          },
      },
      NIGHT_TEXTURE_URL,
    )
    engineRef.current = engine
    if (import.meta.env.DEV) Object.assign(window, { __globe: engine })
    return () => {
      engine.dispose()
      engineRef.current = null
    }
  }, [])

  useEffect(() => {
    let live = true
    loadHistoryDates().then((dates) => live && setHistoryDates(dates))
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    let live = true
    loadObjects('current')
      .then((file) => live && setCurrent(file))
      .catch((err: unknown) => {
        console.error(err)
        if (live) setLoadError('current')
      })
    return () => {
      live = false
    }
  }, [attempt])

  const currentStartMs = current ? Date.parse(current.generated_at_utc) : 0
  const datasetKey: DatasetKey | null = !current
    ? null
    : focus
      ? focus.datasetKey
      : datasetFor(time.simMs || currentStartMs, currentStartMs, historyDates)

  // The selected object's NORAD ID, so a selection survives a change of
  // snapshot (playback or the slider crossing into another day).
  const inspectedIdRef = useRef<number | null>(null)
  useEffect(() => {
    inspectedIdRef.current =
      inspect !== null && loaded ? (loaded.file.objects[inspect]?.norad_id ?? null) : null
  }, [inspect, loaded])

  // Load the snapshot for the displayed time. The previous one stays on screen
  // until the new one arrives. A selected object stays selected if it's in the
  // new snapshot too (its index can differ between snapshots).
  useEffect(() => {
    if (!datasetKey) return
    let live = true
    loadObjects(datasetKey)
      .then((file) => {
        const engine = engineRef.current
        if (!live || !engine) return
        engine.setCatalog(file.objects)
        const id = inspectedIdRef.current
        const found = id === null ? -1 : file.objects.findIndex((o) => o.norad_id === id)
        const next = found >= 0 ? found : null
        // setCatalog clears the engine's selection; restore it directly, as the
        // index may be the same number and not re-run the selection effect.
        engine.setInspected(next)
        setLoaded({ key: datasetKey, file })
        setLoadError(null)
        setInspect(next)
      })
      .catch((err: unknown) => {
        console.error(err)
        if (live) setLoadError(datasetKey)
      })
    return () => {
      live = false
    }
  }, [datasetKey, attempt])

  useEffect(() => {
    if (loaded) onDatasetChange(loaded.key)
  }, [loaded, onDatasetChange])

  const coloring = useMemo(
    () =>
      loaded ? colorize(loaded.file.objects, colorMode, loaded.file.generated_at_utc) : null,
    [loaded, colorMode],
  )
  const hiddenNow = hidden[colorMode]

  // Name group per object, and how many objects each group has, for the
  // filters and the collision-history counts.
  const groups = useMemo(() => {
    const keys = loaded ? loaded.file.objects.map((o) => groupOf(o.name)) : []
    const counts: Record<string, number> = {}
    for (const k of keys) counts[k] = (counts[k] ?? 0) + 1
    return { keys, counts }
  }, [loaded])

  useEffect(() => {
    if (!coloring) return
    engineRef.current?.setColors(
      withVisibility(coloring, hiddenNow, (i) => hiddenGroups.has(groups.keys[i])),
    )
  }, [coloring, hiddenNow, hiddenGroups, groups])

  const toggleGroup = (key: string) => {
    setHiddenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const showOnlyGroups = (keys: string[]) => setHiddenGroups(onlyGroups(keys))

  // The collision-history buttons toggle: on isolates that event's debris,
  // off restores exactly the view from before.
  const [isolation, setIsolation] = useState<{
    keys: string[]
    prev: ReadonlySet<string>
  } | null>(null)
  const isolatedKeys =
    isolation && sameSet(hiddenGroups, onlyGroups(isolation.keys)) ? isolation.keys : null
  const toggleCollisionDebris = (keys: string[]) => {
    if (isolation && isolatedKeys?.join() === keys.join()) {
      setHiddenGroups(isolation.prev)
      setIsolation(null)
      return
    }
    setIsolation({ keys, prev: isolation && isolatedKeys ? isolation.prev : hiddenGroups })
    setHiddenGroups(onlyGroups(keys))
    stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  // How many points the filters leave visible, for the always-visible reset.
  const visibleCount = useMemo(() => {
    if (!coloring) return 0
    let n = 0
    for (let i = 0; i < groups.keys.length; i++) {
      if (!hiddenNow.has(coloring.categoryOf(i)) && !hiddenGroups.has(groups.keys[i])) n++
    }
    return n
  }, [coloring, groups, hiddenNow, hiddenGroups])
  const visibleGroupLabels = ALL_GROUPS.filter(
    (g) => groups.counts[g.key] && !hiddenGroups.has(g.key),
  ).map((g) => g.label)
  const showEverything = () => {
    setHiddenGroups(NO_HIDDEN)
    setHidden((prev) => ({ ...prev, [colorMode]: NO_HIDDEN }))
    setIsolation(null)
  }

  const toggleCategory = (key: string) => {
    setHidden((prev) => {
      const next = new Set(prev[colorMode])
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return { ...prev, [colorMode]: next }
    })
  }

  // The satellite view's viewpoint: the selected satellite, or with a station
  // selected (from the Stations list), its core module. Docked pieces share
  // that orbit and, like everything else, aren't drawn in the satellite view.
  const stationForPov = station ? (STATIONS.find((s) => s.key === station) ?? null) : null
  // A replayed near-miss pair's catalog indices, once its own snapshot is
  // loaded: a pair with a station on one side can be viewed from the station.
  const pairIdx = useMemo((): readonly [number | null, number | null] | null => {
    if (!focus || !loaded || loaded.key !== focus.datasetKey) return null
    const at = (id: number) => {
      const i = loaded.file.objects.findIndex((o) => o.norad_id === id)
      return i < 0 ? null : i
    }
    return [at(focus.aId), at(focus.bId)]
  }, [focus, loaded])
  const povTarget = viewpointFor(
    { satellite: inspect, station: stationForPov, pair: pairIdx },
    loaded?.file.objects ?? null,
  )

  // The engine follows the chosen view and observer. Declared before the
  // replay/station effects so a replay started from the Sky view finds the
  // engine already back on the globe. Entering the Sky view ends a near-miss
  // pair or station view (globe camera modes) without flying the globe camera
  // home; an inspected object stays selected in both views.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    if (viewMode === 'sky' && (focusedRef.current || stationRef.current)) {
      releasedRef.current = true
      engine.clearFocusKeepInspect()
    }
    if (viewMode === 'pov') {
      if (povTarget !== null) engine.enterPov(povTarget)
    } else {
      engine.setViewMode(viewMode)
    }
    // The satellite view follows the viewpoint's index (it changes when a new
    // snapshot loads); `povTarget` is read here deliberately, not as a trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode])

  // Offer the satellite view while one object or a station is selected.
  useEffect(() => {
    onCanPovChange?.(povTarget !== null)
  }, [povTarget, onCanPovChange])

  // In the satellite view, the viewpoint is the selected object (or the
  // station's core module): if the selection goes (deselected, or missing
  // from a newly loaded snapshot), return to the view it came from with a
  // note; if its index moves (a new snapshot with the same object), keep
  // riding it.
  const povNameRef = useRef<string | null>(null)
  useEffect(() => {
    if (viewMode !== 'pov') return
    const engine = engineRef.current
    if (povTarget !== null) {
      engine?.enterPov(povTarget)
      povNameRef.current = loaded?.file.objects[povTarget]?.name ?? povNameRef.current
      return
    }
    const name = povNameRef.current ?? 'The viewpoint satellite'
    setPovNote(
      loadError === null && loaded && loaded.key !== 'current'
        ? `${name} isn’t in the ${loaded.key} snapshot, so the satellite view closed.`
        : `${name} is no longer selected, so the satellite view closed.`,
    )
    onViewRequestRef.current?.('back')
  }, [povTarget, viewMode, loaded, loadError])

  // The note clears itself after a few seconds.
  useEffect(() => {
    if (!povNote) return
    const t = setTimeout(() => setPovNote(null), 6000)
    return () => clearTimeout(t)
  }, [povNote])

  // Keyboard alternative to dragging and pinching in the satellite view.
  const onStageKeyDown = (e: { key: string; preventDefault: () => void }) => {
    if (viewMode !== 'pov') return
    const engine = engineRef.current
    if (!engine) return
    const step = 5
    const keys: Record<string, () => void> = {
      ArrowLeft: () => engine.povNudge(-step, 0),
      ArrowRight: () => engine.povNudge(step, 0),
      ArrowUp: () => engine.povNudge(0, step),
      ArrowDown: () => engine.povNudge(0, -step),
      '+': () => engine.povZoom(0.8),
      '=': () => engine.povZoom(0.8),
      '-': () => engine.povZoom(1.25),
      _: () => engine.povZoom(1.25),
      Escape: () => engine.returnToSatellite(),
    }
    const act = keys[e.key]
    if (act) {
      e.preventDefault()
      act()
    }
  }
  useEffect(() => {
    engineRef.current?.setObserver(observer)
  }, [observer])
  useEffect(() => {
    engineRef.current?.setSkyGrid(skyGrid)
  }, [skyGrid])

  useEffect(() => {
    engineRef.current?.setDayNight(dayNight)
  }, [dayNight])

  useEffect(() => {
    engineRef.current?.setTodayImagery(todayImagery)
  }, [todayImagery])

  useEffect(() => {
    engineRef.current?.setPovOrientation(povOrientation)
  }, [povOrientation])

  // A station view is a globe camera mode; entering the Sky view ends it.
  const [prevViewMode, setPrevViewMode] = useState(viewMode)
  if (prevViewMode !== viewMode) {
    setPrevViewMode(viewMode)
    if (viewMode === 'sky' && station) setStation(null)
    // Planets, the Moon and the Sun exist only in Sky: leaving it clears a body.
    const next = nextSelection(
      { satellite: inspect, body: skyBody },
      { type: 'view', mode: viewMode === 'sky' ? 'sky' : 'globe' },
    )
    if (next.body !== skyBody) setSkyBody(next.body)
  }

  useEffect(() => {
    engineRef.current?.setSelectedBody(skyBody)
  }, [skyBody])

  const useMyLocation = () => {
    if (!('geolocation' in navigator)) {
      setSkyError('This browser can’t share a location. Type a place instead.')
      return
    }
    setSkyBusy('locating')
    setSkyError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSkyBusy(null)
        setObserver({
          latDeg: pos.coords.latitude,
          lonDeg: pos.coords.longitude,
          label: 'Your location',
        })
        setSkyPanelOpen(false)
      },
      (err) => {
        setSkyBusy(null)
        setSkyError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was denied. Type a place instead.'
            : err.code === err.TIMEOUT
              ? 'Finding your location timed out. Try again, or type a place.'
              : 'Your location isn’t available right now. Type a place instead.',
        )
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    )
  }

  const searchPlace = async (e: React.FormEvent) => {
    e.preventDefault()
    const q = placeQuery.trim()
    if (!q || skyBusy) return
    setSkyBusy('searching')
    setSkyError(null)
    try {
      const place = await geocodePlace(q)
      if (place) {
        setObserver(place)
        setSkyPanelOpen(false)
      }
      else setSkyError(`No match for “${q}”. Try a city, or add a country.`)
    } catch {
      setSkyError('The place search isn’t responding. Try again, or use your location.')
    } finally {
      setSkyBusy(null)
    }
  }

  // Select the object in the engine, which keeps its nearest visible
  // neighbour (and the dashed line to it) live; the tick reads it back.
  useEffect(() => {
    engineRef.current?.setInspected(inspect)
  }, [inspect])
  useEffect(() => {
    engineRef.current?.setInspectedName(
      inspect !== null && loaded ? (loaded.file.objects[inspect]?.name ?? null) : null,
    )
  }, [inspect, loaded])

  const applyClock = useCallback((next: Clock, immediate: boolean) => {
    engineRef.current?.setClock(next, immediate)
    setClockState(next)
  }, [])

  // Enter focus once the near-miss's own snapshot is loaded; leave it when the
  // page clears `focus`.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    if (focus && loaded?.key === focus.datasetKey && focusedRef.current !== focus) {
      focusedRef.current = focus
      const tcaMs = Date.parse(focus.tcaUtc)
      const ok = engine.focusPair(focus.aId, focus.bId, tcaMs, fmtKm(focus.missKm))
      setFocusMissing(!ok)
      setClockState(engine.getClock())
    } else if (!focus && focusedRef.current) {
      focusedRef.current = null
      setFocusMissing(false)
      if (releasedRef.current) releasedRef.current = false
      else engine.resetView()
    }
  }, [focus, loaded])

  // Stations: ring every piece and follow them. Mutually exclusive with a
  // near-miss replay.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine || !loaded) return
    if (station && stationRef.current !== station) {
      stationRef.current = station
      const def = STATIONS.find((s) => s.key === station)
      const ids = def
        ? loaded.file.objects.filter((o) => def.match(o.name)).map((o) => o.norad_id)
        : []
      setStationPieces(engine.focusGroup(ids))
    } else if (!station && stationRef.current) {
      stationRef.current = null
      // A replay taking over, or a click elsewhere, has already handled the camera.
      if (releasedRef.current) releasedRef.current = false
      else if (!focus) engine.resetView()
    }
  }, [station, loaded, focus])

  // A replay replaces a station view or an inspected object.
  const [prevFocus, setPrevFocus] = useState(focus)
  if (prevFocus !== focus) {
    setPrevFocus(focus)
    if (focus) {
      if (station) setStation(null)
      if (inspect !== null) setInspect(null)
    }
  }

  const selectStation = (key: string) => {
    if (focus) onExitFocus()
    stationRef.current = null
    setInspect(null)
    setStation(key)
  }

  const stationDef = STATIONS.find((s) => s.key === station) ?? null
  const stationNames =
    stationDef && loaded
      ? loaded.file.objects.filter((o) => stationDef.match(o.name)).map((o) => o.name)
      : []

  // Above-horizon count, or why there's nothing to show. Catalog counts stay
  // in the legend; this one is separate.
  const filtered = loaded !== null && visibleCount < loaded.file.objects.length
  // The twilight phase and the Sun's elevation, as plain text: it changes fast
  // with the slider, so it stays out of any live region.
  const skySunLine = skySun && (
    <p className="globe-sky-sun">
      {PHASE_LABEL[twilightPhase(skySun.elDeg)]} · Sun {Math.abs(skySun.elDeg).toFixed(1)}°{' '}
      {skySun.elDeg >= 0 ? 'up' : 'below the horizon'}
    </p>
  )

  // The Sun, Moon and planets above the horizon, highest first, as plain text
  // (outside any live region, like the other changing numbers).
  const skyBodiesUp = aboveHorizon(skyBodies)
  const skyBodiesLine = observer && skyBodies.length > 0 && (
    <p className="globe-sky-bodies">
      {skyBodiesUp.length
        ? `Up now: ${skyBodiesUp.map((b) => `${b.name} ${Math.round(b.elDeg)}°`).join(', ')}`
        : 'No planets, Moon or Sun above your horizon.'}
    </p>
  )

  const skyCountLine =
    skyAbove > 0 ? (
      <p className="globe-sky-count">{fmt(skyAbove)} above your horizon</p>
    ) : (
      <p className="globe-sky-count is-empty">
        {filtered
          ? 'Nothing above your horizon with the current filters.'
          : 'Nothing above your horizon right now.'}
      </p>
    )

  const isLive = clock.kind === 'live'
  // The selected speed applies wherever the time is: live, scrubbed or paused.
  const speed = clock.speed

  const goLive = () => {
    if (focus) onExitFocus()
    applyClock(liveClock(Date.now(), speed), true)
  }

  const onSpeed = (s: number) => {
    applyClock(withSpeed(clock, s), false)
  }

  // Jump to the picked moment and play on from it at the selected speed.
  const onSlide = (value: number) => {
    if (focus) onExitFocus()
    applyClock(scrubClock(value, speed), false)
  }

  const bounds = current
    ? sliderBounds(time.nowMs || currentStartMs, currentStartMs, historyDates)
    : null

  // Pause / Play: freeze the shared clock at the moment shown, or resume from
  // it at the selected speed (as a scrubbed time; only Live goes back to now).
  // Paused at the end of the range there's nothing ahead to play.
  const paused = isPaused(clock)
  // The engine pauses at its own "now + a day", a moment before the slider's
  // maximum: the last minute of the range counts as the end.
  const endMs = (bounds?.maxMs ?? Infinity) - 60_000
  const playable = canPlay(clock, endMs)
  const onPlayPause = () => {
    // The engine's clock is the one shown (it pauses itself at the end of the range).
    const engineClock = engineRef.current?.getClock() ?? clock
    applyClock(togglePlay(engineClock, Date.now(), endMs), false)
  }
  // Space toggles it, unless focus is somewhere Space already does something
  // (a text field, a button, a link, the slider).
  const playPauseRef = useRef(onPlayPause)
  useEffect(() => {
    playPauseRef.current = onPlayPause
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || t.closest('input, textarea, select, button, a, [role="slider"], [role="button"]'))) return
      e.preventDefault()
      playPauseRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const loadingKey = datasetKey && loaded?.key !== datasetKey && loadError !== datasetKey
  const snapshotLabel = (key: DatasetKey) => (key === 'current' ? 'latest run' : `${key} snapshot`)
  const inspected = inspect !== null && loaded ? loaded.file.objects[inspect] : null
  const povObject = povTarget !== null && loaded ? loaded.file.objects[povTarget] : null
  // The Sun, Moon or planet selected in the satellite view's sky.
  const spaceBody = povInfo?.sky.selected ? (povInfo.sky.bodies.find((b) => b.key === povInfo.sky.selected) ?? null) : null
  // Find a star: matches for the typed text (or the suggested stars before
  // anything is typed), once the names have been loaded on first focus.
  const loadStarNames = () => {
    const engine = engineRef.current
    if (!engine || starTools) return
    void engine.ensureStarDetails().then(() => setStarTools(engine.starSearch()))
  }
  const starMatches: StarMatch[] = (() => {
    if (!starTools) return []
    const { names, has } = starTools
    if (starQuery.trim()) return searchStars(starQuery, names, has)
    return SUGGESTED_STARS.flatMap((n) => searchStars(n, names, has, 1))
  })()
  const goToStarMatch = (m: StarMatch) => {
    const engine = engineRef.current
    if (!engine) return
    const index = engine.starIndexOfHip(m.hip)
    if (index < 0) return
    engine.goToStar(index)
    setStarQuery('')
    setAnnouncement(`Showing ${m.name}`)
  }
  // The star selected in the satellite view's sky, as card rows.
  const spaceStar = viewMode === 'pov' ? (povInfo?.sky.star ?? null) : null
  const povCredits = [...imageryCredits(viewMode, povInfo?.imagery ?? null), ...skyCredits(viewMode, povInfo?.sky ?? null)]

  // ?debug=1: a plain-text overlay of everything that decides whether the
  // satellite view can be entered (temporary, for checking a live build).
  const [debug] = useState(() => new URLSearchParams(window.location.search).get('debug') === '1')
  // The engine's side (its selection, and whether the viewpoint propagates
  // now), read twice a second while the overlay is on.
  const [debugEngine, setDebugEngine] = useState<{
    selection: string
    prop: ReturnType<GlobeEngine['debugObject']> | null
  } | null>(null)
  useEffect(() => {
    if (!debug) return
    const read = () => {
      const engine = engineRef.current
      if (!engine) return
      setDebugEngine({
        selection: engine.debugSelection(),
        prop: povTarget !== null ? engine.debugObject(povTarget) : null,
      })
    }
    read()
    const t = setInterval(read, 500)
    return () => clearInterval(t)
  }, [debug, povTarget])
  const debugLines = (() => {
    if (!debug) return null
    const obj = (i: number | null) =>
      i === null ? 'none' : `${i} → ${loaded?.file.objects[i] ? `${loaded.file.objects[i].norad_id} ${loaded.file.objects[i].name}` : 'NOT IN LOADED OBJECTS'}`
    const prop = debugEngine?.prop ?? null
    return [
      `build ${__BUILD_COMMIT__} (${__BUILD_ENV__})`,
      `snapshot ${loaded ? `${loaded.key}, ${loaded.file.objects.length} objects, generated ${loaded.file.generated_at_utc ?? '?'}` : 'not loaded'}${loadError ? ` · load error ${loadError}` : ''}`,
      `clock ${clock.kind} ×${clock.speed} · displayed ${time.simMs ? new Date(time.simMs).toISOString() : '?'}`,
      `view ${viewMode} · engine ${debugEngine?.selection ?? 'not ready'}`,
      `selection: satellite ${obj(inspect)} · station ${station ?? 'none'}${stationForPov ? ` (core ${stationForPov.main})` : ''} · pair ${pairIdx ? `${obj(pairIdx[0])} / ${obj(pairIdx[1])}` : 'none'}`,
      `viewpoint ${obj(povTarget)} · in loaded objects ${povObject ? 'yes' : 'no'} · satrec ${prop ? (prop.satrec ? 'yes' : 'no') : '-'} · propagates now ${prop ? (prop.propagated ? 'yes' : `no (${prop.error})`) : '-'}`,
      `toggle: canPov sent ${povTarget !== null} · handler ${onCanPovChange ? 'yes' : 'MISSING'}`,
      `buttons: station panel ${!!stationDef && viewMode !== 'pov' && povTarget !== null} · object panel ${!!inspected && viewMode !== 'pov'} · pair panel ${!!focus && viewMode !== 'pov' && povTarget !== null && !!povObject} · onViewRequest ${onViewRequest ? 'yes' : 'MISSING'}`,
    ]
  })()

  // Screen readers hear only changes in kind: a new selection's name,
  // "Deselected", or a newly chosen location. The numbers that change as time
  // plays (azimuth, elevation, range, the above-horizon count) stay out of any
  // live region; they remain readable in the panels.
  const selectedBody = skyBody ? (skyBodies.find((b) => b.key === skyBody) ?? null) : null
  const announcedId = inspected ? `sat:${inspected.norad_id}` : skyBody ? `body:${skyBody}` : null
  const announcedPlace = observer?.label ?? null
  const [prevAnnounced, setPrevAnnounced] = useState({ id: announcedId, place: announcedPlace })
  const [announcement, setAnnouncement] = useState('')
  if (prevAnnounced.id !== announcedId || prevAnnounced.place !== announcedPlace) {
    setPrevAnnounced({ id: announcedId, place: announcedPlace })
    if (prevAnnounced.id !== announcedId) {
      const name = inspected?.name ?? selectedBody?.name ?? (skyBody ? skyBody : null)
      setAnnouncement(name ? `Selected ${name}` : 'Deselected')
    } else if (announcedPlace) {
      setAnnouncement(`Showing the sky from ${announcedPlace}`)
    }
  }
  // Entering and leaving the satellite view are announced by name only.
  const [prevAnnouncedView, setPrevAnnouncedView] = useState(viewMode)
  if (prevAnnouncedView !== viewMode) {
    setPrevAnnouncedView(viewMode)
    if (viewMode === 'pov') setAnnouncement(`Viewing from ${povObject?.name ?? 'the satellite'}`)
    else if (prevAnnouncedView === 'pov') {
      setAnnouncement(stationForPov && viewMode === 'globe' ? `Back to ${stationForPov.fullName}` : 'Back to full view')
    }
  }
  // Detaching from the satellite and returning are announced too.
  const povHeld = viewMode === 'pov' && !!povInfo?.detached
  const [prevPovHeld, setPrevPovHeld] = useState(povHeld)
  if (prevPovHeld !== povHeld) {
    setPrevPovHeld(povHeld)
    if (viewMode === 'pov') {
      setAnnouncement(povHeld ? 'Holding over the ground' : `Riding ${povObject?.name ?? 'the satellite'} again`)
    }
  }
  const offsetLabel = time.simMs ? formatOffset(time.simMs - time.nowMs) : ''
  // Whole degrees, finer when zoomed in on the sky (down to 0.05 degrees).
  const fmtFov = (f: number) => (f >= 10 ? `${Math.round(f)}°` : f >= 1 ? `${f.toFixed(1)}°` : `${f.toFixed(2)}°`)
  const PRESET_LABEL = {
    down: 'Down at Earth',
    forward: 'Forward along the orbit',
    outward: 'Outward at space',
  }
  const PRESET_SHORT = { down: 'Down', forward: 'Forward', outward: 'Out' }

  // On a phone outside full screen, a small box stands in for the panels:
  // what's selected (or what the view needs), and the way to full screen.
  const miniTitle =
    viewMode === 'pov' && spaceStar && !spaceBody
      ? spaceStar.name
      : viewMode === 'pov' && spaceBody
      ? spaceBody.name
      : viewMode === 'pov' && povObject
        ? `Satellite view: ${povObject.name}`
      : focus
        ? `${focus.aName} and ${focus.bName}`
        : (inspected?.name ??
          stationDef?.fullName ??
          selectedBody?.name ??
          (viewMode === 'sky' && !observer ? 'Sky view' : null))
  const miniText =
    viewMode === 'sky' && !observer && !inspected && !selectedBody
      ? 'Enter full screen to choose your location and see the sky'
      : 'Enter full screen to see details and controls'

  return (
    <div ref={rootRef} className={`globe${fullscreen.on ? ' is-fullscreen' : ''}`}>
      <div
        ref={stageRef}
        className="globe-stage"
        role="img"
        aria-label={
          viewMode === 'sky'
            ? 'Sky view: tracked objects above the chosen location’s horizon'
            : viewMode === 'pov'
              ? 'Satellite view: looking out from the selected satellite. ' +
                'Arrow keys look around, plus and minus zoom.'
              : 'Interactive 3D globe of every tracked object in the latest screening run'
        }
        tabIndex={viewMode === 'pov' ? 0 : undefined}
        onKeyDown={onStageKeyDown}
      >
        <div ref={containerRef} className="globe-canvas" />

        {coloring && (
          <div
            ref={legendRef}
            className={`globe-panel globe-legend${viewMode === 'sky' ? ' is-sky' : ''}${
              viewMode === 'sky' || fullscreen.on ? ' is-foldable' : ''
            }${(viewMode === 'sky' || fullscreen.on) && !legendOpen ? ' is-folded' : ''}`}
          >
            {(viewMode === 'sky' || fullscreen.on) && (
              <button
                type="button"
                className="globe-legend-fold"
                aria-expanded={legendOpen}
                aria-controls="globe-legend-body"
                onClick={() => setLegendOpen((open) => !open)}
              >
                Colours and filters
                {hiddenNow.size + hiddenGroups.size > 0 && (
                  <span className="globe-filter-count">
                    {' '}
                    · {hiddenNow.size + hiddenGroups.size} hidden
                  </span>
                )}
              </button>
            )}
            <div id="globe-legend-body" className="globe-legend-body">
              <div className="globe-segmented" role="group" aria-label="Color points by">
                {COLOR_MODES.map(({ mode, label }) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={colorMode === mode}
                    onClick={() => setColorMode(mode)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <ul>
                {coloring.categories.map((c) => {
                  const swatch = <span className="globe-swatch" style={{ background: c.color }} />
                  const content = (
                    <>
                      {swatch}
                      <span className="globe-legend-label">{c.label}</span>
                      <span className="globe-legend-count">{fmt(c.count)}</span>
                    </>
                  )
                  return (
                    <li key={c.key}>
                      {colorMode === 'flat' ? (
                        <span className="globe-legend-row">{content}</span>
                      ) : (
                        <label
                          className={`globe-legend-row is-toggle${hiddenNow.has(c.key) ? ' is-off' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={!hiddenNow.has(c.key)}
                            onChange={() => toggleCategory(c.key)}
                          />
                          {content}
                        </label>
                      )}
                    </li>
                  )
                })}
              </ul>
              {colorMode === 'age' && (
                <>
                  {coloring.note && <p className="globe-legend-note">{coloring.note}</p>}
                  <p className="globe-legend-note globe-legend-precision">
                    Launch year vs this snapshot&apos;s date, so ±1 year at the edges.
                  </p>
                </>
              )}
              <details className="globe-filters">
                <summary>
                  Filter by name
                  {hiddenGroups.size > 0 && (
                    <span className="globe-filter-count"> · {hiddenGroups.size} hidden</span>
                  )}
                </summary>
                <ul>
                  {ALL_GROUPS.filter((g) => groups.counts[g.key]).map((g) => (
                    <li key={g.key} className="globe-filter-row">
                      <label
                        className={`globe-legend-row is-toggle is-filter${hiddenGroups.has(g.key) ? ' is-off' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={!hiddenGroups.has(g.key)}
                          onChange={() => toggleGroup(g.key)}
                        />
                        <span className="globe-legend-label">{g.label}</span>
                        <span className="globe-legend-count">{fmt(groups.counts[g.key])}</span>
                      </label>
                      <button
                        type="button"
                        className="globe-only"
                        aria-label={`Show only ${g.label}`}
                        onClick={() => showOnlyGroups([g.key])}
                      >
                        only
                      </button>
                    </li>
                  ))}
                </ul>
                {hiddenGroups.size > 0 && (
                  <button
                    type="button"
                    className="globe-link"
                    onClick={() => setHiddenGroups(NO_HIDDEN)}
                  >
                    Show all
                  </button>
                )}
              </details>
              {viewMode === 'globe' && (
                <div className="globe-stations" role="group" aria-label="Go to a space station">
                  <span className="globe-muted">Stations</span>
                  {STATIONS.map((st) => (
                    <button
                      key={st.key}
                      type="button"
                      aria-pressed={station === st.key}
                      onClick={() => selectStation(st.key)}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              )}
              {viewMode !== 'sky' && (
                <label className="globe-daynight">
                  <input
                    type="checkbox"
                    checked={dayNight}
                    onChange={(e) => setDayNight(e.target.checked)}
                  />
                  Day/night
                </label>
              )}
            </div>
          </div>
        )}

        {(focus || inspected || stationDef || viewMode !== 'globe' || selectedBody) && (
          <div
            ref={sideRef}
            className={`globe-side${sheetOpen ? ' is-open' : ''}`}
            style={sideDock === null || fullscreen.on ? undefined : { top: sideDock, bottom: 'auto' }}
          >
            {fullscreen.on && (
              <button
                type="button"
                className="globe-sheet-handle"
                aria-expanded={sheetOpen}
                onClick={() => setSheetOpen((o) => !o)}
              >
                <span className="globe-sheet-grip" aria-hidden="true" />
                {sheetOpen ? 'Less' : 'Details and controls'}
              </button>
            )}
            {viewMode === 'sky' && (
              <>
                {observer && !skyPanelOpen ? (
                  <div className="globe-panel globe-sky-panel is-compact">
                    <div className="globe-sky-head">
                      <p className="globe-panel-title">Your sky</p>
                      <label className="globe-sky-grid">
                        <input
                          type="checkbox"
                          checked={skyGrid}
                          onChange={(e) => setSkyGrid(e.target.checked)}
                        />
                        Grid
                      </label>
                    </div>
                    <p className="globe-sky-compact-where">{observer.label}</p>
                    {skyCountLine}
                    {skySunLine}
                    {skyBodiesLine}
                    <div className="globe-sky-actions">
                      <button
                        type="button"
                        className="globe-button"
                        onClick={() => setSkyPanelOpen(true)}
                      >
                        Change location
                      </button>
                      <button
                        type="button"
                        className="globe-button"
                        onClick={() => engineRef.current?.resetSkyView()}
                      >
                        Reset view
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="globe-panel globe-sky-panel">
                    <div className="globe-sky-head">
                        <p className="globe-panel-title">Your sky</p>
                        <label className="globe-sky-grid">
                          <input
                            type="checkbox"
                            checked={skyGrid}
                            onChange={(e) => setSkyGrid(e.target.checked)}
                          />
                          Grid
                        </label>
                      </div>
                    <button
                      type="button"
                      className="globe-button"
                      onClick={useMyLocation}
                      disabled={skyBusy !== null}
                    >
                      {skyBusy === 'locating' ? 'Finding your location…' : 'Use my location'}
                    </button>
                    <form className="globe-sky-search" onSubmit={searchPlace}>
                      <label htmlFor="globe-sky-place" className="globe-muted">
                        or a place
                      </label>
                      <div className="globe-sky-search-row">
                        <input
                          id="globe-sky-place"
                          type="text"
                          value={placeQuery}
                          onChange={(e) => setPlaceQuery(e.target.value)}
                          placeholder="City or address"
                          autoComplete="off"
                        />
                        <button type="submit" className="globe-button" disabled={skyBusy !== null}>
                          {skyBusy === 'searching' ? '…' : 'Find'}
                        </button>
                      </div>
                    </form>
                    {skyError && (
                      <p className="globe-sky-error" role="alert">
                        {skyError}
                      </p>
                    )}
                    {observer && (
                      <div className="globe-sky-where">
                        <p>{observer.label}</p>
                        <p className="globe-muted">
                          {formatLatLon({ latDeg: observer.latDeg, lonDeg: observer.lonDeg, altKm: 0 })}
                        </p>
                        {skyCountLine}
                        {skySunLine}
                        {skyBodiesLine}
                        <button
                          type="button"
                          className="globe-button globe-sky-reset"
                          onClick={() => engineRef.current?.resetSkyView()}
                        >
                          Reset view
                        </button>
                      </div>
                    )}
                    <p className="globe-muted globe-sky-note">
                      Your location stays in this browser: it isn&apos;t stored or sent anywhere. A typed
                      place is sent only to OpenStreetMap&apos;s Nominatim to look it up.{' '}
                      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
                        Search © OpenStreetMap contributors
                      </a>
                      .
                    </p>
                  </div>
                )}
              </>
            )}
            {stationDef && viewMode !== 'pov' && (
              <div className="globe-panel" aria-live="polite">
                <p className="globe-panel-title">
                  <span className="globe-ring-key" style={{ borderColor: RING_GROUP }} />
                  {stationDef.fullName}
                </p>
                <p>
                  {stationPieces
                    ? `${stationPieces} tracked piece${stationPieces === 1 ? '' : 's'}, followed as it moves:`
                    : 'Not in this snapshot.'}
                </p>
                {stationPieces > 0 && <p className="globe-muted">{stationNames.join(' · ')}</p>}
                {stationPieces > 0 && (
                  <p className="globe-muted">
                    <span className="globe-orbit-key" style={{ background: ORBIT_COLOR }} />
                    Its orbit, one full period
                  </p>
                )}
                <div className="globe-inspect-actions">
                  <button type="button" className="globe-button" onClick={() => setStation(null)}>
                    ← Back to full view
                  </button>
                  {povTarget !== null && (
                    <button type="button" className="globe-button" onClick={() => onViewRequest?.('pov')}>
                      View from here
                    </button>
                  )}
                </div>
              </div>
            )}
            {focus && viewMode !== 'pov' && (
              <div className="globe-panel" aria-live="polite">
                <p className="globe-panel-title">Closest approach</p>
                <p className="globe-pair">
                  <span>
                    <span className="globe-ring-key" style={{ borderColor: RING_A }} />
                    {focus.aName}
                  </span>
                  <span>
                    <span className="globe-ring-key" style={{ borderColor: RING_B }} />
                    {focus.bName}
                  </span>
                </p>
                <p className="globe-muted">
                  {fmtKm(focus.missKm)} apart at {formatUtc(Date.parse(focus.tcaUtc))} UTC
                </p>
                {focusMissing ? (
                  <p className="globe-muted">One of these objects isn&apos;t in this snapshot.</p>
                ) : (
                  <p className="globe-muted">
                    <span className="globe-orbit-key" style={{ background: ORBIT_COLOR }} />
                    Both orbits, one full period each
                  </p>
                )}
                <div className="globe-inspect-actions">
                  <button type="button" className="globe-button" onClick={goLive}>
                    ← Back to full view
                  </button>
                  {povTarget !== null && povObject && (
                    <button
                      type="button"
                      className="globe-button"
                      aria-label={`View from ${povObject.name}`}
                      onClick={() => onViewRequest?.('pov')}
                    >
                      View from here
                    </button>
                  )}
                </div>
              </div>
            )}
            {selectedBody && viewMode === 'sky' && (
              <div
                className={`globe-panel globe-inspect globe-body is-sky${
                  bodyDetailsFor !== selectedBody.key ? ' is-collapsed' : ''
                }`}
                role="region"
                aria-label="Selected object"
              >
                <div className="globe-panel-head">
                  <p className="globe-panel-title">
                    <span className="globe-ring-key" style={{ borderColor: RING_INSPECT }} />
                    {selectedBody.kind === 'planet'
                      ? 'Planet'
                      : selectedBody.kind === 'moon'
                        ? 'The Moon'
                        : 'The Sun'}
                  </p>
                  <button
                    type="button"
                    className="globe-inspect-more"
                    aria-expanded={bodyDetailsFor === selectedBody.key}
                    aria-controls="globe-body-details"
                    onClick={() =>
                      setBodyDetailsFor(bodyDetailsFor === selectedBody.key ? null : selectedBody.key)
                    }
                  >
                    {bodyDetailsFor === selectedBody.key ? 'Less' : 'Details'}
                  </button>
                  <button
                    type="button"
                    className="globe-close"
                    aria-label="Close details"
                    onClick={() => handlePick.current(null)}
                  >
                    ×
                  </button>
                </div>
                <p className="globe-inspect-name">{selectedBody.name}</p>
                <p className="globe-inspect-summary">
                  {selectedBody.elDeg <= 0
                    ? 'Below your horizon right now'
                    : `Az ${selectedBody.azDeg.toFixed(1)}° · El ${selectedBody.elDeg.toFixed(1)}°`}
                </p>
                <div id="globe-body-details" className="globe-inspect-details">
                  <dl>
                    <dt>Azimuth</dt>
                    <dd>{selectedBody.azDeg.toFixed(1)}°</dd>
                    <dt>Elevation</dt>
                    <dd>{selectedBody.elDeg.toFixed(1)}°</dd>
                    <dt>Magnitude</dt>
                    <dd>{selectedBody.mag.toFixed(1)}</dd>
                    <dt>Distance</dt>
                    <dd>
                      {selectedBody.kind === 'moon'
                        ? fmtKm(Math.round(selectedBody.distKm))
                        : `${selectedBody.distAu.toFixed(selectedBody.distAu < 10 ? 3 : 2)} AU`}
                    </dd>
                    {selectedBody.illuminated !== undefined && (
                      <>
                        <dt>Illuminated</dt>
                        <dd>
                          {Math.round(selectedBody.illuminated * 100)}% ·{' '}
                          {moonPhaseName(selectedBody.illuminated, selectedBody.waxing ?? true)}
                        </dd>
                      </>
                    )}
                  </dl>
                  {selectedBody.elDeg <= 0 && (
                    <p className="globe-sky-below">Below your horizon right now.</p>
                  )}
                  <button type="button" className="globe-button" onClick={() => handlePick.current(null)}>
                    Deselect
                  </button>
                </div>
              </div>
            )}
            {viewMode === 'pov' && povObject && (
              <div className="globe-panel globe-pov" role="region" aria-label="Satellite view">
                <div className="globe-panel-head">
                  <p className="globe-panel-title">Satellite view</p>
                  <button
                    type="button"
                    className="globe-button globe-pov-back"
                    onClick={() => onViewRequest?.('back')}
                  >
                    ← Back
                  </button>
                </div>
                <p className="globe-inspect-name">{povObject.name}</p>
                <div className="globe-pov-imagery-choice" role="group" aria-label="Imagery" aria-describedby="globe-pov-explainer">
                  <button type="button" aria-pressed={!todayImagery} onClick={() => setTodayImagery(false)}>
                    Base map
                  </button>
                  <button type="button" aria-pressed={todayImagery} onClick={() => setTodayImagery(true)}>
                    Today&apos;s imagery
                  </button>
                </div>
                {todayImagery && (
                  <p className="globe-pov-date">
                    {povInfo?.imagery.overlay?.date ? (
                      <strong>{povInfo.imagery.overlay.date}</strong>
                    ) : (
                      <strong>Loading…</strong>
                    )}{' '}
                    · follows the time slider
                  </p>
                )}
                <p id="globe-pov-explainer" className="globe-muted globe-pov-explainer">
                  {IMAGERY_EXPLAINER}
                </p>
                {todayImagery && <p className="globe-muted globe-pov-explainer">{TODAY_FADE_NOTE}.</p>}
                <div className="globe-pov-presets" role="group" aria-label="Look">
                  {(['down', 'forward', 'outward'] as const).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      aria-pressed={!povInfo?.detached && povInfo?.preset === preset}
                      aria-label={PRESET_LABEL[preset]}
                      onClick={() => engineRef.current?.setPovPreset(preset)}
                    >
                      {PRESET_SHORT[preset]}
                    </button>
                  ))}
                </div>
                {povInfo && povInfo.sky.stars > 0 && (
                  <div className="globe-star-find">
                    <label className="globe-star-find-label" htmlFor="globe-star-find">
                      Find a star
                    </label>
                    <input
                      id="globe-star-find"
                      type="search"
                      className="globe-star-find-input"
                      value={starQuery}
                      placeholder="Sirius, Vega, HIP 91262…"
                      autoComplete="off"
                      spellCheck={false}
                      onFocus={loadStarNames}
                      onChange={(e) => {
                        setStarQuery(e.target.value)
                        loadStarNames()
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && starMatches[0]) {
                          e.preventDefault()
                          goToStarMatch(starMatches[0])
                        }
                        e.stopPropagation()
                      }}
                    />
                    {!starTools ? null : starMatches.length > 0 ? (
                      <ul className="globe-star-find-list" aria-label="Matching stars">
                        {starMatches.map((m) => (
                          <li key={m.hip}>
                            <button type="button" onClick={() => goToStarMatch(m)}>
                              <span>{m.name}</span>
                              <span className="globe-muted">
                                {[m.designation, m.constellation].filter(Boolean).join(' ') || `HIP ${m.hip}`}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : starQuery.trim() !== '' ? (
                      <p className="globe-muted globe-star-find-none">
                        No star named or numbered that. Try a name such as Vega, or HIP 91262.
                      </p>
                    ) : null}
                  </div>
                )}
                <div className="globe-pov-imagery-choice globe-pov-orientation" role="group" aria-label="Orientation">
                  <button type="button" aria-pressed={povOrientation === 'heading'} onClick={() => setPovOrientation('heading')}>
                    Heading up
                  </button>
                  <button type="button" aria-pressed={povOrientation === 'north'} onClick={() => setPovOrientation('north')}>
                    North up
                  </button>
                </div>
                {povInfo && (
                  <dl className="globe-pov-facts">
                    <dt>Altitude</dt>
                    <dd>{fmtKm(Math.round(povInfo.altKm))}</dd>
                    <dt>Speed</dt>
                    <dd>{povInfo.speedKmS.toFixed(2)} km/s</dd>
                    {povInfo.detached ? (
                      <>
                        <dt>Holding over</dt>
                        <dd>{formatLatLon({ latDeg: povInfo.detached.latDeg, lonDeg: povInfo.detached.lonDeg, altKm: 0 })}</dd>
                        <dt>Camera height</dt>
                        <dd>{fmtKm(povInfo.detached.altKm < 10 ? Math.round(povInfo.detached.altKm * 10) / 10 : Math.round(povInfo.detached.altKm))}</dd>
                        <dt>Looking</dt>
                        <dd>
                          Straight down,{' '}
                          {povInfo.orientation === 'north'
                            ? 'north up'
                            : `heading up (${Math.round(povInfo.detached.headingDeg ?? 0)}°)`}
                        </dd>
                      </>
                    ) : (
                      <>
                        <dt>Below</dt>
                        <dd>{formatLatLon({ latDeg: povInfo.latDeg, lonDeg: povInfo.lonDeg, altKm: 0 })}</dd>
                        <dt>Looking</dt>
                        <dd>
                          {PRESET_LABEL[povInfo.preset]}
                          {povInfo.preset === 'down' ? (povInfo.orientation === 'north' ? ', north up' : ', heading up') : ''}
                          {povInfo.yaw !== 0 || povInfo.pitch !== 0
                            ? ` · ${Math.round(povInfo.yaw)}° right, ${Math.round(povInfo.pitch)}° up`
                            : ''}
                        </dd>
                      </>
                    )}
                    <dt>Field of view</dt>
                    <dd>{fmtFov(povInfo.fov)}</dd>
                  </dl>
                )}
                {povInfo && <p className="globe-muted globe-pov-imagery">{imageryLine(povInfo.imagery)}</p>}
              </div>
            )}
            {viewMode === 'pov' && spaceStar && !spaceBody && (
              <div className="globe-panel globe-space-body" role="region" aria-label={`${spaceStar.name}, selected in the sky`}>
                <div className="globe-panel-head">
                  <p className="globe-panel-title">Star</p>
                  <button
                    type="button"
                    className="globe-close"
                    aria-label="Close"
                    onClick={() => engineRef.current?.selectStar(-1)}
                  >
                    ×
                  </button>
                </div>
                <p className="globe-inspect-name">
                  {spaceStar.name}
                  {spaceStar.iau && spaceStar.designation ? (
                    <span className="globe-star-desig"> · {spaceStar.designation}</span>
                  ) : null}
                </p>
                {spaceStar.record && spaceStar.iau && (
                  <p className="globe-muted globe-star-id">HIP {spaceStar.record.hip}</p>
                )}
                <dl className="globe-space-facts">
                  {starCardRows(spaceStar).map((r) => (
                    <Fragment key={r.label}>
                      <dt>{r.label}</dt>
                      <dd>
                        {r.value}
                        {r.estimate && <span className="globe-star-est"> (estimate)</span>}
                        {r.note && <span className="globe-star-note">{r.note}</span>}
                      </dd>
                    </Fragment>
                  ))}
                </dl>
                <p className="globe-muted globe-star-source">
                  Hipparcos Catalogue (ESA, 1997). Estimates inherit the catalogue&apos;s errors and ignore
                  interstellar dust.
                </p>
              </div>
            )}
            {viewMode === 'pov' && spaceBody && (
              <div className="globe-panel globe-space-body" role="region" aria-label={`${spaceBody.name}, selected in the sky`}>
                <div className="globe-panel-head">
                  <p className="globe-panel-title">{spaceBody.kind === 'moon' ? 'Moon' : spaceBody.key === 'sun' ? 'Sun' : 'Planet'}</p>
                  <button
                    type="button"
                    className="globe-close"
                    aria-label="Close"
                    onClick={() => engineRef.current?.setSpaceSelected(null)}
                  >
                    ×
                  </button>
                </div>
                <p className="globe-inspect-name">{spaceBody.name}</p>
                <dl className="globe-space-facts">
                  <dt>Magnitude</dt>
                  <dd>{spaceBody.mag.toFixed(1)}</dd>
                  <dt>Distance</dt>
                  <dd>
                    {spaceBody.distKm > 5e6
                      ? `${(spaceBody.distKm / 149_597_870.7).toFixed(2)} AU`
                      : `${fmtKm(Math.round(spaceBody.distKm))}`}
                  </dd>
                  {spaceBody.angDiameterDeg > 0 && (
                    <>
                      <dt>Apparent size</dt>
                      <dd>{(spaceBody.angDiameterDeg * 60).toFixed(1)}′</dd>
                    </>
                  )}
                  {spaceBody.illuminated !== undefined && spaceBody.waxing !== undefined && (
                    <>
                      <dt>Phase</dt>
                      <dd>
                        {moonPhaseName(spaceBody.illuminated, spaceBody.waxing)} ·{' '}
                        {Math.round(spaceBody.illuminated * 100)}% lit, as seen from here
                      </dd>
                    </>
                  )}
                </dl>
                {spaceBody.parallaxDeg !== undefined && (
                  <p className="globe-muted">
                    From this satellite the Moon is {spaceBody.parallaxDeg.toFixed(2)}° from where it appears from
                    the Earth&apos;s centre.
                  </p>
                )}
              </div>
            )}
            {inspected && viewMode !== 'pov' && (
              <div
                className={`globe-panel globe-inspect${viewMode === 'sky' ? ' is-sky' : ''}${
                  viewMode === 'sky' && detailsFor !== inspect ? ' is-collapsed' : ''
                }`}
                role="region"
                aria-label="Selected object"
              >
                <div className="globe-panel-head">
                  <p className="globe-panel-title">
                    <span className="globe-ring-key" style={{ borderColor: RING_INSPECT }} />
                    Selected object
                  </p>
                  {viewMode === 'sky' && (
                    <button
                      type="button"
                      className="globe-inspect-more"
                      aria-expanded={detailsFor === inspect}
                      aria-controls="globe-inspect-details"
                      onClick={() => setDetailsFor(detailsFor === inspect ? null : inspect)}
                    >
                      {detailsFor === inspect ? 'Less' : 'Details'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="globe-close"
                    aria-label="Close object details"
                    onClick={() => handlePick.current(null)}
                  >
                    ×
                  </button>
                </div>
                <p className="globe-inspect-name">{inspected.name}</p>
                {viewMode === 'sky' && (
                  <p className="globe-inspect-summary">
                    {!inspectSky
                      ? '—'
                      : inspectSky.elDeg <= 0
                        ? 'Below your horizon right now'
                        : `Az ${inspectSky.azDeg.toFixed(1)}° · El ${inspectSky.elDeg.toFixed(1)}°`}
                  </p>
                )}
                <div id="globe-inspect-details" className="globe-inspect-details">
                  <dl>
                    <dt>NORAD ID</dt>
                    <dd>{inspected.norad_id}</dd>
                    <dt>Type</dt>
                    <dd>{describeType(inspected)}</dd>
                    <dt>Owner</dt>
                    <dd>{inspected.satcat_owner?.name ?? 'Unknown'}</dd>
                    <dt>Position</dt>
                    <dd>{inspectPos ? formatLatLon(inspectPos) : '—'}</dd>
                    <dt>Altitude</dt>
                    <dd>{inspectPos ? fmtKm(Math.round(inspectPos.altKm)) : '—'}</dd>
                    {orbitPeriodMs !== null && (
                      <>
                        <dt>Orbit</dt>
                        <dd>
                          <span className="globe-orbit-key" style={{ background: ORBIT_COLOR }} />
                          {formatPeriod(orbitPeriodMs)}
                        </dd>
                      </>
                    )}
                    {viewMode === 'sky' && (
                      <>
                        <dt>Azimuth</dt>
                        <dd>{inspectSky ? `${inspectSky.azDeg.toFixed(1)}°` : '—'}</dd>
                        <dt>Elevation</dt>
                        <dd>{inspectSky ? `${inspectSky.elDeg.toFixed(1)}°` : '—'}</dd>
                        <dt>Range</dt>
                        <dd>{inspectSky ? fmtKm(Math.round(inspectSky.rangeKm)) : '—'}</dd>
                      </>
                    )}
                    {viewMode === 'globe' && <dt>Nearest</dt>}
                    {viewMode === 'globe' && <dd>
                      {neighbor && loaded && inspect !== null ? (
                        <>
                          <span className="globe-ring-key" style={{ borderColor: RING_A }} />
                          {fmtKm(neighbor.km)} · {loaded.file.objects[neighbor.index].name}
                          {neighbor.km < COLOCATED_KM && (
                            <span className="globe-muted"> (docked or co-located)</span>
                          )}
                        </>
                      ) : neighbor === null ? (
                        <span className="globe-muted">No visible object</span>
                      ) : (
                        '—'
                      )}
                    </dd>}
                  </dl>
                  {viewMode === 'globe' ? (
                    <p className="globe-muted globe-neighbor-note">
                      Nearest neighbour is live: it follows the displayed time and counts only
                      objects currently shown.
                    </p>
                  ) : (
                    inspectSky &&
                    inspectSky.elDeg <= 0 && (
                      <p className="globe-sky-below">Below your horizon right now.</p>
                    )
                  )}
                  <div className="globe-inspect-actions">
                    <button
                      type="button"
                      className="globe-button"
                      onClick={() => handlePick.current(null)}
                    >
                      Deselect
                    </button>
                    <button
                      type="button"
                      className="globe-button"
                      onClick={() => onViewRequest?.('pov')}
                    >
                      View from here
                    </button>
                  </div>
                  {/* In Sky the values are live and the clock sits just below the stage. */}
                  {viewMode === 'globe' && (
                    <p className="globe-muted">
                      At {time.simMs ? `${formatUtc(time.simMs)} UTC` : 'the displayed time'}.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {viewMode === 'sky' && !observer && (
          <p className="globe-status globe-sky-prompt">
            Choose a location to see what&apos;s above your horizon.
          </p>
        )}

        {!loaded && !loadError && <p className="globe-status">Loading the tracked catalog…</p>}
        {loadError && (
          <div className="globe-status" role="alert">
            <p>Couldn&apos;t load the {snapshotLabel(loadError)}.</p>
            <button type="button" className="globe-button" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
          </div>
        )}
        {loaded && loadingKey && (
          <p className="globe-badge">Loading {snapshotLabel(datasetKey)}…</p>
        )}

        {povNote && <p className="globe-badge globe-pov-note">{povNote}</p>}
        {viewMode === 'pov' && povInfo && povInfo.northDeg !== null && (
          <div
            className="globe-compass"
            role="img"
            aria-label={`North is ${Math.round(Math.abs(povInfo.northDeg))}° ${povInfo.northDeg >= 0 ? 'right' : 'left'} of up`}
            title="North"
          >
            <svg viewBox="-20 -20 40 40" width="40" height="40" style={{ transform: `rotate(${povInfo.northDeg}deg)` }} aria-hidden="true">
              <circle r="18" className="globe-compass-ring" />
              <path d="M0 -14 L5 2 L0 -1 L-5 2 Z" className="globe-compass-north" />
              <path d="M0 14 L5 2 L0 5 L-5 2 Z" className="globe-compass-south" />
              <text y="-5" transform="translate(0 -9)" textAnchor="middle" className="globe-compass-n">N</text>
            </svg>
          </div>
        )}
        {fullscreen.on ? (
          <button
            type="button"
            className="globe-fs-btn globe-fs-exit"
            onClick={() => dispatchFs({ type: 'exit' })}
          >
            <span aria-hidden="true">✕</span> Exit full screen
          </button>
        ) : (
          <button ref={fsButtonRef} type="button" className="globe-fs-btn" onClick={enterFullscreen}>
            <span aria-hidden="true">⤢</span> Full screen
          </button>
        )}
        {!fullscreen.on && miniTitle && (
          <div className="globe-mini" role="region" aria-label="Selection">
            <p className="globe-mini-name">{miniTitle}</p>
            <p className="globe-mini-text">{miniText}</p>
            <button type="button" className="globe-mini-btn" onClick={enterFullscreen}>
              Full screen
            </button>
          </div>
        )}
        {viewMode === 'pov' && povInfo?.detached && (
          <button type="button" className="globe-pov-return" onClick={() => engineRef.current?.returnToSatellite()}>
            ↑ Return to satellite
          </button>
        )}
        {debugLines && (
          <pre className="globe-debug" aria-hidden="true">
            {debugLines.join('\n')}
          </pre>
        )}
        <p className={`globe-hint${viewMode !== 'globe' ? ' is-sky' : ''}`}>
          {viewMode === 'sky'
            ? 'Drag to look around · scroll or pinch to zoom · click a point for details'
            : viewMode === 'pov'
              ? povInfo?.detached
                ? 'Drag or arrow keys to pan · scroll, pinch or double-click to zoom · Esc returns to the satellite'
                : 'Drag or arrow keys to look around · scroll, pinch or double-click to zoom in toward a point'
              : 'Drag to rotate · scroll to zoom · right-drag to pan · click a point for details'}
        </p>
      </div>

      <p className="visually-hidden" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      {loaded && visibleCount < loaded.file.objects.length && (
        <div className="globe-filterbar" role="status">
          <span>
            Showing {fmt(visibleCount)} of {fmt(loaded.file.objects.length)} objects
            {hiddenGroups.size > 0 && visibleGroupLabels.length <= 3
              ? `: ${visibleGroupLabels.join(', ') || 'no name groups'}`
              : ''}
            .
          </span>
          <button type="button" className="globe-button-light" onClick={showEverything}>
            Show all objects
          </button>
        </div>
      )}

      <div className="globe-timebar">
        <div className="globe-playback">
          <button
            type="button"
            className={`globe-live${isLive ? ' is-live' : ''}`}
            aria-pressed={isLive}
            onClick={goLive}
          >
            <span className="globe-live-dot" aria-hidden="true" />
            Live
          </button>
          <button
            type="button"
            className="globe-playpause"
            aria-label={paused ? 'Play' : 'Pause'}
            aria-disabled={!playable || undefined}
            title={!playable ? 'At the end of the time range' : paused ? 'Play (Space)' : 'Pause (Space)'}
            onClick={() => playable && onPlayPause()}
          >
            <span aria-hidden="true">{paused ? '▶' : '❚❚'}</span>
            {paused ? 'Play' : 'Pause'}
          </button>
          <div
            className="globe-speed"
            role="group"
            aria-label="Playback speed"
          >
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={speed === s}
                onClick={() => onSpeed(s)}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>
        {bounds && (
          <input
            type="range"
            className="globe-slider"
            aria-label="Displayed time"
            min={bounds.minMs}
            max={bounds.maxMs}
            step={60_000}
            value={Math.min(bounds.maxMs, Math.max(bounds.minMs, time.simMs || bounds.minMs))}
            onChange={(e) => onSlide(Number(e.target.value))}
          />
        )}
        <p className="globe-time">
          {time.simMs ? `${formatUtc(time.simMs)} UTC` : '—'}
          <span className="globe-muted">
            {!time.simMs
              ? ''
              : isLive
                ? speed === 1 && Math.abs(time.simMs - time.nowMs) < 2000
                  ? ' · real time'
                  : ` · ${speed}× · ${offsetLabel}`
                : clock.kind === 'frozen'
                  ? ` · ${offsetLabel} · paused`
                  : ` · ${speed}× · ${offsetLabel}`}
          </span>
        </p>
      </div>
      <p className="globe-footnote">
        {loaded
          ? `${fmt(loaded.file.object_count)} objects from the ${snapshotLabel(loaded.key)}. `
          : ''}
        {historyDates.length === 0
          ? 'Earlier days appear on the slider as daily snapshots accumulate. '
          : ''}
        Earth imagery: NASA Visible Earth (Blue Marble); city lights: NASA Earth Observatory (Black
        Marble 2016, Suomi NPP VIIRS).
        {povCredits.length > 0 && ` Satellite view: ${povCredits.join('. ')}.`}
      </p>
      {loaded && (
        <CollisionHistory
          counts={groups.counts}
          conjunctionsFlagged={conjunctionsFlagged}
          activeKeys={isolatedKeys}
          onToggle={toggleCollisionDebris}
        />
      )}
    </div>
  )
}
