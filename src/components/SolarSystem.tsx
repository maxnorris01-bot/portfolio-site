import { useEffect, useRef, type KeyboardEvent } from 'react'
import { BODIES, CX, CY, ORBITS, TILT, advance, positionAt, shouldMove, type PlanetId } from './solarmodel.ts'
import './SolarSystem.css'

export type { PlanetId }

/**
 * A small solar system: a sun, tilted orbits and planets that circle slowly. Two planets can be chosen (they are
 * buttons, with a label that follows them); the rest are decoration. The planets stand still while the pointer is
 * over the picture or a planet has keyboard focus, while the tab is hidden, and always under reduced motion.
 */
export default function SolarSystem({ selected, onSelect }: { selected: PlanetId; onSelect: (id: PlanetId) => void }) {
  const refs = useRef(new Map<string, SVGGElement>())

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    const flags = { hover: false, focus: false }
    let elapsed = 0 // seconds of motion so far; it only grows while the planets move
    let last = 0
    let raf = 0

    const draw = () => {
      for (const b of BODIES) {
        const el = refs.current.get(b.key)
        if (!el) continue
        const { x, y } = positionAt(b, elapsed, reduce.matches)
        el.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`)
      }
    }
    const frame = (now: number) => {
      if (last) elapsed = advance(elapsed, now - last)
      last = now
      draw()
      raf = requestAnimationFrame(frame)
    }
    const sync = () => {
      const run = shouldMove({ reducedMotion: reduce.matches, hover: flags.hover, focus: flags.focus, hidden: document.hidden })
      if (run && !raf) {
        last = 0
        raf = requestAnimationFrame(frame)
      } else if (!run && raf) {
        cancelAnimationFrame(raf)
        raf = 0
      }
    }

    draw()
    sync()
    const root = refs.current.get('background')?.ownerSVGElement
    const enter = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return // a touch has no "hover": it would freeze the picture
      flags.hover = true
      sync()
    }
    const leave = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      flags.hover = false
      sync()
    }
    // Only keyboard focus holds the planets still: a mouse click focuses a planet too, but the pointer leaving should let them go on.
    const focusIn = (e: FocusEvent) => {
      flags.focus = e.target instanceof Element && e.target.matches(':focus-visible')
      sync()
    }
    const focusOut = () => {
      flags.focus = false
      sync()
    }
    root?.addEventListener('pointerenter', enter)
    root?.addEventListener('pointerleave', leave)
    root?.addEventListener('focusin', focusIn)
    root?.addEventListener('focusout', focusOut)
    const motionChanged = () => {
      draw()
      sync()
    }
    reduce.addEventListener('change', motionChanged)
    document.addEventListener('visibilitychange', sync)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      root?.removeEventListener('pointerenter', enter)
      root?.removeEventListener('pointerleave', leave)
      root?.removeEventListener('focusin', focusIn)
      root?.removeEventListener('focusout', focusOut)
      reduce.removeEventListener('change', motionChanged)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [])

  const onKey = (e: KeyboardEvent, id: PlanetId) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(id)
    }
  }

  return (
    <svg className="solar" viewBox="20 60 360 260" role="group" aria-label="Choose a planet to read about">
      <g aria-hidden="true">
        {ORBITS.map(({ rx, ry }, i) => (
          <ellipse key={i} className="solar-orbit" cx={CX} cy={CY} rx={rx} ry={ry} transform={`rotate(${TILT} ${CX} ${CY})`} />
        ))}
        <circle className="solar-sun" cx={CX} cy={CY} r={26} />
      </g>
      {BODIES.map((b) =>
        b.select ? (
          <g
            key={b.key}
            ref={(el) => {
              if (el) refs.current.set(b.key, el)
              else refs.current.delete(b.key)
            }}
            className={`solar-planet${selected === b.select.id ? ' is-selected' : ''}`}
            role="button"
            tabIndex={0}
            aria-pressed={selected === b.select.id}
            aria-label={b.select.label}
            onClick={() => onSelect(b.select!.id)}
            onKeyDown={(e) => onKey(e, b.select!.id)}
          >
            <circle className="solar-hit" r={28} />
            <circle className="solar-glow" r={19} />
            <circle className="solar-ring" r={13} />
            <circle className="solar-focus" r={23} />
            <circle className="solar-body" r={selected === b.select.id ? 10 : 7.5} />
            <text className="solar-label" x={b.select.labelDx} y={b.select.labelDy}>
              {b.select.label}
            </text>
          </g>
        ) : (
          <g
            key={b.key}
            ref={(el) => {
              if (el) refs.current.set(b.key, el)
              else refs.current.delete(b.key)
            }}
            aria-hidden="true"
          >
            <circle className="solar-deco" r={4.5} />
          </g>
        ),
      )}
    </svg>
  )
}
