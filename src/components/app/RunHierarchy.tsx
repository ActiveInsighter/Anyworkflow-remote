import { ChevronRight, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { ProgressBar, StatusBadge } from '@/components/app/ui'
import { Button } from '@/components/ui/button'
import { useAsyncData } from '@/hooks/useAsyncData'
import { listEventsForTask, toErrorMessage } from '@/lib/api'
import { modeLabel, progressPercent, progressText, runStatusMeta } from '@/lib/format'
import { getEventTitle, parseQueue, type QueuePart } from '@/lib/plan'
import { cn } from '@/lib/utils'
import type { DispatchEventRecord, DispatchTaskRecord, PocketBaseListResponse, StatusTone } from '@/types'

const EVENT_PAGE_SIZE = 20
const QUEUE_PREVIEW_CHARS = 100_000
const QUEUE_PART_LIMIT = 50

const EVENT_LABELS: Record<DispatchEventRecord['status'], string> = {
  waiting: '等待',
  ready: '就绪',
  leased: '已领取',
  running: '执行中',
  paused: '暂停',
  terminal: '结束',
}

const QUEUE_LABELS: Record<QueuePart['type'], string> = {
  message: '消息',
  url: '链接',
  act: 'Act',
  raw: '队列',
}

function eventTone(event: DispatchEventRecord): StatusTone {
  if (event.status === 'paused') return 'warning'
  if (event.status === 'running' || event.status === 'leased' || event.status === 'ready') return 'info'
  if (event.status === 'terminal') {
    if (event.terminalResult === 'failed') return 'danger'
    if (event.terminalResult === 'canceled') return 'warning'
    return 'success'
  }
  return 'neutral'
}

function QueuePartRow({ item, index }: { item: QueuePart; index: number }) {
  return (
    <div className="border-t border-border px-3 py-2.5 first:border-t-0 sm:px-4">
      <div className="mb-1.5 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
        <span>{QUEUE_LABELS[item.type]}</span>
        <span className="tabular-nums">{index + 1}</span>
      </div>
      {item.url ? (
        <a className="mb-1.5 inline-flex max-w-full items-center gap-1 break-all text-xs text-info hover:underline" href={item.url} target="_blank" rel="noreferrer">
          {item.url}<ExternalLink className="size-3 shrink-0" aria-hidden="true" />
        </a>
      ) : null}
      <pre className="m-0 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-foreground">
        {item.text.length > 4000 ? `${item.text.slice(0, 4000)}\n…` : item.text}
      </pre>
    </div>
  )
}

function EventRow({ event }: { event: DispatchEventRecord }) {
  const [open, setOpen] = useState(false)
  const queue = event.queueTextOverride.trim()
  const preview = queue.slice(0, QUEUE_PREVIEW_CHARS)
  const queueParts = open ? parseQueue(preview).slice(0, QUEUE_PART_LIMIT) : []
  const title = getEventTitle(queue, `Event ${event.eventIndex + 1}`)

  return (
    <div className="border-t border-border first:border-t-0">
      <button
        type="button"
        className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left outline-none hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/35 sm:px-4"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <ChevronRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{title}</span>
        <StatusBadge tone={eventTone(event)}>{EVENT_LABELS[event.status]}</StatusBadge>
        {event.attempt > 0 ? <span className="hidden text-[11px] tabular-nums text-muted-foreground sm:inline">尝试 {event.attempt}</span> : null}
      </button>

      {open ? (
        <div className="border-t border-border bg-muted/15 sm:ms-9">
          {event.lastError ? <div className="px-3 py-2 text-xs text-danger sm:px-4">{event.lastError}</div> : null}
          {queueParts.length ? queueParts.map((item, index) => <QueuePartRow key={`${item.type}-${index}`} item={item} index={index} />) : (
            <div className="px-3 py-3 text-xs text-muted-foreground sm:px-4">暂无队列内容</div>
          )}
          {queue.length > QUEUE_PREVIEW_CHARS ? (
            <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground sm:px-4">队列较长，仅展示前 100 KB</div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function TaskHierarchyItem({ task, live }: { task: DispatchTaskRecord; live: boolean }) {
  const [open, setOpen] = useState(false)
  const [eventPage, setEventPage] = useState(1)
  const taskStatus = runStatusMeta(task.status, task.requestedAction)
  const eventsState = useAsyncData<PocketBaseListResponse<DispatchEventRecord>>(
    async () => listEventsForTask(task.id, eventPage, EVENT_PAGE_SIZE),
    [task.id, eventPage],
    {
      enabled: open,
      pollMs: open && live ? 8000 : undefined,
      staleMs: 12000,
      cacheKey: `events:${task.owner}:${task.id}:page-${eventPage}`,
      errorMessage: toErrorMessage,
    },
  )



  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        className="grid min-h-14 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 text-left outline-none hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/35 sm:grid-cols-[auto_minmax(0,1fr)_170px_auto] sm:px-4"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <ChevronRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[13px] font-medium">{task.title || `Task ${task.runIndex + 1}`}</span>
            <StatusBadge tone={taskStatus.tone}>{taskStatus.label}</StatusBadge>
          </div>
          <div className="mt-1 truncate text-[11px] text-muted-foreground">{modeLabel(task.executionMode, task.maxConcurrency, '事件')}</div>
        </div>
        <div className="hidden min-w-0 sm:block">
          <div className="mb-1.5 text-[11px] tabular-nums text-muted-foreground">{progressText(task.completedEvents, task.totalEvents, 'Events')}</div>
          <ProgressBar value={progressPercent(task.completedEvents, task.totalEvents)} tone={taskStatus.tone} />
        </div>
        <span className="text-[11px] tabular-nums text-muted-foreground">{task.totalEvents}</span>
      </button>

      {open ? (
        <div className="border-t border-border bg-background">
          {eventsState.error ? <div className="px-4 py-3 text-xs text-danger">{eventsState.error}</div> : null}
          {eventsState.loading && !eventsState.data ? <div className="px-4 py-4 text-xs text-muted-foreground">加载 Events…</div> : null}
          {eventsState.data?.items.map((event) => <EventRow key={event.id} event={event} />)}
          {eventsState.data && eventsState.data.items.length === 0 ? <div className="px-4 py-4 text-xs text-muted-foreground">暂无 Event</div> : null}
          {eventsState.data && eventsState.data.totalPages > 1 ? (
            <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-2.5">
              <Button size="sm" variant="outline" onClick={() => setEventPage((page) => Math.max(1, page - 1))} disabled={eventsState.data.page <= 1}>上一页</Button>
              <span className="text-[11px] tabular-nums text-muted-foreground">{eventsState.data.page} / {eventsState.data.totalPages}</span>
              <Button size="sm" variant="outline" onClick={() => setEventPage((page) => Math.min(eventsState.data!.totalPages, page + 1))} disabled={eventsState.data.page >= eventsState.data.totalPages}>下一页</Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function RunHierarchy({
  tasks,
  totalItems,
  live,
  page,
  totalPages,
  onPageChange,
}: {
  tasks: DispatchTaskRecord[]
  totalItems: number
  live: boolean
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {tasks.map((task) => <TaskHierarchyItem key={task.id} task={task} live={live} />)}
      {totalPages > 1 ? (
        <div className="flex items-center justify-end gap-2 px-4 py-3">
          <span className="me-auto text-[11px] tabular-nums text-muted-foreground">共 {totalItems} 个 Task</span>
          <Button variant="outline" size="sm" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1}>上一页</Button>
          <span className="text-[11px] tabular-nums text-muted-foreground">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>下一页</Button>
        </div>
      ) : null}
    </div>
  )
}
