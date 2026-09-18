import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { AppPage, ErrorBanner, LoadingState, MetaGrid, PageHeader, ProgressBar, SectionHeading, StatusBadge } from '@/components/app/ui'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { useAsyncData } from '@/hooks/useAsyncData'
import { getTask, listAllEventsForTask, toErrorMessage } from '@/lib/api'
import {
  eventStatusMeta,
  formatDateTime,
  modeLabel,
  progressPercent,
  progressText,
  runStatusMeta,
  terminalResultLabel,
} from '@/lib/format'
import { getEventTitle } from '@/lib/plan'

export function TaskDetailPage() {
  const { taskId = '' } = useParams()

  const state = useAsyncData(
    async () => {
      const [task, events] = await Promise.all([getTask(taskId), listAllEventsForTask(taskId)])
      return { task, events }
    },
    [taskId],
    { enabled: Boolean(taskId), pollMs: 5000, errorMessage: toErrorMessage },
  )

  if (state.loading && !state.data) return <AppPage><LoadingState label="正在读取 Task…" /></AppPage>
  if (state.error && !state.data) return <AppPage><ErrorBanner>{state.error}</ErrorBanner></AppPage>
  if (!state.data) return null

  const { task, events } = state.data
  const status = runStatusMeta(task.status, task.requestedAction)

  return (
    <AppPage>
      <PageHeader
        eyebrow="Task"
        title={task.title || `Task ${task.runIndex + 1}`}
        description={modeLabel(task.executionMode, task.maxConcurrency, '事件')}
        actions={<Button variant="outline" asChild><Link to={`/runs/${task.run}`}><ArrowLeft />返回 Run</Link></Button>}
      />

      {state.error ? <ErrorBanner>{state.error}</ErrorBanner> : null}

      <Card>
        <CardHeader className="gap-4 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">任务进度</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">{progressText(task.completedEvents, task.totalEvents, 'Events')}</h2>
            </div>
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          </div>
          <ProgressBar value={progressPercent(task.completedEvents, task.totalEvents)} tone={status.tone} />
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0 sm:px-5 sm:pb-5">
          <MetaGrid items={[
            { label: '调度方式', value: modeLabel(task.executionMode, task.maxConcurrency, '事件') },
            { label: '编排状态', value: task.orchestrationState },
            { label: '创建时间', value: formatDateTime(task.created) },
            { label: '更新时间', value: formatDateTime(task.updated) },
          ]} />
          {task.compileError || task.lastError ? <div className="mt-4 rounded-lg bg-destructive/10 p-3 text-xs leading-5 text-destructive">{task.compileError || task.lastError}</div> : null}
        </CardContent>
      </Card>

      <SectionHeading eyebrow="Events" title="执行单元" trailing={`${events.length} 项`} />

      <div className="grid gap-2.5">
        {events.map((event) => {
          const eventStatus = eventStatusMeta(event.status, event.terminalResult)
          return (
            <Link
              className="group grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border bg-card p-3.5 shadow-sm transition-colors hover:border-foreground/15 sm:grid-cols-[44px_minmax(0,1fr)_auto] sm:p-4"
              to={`/events/${event.id}`}
              key={event.id}
            >
              <div className="grid size-10 place-items-center rounded-lg bg-blue-500/10 text-[11px] font-semibold text-blue-600 dark:text-blue-400 sm:size-11">
                {String(event.eventIndex + 1).padStart(2, '0')}
              </div>
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="truncate text-sm font-semibold">{getEventTitle(event.queueTextOverride, `Event ${event.eventIndex + 1}`)}</h3>
                  <StatusBadge tone={eventStatus.tone}>{eventStatus.label}</StatusBadge>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">{terminalResultLabel(event.terminalResult)} · 尝试 {event.attempt} 次</p>
              </div>
              <span className="hidden text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block">›</span>
            </Link>
          )
        })}
      </div>

      {!events.length ? <Card className="mt-3 border-dashed bg-muted/20 p-5 text-center text-xs text-muted-foreground">暂无 Event，云端仍可能正在编排。</Card> : null}
    </AppPage>
  )
}
