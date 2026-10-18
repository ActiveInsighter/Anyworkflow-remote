import { useEffect, useMemo, useState } from 'react'
import { FileText } from 'lucide-react'
import { CodeBlock } from '@/components/data-display/code-block'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAsyncData } from '@/hooks/use-async-data'
import { listHistoryActsForDispatchEvent, toErrorMessage } from '@/lib/api'
import { deriveEventProgress } from '@/lib/domain/event-structure'
import { eventStatusMeta } from '@/lib/domain/run-status'
import { formatDateTime } from '@/lib/format'
import type { DispatchEventRecord } from '@/types'
import { POLL_MS } from '../../lib/constants'
import { eventProgressSummary, eventTitle } from '../../lib/event-progress'
import { runKeys } from '../../lib/query-keys'
import { FallbackActNode, HistoryActNode } from './act-node'
import { HierarchyChildren, HierarchyNode } from './hierarchy-node'

export function EventNode({ event, deepLinked }: { event: DispatchEventRecord; deepLinked: boolean }) {
  const [open, setOpen] = useState(deepLinked)
  const [contentOpen, setContentOpen] = useState(false)

  useEffect(() => {
    if (deepLinked) setOpen(true)
  }, [deepLinked])

  const historyActs = useAsyncData(
    (signal) => listHistoryActsForDispatchEvent(event, signal),
    [event.id, event.localRunId, event.attempt],
    {
      enabled: open && Boolean(event.localRunId),
      pollMs: open ? POLL_MS.hierarchy : undefined,
      staleMs: POLL_MS.runDetail,
      cacheKey: open && event.localRunId ? runKeys.historyActs(event.id, event.localRunId, event.attempt) : undefined,
      errorMessage: toErrorMessage,
    },
  )
  const acts = historyActs.data?.length ? historyActs.data : null
  const plannedActs = useMemo(
    () => deriveEventProgress(event.queueTextOverride, event.progress, event.terminalResult).acts,
    [event.queueTextOverride, event.progress, event.terminalResult],
  )
  const title = eventTitle(event)

  return (
    <HierarchyNode
      id={`event-${event.id}`}
      size="sm"
      open={open}
      onOpenChange={setOpen}
      eyebrow={`Event ${event.eventIndex + 1}`}
      title={title}
      meta={eventProgressSummary(event, acts)}
      status={eventStatusMeta(event.status, event.terminalResult)}
    >
      <HierarchyChildren>
        {historyActs.loading && !historyActs.data ? <LoadingState label="加载 Act…" /> : null}
        {historyActs.error ? (
          <ErrorAlert inline className="mb-3">
            历史 Act 暂不可用，当前显示执行定义：{historyActs.error}
          </ErrorAlert>
        ) : null}
        {acts ? (
          <div className="mb-3 min-w-0 divide-y bg-card">
            {acts.map((act) => (
              <HistoryActNode key={act.id} act={act} />
            ))}
          </div>
        ) : plannedActs.length ? (
          <div className="mb-3 min-w-0 divide-y bg-card">
            {plannedActs.map((act) => (
              <FallbackActNode key={act.id} act={act} />
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-2 text-caption text-muted-foreground">
          {event.attempt > 0 ? <span>尝试 {event.attempt}</span> : null}
          <span>{formatDateTime(event.updated)}</span>
          {event.workerId ? <span className="hidden sm:inline">Worker {event.workerId}</span> : null}
          {event.queueTextOverride.trim() ? (
            <Button size="sm" variant="link" className="h-auto p-0 text-caption" onClick={() => setContentOpen(true)}>
              <FileText data-icon="inline-start" />
              查看执行内容
            </Button>
          ) : null}
        </div>
        <ErrorAlert inline className="mb-2">
          {event.lastError}
        </ErrorAlert>
      </HierarchyChildren>

      <Dialog open={contentOpen} onOpenChange={setContentOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>执行内容</DialogTitle>
            <DialogDescription>{title}</DialogDescription>
          </DialogHeader>
          <CodeBlock className="[&_pre]:max-h-[68dvh]">{event.queueTextOverride}</CodeBlock>
        </DialogContent>
      </Dialog>
    </HierarchyNode>
  )
}
