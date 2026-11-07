import { useEffect, useRef, type MutableRefObject } from 'react'

/** Whether the visitor has scrolled since `key` last changed (the search's start time; null: no search running). */
export function useScrolledSince(key: number | null): MutableRefObject<boolean> {
  const scrolled = useRef(false)
  useEffect(() => {
    scrolled.current = false
    if (key === null) return
    const onScroll = () => {
      scrolled.current = true
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [key])
  return scrolled
}

export const prefersReducedMotion = (): boolean => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
