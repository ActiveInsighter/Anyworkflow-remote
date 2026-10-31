import type { EventPreview, WorkflowInspection } from '../../../lib/workflow-dsl/index.ts'
import { readSourceStructure } from './source-structure.ts'

/** What the 预览 tab shows: the Events the plan creates, with the cursor's Event singled out. */
export interface ActPreviewModel {
  events: readonly EventPreview[]
  eventCount: number
  actCount: number
  errors: number
  /** Source line of the `@event` header around the cursor; a loop can create several Events there. */
  focusLine: number | null
  /** The Events created from `focusLine`, in creation order. */
  focused: readonly EventPreview[]
}

/** 1-based line of the innermost `@event` block containing `at`, or null outside every Event. */
export function eventLineAt(source: string, at: number): number | null {
  const blocks = readSourceStructure(source).blocks
  let headerFrom = -1
  for (const block of blocks) {
    if (block.kind !== 'event' || block.openAt >= at) continue
    if (block.closeAt >= 0 && at > block.closeAt) continue
    headerFrom = Math.max(headerFrom, block.headerFrom)
  }
  if (headerFrom < 0) return null
  let line = 1
  for (let index = source.indexOf('\n'); index >= 0 && index < headerFrom; index = source.indexOf('\n', index + 1)) line += 1
  return line
}

export function readActPreview(inspection: WorkflowInspection, source: string, at: number): ActPreviewModel {
  const focusLine = eventLineAt(source, at)
  return {
    events: inspection.events,
    eventCount: inspection.events.length,
    actCount: inspection.events.reduce((sum, event) => sum + event.actCount, 0),
    errors: inspection.diagnostics.filter((item) => item.severity === 'error').length,
    focusLine,
    focused: focusLine === null ? [] : inspection.events.filter((event) => event.line === focusLine),
  }
}

/** Acts per `@event` header line, for the outline's per-Event counts. */
export function actCountsByLine(inspection: WorkflowInspection): Map<number, { events: number; acts: number }> {
  const counts = new Map<number, { events: number; acts: number }>()
  for (const event of inspection.events) {
    const entry = counts.get(event.line) ?? { events: 0, acts: 0 }
    entry.events += 1
    entry.acts += event.actCount
    counts.set(event.line, entry)
  }
  return counts
}
