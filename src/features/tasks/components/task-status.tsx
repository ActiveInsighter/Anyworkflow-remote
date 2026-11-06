import type { TaskRecord } from '@shared/task-kit/index.mjs'
import { SegmentRail } from '@/components/data-display/segment-rail'
import { StatusBadge } from '@/components/data-display/status-badge'
import { taskPhase, taskStatusMeta, type TaskKind, type TaskView } from '@/lib/tasks'
import { cn } from '@/lib/utils'

/** Cells of a rail showing a measured percentage, which has no units of its own. */
const PERCENT_CELLS = 20

/** The status tag for any async task record, labelled by its kind's phase names. */
export function TaskStatusBadge({ kind, record, className }: { kind: TaskKind; record: TaskRecord; className?: string }) {
  const meta = taskStatusMeta(kind, record)
  return (
    <StatusBadge tone={meta.tone} className={className}>
      {meta.label}
    </StatusBadge>
  )
}

/**
 * Progress for any async task while it runs, in the truest terms available: the measured fraction
 * when the kind reports one, the phase it has reached otherwise, a sweep when neither is known.
 * Waiting and settled tasks show none; their status says enough.
 */
export function TaskProgress({ view, className }: { view: TaskView; className?: string }) {
  if (view.state !== 'running') return null
  const tone = view.stopping ? 'warning' : 'info'
  if (view.progress !== null) {
    const done = (view.progress / 100) * PERCENT_CELLS
    return <SegmentRail total={PERCENT_CELLS} done={done} live tone={tone} label={`进度 ${view.progress}%`} className={className} />
  }
  const phase = taskPhase(view)
  if (phase) {
    return <SegmentRail total={phase.total} done={phase.done} live tone={tone} label={`第 ${phase.done + 1} 阶段，共 ${phase.total} 阶段`} className={className} />
  }
  return (
    <div role="progressbar" aria-label="进行中" className={cn('relative h-1.5 w-full overflow-hidden rounded-[2px] bg-border', className)}>
      <div className={cn('absolute inset-y-0 left-0 w-2/5 rounded-[2px] animate-indeterminate', view.stopping ? 'bg-warning' : 'bg-info')} />
    </div>
  )
}
