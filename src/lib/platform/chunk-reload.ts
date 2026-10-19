/**
 * Recovery from stale code-split chunks.
 *
 * Every deploy replaces the hashed files under /assets, and the Worker answers a missing asset
 * with the SPA's index.html. A tab opened before the deploy therefore fails the first time it
 * lazily loads a page ("Failed to fetch dynamically imported module"). Reloading the document
 * picks up the new build; the timestamp guard stops a genuinely broken chunk from looping.
 */

const RELOAD_KEY = 'anyworkflow.chunk-reload.v1'
const RELOAD_GUARD_MS = 30_000

const CHUNK_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|is not a valid JavaScript MIME type/iu

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  return CHUNK_ERROR_PATTERN.test(message)
}

/** Reloads the page for a new build unless one was just attempted. Returns whether it reloads. */
export function reloadForNewBuild(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0)
    if (Date.now() - last < RELOAD_GUARD_MS) return false
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    // Without storage there is no loop guard; one reload is still better than a dead page.
  }
  window.location.reload()
  return true
}

/** Vite reports failed dependency preloads through this event before the import rejects. */
export function installChunkReload() {
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadForNewBuild()) event.preventDefault()
  })
}
