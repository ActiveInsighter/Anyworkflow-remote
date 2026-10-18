import { useSyncExternalStore } from 'react'

/** Matches Tailwind's `md` breakpoint so JS and CSS switch layouts at the same width. */
export const MOBILE_QUERY = '(max-width: 767.98px)'

function subscribe(listener: () => void): () => void {
  const media = window.matchMedia(MOBILE_QUERY)
  media.addEventListener('change', listener)
  return () => media.removeEventListener('change', listener)
}

function getSnapshot(): boolean {
  return window.matchMedia(MOBILE_QUERY).matches
}

/** Read synchronously on first render, so mobile never flashes the desktop layout. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
