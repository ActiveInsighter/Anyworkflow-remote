/**
 * A same-tab signal that some async task was created or commanded. The task center reloads on
 * it at once instead of waiting for its next poll; features never need to know who listens.
 */
const EVENT = 'anyworkflow:tasks-changed'

export function notifyTasksChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT))
}

export function onTasksChanged(listener: () => void): () => void {
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener)
}
