import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { InlineError, LoadingState, StatusBadge } from '@/components/app/ui'
import { Button } from '@/components/ui/button'
import { EventNode } from '@/components/run/RunEventNode'
import { RUN_DETAIL_PAGE_SIZE } from '@/components/run/run-detail-constants'
import { useAsyncData } from '@/hooks/useAsyncData'
import { listEventsForTask, toErrorMessage } from '@/lib/api'
import { progressPercent, progressText, runStatusMeta } from '@/lib/format'
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
  const percent = progressPercent(task.completedEvents, task.totalEvents)

  return (
    <div id={'task-' + task.id} className="border-b border-border last:border-b-0">
      <button
        type="button"
        className="flex min-h-16 w-full flex-wrap items-center gap-2.5 px-3 py-3 text-left outline-none transition-colors hover:bg-muted/35 focus-visible:bg-muted/45 sm:px-4"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {open ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
        <span className="hidden size-7 shrink-0 place-items-center rounded-md bg-muted text-[10px] font-semibold tabular-nums text-muted-foreground sm:grid">
          {task.runIndex + 1}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{task.title || 'Task ' + (task.runIndex + 1)}</span>
        {task.executorKind === 'codex' ? <span className="shrink-0 rounded bg-info/10 px-1.5 py-0.5 text-[10px] font-medium text-info">Codex</span> : null}
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        <span className="ml-6 w-full text-xs tabular-nums sm:ml-0 sm:w-auto text-muted-foreground">
          {progressText(task.completedEvents, task.totalEvents, 'Events')} · {percent}%
        </span>
      </button>

      {open ? (
        <div className="border-t border-border bg-muted/10">
          {task.compileError ? <div className="px-3 pt-3 sm:px-4"><InlineError>{task.compileError}</InlineError></div> : null}
          {eventsState.loading && !eventsState.data ? <div className="p-3 sm:p-4"><LoadingState label="加载 Event…" /></div> : null}
          {eventsState.error ? <div className="px-3 pt-3 sm:px-4"><InlineError>{eventsState.error}</InlineError></div> : null}
          {eventsState.data?.items.length ? (
            <div className="min-w-0 sm:ms-5 sm:border-s sm:border-border">
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
