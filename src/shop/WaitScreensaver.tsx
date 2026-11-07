import { useEffect, useRef } from 'react'
import { DEFAULT_COLORS, startScreensaver, type Pattern } from './screensaver.ts'

/**
 * The canvas for the wait panel. It fills its box (the box reserves its size in CSS, so nothing shifts when the first frame draws). One
 * pattern per mount, chosen at random unless `pattern` is given (tests). Decorative: hidden from readers.
 */
export default function WaitScreensaver({ pattern }: { pattern?: Pattern }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = canvas.current
    const host = el?.parentElement
    if (!el || !host) return
    const css = getComputedStyle(host)
    const pick = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
    const saver = startScreensaver({
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
      colors: { navy: pick('--color-navy', DEFAULT_COLORS.navy), coral: pick('--color-accent', DEFAULT_COLORS.coral) },
      pattern,
    })
    return saver.stop
  }, [pattern])
  return <canvas ref={canvas} className="wait-canvas" aria-hidden="true" />
}
