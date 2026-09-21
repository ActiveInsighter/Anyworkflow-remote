import { ChevronDown, ChevronRight, FileText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { InlineError, LoadingState, StatusBadge } from '@/components/app/ui'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FallbackActNode, HistoryActNode } from '@/components/run/RunActNode'
import { useAsyncData } from '@/hooks/useAsyncData'
import { listHistoryActsForDispatchEvent, toErrorMessage } from '@/lib/api'
import {
  eventProgressLabel,
  eventStatusMeta,
  formatDateTime,
  historyStatusCompleted,
  progressPercent,
} from '@/lib/format'
import { deriveEventProgress } from '@/lib/event-structure'
import type { DispatchEventRecord, WorkflowHistoryActRecord } from '@/types'

function eventTitle(event: DispatchEventRecord): string {
  return event.queueTextOverride.match(/^\s*@event\s*=\s*(.*?)\s*$/imu)?.[1]?.trim() || `Event ${event.eventIndex + 1}`
}

interface ProgressSummary {
  completed: number
  total: number
  percent: number
}

function historyActsProgress(acts: readonly WorkflowHistoryActRecord[], event: DispatchEventRecord): ProgressSummary {
  const total = acts.length
  const completed = event.terminalResult === 'succeeded'
    ? total
    : acts.filter((act) => historyStatusCompleted(act.status)).length
  return { completed, total, percent: progressPercent(completed, total) }
}

export function EventNode({ event, deepLinked, activeRun }: { event: DispatchEventRecord; deepLinked: boolean; activeRun: boolean }) {
  const [open, setOpen] = useState(deepLinked)
  const [contentOpen, setContentOpen] = useState(false)

  useEffect(() => {
    if (deepLinked) setOpen(true)
  }, [deepLinked])

  const status = eventStatusMeta(event.status, event.terminalResult)
  const fallbackProgress = deriveEventProgress(event.queueTextOverride, event.progress, event.terminalResult)
  const historyActsState = useAsyncData(
    async () => listHistoryActsForDispatchEvent(event),
    [event.id, event.localRunId, event.attempt],
    {
      enabled: open && Boolean(event.localRunId),
      pollMs: open && activeRun ? 8_000 : undefined,
      staleMs: 8_000,
      cacheKey: open && event.localRunId ? 'history-acts:' + event.id + ':' + event.localRunId : undefined,
      errorMessage: toErrorMessage,
    },
  )
  const hasHistory = Boolean(historyActsState.data?.length)
  const historyProgress = hasHistory && historyActsState.data ? historyActsProgress(historyActsState.data, event) : null
  const progressLabel = historyProgress
    ? `${historyProgress.completed} / ${historyProgress.total} Acts · ${historyProgress.percent}%`
    : fallbackProgress.totalActs
      ? `${fallbackProgress.completedActs} / ${fallbackProgress.totalActs} Acts · ${fallbackProgress.percent}%`
      : eventProgressLabel(event.status, event.progress)

  return (
    <div id={'event-' + event.id} className="border-b border-border last:border-b-0">
      <button
        type="button"
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/35 focus-visible:bg-muted/45 sm:px-4"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {open ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-[10px] font-semibold tabular-nums text-muted-foreground">
          {event.eventIndex + 1}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{eventTitle(event)}</span>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        <span className="max-w-[42%] shrink-0 truncate text-[10px] tabular-nums text-muted-foreground">{progressLabel}</span>
      </button>

      {open ? (
        <div className="border-t border-border bg-muted/10 px-3 py-2.5 sm:px-4">
          <div className="mb-2 flex items-center justify-between gap-3 px-1 text-[10px] tabular-nums text-muted-foreground">
            <span>Acts</span>
            <span>{progressLabel}</span>
          </div>
          {historyActsState.loading && !historyActsState.data ? <LoadingState label="加载 Act…" /> : null}
          {historyActsState.error ? <div className="mb-3"><InlineError>历史 Act 暂不可用，当前显示执行定义：{historyActsState.error}</InlineError></div> : null}
          {hasHistory && historyActsState.data ? (
            <div className="mb-3 overflow-hidden rounded-md border border-border bg-card">
              {historyActsState.data.map((act) => <HistoryActNode key={act.id} act={act} />)}
            </div>
          ) : fallbackProgress.acts.length ? (
            <div className="mb-3 overflow-hidden rounded-md border border-border bg-card">
              {fallbackProgress.acts.map((act) => <FallbackActNode key={act.id} act={act} />)}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            {event.attempt > 0 ? <span>尝试 {event.attempt}</span> : null}
            <span>{formatDateTime(event.updated)}</span>
            {event.workerId ? <span className="hidden sm:inline">Worker {event.workerId}</span> : null}
            {event.queueTextOverride.trim() ? (
              <Button
                size="sm"
                variant="link"
                className="h-auto gap-1 p-0 text-[10px] text-info"
                onClick={() => setContentOpen(true)}
              >
                <FileText className="size-3.5" />
                查看执行内容
              </Button>
            ) : null}
          </div>
          {event.lastError ? <div className="mt-2"><InlineError>{event.lastError}</InlineError></div> : null}
        </div>
      ) : null}

      <Dialog open={contentOpen} onOpenChange={setContentOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>执行内容</DialogTitle>
            <DialogDescription>{eventTitle(event)}</DialogDescription>
          </DialogHeader>
          <pre className="max-h-[68vh] overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/45 p-3 text-[12px] leading-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {event.queueTextOverride}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  )
}
