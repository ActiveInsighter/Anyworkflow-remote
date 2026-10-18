import type { DispatchEventRecord, DispatchExecutorKind, DispatchRunOrigin, DispatchRunRecord, DispatchTaskRecord } from '../../types'
import { normalizeRecurrence } from '../domain/recurrence'
import { normalizeRuntimeConfig } from '../domain/runtime-config'

/**
 * `scheduledAt` was added to the deployment after some Runs already existed, and PocketBase's
 * date field reads back as an empty string. Normalising on the way in keeps every downstream
 * truthiness check off the `undefined` case.
 */
export function normalizeRun<T extends DispatchRunRecord>(run: T): T {
  const origin: DispatchRunOrigin = ['initial', 'rerun', 'resume', 'edited_rerun'].includes(run.origin)
    ? run.origin
    : 'initial'
  return {
    ...run,
    recurrence: run.recurrence == null ? null : normalizeRecurrence(run.recurrence),
    runtimeConfig: run.runtimeConfig == null ? null : normalizeRuntimeConfig(run.runtimeConfig),
    familyId: typeof run.familyId === 'string' && run.familyId ? run.familyId : run.id,
    versionNumber: Number.isSafeInteger(run.versionNumber) && run.versionNumber > 0 ? run.versionNumber : 1,
    versionMajor: Number.isSafeInteger(run.versionMajor) && run.versionMajor > 0 ? run.versionMajor : 1,
    versionMinor: Number.isSafeInteger(run.versionMinor) && run.versionMinor >= 0 ? run.versionMinor : 0,
    parentRun: typeof run.parentRun === 'string' ? run.parentRun : '',
    origin,
    scheduledAt: typeof run.scheduledAt === 'string' ? run.scheduledAt : '',
  }
}

export function normalizeTask<T extends DispatchTaskRecord>(task: T): T {
  const executorKind: DispatchExecutorKind = task.executorKind === 'codex' ? 'codex' : 'browser'
  return {
    ...task,
    executorKind,
    runPlanChecksum: typeof task.runPlanChecksum === 'string' ? task.runPlanChecksum : '',
    inheritedFrom: typeof task.inheritedFrom === 'string' ? task.inheritedFrom : '',
  }
}

export function normalizeEvent<T extends DispatchEventRecord>(event: T): T {
  return {
    ...event,
    queueChecksum: typeof event.queueChecksum === 'string' && event.queueChecksum ? event.queueChecksum : null,
    inheritedFrom: typeof event.inheritedFrom === 'string' ? event.inheritedFrom : '',
    resumeSpec: event.resumeSpec && typeof event.resumeSpec === 'object' ? event.resumeSpec : null,
  }
}
