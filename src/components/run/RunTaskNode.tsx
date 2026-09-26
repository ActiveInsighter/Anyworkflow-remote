import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { InlineError, LoadingState, StatusBadge } from '@/components/app/ui'
import { Button } from '@/components/ui/button'
import { EventNode } from '@/components/run/RunEventNode'
import { RUN_DETAIL_PAGE_SIZE } from '@/components/run/run-detail-constants'
import { useAsyncData } from '@/hooks/useAsyncData'
import { listEventsForTask, toErrorMessage } from '@/lib/api'
import { progressText, runStatusMeta } from '@/lib/format'
import type { DispatchTaskRecord } from '@/types'

export function TaskNode({
  task,
  deepTaskId,
  deepEventId,
  deepEventPage,
}: {
  task: DispatchTaskRecord
  deepTaskId: string
  deepEventId: string
  deepEventPage: number
}) {
  const deepLinked = task.id === deepTaskId
  const [open, setOpen] = useState(deepLinked)
  const [eventPage, setEventPage] = useState(deepLinked ? deepEventPage : 1)

  useEffect(() => {
    if (!deepLinked) return
    setOpen(true)
    setEventPage(deepEventPage)
  }, [deepLinked, deepEventPage])

  const eventsState = useAsyncData(
    async () => listEventsForTask(task.id, eventPage, RUN_DETAIL_PAGE_SIZE),
    [task.id, eventPage],
    {
      enabled: open,
      pollMs: open ? 5_000 : undefined,
      staleMs: 8_000,
      cacheKey: open ? 'events:' + task.id + ':' + eventPage : undefined,
      errorMessage: toErrorMessage,
    },
  )

  const status = runStatusMeta(task.status, task.requestedAction)

  return (
    <div id={'task-' + task.id} className="border-b border-border last:border-b-0">
      <button
        type="button"
        className="flex min-h-16 w-full items-center gap-2 px-3 py-3 text-left outline-none transition-colors hover:bg-muted/35 focus-visible:bg-muted/45 sm:px-4"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {open ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-medium text-muted-foreground">Task {task.runIndex + 1}</span>
          <span className="mt-0.5 block truncate text-sm font-semibold">{task.title || '未命名任务'}</span>
          <span className="mt-1 block text-xs tabular-nums text-muted-foreground">{progressText(task.completedEvents, task.totalEvents, 'Events')}</span>
        </span>
        {task.executorKind === 'codex' ? <span className="shrink-0 rounded bg-info/10 px-1.5 py-0.5 text-[10px] font-medium text-info">Codex</span> : null}
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      </button>

      {open ? (
        <div className="pb-3">
          {task.compileError ? <div className="px-3 pt-3 sm:px-4"><InlineError>{task.compileError}</InlineError></div> : null}
          {eventsState.loading && !eventsState.data ? <div className="p-3 sm:p-4"><LoadingState label="加载 Event…" /></div> : null}
          {eventsState.error ? <div className="px-3 pt-3 sm:px-4"><InlineError>{eventsState.error}</InlineError></div> : null}
          {eventsState.data?.items.length ? (
            <div className="ms-4 min-w-0 border-s border-border ps-2 sm:ms-6 sm:ps-3">
              {eventsState.data.items.map((event) => (
                <EventNode key={event.id} event={event} deepLinked={event.id === deepEventId} />
              ))}
            </div>
          ) : null}
          {eventsState.data && eventsState.data.items.length === 0 ? (
            <div className="px-4 py-5 text-xs text-muted-foreground">暂无 Event</div>
          ) : null}
          {eventsState.data && eventsState.data.totalPages > 1 ? (
            <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2.5 text-[11px] text-muted-foreground sm:px-4">
              <span>{eventsState.data.totalItems} 条 · {eventPage}/{eventsState.data.totalPages} 页</span>
              <span className="flex items-center gap-1">
                <Button size="sm" variant="ghost" disabled={eventPage <= 1} onClick={() => setEventPage((value) => Math.max(1, value - 1))}>
                  <ChevronLeft />上一页
                </Button>
                <Button size="sm" variant="ghost" disabled={eventPage >= eventsState.data.totalPages} onClick={() => setEventPage((value) => value + 1)}>
                  下一页<ChevronRight />
                </Button>
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
