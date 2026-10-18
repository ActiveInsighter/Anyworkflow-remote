/**
 * Dispatch API — Runs, Tasks, Events, history and auth against PocketBase.
 *
 * Collections and command semantics stay compatible with Anyworkflow-wechat: Run control uses
 * `requestedAction` + `commandVersion + 1`, and every record is checked against the session owner.
 * Library, schedules, runtime defaults and file conversion live in their own modules here.
 */
export { ApiError, assertOwner, collectPages, quoteFilter, request } from './client'
export { toErrorMessage } from './errors'
export { login } from './auth'
export {
  cloneRun,
  commandRun,
  createEditedRun,
  createRun,
  deleteRun,
  getRun,
  listRuns,
  listRunVersions,
  updateRunDraft,
  type RunListFilter,
} from './runs'
export { resumeFailedRun } from './run-resume'
export { getEvent, getTask, listEventsForTask, listTasksForRun } from './tasks'
export {
  getHistoryMessage,
  getHistoryMessageForAct,
  getHistoryMessageForDispatchEvent,
  listAllHistoryActsForEvent,
  listAllHistoryEventsForLocalRun,
  listAllHistoryMessagesForAct,
  listHistoryActsForDispatchEvent,
  listHistoryActsForEvent,
  listHistoryEventsForLocalRun,
  listHistoryMessageSummariesForAct,
  listHistoryMessagesForAct,
} from './history'
