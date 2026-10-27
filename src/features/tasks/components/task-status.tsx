import type { TaskRecord } from '@shared/task-kit/index.mjs'
import { StatusBadge } from '@/components/data-display/status-badge'
import { Progress } from '@/components/ui/progress'
import { taskStatusMeta, type TaskKind, type TaskView } from '@/lib/tasks'
import { cn } from '@/lib/utils'

/** The status pill for any async task record, labelled by its kind's phase names. */
export function TaskStatusBadge({ kind, record, className }: { kind: TaskKind; record: TaskRecord; className?: string }) {
  const meta = taskStatusMeta(kind, record)
  return (
    <StatusBadge tone={meta.tone} className={className}>
      {meta.label}
    </StatusBadge>
  )
}

/**
 * Progress for any async task while it runs: the measured fraction when the kind reports one, a
 * sweeping bar when it does not. Waiting and settled tasks show none; their badge says enough.
 */
export function TaskProgress({ view, className }: { view: TaskView; className?: string }) {
  if (view.state !== 'running') return null
  const tone = view.stopping ? 'warning' : 'info'
  if (view.progress !== null) {
    return <Progress value={view.progress} tone={tone} aria-label={`进度 ${view.progress}%`} className={cn('h-1', className)} />
  }
  return (
    <div role="progressbar" aria-label="进行中" className={cn('relative h-1 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div className={cn('absolute inset-y-0 left-0 w-2/5 rounded-full animate-indeterminate', view.stopping ? 'bg-warning' : 'bg-info')} />
    </div>
  )
}
