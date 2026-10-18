import { useEffect, useState } from 'react'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { Pager } from '@/components/navigation/pager'
import { Badge } from '@/components/ui/badge'
import { useAsyncData } from '@/hooks/use-async-data'
import { listEventsForTask, toErrorMessage } from '@/lib/api'
import { runStatusMeta } from '@/lib/domain/run-status'
import { progressText } from '@/lib/format'
import type { DispatchTaskRecord } from '@/types'
import { POLL_MS, RUN_HIERARCHY_PAGE_SIZE } from '../../lib/constants'
import { runKeys } from '../../lib/query-keys'
import type { RunDeepLink } from '../../hooks/use-run-detail'
import { EventNode } from './event-node'
import { HierarchyChildren, HierarchyNode } from './hierarchy-node'

export function TaskNode({ task, deepLink }: { task: DispatchTaskRecord; deepLink: RunDeepLink }) {
  const deepLinked = task.id === deepLink.taskId
  const [open, setOpen] = useState(deepLinked)
  const [eventPage, setEventPage] = useState(deepLinked ? deepLink.eventPage : 1)

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
      pollMs: open ? POLL_MS.hierarchy : undefined,
      staleMs: POLL_MS.runDetail,
      cacheKey: open ? runKeys.events(task.id, eventPage) : undefined,
      errorMessage: toErrorMessage,
    },
  )

  return (
    <HierarchyNode
      id={`task-${task.id}`}
      open={open}
      onOpenChange={setOpen}
      eyebrow={`Task ${task.runIndex + 1}`}
      title={task.title || '未命名任务'}
      meta={progressText(task.completedEvents, task.totalEvents, 'Events')}
      badge={task.executorKind === 'codex' ? <Badge variant="info">Codex</Badge> : null}
      status={runStatusMeta(task.status, task.requestedAction)}
    >
      <div className="flex flex-col gap-3 pb-3">
        {task.compileError || events.error ? (
          <div className="flex flex-col gap-2 px-3 sm:px-4">
            <ErrorAlert inline>{task.compileError}</ErrorAlert>
            <ErrorAlert inline>{events.error}</ErrorAlert>
          </div>
        ) : null}
        {events.loading && !events.data ? <LoadingState className="mx-3 sm:mx-4" label="加载 Event…" /> : null}
        {events.data?.items.length ? (
          <HierarchyChildren className="ms-4 divide-y sm:ms-6">
            {events.data.items.map((event) => (
              <EventNode key={event.id} event={event} deepLinked={event.id === deepLink.eventId} />
            ))}
          </HierarchyChildren>
        ) : null}
        {events.data && events.data.items.length === 0 ? (
          <p className="px-4 py-2 text-xs text-muted-foreground">暂无 Event</p>
        ) : null}
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
    </HierarchyNode>
  )
}
