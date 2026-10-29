import { useEffect, useSyncExternalStore } from 'react'
import { getStartLinksSnapshot, loadStartLinks, saveStartLinks, subscribeStartLinks } from '../lib/start-links-store'

/** The signed-in account's start links, loaded on first use and shared by every consumer. */
export function useStartLinks() {
  const snapshot = useSyncExternalStore(subscribeStartLinks, getStartLinksSnapshot, getStartLinksSnapshot)
  // `idle` means this account has not been fetched yet, including right after an account switch.
  useEffect(() => {
    if (snapshot.status === 'idle') void loadStartLinks()
  }, [snapshot])
  return { ...snapshot, save: saveStartLinks, reload: () => loadStartLinks(true) }
}
