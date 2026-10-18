import { CalendarClock, History, Pause, Play, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import { DescriptionList } from '@/components/data-display/description-list'
import { StatusBadge } from '@/components/data-display/status-badge'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { formatUtcOffset } from '@/lib/domain/recurrence'
import { formatDateTime } from '@/lib/format'
import type { RunSchedule } from '@/lib/api/run-schedules'

export function ScheduleCard({
  schedule,
  busy,
  onToggle,
  onDelete,
}: {
  schedule: RunSchedule
  busy: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              className="text-sm font-medium break-words underline-offset-4 hover:underline"
              to={`/runs/${schedule.sourceRun}`}
            >
              {schedule.title || '未命名工作流'}
            </Link>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <CalendarClock className="size-4" aria-hidden="true" />
              每天 {schedule.rule.time} · {formatUtcOffset(schedule.rule.utcOffsetMinutes)}
            </div>
          </div>
          <StatusBadge tone={schedule.enabled ? 'success' : 'neutral'}>{schedule.enabled ? '已启用' : '已暂停'}</StatusBadge>
        </div>
        <DescriptionList
          columns={2}
          items={[
            { label: '下次执行', value: schedule.enabled ? formatDateTime(schedule.nextRunAt) : '恢复后从下次时间开始' },
            {
              label: '已跳过',
              value: `${schedule.skippedCount} 次${schedule.lastSkippedAt ? ` · 最近 ${formatDateTime(schedule.lastSkippedAt)}` : ''}`,
            },
          ]}
        />
        <ErrorAlert inline>{schedule.lastError}</ErrorAlert>
      </CardContent>
      <CardFooter>
        <Button size="sm" variant="secondary" disabled={busy} onClick={onToggle}>
          {schedule.enabled ? <Pause data-icon="inline-start" /> : <Play data-icon="inline-start" />}
          {schedule.enabled ? '暂停重复' : '恢复重复'}
        </Button>
        {schedule.lastRun ? (
          <Button size="sm" variant="outline" asChild>
            <Link to={`/runs/${schedule.lastRun}`}>
              <History data-icon="inline-start" />
              最近执行
            </Link>
          </Button>
        ) : null}
        <Button size="sm" variant="ghost-destructive" className="ms-auto" disabled={busy} onClick={onDelete}>
          <Trash2 data-icon="inline-start" />
          删除计划
        </Button>
      </CardFooter>
    </Card>
  )
}
