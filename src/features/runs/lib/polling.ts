import { POLL_MS } from './constants'

/** How long a finished record keeps its fast refresh before it settles into the slow one. */
const SETTLED_AFTER_MS = 5 * 60_000

function recordTime(value: string): number {
  return Date.parse(value.trim().replace(/^(\d{4}-\d{2}-\d{2}) /u, '$1T'))
}

/**
 * Refresh cadence for an expanded node. Nothing stops polling outright, because history is
 * written by the extension after dispatch reports completion; a record that finished a while ago
 * simply checks less often.
 */
export function executionPollMs(record: { terminal: boolean; updated: string }): number {
  if (!record.terminal) return POLL_MS.hierarchy
  const updatedAt = recordTime(record.updated)
  return Number.isFinite(updatedAt) && Date.now() - updatedAt > SETTLED_AFTER_MS ? POLL_MS.settled : POLL_MS.hierarchy
}
