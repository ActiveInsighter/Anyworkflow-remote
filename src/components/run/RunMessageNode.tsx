import { Bot, Clock3, MessageSquareText, UserRound } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { InlineError, LoadingState, StatusBadge } from '@/components/app/ui'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAsyncData } from '@/hooks/useAsyncData'
import { getHistoryMessageForAct, toErrorMessage } from '@/lib/api'
import { formatDateTime, historyStatusMeta } from '@/lib/format'
import { cn } from '@/lib/utils'

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
        emphasized ? 'border-primary/20 bg-primary/[0.035]' : 'border-border bg-muted/25',
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

export function HistoryMessageNode({
  actId,
  actTitle,
  nodeIndex,
}: {
  actId: string
  actTitle: string
  nodeIndex: number
}) {
  const [open, setOpen] = useState(false)
  const [queryResolved, setQueryResolved] = useState(false)
  const messageState = useAsyncData(
    async (signal) => {
      try {
        return await getHistoryMessageForAct(actId, nodeIndex, signal)
      } finally {
        if (!signal.aborted) setQueryResolved(true)
      }
    },
    [actId, nodeIndex],
    { enabled: open, errorMessage: toErrorMessage },
  )
  const message = messageState.data
  const status = message ? historyStatusMeta(message.status) : null
  const loadingMessage = messageState.loading || (open && !queryResolved && !messageState.error)

  function openMessage() {
    setQueryResolved(false)
    setOpen(true)
  }

  function changeOpen(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) setQueryResolved(false)
  }

  return (
    <li className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted/70 text-muted-foreground">
          <MessageSquareText className="size-3.5" />
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-medium">消息 {nodeIndex + 1}</span>
          <span className="block truncate text-[10px] text-muted-foreground">用户消息与 AI 回复</span>
        </span>
      </div>

      <Button
        type="button"
        size="sm"
        variant="outline"
        className="min-h-10 sm:min-h-9"
        aria-label={`查看消息 ${nodeIndex + 1}`}
        aria-haspopup="dialog"
        onClick={openMessage}
      >
        <MessageSquareText />查看消息
      </Button>

      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="max-w-2xl gap-4 p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base">消息 {nodeIndex + 1}</DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="min-w-0 truncate">{actTitle}</span>
              {status ? <StatusBadge tone={status.tone}>{status.label}</StatusBadge> : null}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[calc(100dvh-10rem)] space-y-3 overflow-y-auto overscroll-contain pe-1">
            {loadingMessage ? <LoadingState label="正在查询消息…" /> : null}
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
                  content={message.userMarkdown}
                  emptyLabel="没有记录用户消息"
                />
                <MessageBlock
                  icon={Bot}
                  label="AI 回复"
                  content={message.assistantMarkdown}
                  emptyLabel={message.status === 'unknown' ? '等待 AI 回复' : '没有记录 AI 回复'}
                  emphasized
                />
              </>
            ) : null}
            {queryResolved && !messageState.loading && !messageState.error && !message ? (
              <div role="status" className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                暂时没有找到这条消息记录
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </li>
  )
}
