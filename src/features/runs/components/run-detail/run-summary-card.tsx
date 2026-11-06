import type * as React from 'react'
import { CalendarClock, GitBranch } from 'lucide-react'
import { Link } from 'react-router'
import { DescriptionList } from '@/components/data-display/description-list'
import { SegmentRail } from '@/components/data-display/segment-rail'
import { StatusBadge } from '@/components/data-display/status-badge'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { runOriginLabel, runStatusMeta, runVersionLabel } from '@/lib/domain/run-status'
import { formatDateTime, modeLabel, progressPercent } from '@/lib/format'
import type { DispatchRunRecord } from '@/types'
import { RunRuntimeSummary } from './run-runtime-summary'

/** Status, progress and the facts that define this Run version; the footer holds config and versions. */
export function RunSummaryCard({
  run,
  totalTasks,
  scheduledLabel,
  versionPicker,
}: {
  run: DispatchRunRecord
  totalTasks: number
  /** Absolute run time, or empty when the Run starts immediately. */
  scheduledLabel: string
  versionPicker?: React.ReactNode
}) {
  const status = runStatusMeta(run.status, run.requestedAction)
  const percent = progressPercent(run.completedTasks, totalTasks)
  const completed = Math.min(Math.max(0, run.completedTasks), totalTasks)

  return (
    <Card aria-label="运行概况">
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
              <p className="text-body text-muted-foreground tabular-nums">
                <span className="font-semibold text-foreground">{completed}</span> / {totalTasks} Tasks
              </p>
            </div>
            <span className="text-body font-medium text-muted-foreground tabular-nums">{percent}%</span>
          </div>
          <SegmentRail
            className="h-2"
            total={totalTasks}
            done={completed}
            live={run.status === 'running'}
            tone={status.tone}
            label={`已完成 ${completed} / ${totalTasks} 个任务`}
          />
        </div>
        <DescriptionList
          className="border-t pt-4"
          items={[
            {
              label: '版本',
              value: (
                <span className="flex flex-wrap items-center gap-1 tabular-nums">
                  <GitBranch className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  {runVersionLabel(run)}
                  <span className="ms-1 font-normal text-muted-foreground">{runOriginLabel(run.origin)}</span>
                </span>
              ),
            },
            { label: '执行方式', value: modeLabel(run.executionMode, run.maxConcurrency, '任务') },
            { label: '执行时间', value: <span className="tabular-nums">{scheduledLabel || '立即执行'}</span> },
            { label: '最后更新', value: <span className="tabular-nums">{formatDateTime(run.updated)}</span> },
          ]}
        />
        <ErrorAlert inline>{run.lastError}</ErrorAlert>
      </CardContent>
      <div className="flex flex-col gap-2 border-t px-4 py-1 sm:px-5">
        <RunRuntimeSummary run={run} aside={versionPicker} />
        {run.recurrenceSchedule ? (
          <Button asChild variant="outline" size="sm" className="mb-2 self-start">
            <Link to="/schedules">
              <CalendarClock data-icon="inline-start" />
              管理重复计划
            </Link>
          </Button>
        ) : run.recurrence ? (
          <span className="pb-2 text-xs text-muted-foreground">每天 {run.recurrence.time} · 保存为草稿，尚未启用</span>
        ) : null}
      </div>
    </Card>
  )
}
