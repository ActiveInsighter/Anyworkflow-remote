/**
 * The async task model the console shares with the backend: conversions, Run exports, Runs and
 * web crawls are kinds of one lifecycle (vendored from AnyWorkflow-workers into shared/task-kit). Features
 * read state, progress and "stopping" through `kind.describe(record)` and label it here, instead
 * of comparing raw status strings.
 */
export {
  TASK_KINDS,
  crawlJobKind,
  fileConversionKind,
  hasResultState,
  isActiveState,
  isTerminalState,
  runExportKind,
  runKind,
} from '@shared/task-kit/index.mjs'
export type { TaskKind, TaskState, TaskView } from '@shared/task-kit/index.mjs'
export { taskPhase, taskStatusMeta, taskStateMeta } from './status'
export { notifyTasksChanged, onTasksChanged } from './events'
