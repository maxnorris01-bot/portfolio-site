// The 3D globe (Phase 1 of the visualization plan, satellite-conjunction-
// screening working notes 2026-10-03). Lazy-loaded by SatelliteTool so
// three.js and satellite.js stay out of the app's main bundle.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { colorize, type ColorMode } from '../globe/colors'
import { loadHistoryDates, loadObjects } from '../globe/data'
import { GlobeEngine, type Clock } from '../globe/engine'
import { DAY_MS, HOUR_MS, datasetFor, sliderBounds } from '../globe/timeline'
import type { DatasetKey, FocusRequest, ObjectsFile } from '../globe/types'
import './SatelliteGlobe.css'

const TEXTURE_URL = '/textures/earth-day-2k.jpg'
const TICK_MS = 250

const COLOR_MODES: { mode: ColorMode; label: string }[] = [
  { mode: 'type', label: 'Type' },
  { mode: 'owner', label: 'Owner' },
  { mode: 'flat', label: 'Flat' },
]

const fmt = (n: number) => n.toLocaleString('en-US')

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
  const abs = Math.abs(deltaMs)
  const d = Math.floor(abs / DAY_MS)
  const h = Math.floor((abs % DAY_MS) / HOUR_MS)
  const m = Math.round((abs % HOUR_MS) / 60_000)
  const parts = d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`
  return deltaMs < 0 ? `${parts} ago` : `in ${parts}`
}

interface Props {
  /** A near-miss to replay, or null for the free-roam view. */
  focus: FocusRequest | null
  /** Called when the globe leaves focus mode on its own (slider, Live, back). */
  onExitFocus: () => void
  /** The snapshot the globe is showing, so the page can show its near misses. */
  onDatasetChange: (key: DatasetKey) => void
}

export default function SatelliteGlobe({ focus, onExitFocus, onDatasetChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<GlobeEngine | null>(null)
  const [time, setTime] = useState(() => ({ simMs: 0, nowMs: 0 }))
  const [clock, setClockState] = useState<Clock>({ kind: 'live' })
  const [colorMode, setColorMode] = useState<ColorMode>('type')
  const [historyDates, setHistoryDates] = useState<string[]>([])
  const [current, setCurrent] = useState<ObjectsFile | null>(null)
  const [loaded, setLoaded] = useState<{ key: DatasetKey; file: ObjectsFile } | null>(null)
  const [loadError, setLoadError] = useState<DatasetKey | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [focusMissing, setFocusMissing] = useState(false)

  // Engine lifetime: one WebGL context per mount.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let lastTick = 0
    const engine = new GlobeEngine(container, TEXTURE_URL, (simMs) => {
      const now = performance.now()
      if (now - lastTick < TICK_MS) return
      lastTick = now
      setTime({ simMs, nowMs: Date.now() })
    })
    engineRef.current = engine
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

  // Load the snapshot for the displayed time. The previous one stays on screen
  // until the new one arrives.
  useEffect(() => {
    if (!datasetKey) return
    let live = true
    loadObjects(datasetKey)
      .then((file) => {
        if (!live || !engineRef.current) return
        engineRef.current.setCatalog(file.objects)
        setLoaded({ key: datasetKey, file })
        setLoadError(null)
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
    () => (loaded ? colorize(loaded.file.objects, colorMode) : null),
    [loaded, colorMode],
  )
  useEffect(() => {
    if (coloring) engineRef.current?.setColors(coloring.rgb)
  }, [coloring])

  const applyClock = useCallback((next: Clock, immediate: boolean) => {
    engineRef.current?.setClock(next, immediate)
    setClockState(next)
  }, [])

  // Enter focus once the near-miss's own snapshot is loaded; leave it when the
  // page clears `focus`.
  const focusedRef = useRef<FocusRequest | null>(null)
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    if (focus && loaded?.key === focus.datasetKey && focusedRef.current !== focus) {
      focusedRef.current = focus
      const tcaMs = Date.parse(focus.tcaUtc)
      const ok = engine.focusPair(focus.aId, focus.bId, tcaMs)
      setFocusMissing(!ok)
      setClockState({ kind: 'frozen', atMs: tcaMs })
    } else if (!focus && focusedRef.current) {
      focusedRef.current = null
      setFocusMissing(false)
      engine.resetView()
    }
  }, [focus, loaded])

  const goLive = () => {
    if (focus) onExitFocus()
    applyClock({ kind: 'live' }, true)
  }

  const onSlide = (value: number) => {
    if (focus) onExitFocus()
    applyClock({ kind: 'offset', offsetMs: value - Date.now() }, false)
  }

  const bounds = current
    ? sliderBounds(time.nowMs || currentStartMs, currentStartMs, historyDates)
    : null
  const isLive = clock.kind === 'live'
  const loadingKey = datasetKey && loaded?.key !== datasetKey && loadError !== datasetKey
  const snapshotLabel = (key: DatasetKey) => (key === 'current' ? 'latest run' : `${key} snapshot`)

  return (
    <div className="globe">
      <div
        className="globe-stage"
        role="img"
        aria-label="Interactive 3D globe of every tracked object in the latest screening run"
      >
        <div ref={containerRef} className="globe-canvas" />

        {coloring && (
          <div className="globe-panel globe-legend">
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
              {coloring.categories.map((c) => (
                <li key={c.key}>
                  <span className="globe-swatch" style={{ background: c.color }} />
                  <span className="globe-legend-label">{c.label}</span>
                  <span className="globe-legend-count">{fmt(c.count)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {focus && (
          <div className="globe-panel globe-focus" aria-live="polite">
            <p className="globe-focus-title">Closest approach</p>
            <p>
              {focus.aName}
              <br />
              {focus.bName}
            </p>
            <p className="globe-muted">
              {focus.missKm.toLocaleString('en-US', { maximumFractionDigits: 3 })} km apart at{' '}
              {formatUtc(Date.parse(focus.tcaUtc))} UTC
            </p>
            {focusMissing && (
              <p className="globe-muted">One of these objects isn&apos;t in this snapshot.</p>
            )}
            <button type="button" className="globe-button" onClick={goLive}>
              ← Back to full view
            </button>
          </div>
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

        <p className="globe-hint">Drag to rotate · scroll to zoom · right-drag to pan</p>
      </div>

      <div className="globe-timebar">
        <button
          type="button"
          className={`globe-live${isLive ? ' is-live' : ''}`}
          aria-pressed={isLive}
          onClick={goLive}
        >
          <span className="globe-live-dot" aria-hidden="true" />
          Live
        </button>
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
            {isLive
              ? ' · real time'
              : time.simMs
                ? ` · ${formatOffset(time.simMs - time.nowMs)}${clock.kind === 'frozen' ? ' · paused' : ''}`
                : ''}
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
        Earth imagery: NASA Visible Earth (Blue Marble).
      </p>
    </div>
  )
}
