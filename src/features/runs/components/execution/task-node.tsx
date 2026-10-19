import { useEffect, useState } from 'react'
import { ProgressMeter } from '@/components/data-display/progress-meter'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { Pager } from '@/components/navigation/pager'
import { Badge } from '@/components/ui/badge'
import { useAsyncData } from '@/hooks/use-async-data'
import { listEventsForTask, toErrorMessage } from '@/lib/api'
import { isTerminalStatus, runStatusMeta } from '@/lib/domain/run-status'
import { progressPercent, progressText } from '@/lib/format'
import type { DispatchTaskRecord } from '@/types'
import type { RunDeepLink } from '../../hooks/use-run-detail'
import { expansionKey, useNodeExpansion } from '../../hooks/use-execution-expansion'
import { useRevealOnMount } from '../../hooks/use-reveal-on-mount'
import { POLL_MS, RUN_HIERARCHY_PAGE_SIZE } from '../../lib/constants'
import { executionPollMs } from '../../lib/polling'
import { runKeys } from '../../lib/query-keys'
import { EventNode } from './event-node'
import { InlineLoading, InlineNote, MetaDot, RecordNode } from './record-node'
import { StatusGlyph, StatusText } from './status-glyph'

function eventsEmptyNote(task: DispatchTaskRecord): string {
  if (task.orchestrationState === 'pending') return '等待云端编排 Event'
  if (task.orchestrationState === 'failed') return '编排失败，没有生成 Event'
  return '暂无 Event'
}

/**
 * One Task card and its page of Events. Events load only while the Task is open. While following
 * progress, a running Task (or the only Task) opens by itself.
 */
export function TaskNode({
  task,
  deepLink,
  onlyTask,
}: {
  task: DispatchTaskRecord
  deepLink: RunDeepLink
  onlyTask: boolean
}) {
  const deepLinked = task.id === deepLink.taskId
  const [open, setOpen] = useNodeExpansion(expansionKey.task(task.id), onlyTask || task.status === 'running')
  const [eventPage, setEventPage] = useState(deepLinked ? deepLink.eventPage : 1)
  // A deep link to an Event scrolls to that Event; one to the Task alone scrolls to the Task.
  const ref = useRevealOnMount<HTMLDivElement>(deepLinked && !deepLink.eventId)

  useEffect(() => {
    if (deepLinked) setEventPage(deepLink.eventPage)
  }, [deepLinked, deepLink.eventPage])

  const events = useAsyncData(
    async () => listEventsForTask(task.id, eventPage, RUN_HIERARCHY_PAGE_SIZE),
    [task.id, eventPage],
    {
      enabled: open,
      pollMs: open ? executionPollMs({ terminal: isTerminalStatus(task.status), updated: task.updated }) : undefined,
      staleMs: POLL_MS.runDetail,
      cacheKey: open ? runKeys.events(task.id, eventPage) : undefined,
      errorMessage: toErrorMessage,
    },
  )
  const status = runStatusMeta(task.status, task.requestedAction)
  const running = task.status === 'running'
  const items = events.data?.items ?? []

  return (
    <RecordNode
      ref={ref}
      id={`task-${task.id}`}
      level="task"
      open={open}
      onOpenChange={setOpen}
      className="overflow-hidden rounded-xl border bg-card transition-shadow duration-base data-[state=open]:shadow-sm"
      leading={<StatusGlyph tone={status.tone} active={running} />}
      title={task.title || '未命名任务'}
      meta={
        <>
          <span>Task {task.runIndex + 1}</span>
          <MetaDot />
          <StatusText tone={status.tone}>{status.label}</StatusText>
          <MetaDot />
          <span>{progressText(task.completedEvents, task.totalEvents, 'Events')}</span>
        </>
      }
      footer={
        running && task.totalEvents > 0 ? (
          <ProgressMeter
            className="mt-2 h-1 max-w-xs"
            value={progressPercent(task.completedEvents, task.totalEvents)}
            tone={status.tone}
          />
        ) : null
      }
      trailing={task.executorKind === 'codex' ? <Badge variant="info" className="mt-1.5">Codex</Badge> : null}
    >
      <div className="flex flex-col gap-2 border-t bg-muted/25 px-3 pt-3 pb-3 sm:px-4">
        <div className="flex flex-col gap-2 empty:hidden">
          <ErrorAlert inline>{task.compileError}</ErrorAlert>
          <ErrorAlert inline>{task.lastError && task.lastError !== task.compileError ? task.lastError : ''}</ErrorAlert>
          <ErrorAlert inline>{events.error}</ErrorAlert>
        </div>
        {events.loading && !events.data ? <InlineLoading className="px-1" label="加载 Event…" /> : null}
        {items.length ? (
          <ol
            aria-label={`${task.title || '任务'} 的 Event`}
            className="relative flex flex-col gap-1 before:absolute before:start-[7.5px] before:top-5 before:bottom-5 before:w-px before:bg-border"
          >
            {items.map((event, index) => (
              <EventNode
                key={event.id}
                event={event}
                index={index}
                deepLinked={event.id === deepLink.eventId}
                onlyEvent={events.data?.totalItems === 1}
              />
            ))}
          </ol>
        ) : null}
        {events.data && items.length === 0 ? <InlineNote className="px-1">{eventsEmptyNote(task)}</InlineNote> : null}
        {events.data ? (
          <Pager
            className="mt-0"
            label={`${task.title || '任务'} 的 Event 分页`}
            page={eventPage}
            totalPages={events.data.totalPages}
            totalItems={events.data.totalItems}
            onPageChange={setEventPage}
          />
        ) : null}
      </div>
    </RecordNode>
  )
}
