import { deriveEventProgress } from '@/lib/domain/event-structure'
import { eventProgressLabel } from '@/lib/format'
import { removeLeadingEventHeaders } from '@/lib/workflow-dsl/cloud-parser'
import type { DispatchEventRecord, DispatchEventStatus } from '@/types'

/** Event name from the queue's leading `@event=` line; later `@event=` lines belong to Acts. */
export function eventTitle(event: Pick<DispatchEventRecord, 'queueTextOverride' | 'eventIndex'>): string {
  return removeLeadingEventHeaders(event.queueTextOverride).eventTitle || `Event ${event.eventIndex + 1}`
}

/**
 * Progress for the Event row. It reads only the dispatch record (queue plan and the executor's
 * progress), so the line is the same whether the Event is collapsed or open. The plan supplies
 * totals only; Act and message rows are always persisted history.
 */
export function eventProgressSummary(
  event: Pick<DispatchEventRecord, 'queueTextOverride' | 'progress' | 'terminalResult' | 'status'>,
): string {
  const { completedActs, totalActs } = deriveEventProgress(event.queueTextOverride, event.progress, event.terminalResult)
  return totalActs ? `${completedActs} / ${totalActs} Acts` : eventProgressLabel(event.status, event.progress)
}

const PENDING_NOTE: Record<DispatchEventStatus, string> = {
  waiting: '等待云端编排',
  ready: '等待执行器领取',
  leased: '执行器已分配，等待启动',
  running: '执行中，Act 记录同步后显示',
  paused: '已暂停，恢复后继续记录',
  terminal: '暂无 Act 记录，同步后自动显示',
}

/** Shown in place of Acts while none have been persisted for this Event. */
export function eventPendingNote(status: DispatchEventStatus): string {
  return PENDING_NOTE[status] ?? PENDING_NOTE.terminal
}
