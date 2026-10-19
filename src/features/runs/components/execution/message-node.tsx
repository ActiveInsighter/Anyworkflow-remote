import type * as React from 'react'
import { useEffect, useState } from 'react'
import { Bot, ChevronRight, Clock3, LoaderCircle, MessagesSquare, UserRound, type LucideIcon } from 'lucide-react'
import { StatusBadge } from '@/components/data-display/status-badge'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useAsyncData } from '@/hooks/use-async-data'
import { getHistoryMessage, toErrorMessage } from '@/lib/api'
import { messageStatusMeta } from '@/lib/domain/run-status'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { WorkflowHistoryMessageSummary } from '@/types'
import { POLL_MS } from '../../lib/constants'
import { StatusText } from './status-glyph'

function MessageBlock({
  icon: Icon,
  label,
  content,
  emptyLabel,
  emphasized = false,
}: {
  icon: LucideIcon
  label: string
  content: string
  emptyLabel: string
  emphasized?: boolean
}) {
  return (
    <section
      aria-label={label}
      className={cn('rounded-lg border px-3 py-3 sm:px-4', emphasized ? 'bg-accent/35' : 'bg-muted/25')}
    >
      <h3 className="flex items-center gap-2 text-xs font-semibold">
        <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
        {label}
      </h3>
      <p className="mt-2 text-body leading-6 [overflow-wrap:anywhere] break-words whitespace-pre-wrap text-foreground/90">
        {content.trim() || <span className="text-muted-foreground">{emptyLabel}</span>}
      </p>
    </section>
  )
}

/**
 * The full record, fetched only while the dialog is open (this component mounts with it). It
 * follows the reply until one is captured or the message reaches a final status, then stops.
 */
function MessageDetail({ summary, eventActive }: { summary: WorkflowHistoryMessageSummary; eventActive: boolean }) {
  const [settled, setSettled] = useState(false)
  const detail = useAsyncData((signal) => getHistoryMessage(summary.id, summary.act, signal), [summary.id, summary.act], {
    pollMs: settled ? undefined : POLL_MS.hierarchy,
    errorMessage: toErrorMessage,
  })
  const message = detail.data

  useEffect(() => {
    if (message && (message.status !== 'unknown' || message.receivedAt)) setSettled(true)
  }, [message])

  return (
    <div className="flex max-h-[calc(100dvh-10rem)] flex-col gap-3 overflow-y-auto overscroll-contain pe-1">
      {!message && !detail.error ? <LoadingState label="正在查询消息…" /> : null}
      {detail.error ? (
        <div className="flex flex-col items-start gap-2">
          <ErrorAlert inline className="w-full">
            {detail.error}
          </ErrorAlert>
          <Button size="sm" variant="secondary" onClick={() => void detail.reload()}>
            重试查询
          </Button>
        </div>
      ) : null}
      {message ? (
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-micro text-muted-foreground">
            {message.sentAt ? (
              <span className="inline-flex items-center gap-1">
                <Clock3 className="size-3" aria-hidden="true" />
                用户发送于 {formatDateTime(message.sentAt)}
              </span>
            ) : null}
            {message.receivedAt ? (
              <span className="inline-flex items-center gap-1">
                <Clock3 className="size-3" aria-hidden="true" />
                AI 回复于 {formatDateTime(message.receivedAt)}
              </span>
            ) : null}
          </div>
          <MessageBlock
            icon={UserRound}
            label="用户消息"
            content={message.userMarkdown || ''}
            emptyLabel="没有记录用户消息"
          />
          <MessageBlock
            icon={Bot}
            label="AI 回复"
            content={message.assistantMarkdown || ''}
            emptyLabel={eventActive && !message.receivedAt ? '等待 AI 回复' : '没有记录 AI 回复'}
            emphasized
          />
        </>
      ) : null}
    </div>
  )
}

/** A message summary row; its full record opens in a dialog. */
export function MessageNode({
  summary,
  index,
  actTitle,
  messageNumber,
  eventActive,
}: {
  summary: WorkflowHistoryMessageSummary
  index: number
  actTitle: string
  messageNumber: number
  eventActive: boolean
}) {
  const [open, setOpen] = useState(false)
  const messageTitle = `消息 ${messageNumber}`
  const status = messageStatusMeta(summary, eventActive)
  const timestamp = summary.receivedAt || summary.sentAt
  const waiting = eventActive && status.tone === 'warning'

  return (
    <li className="min-w-0 animate-enter" style={{ '--stagger-index': index } as React.CSSProperties}>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label={`查看${messageTitle}`}
            className="group/message flex min-h-12 w-full items-center gap-2.5 rounded-md border border-transparent bg-card px-2.5 py-2 text-left transition-colors duration-fast outline-none hover:border-border focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
              {waiting ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : <MessagesSquare className="size-3.5" aria-hidden="true" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-body font-medium">{messageTitle}</span>
              <span className="mt-0.5 block truncate text-caption text-muted-foreground tabular-nums">
                <StatusText tone={status.tone}>{status.label}</StatusText>
                {timestamp ? ` · ${formatDateTime(timestamp)}` : ''}
              </span>
            </span>
            <ChevronRight
              className="size-4 shrink-0 text-muted-foreground transition-transform duration-fast group-hover/message:translate-x-0.5"
              aria-hidden="true"
            />
          </button>
        </DialogTrigger>
        <DialogContent className="gap-4 p-4 sm:max-w-2xl sm:p-6">
          <DialogHeader>
            <DialogTitle>{messageTitle}</DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="min-w-0 truncate">{actTitle}</span>
              <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            </DialogDescription>
          </DialogHeader>
          <MessageDetail summary={summary} eventActive={eventActive} />
        </DialogContent>
      </Dialog>
    </li>
  )
}
