/** Public surface of the tasks feature: the task center and the shared task status UI. */
export { TaskCenter } from './components/task-center'
export { TaskProgress, TaskStatusBadge } from './components/task-status'
export { TaskCenterProvider, useTaskCenter } from './hooks/use-task-center'
export { TASK_SOURCES, type TaskItem, type TaskSource } from './lib/sources'
