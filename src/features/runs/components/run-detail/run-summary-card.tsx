import { CalendarClock, GitBranch } from 'lucide-react'
import { Link } from 'react-router'
import { DescriptionList } from '@/components/data-display/description-list'
import { ProgressMeter } from '@/components/data-display/progress-meter'
import { StatusBadge } from '@/components/data-display/status-badge'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { runOriginLabel, runStatusMeta, runVersionLabel } from '@/lib/domain/run-status'
import { formatDateTime, modeLabel, progressPercent, progressText } from '@/lib/format'
import type { DispatchRunRecord } from '@/types'
import { RunRuntimeSummary } from './run-runtime-summary'

/** Status, progress and the facts that define this Run version. */
export function RunSummaryCard({
  run,
  totalTasks,
  scheduledLabel,
}: {
  run: DispatchRunRecord
  totalTasks: number
  /** Absolute run time, or empty when the Run starts immediately. */
  scheduledLabel: string
}) {
  const status = runStatusMeta(run.status, run.requestedAction)
  const percent = progressPercent(run.completedTasks, totalTasks)

  return (
    <Card aria-label="运行概况">
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            <span className="font-medium tabular-nums">{progressText(run.completedTasks, totalTasks, 'Tasks')}</span>
            <span className="ms-auto font-mono text-xs text-muted-foreground tabular-nums">{percent}%</span>
          </div>
          <ProgressMeter value={percent} tone={status.tone} />
        </div>
        <Separator />
        <DescriptionList
          items={[
            {
              label: '版本',
              value: (
                <span className="flex flex-wrap items-center gap-1 font-mono">
                  <GitBranch className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  {runVersionLabel(run)}
                  <span className="ms-1 font-sans font-normal text-muted-foreground">{runOriginLabel(run.origin)}</span>
                </span>
              ),
            },
            { label: '执行方式', value: modeLabel(run.executionMode, run.maxConcurrency, '任务') },
            { label: '执行时间', value: <span className="tabular-nums">{scheduledLabel || '立即执行'}</span> },
            { label: '最后更新', value: <span className="tabular-nums">{formatDateTime(run.updated)}</span> },
          ]}
        />
        <ErrorAlert inline>{run.lastError}</ErrorAlert>
        <Separator />
        <div className="flex flex-col gap-2">
          <RunRuntimeSummary run={run} />
          {run.recurrenceSchedule ? (
            <Button asChild variant="outline" size="sm" className="self-start">
              <Link to="/schedules">
                <CalendarClock data-icon="inline-start" />
                管理重复计划
              </Link>
            </Button>
          ) : run.recurrence ? (
            <span className="text-xs text-muted-foreground">每天 {run.recurrence.time} · 保存为草稿，尚未启用</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
