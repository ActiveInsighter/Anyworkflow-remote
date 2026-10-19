import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import { CodeBlock } from '@/components/data-display/code-block'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { eventIsActive, eventStatusMeta } from '@/lib/domain/run-status'
import { formatDateTime } from '@/lib/format'
import type { DispatchEventRecord } from '@/types'
import { useEventActs } from '../../hooks/use-event-acts'
import { useRevealOnMount } from '../../hooks/use-reveal-on-mount'
import { eventPendingNote, eventProgressSummary, eventTitle } from '../../lib/event-progress'
import { executionPollMs } from '../../lib/polling'
import { ActNode } from './act-node'
import { InlineLoading, InlineNote, RecordChildren, RecordNode } from './record-node'

/** One dispatch Event. Its Acts are the persisted history rows, and only those. */
export function EventNode({ event, deepLinked }: { event: DispatchEventRecord; deepLinked: boolean }) {
  const [open, setOpen] = useState(deepLinked)
  const [contentOpen, setContentOpen] = useState(false)
  const ref = useRevealOnMount<HTMLDivElement>(deepLinked)

  useEffect(() => {
    if (deepLinked) setOpen(true)
  }, [deepLinked])

  const history = useEventActs(event, open)
  const acts = history.data ?? []
  const active = eventIsActive(event.status)
  const pollMs = executionPollMs({ terminal: event.status === 'terminal', updated: event.updated })
  const title = eventTitle(event)

  return (
    <RecordNode
      ref={ref}
      id={`event-${event.id}`}
      size="sm"
      open={open}
      onOpenChange={setOpen}
      eyebrow={`Event ${event.eventIndex + 1}`}
      title={title}
      meta={eventProgressSummary(event)}
      status={eventStatusMeta(event.status, event.terminalResult)}
    >
      <RecordChildren>
        {history.loading && !history.data ? <InlineLoading label="加载 Act…" /> : null}
        {history.error ? (
          <ErrorAlert inline className="mb-3">
            Act 记录加载失败：{history.error}
          </ErrorAlert>
        ) : null}
        {acts.length ? (
          <div className="mb-3 min-w-0 divide-y bg-card">
            {acts.map((act, index) => (
              <ActNode
                key={act.id}
                act={act}
                defaultOpen={index === acts.length - 1}
                eventActive={active}
                pollMs={pollMs}
              />
            ))}
          </div>
        ) : !history.loading && !history.error ? (
          <InlineNote>{eventPendingNote(event.status)}</InlineNote>
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
      </RecordChildren>

      <Dialog open={contentOpen} onOpenChange={setContentOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>执行内容</DialogTitle>
            <DialogDescription>{title}</DialogDescription>
          </DialogHeader>
          <CodeBlock className="[&_pre]:max-h-[68dvh]">{event.queueTextOverride}</CodeBlock>
        </DialogContent>
      </Dialog>
    </RecordNode>
  )
}
