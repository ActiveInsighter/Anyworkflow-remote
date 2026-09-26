import { Bot, ChevronRight, Clock3, UserRound } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { InlineError, LoadingState, StatusBadge } from '@/components/app/ui'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useAsyncData } from '@/hooks/useAsyncData'
import { getHistoryMessage, toErrorMessage } from '@/lib/api'
import { formatDateTime, historyStatusMeta } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { WorkflowHistoryMessageSummary } from '@/types'

interface MessageBlockProps {
  icon: LucideIcon
  label: string
  content: string
  emptyLabel: string
  emphasized?: boolean
}

function MessageBlock({ icon: Icon, label, content, emptyLabel, emphasized = false }: MessageBlockProps) {
  return (
    <section
      aria-label={label}
      className={cn(
        'rounded-lg border px-3 py-3 sm:px-4',
        emphasized ? 'border-border bg-accent/35' : 'border-border bg-muted/25',
      )}
    >
      <h3 className="flex items-center gap-2 text-xs font-semibold">
        <Icon className="size-4 text-muted-foreground" />{label}
      </h3>
      <p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-6 text-foreground/90 [overflow-wrap:anywhere]">
        {content.trim() || <span className="text-muted-foreground">{emptyLabel}</span>}
      </p>
    </section>
  )
}

export function HistoryMessageNode({ summary, actTitle }: {
  summary: WorkflowHistoryMessageSummary
  actTitle: string
}) {
  const [open, setOpen] = useState(false)
  const messageTitle = `消息 ${summary.nodeIndex + 1}`
  const messageState = useAsyncData(
    (signal) => getHistoryMessage(summary.id, summary.act, signal),
    [summary.id, summary.act],
    { enabled: open, pollMs: 5_000, errorMessage: toErrorMessage },
  )
  const message = messageState.data
  const status = historyStatusMeta(message?.status ?? summary.status)
  const received = Boolean(summary.receivedAt)

  return (
    <li className="min-w-0">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button type="button" aria-label={`查看${messageTitle}`} className="group flex min-h-16 w-full items-center gap-3 rounded-md px-2 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
              <Bot className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{messageTitle}</span>
              <span className="mt-1 block truncate text-xs text-muted-foreground">
                {received ? '已收到回复' : '查看对话'}{summary.receivedAt || summary.sentAt ? ` · ${formatDateTime(summary.receivedAt || summary.sentAt)}` : ''}
              </span>
            </span>
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl gap-4 p-4 sm:p-6 [&>button]:size-11 [&>button]:right-1 [&>button]:top-1">
          <DialogHeader>
            <DialogTitle className="text-base">{messageTitle}</DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="min-w-0 truncate">{actTitle}</span>
              {status ? <StatusBadge tone={status.tone}>{status.label}</StatusBadge> : null}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[calc(100dvh-10rem)] space-y-3 overflow-y-auto overscroll-contain pe-1">
            {!message && !messageState.error ? <LoadingState label="正在查询消息…" /> : null}
            {messageState.error ? (
              <div className="grid gap-2">
                <InlineError>{messageState.error}</InlineError>
                <Button type="button" size="sm" variant="secondary" className="justify-self-start" onClick={() => void messageState.reload()}>
                  重试查询
                </Button>
              </div>
            ) : null}
            {message ? (
              <>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                  {message.sentAt ? (
                    <span className="inline-flex items-center gap-1"><Clock3 className="size-3" />用户发送于 {formatDateTime(message.sentAt)}</span>
                  ) : null}
                  {message.receivedAt ? (
                    <span className="inline-flex items-center gap-1"><Clock3 className="size-3" />AI 回复于 {formatDateTime(message.receivedAt)}</span>
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
                  emptyLabel={message.status === 'unknown' ? '等待 AI 回复' : '没有记录 AI 回复'}
                  emphasized
                />
              </>
            ) : null}

          </div>
        </DialogContent>
      </Dialog>
    </li>
  )
}
