import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router'
import {
  AppPage,
  EmptyState,
  ErrorBanner,
  InlineError,
  ListRow,
  LoadingState,
  MetaGrid,
  PageHeader,
  Panel,
  ProgressBar,
  SectionHeading,
  StatusBadge,
} from '@/components/app/ui'
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
  const failure = task.compileError || task.lastError

  return (
    <AppPage>
      <PageHeader
        eyebrow={
          <Link to={'/runs/' + task.run} className="outline-none hover:text-foreground focus-visible:underline">
            Run
          </Link>
        }
        title={task.title || 'Task ' + (task.runIndex + 1)}
        actions={
          <Button variant="outline" asChild>
            <Link to={'/runs/' + task.run}><ArrowLeft />返回 Run</Link>
          </Button>
        }
      />

      {state.error ? <ErrorBanner>{state.error}</ErrorBanner> : null}

      <Panel className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold">{progressText(task.completedEvents, task.totalEvents, 'Events')}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">已完成的 Event 数量</div>
          </div>
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        </div>
        <ProgressBar
          className="mt-3"
          value={progressPercent(task.completedEvents, task.totalEvents)}
          tone={status.tone}
        />
        <div className="mt-4">
          <MetaGrid
            items={[
              { label: '调度', value: modeLabel(task.executionMode, task.maxConcurrency, '事件') },
              { label: '编排', value: task.orchestrationState },
              { label: '创建', value: formatDateTime(task.created) },
              { label: '更新', value: formatDateTime(task.updated) },
            ]}
          />
        </div>
        {failure ? <div className="mt-4"><InlineError>{failure}</InlineError></div> : null}
      </Panel>

      <SectionHeading title="Events" trailing={events.length} />

      {events.length ? (
        <Panel>
          {events.map((event) => {
            const eventStatus = eventStatusMeta(event.status, event.terminalResult)
            return (
              <ListRow
                key={event.id}
                className="grid gap-3 sm:grid-cols-[44px_minmax(0,1fr)_140px] sm:items-center sm:gap-5"
                render={<Link to={'/events/' + event.id} />}
              >
                <div className="hidden size-9 place-items-center rounded-md bg-muted text-[11px] font-semibold tabular-nums text-muted-foreground sm:grid">
                  {String(event.eventIndex + 1).padStart(2, '0')}
                </div>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <h3 className="truncate text-[13px] font-medium">
                      {getEventTitle(event.queueTextOverride, 'Event ' + (event.eventIndex + 1))}
                    </h3>
                    <StatusBadge tone={eventStatus.tone}>{eventStatus.label}</StatusBadge>
                  </div>
                  <div className="mt-1 truncate text-[11px] text-muted-foreground">
                    {terminalResultLabel(event.terminalResult)}
                  </div>
                </div>
                <div className="text-[11px] tabular-nums text-muted-foreground sm:text-right">
                  尝试 {event.attempt}
                </div>
              </ListRow>
            )
          })}
        </Panel>
      ) : (
        <EmptyState title="暂无 Event" description="Task 被编排后会生成待执行的 Event 队列。" />
      )}
    </AppPage>
  )
}
