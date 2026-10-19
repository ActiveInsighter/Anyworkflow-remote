import type * as React from 'react'
import { useState } from 'react'
import { FileText } from 'lucide-react'
import { CodeBlock } from '@/components/data-display/code-block'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { eventIsActive, eventStatusMeta } from '@/lib/domain/run-status'
import { formatDateTime } from '@/lib/format'
import type { DispatchEventRecord } from '@/types'
import { useEventActs } from '../../hooks/use-event-acts'
import { expansionKey, useNodeExpansion } from '../../hooks/use-execution-expansion'
import { useRevealOnMount } from '../../hooks/use-reveal-on-mount'
import { eventPendingNote, eventProgressSummary, eventTitle } from '../../lib/event-progress'
import { executionPollMs } from '../../lib/polling'
import { ActNode } from './act-node'
import { InlineLoading, InlineNote, MetaDot, RecordNode } from './record-node'
import { StatusText, TimelineDot } from './status-glyph'

/**
 * One dispatch Event on its Task's timeline. Its Acts are the persisted history rows, and only
 * those. While following progress, a live Event (or the only Event) opens by itself.
 */
export function EventNode({
  event,
  index,
  deepLinked,
  onlyEvent,
}: {
  event: DispatchEventRecord
  index: number
  deepLinked: boolean
  onlyEvent: boolean
}) {
  const active = eventIsActive(event.status)
  const [open, setOpen] = useNodeExpansion(expansionKey.event(event.id), onlyEvent || active)
  const [contentOpen, setContentOpen] = useState(false)
  const ref = useRevealOnMount<HTMLDivElement>(deepLinked)

  const history = useEventActs(event, open)
  const acts = history.data ?? []
  const pollMs = executionPollMs({ terminal: event.status === 'terminal', updated: event.updated })
  const status = eventStatusMeta(event.status, event.terminalResult)
  const title = eventTitle(event)

  return (
    <li className="relative animate-enter ps-6" style={{ '--stagger-index': index } as React.CSSProperties}>
      <TimelineDot tone={status.tone} active={active} className="absolute start-0.5 top-[15px]" />
      <RecordNode
        ref={ref}
        id={`event-${event.id}`}
        level="event"
        open={open}
        onOpenChange={setOpen}
        title={title}
        meta={
          <>
            <span>Event {event.eventIndex + 1}</span>
            <MetaDot />
            <StatusText tone={status.tone}>{status.label}</StatusText>
            <MetaDot />
            <span>{eventProgressSummary(event)}</span>
          </>
        }
      >
        <div className="flex flex-col gap-2 pt-1 pb-3 sm:ps-2">
          {history.loading && !history.data ? <InlineLoading label="加载 Act…" /> : null}
          {history.error ? <ErrorAlert inline>Act 记录加载失败：{history.error}</ErrorAlert> : null}
          {acts.length ? (
            <ol aria-label={`${title} 的 Act`} className="overflow-hidden rounded-lg border bg-card">
              {acts.map((act, actIndex) => (
                <ActNode
                  key={act.id}
                  act={act}
                  index={actIndex}
                  latest={actIndex === acts.length - 1}
                  eventActive={active}
                  pollMs={pollMs}
                />
              ))}
            </ol>
          ) : !history.loading && !history.error ? (
            <InlineNote className="rounded-lg border border-dashed bg-card px-3">{eventPendingNote(event.status)}</InlineNote>
          ) : null}
          <ErrorAlert inline>{event.lastError}</ErrorAlert>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground tabular-nums">
            {event.attempt > 0 ? <span>尝试 {event.attempt}</span> : null}
            <span>{formatDateTime(event.updated)}</span>
            {event.workerId ? <span className="hidden truncate sm:inline">Worker {event.workerId}</span> : null}
            {event.queueTextOverride.trim() ? (
              <Button
                size="sm"
                variant="link"
                className="ms-auto h-auto p-0 text-caption"
                onClick={() => setContentOpen(true)}
              >
                <FileText data-icon="inline-start" />
                查看执行内容
              </Button>
            ) : null}
          </div>
        </div>
      </RecordNode>

      <Dialog open={contentOpen} onOpenChange={setContentOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>执行内容</DialogTitle>
            <DialogDescription>{title}</DialogDescription>
          </DialogHeader>
          <CodeBlock className="[&_pre]:max-h-[68dvh]">{event.queueTextOverride}</CodeBlock>
        </DialogContent>
      </Dialog>
    </li>
  )
}
