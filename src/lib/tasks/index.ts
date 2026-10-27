/**
 * The async task model the console shares with the backend: conversions, Run exports and Runs
 * are kinds of one lifecycle (vendored from AnyWorkflow-workers into shared/task-kit). Features
 * read state, progress and "stopping" through `kind.describe(record)` and label it here, instead
 * of comparing raw status strings.
 */
export {
  TASK_KINDS,
  fileConversionKind,
  hasResultState,
  isActiveState,
  isTerminalState,
  runExportKind,
  runKind,
} from '@shared/task-kit/index.mjs'
export type { TaskKind, TaskState, TaskView } from '@shared/task-kit/index.mjs'
export { taskStatusMeta, taskStateMeta } from './status'
export { notifyTasksChanged, onTasksChanged } from './events'
