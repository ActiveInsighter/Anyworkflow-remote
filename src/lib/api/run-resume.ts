/** Checkpoint resume: only a failed Run whose every unfinished Event has a safe checkpoint may resume. */
import type { DispatchCheckpointRecord, DispatchEventRecord, DispatchRunRecord } from '../../types'
import { isSafeConversationUrl } from '../domain/conversation-url'
import { ApiError, collectPages, listOwnedCollection, quoteFilter } from './client'
import { CHECKPOINT_COLLECTION, DEFAULT_PAGE_SIZE } from './config'
import { requireSession } from './session'
import { createRun } from './runs'
import { listEventsForTask, listTasksForRun } from './tasks'

function checkpointIsSafe(
  checkpoint: DispatchCheckpointRecord,
  event: DispatchEventRecord,
  planChecksum: string,
): boolean {
  if (
    checkpoint.eventAttempt !== event.attempt ||
    checkpoint.planChecksum !== planChecksum ||
    !event.queueChecksum || checkpoint.queueChecksum !== event.queueChecksum ||
    !Number.isSafeInteger(checkpoint.nextNodeIndex) || checkpoint.nextNodeIndex < 0 ||
    !Number.isSafeInteger(checkpoint.totalNodes) || checkpoint.totalNodes < checkpoint.nextNodeIndex
  ) return false
  if (checkpoint.phase === 'unsafe') return false
  if (checkpoint.phase === 'continue') {
    return Object.keys(checkpoint.providerState || {}).length === 0 && (
      checkpoint.nextNodeIndex >= checkpoint.totalNodes ||
      (Boolean(event.localRunId) && event.localAttempt > 0 &&
        (checkpoint.nextNodeIndex === 0 || isSafeConversationUrl(checkpoint.conversationUrl)))
    )
  }
  const state = checkpoint.providerState
  const sentUserMessageId = state?.sentUserMessageId ??
    (state?.snapshot && typeof state.snapshot === 'object'
      ? (state.snapshot as Record<string, unknown>).sentUserMessageId
      : undefined)
  return Boolean(event.localRunId) && event.localAttempt > 0 &&
    isSafeConversationUrl(checkpoint.conversationUrl) &&
    typeof sentUserMessageId === 'string' && sentUserMessageId.trim().length > 0
}

async function assertRunCanResume(run: DispatchRunRecord): Promise<void> {
  const session = requireSession()
  if (run.owner !== session.record.id) throw new ApiError('当前 Run 不属于登录账号', 403, 'INVALID_RECORD_OWNER')
  if (run.status !== 'failed') throw new ApiError('只有失败的 Run 可以从检查点恢复', 409, 'RUN_NOT_RESUMABLE')
  if (!run.planText.trim() || !/^[a-f0-9]{64}$/u.test(run.planChecksum)) {
    throw new ApiError('Run 缺少有效的不可变计划校验和', 409, 'RUN_RESUME_PLAN_INVALID')
  }

  const firstTasks = await listTasksForRun(run.id, 1, DEFAULT_PAGE_SIZE)
  const tasks = await collectPages(firstTasks, (page) => listTasksForRun(run.id, page, firstTasks.perPage))
  if (!tasks.length) throw new ApiError('Run 没有可恢复的 Task', 409, 'RUN_RESUME_TASKS_MISSING')
  for (const task of tasks) {
    const firstEvents = await listEventsForTask(task.id, 1, DEFAULT_PAGE_SIZE)
    const events = await collectPages(firstEvents, (page) => listEventsForTask(task.id, page, firstEvents.perPage))
    if (!events.length) throw new ApiError(`Task「${task.title}」没有可恢复的 Event`, 409, 'RUN_RESUME_EVENTS_MISSING')
    for (const event of events) {
      if (event.status === 'terminal' && event.terminalResult === 'succeeded') continue
      if (
        event.attempt === 0 &&
        (event.status === 'waiting' || event.status === 'ready' ||
          (event.status === 'terminal' && event.terminalResult === 'canceled'))
      ) continue
      const firstCheckpoints = await listOwnedCollection<DispatchCheckpointRecord>(CHECKPOINT_COLLECTION, {
        page: 1,
        perPage: DEFAULT_PAGE_SIZE,
        sort: '-checkpointSeq',
        filter: `event="${quoteFilter(event.id)}" && eventAttempt=${event.attempt}`,
      }, (record) => record)
      // The newest checkpoint is sufficient. Avoid downloading every prior
      // provider snapshot for an Event that may have many node transitions.
      const latest = firstCheckpoints.items[0]
      if (!latest || !checkpointIsSafe(latest, event, run.planChecksum)) {
        throw new ApiError(
          `Event ${event.eventIndex + 1} 没有与当前计划匹配的安全检查点，已阻止恢复以避免重复发送。`,
          409,
          'RUN_RESUME_CHECKPOINT_UNSAFE',
        )
      }
    }
  }
}

export async function resumeFailedRun(source: DispatchRunRecord): Promise<DispatchRunRecord> {
  await assertRunCanResume(source)
  return createRun(source.planText, 'queued', '', { parentRun: source.id, origin: 'resume' })
}
