import { GitBranch } from 'lucide-react'
import { Link } from 'react-router'
import { SegmentRail } from '@/components/data-display/segment-rail'
import { StatusBadge } from '@/components/data-display/status-badge'
import { useNow } from '@/hooks/use-now'
import { formatDateTime, formatRelativeTime, progressText } from '@/lib/format'
import { isActiveStatus, runStatusMeta, runTitle, runVersionLabel } from '@/lib/domain/run-status'
import type { DispatchRunRecord } from '@/types'
import { RunStatusIcon } from '../run-status-icon'
import { RUN_LIST_COLUMNS } from './run-list-columns'
import type { ReactNode } from 'react'

/**
 * One Run in the list. Large screens align status, tasks and update time into columns; narrower
 * screens reflow the same record into a readable two-line row with its actions still visible.
 */
export function RunListItem({ run, actions }: { run: DispatchRunRecord; actions: ReactNode }) {
  const status = runStatusMeta(run.status, run.requestedAction)
  const title = runTitle(run)
  const now = useNow()
  const updated = formatRelativeTime(run.updated, now)

  return (
    <article
      className={`group/run relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-xl px-3 py-3 transition-colors duration-fast hover:bg-subtle lg:gap-x-4 ${RUN_LIST_COLUMNS}`}
    >
      <div className="flex min-w-0 items-start gap-3 lg:items-center">
        <RunStatusIcon status={run.status} tone={status.tone} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <Link
            to={`/runs/${run.id}`}
            title={title}
            className="block text-body font-medium break-words outline-none hover:underline focus-visible:underline lg:truncate"
          >
            {title}
          </Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
            <span className="inline-flex items-center gap-1 tabular-nums">
              <GitBranch className="size-3" aria-hidden="true" />
              {runVersionLabel(run)}
            </span>
            <time className="lg:hidden" dateTime={run.updated} title={formatDateTime(run.updated)}>
              {updated}
            </time>
          </div>
          {isActiveStatus(run.status) ? (
            <SegmentRail
              className="mt-2 max-w-64"
              total={run.totalTasks}
              done={run.completedTasks}
              live={run.status === 'running'}
              tone={status.tone}
              label={`已完成 ${run.completedTasks} / ${run.totalTasks} 个任务`}
            />
          ) : null}
        </div>
      </div>
      <div className="col-span-2 flex min-w-0 items-center justify-between gap-3 ps-7 lg:contents">
        <div>
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        </div>
        <span className="shrink-0 text-caption text-muted-foreground tabular-nums" title="已完成任务 / 总任务">
          {progressText(run.completedTasks, run.totalTasks, 'Tasks')}
        </span>
      </div>
      <time className="hidden text-caption text-muted-foreground tabular-nums lg:block" dateTime={run.updated} title={formatDateTime(run.updated)}>
        {updated}
      </time>
      <div className="col-start-2 row-start-1 lg:col-auto lg:row-auto">{actions}</div>
    </article>
  )
}
