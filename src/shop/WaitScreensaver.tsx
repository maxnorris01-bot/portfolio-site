import { useEffect, useRef } from 'react'
import { DEFAULT_COLORS, startScreensaver, type Screensaver } from './screensaver.ts'

/**
 * The canvas for the wait panel. It fills its box (the box reserves its size in CSS, so nothing shifts when the first frame draws). The
 * oscilloscope waves; `progress` (0..1) swells them as steps finish. Decorative: hidden from readers.
 */
export default function WaitScreensaver({ progress }: { progress?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const saver = useRef<Screensaver | null>(null)
  const latest = useRef(progress)
  useEffect(() => {
    const el = canvas.current
    const host = el?.parentElement
    if (!el || !host) return
    const css = getComputedStyle(host)
    const pick = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
    const started = startScreensaver({
      canvas: el,
      size: () => ({ w: host.clientWidth, h: host.clientHeight }),
      dpr: () => window.devicePixelRatio || 1,
      raf: (cb) => requestAnimationFrame(cb),
      caf: (id) => cancelAnimationFrame(id),
      observe: (cb) => {
        const ro = new ResizeObserver(cb)
        ro.observe(host)
        return () => ro.disconnect()
      },
      doc: document,
      reducedMotion: () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
      random: Math.random,
      colors: {
        bg: pick('--color-bg', DEFAULT_COLORS.bg),
        navy: pick('--color-navy', DEFAULT_COLORS.navy),
        coral: pick('--color-accent', DEFAULT_COLORS.coral),
        slate: pick('--color-risk-low', DEFAULT_COLORS.slate),
        centre: DEFAULT_COLORS.centre,
      },
      progress: latest.current,
    })
    saver.current = started
    return () => {
      saver.current = null
      started.stop()
    }
  }, [])
  useEffect(() => {
    latest.current = progress
    saver.current?.setProgress(progress)
  }, [progress])
  return <canvas ref={canvas} className="wait-canvas" aria-hidden="true" />
}
