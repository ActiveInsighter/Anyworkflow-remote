import { Link, useParams } from 'react-router'
import { Button, Card, ErrorBanner, LoadingState, MetaGrid, PageHeader, ProgressBar, StatusBadge } from '../components/ui'
import { getTask, listAllEventsForTask, toErrorMessage } from '../lib/api'
import {
  eventStatusMeta,
  formatDateTime,
  modeLabel,
  progressPercent,
  progressText,
  runStatusMeta,
  terminalResultLabel,
} from '../lib/format'
import { getEventTitle } from '../lib/plan'
import { useAsyncData } from '../hooks/useAsyncData'

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

  if (state.loading && !state.data) return <LoadingState label="正在读取 Task…" />
  if (state.error && !state.data) return <ErrorBanner>{state.error}</ErrorBanner>
  if (!state.data) return null

  const { task, events } = state.data
  const status = runStatusMeta(task.status, task.requestedAction)

  return (
    <>
      <PageHeader
        eyebrow="Task"
        title={task.title || `Task ${task.runIndex + 1}`}
        description={modeLabel(task.executionMode, task.maxConcurrency, '事件')}
        actions={<Button variant="secondary" asChild><Link to={`/runs/${task.run}`}>返回 Run</Link></Button>}
      />

      {state.error ? <ErrorBanner>{state.error}</ErrorBanner> : null}

      <Card className="summary-card">
        <div className="summary-top">
          <div>
            <span className="eyebrow">任务进度</span>
            <h2>{progressText(task.completedEvents, task.totalEvents, 'Events')}</h2>
          </div>
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        </div>
        <ProgressBar value={progressPercent(task.completedEvents, task.totalEvents)} tone={status.tone} />
        <MetaGrid items={[
          { label: '调度方式', value: modeLabel(task.executionMode, task.maxConcurrency, '事件') },
          { label: '编排状态', value: task.orchestrationState },
          { label: '创建时间', value: formatDateTime(task.created) },
          { label: '更新时间', value: formatDateTime(task.updated) },
        ]} />
        {task.compileError || task.lastError ? <div className="inline-error">{task.compileError || task.lastError}</div> : null}
      </Card>

      <div className="section-bar">
        <div>
          <span className="eyebrow">Events</span>
          <h2>执行单元</h2>
        </div>
        <span>{events.length} 项</span>
      </div>

      <div className="detail-list">
        {events.map((event) => {
          const eventStatus = eventStatusMeta(event.status, event.terminalResult)
          return (
            <Link className="detail-row card" to={`/events/${event.id}`} key={event.id}>
              <div className="detail-index event-index">{String(event.eventIndex + 1).padStart(2, '0')}</div>
              <div className="detail-main">
                <div className="detail-title-row">
                  <h3>{getEventTitle(event.queueTextOverride, `Event ${event.eventIndex + 1}`)}</h3>
                  <StatusBadge tone={eventStatus.tone}>{eventStatus.label}</StatusBadge>
                </div>
                <p>{terminalResultLabel(event.terminalResult)} · 尝试 {event.attempt} 次</p>
              </div>
              <span className="detail-arrow">›</span>
            </Link>
          )
        })}
      </div>

      {!events.length ? <Card className="soft-card">暂无 Event，云端仍可能正在编排。</Card> : null}
    </>
  )
}
