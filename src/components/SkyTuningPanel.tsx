// The ?debug=1 sky tuning panel: sliders for the glow, the Earth-in-view
// dimming and the stars, applied live to the engine's own settings (the same
// ones the console hooks are), with presets and a JSON copy. Lazy-loaded, and
// only ever rendered in debug mode.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  SKY_TUNING_SLIDERS,
  TuningController,
  type SkyTuningKey,
  type SkyTuningValues,
  type SliderSpec,
  type TuningTarget,
} from '../globe/skytuning'

const GROUPS: SliderSpec['group'][] = ['View', 'Glow', 'Earth in view', 'Stars']

export default function SkyTuningPanel({ target }: { target: TuningTarget }) {
  const controller = useMemo(() => new TuningController(target), [target])
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<SkyTuningValues>(() => controller.values())
  const [status, setStatus] = useState('')
  const [fallback, setFallback] = useState<string | null>(null)
  const fallbackRef = useRef<HTMLTextAreaElement>(null)

  // The console hooks change the same settings: keep the sliders in step with them.
  useEffect(() => {
    if (!open) return
    const read = () => setValues(controller.values())
    read()
    const t = setInterval(read, 400)
    return () => clearInterval(t)
  }, [open, controller])
  useEffect(() => () => controller.dispose(), [controller])
  useEffect(() => {
    if (fallback !== null) fallbackRef.current?.select()
  }, [fallback])

  const set = (key: SkyTuningKey, v: number) => {
    controller.set(key, v)
    setValues(controller.values())
    setStatus('')
  }
  const copy = async () => {
    const json = controller.json()
    try {
      await navigator.clipboard.writeText(json)
      setFallback(null)
      setStatus('Copied to the clipboard')
    } catch {
      setFallback(json)
      setStatus('Copy failed: select the text below')
    }
  }

  return (
    <div className="globe-tune" onKeyDown={(e) => {
      // Arrow keys here move a slider, not the camera; Escape closes.
      e.stopPropagation()
      if (e.key === 'Escape') setOpen(false)
    }}>
      <button type="button" className="globe-tune-tab" aria-expanded={open} aria-controls="globe-tune-panel" onClick={() => setOpen((o) => !o)}>
        Sky tuning
      </button>
      {open && (
        <div id="globe-tune-panel" className="globe-tune-panel" role="region" aria-label="Sky tuning">
          {GROUPS.map((g) => (
            <fieldset key={g} className="globe-tune-group">
              <legend>{g}</legend>
              {SKY_TUNING_SLIDERS.filter((s) => s.group === g).map((s) => {
                const id = `tune-${s.key}`
                const v = values[s.key]
                return (
                  <div className="globe-tune-row" key={s.key}>
                    <label htmlFor={id} title={s.hint}>
                      {s.label}
                    </label>
                    <input
                      id={id}
                      type="range"
                      min={s.min}
                      max={s.max}
                      step={s.step}
                      value={v}
                      onChange={(e) => set(s.key, Number(e.target.value))}
                      aria-describedby={`${id}-out`}
                    />
                    <output id={`${id}-out`} htmlFor={id}>
                      {v.toFixed(s.digits)}
                      {s.unit ?? ''}
                    </output>
                  </div>
                )
              })}
              {g === 'View' && <p className="globe-tune-note">Above about 100° the edges of a wide map distort (fish-eye). The cap holds the larger of the horizontal and vertical angles.</p>}
            </fieldset>
          ))}
          <div className="globe-tune-buttons">
            <button type="button" onClick={() => { controller.reset(); setValues(controller.values()); setStatus('Reset to the shipped defaults') }}>
              Reset to defaults
            </button>
            <button type="button" onClick={() => { controller.original(); setValues(controller.values()); setStatus('The original look: glow 1.0 / 0.7 / 1.5, no blur, no Earth dimming') }}>
              Original look
            </button>
            <button type="button" onClick={copy}>
              Copy settings
            </button>
          </div>
          {fallback !== null && <textarea ref={fallbackRef} className="globe-tune-json" readOnly rows={5} value={fallback} aria-label="Settings as JSON" onFocus={(e) => e.currentTarget.select()} />}
          <p className="globe-tune-status" role="status">
            {status}
          </p>
          <p className="globe-tune-note">Debug only. Values are remembered in this browser while ?debug=1 is on.</p>
        </div>
      )}
    </div>
  )
}
