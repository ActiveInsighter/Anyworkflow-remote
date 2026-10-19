import { useEffect, useRef } from 'react'

/** Scrolls the returned ref's element into view once `active` turns true (deep links). */
export function useRevealOnMount<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (!active) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ref.current?.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' })
  }, [active])
  return ref
}
