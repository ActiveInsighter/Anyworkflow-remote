import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { AppPage, EmptyState, ErrorBanner, LoadingState, MetaGrid, PageHeader, ProgressBar, SectionHeading, StatusBadge } from '@/components/app/ui'
import { Button } from '@/components/ui/button'
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

  if (state.loading && !state.data) return <AppPage><LoadingState /></AppPage>
  if (state.error && !state.data) return <AppPage><ErrorBanner>{state.error}</ErrorBanner></AppPage>
  if (!state.data) return null

  const { task, events } = state.data
  const status = runStatusMeta(task.status, task.requestedAction)

  return (
    <AppPage>
      <PageHeader
        title={task.title || 'Task ' + (task.runIndex + 1)}
        actions={<Button variant="outline" asChild><Link to={'/runs/' + task.run}><ArrowLeft />Run</Link></Button>}
      />

      {state.error ? <ErrorBanner>{state.error}</ErrorBanner> : null}

      <section className="rounded-lg border bg-card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm font-semibold">{progressText(task.completedEvents, task.totalEvents, 'Events')}</div>
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        </div>
        <ProgressBar className="mt-3" value={progressPercent(task.completedEvents, task.totalEvents)} tone={status.tone} />
        <div className="mt-4">
          <MetaGrid items={[
            { label: '调度', value: modeLabel(task.executionMode, task.maxConcurrency, '事件') },
            { label: '编排', value: task.orchestrationState },
            { label: '创建', value: formatDateTime(task.created) },
            { label: '更新', value: formatDateTime(task.updated) },
          ]} />
        </div>
        {task.compileError || task.lastError ? (
          <div className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive">
            {task.compileError || task.lastError}
          </div>
        ) : null}
      </section>

      <SectionHeading title="Events" trailing={events.length} />

      {events.length ? (
        <div className="overflow-hidden rounded-lg border bg-card">
          {events.map((event) => {
            const eventStatus = eventStatusMeta(event.status, event.terminalResult)
            return (
              <Link
                className="grid gap-3 border-b p-4 last:border-b-0 hover:bg-muted/20 sm:grid-cols-[44px_minmax(0,1fr)_150px] sm:items-center"
                to={'/events/' + event.id}
                key={event.id}
              >
                <div className="hidden size-9 place-items-center rounded-md bg-muted text-[10px] font-semibold text-muted-foreground sm:grid">
                  {String(event.eventIndex + 1).padStart(2, '0')}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-medium">{getEventTitle(event.queueTextOverride, 'Event ' + (event.eventIndex + 1))}</h3>
                    <StatusBadge tone={eventStatus.tone}>{eventStatus.label}</StatusBadge>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {terminalResultLabel(event.terminalResult)}
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground sm:text-right">
                  尝试 {event.attempt}
                </div>
              </Link>
            )
          })}
        </div>
      ) : <EmptyState title="暂无 Event" />}
    </AppPage>
  )
}
