import { useEffect, useState } from 'react'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { Pager } from '@/components/navigation/pager'
import { Badge } from '@/components/ui/badge'
import { useAsyncData } from '@/hooks/use-async-data'
import { listEventsForTask, toErrorMessage } from '@/lib/api'
import { isTerminalStatus, runStatusMeta } from '@/lib/domain/run-status'
import { progressText } from '@/lib/format'
import type { DispatchTaskRecord } from '@/types'
import type { RunDeepLink } from '../../hooks/use-run-detail'
import { useRevealOnMount } from '../../hooks/use-reveal-on-mount'
import { POLL_MS, RUN_HIERARCHY_PAGE_SIZE } from '../../lib/constants'
import { executionPollMs } from '../../lib/polling'
import { runKeys } from '../../lib/query-keys'
import { EventNode } from './event-node'
import { InlineLoading, InlineNote, RecordChildren, RecordNode } from './record-node'

function eventsEmptyNote(task: DispatchTaskRecord): string {
  if (task.orchestrationState === 'pending') return '等待云端编排 Event'
  if (task.orchestrationState === 'failed') return '编排失败，没有生成 Event'
  return '暂无 Event'
}

/** One Task and its page of Events. Events load only while the Task is open. */
export function TaskNode({ task, deepLink }: { task: DispatchTaskRecord; deepLink: RunDeepLink }) {
  const deepLinked = task.id === deepLink.taskId
  const [open, setOpen] = useState(deepLinked)
  const [eventPage, setEventPage] = useState(deepLinked ? deepLink.eventPage : 1)
  // A deep link to an Event scrolls to that Event; one to the Task alone scrolls to the Task.
  const ref = useRevealOnMount<HTMLDivElement>(deepLinked && !deepLink.eventId)

  useEffect(() => {
    if (!deepLinked) return
    setOpen(true)
    setEventPage(deepLink.eventPage)
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

  return (
    <RecordNode
      ref={ref}
      id={`task-${task.id}`}
      open={open}
      onOpenChange={setOpen}
      eyebrow={`Task ${task.runIndex + 1}`}
      title={task.title || '未命名任务'}
      meta={progressText(task.completedEvents, task.totalEvents, 'Events')}
      badge={task.executorKind === 'codex' ? <Badge variant="info">Codex</Badge> : null}
      status={runStatusMeta(task.status, task.requestedAction)}
    >
      <div className="flex flex-col gap-2 pb-3">
        <div className="flex flex-col gap-2 px-3 empty:hidden sm:px-4">
          <ErrorAlert inline>{task.compileError}</ErrorAlert>
          <ErrorAlert inline>{task.lastError && task.lastError !== task.compileError ? task.lastError : ''}</ErrorAlert>
          <ErrorAlert inline>{events.error}</ErrorAlert>
        </div>
        {events.loading && !events.data ? <InlineLoading className="px-4" label="加载 Event…" /> : null}
        {events.data?.items.length ? (
          <RecordChildren className="ms-2 divide-y sm:ms-6">
            {events.data.items.map((event) => (
              <EventNode key={event.id} event={event} deepLinked={event.id === deepLink.eventId} />
            ))}
          </RecordChildren>
        ) : null}
        {events.data && events.data.items.length === 0 ? <InlineNote className="px-4">{eventsEmptyNote(task)}</InlineNote> : null}
        {events.data ? (
          <Pager
            className="mt-0 px-3 sm:px-4"
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
