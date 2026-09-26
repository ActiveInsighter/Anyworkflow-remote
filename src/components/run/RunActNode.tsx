import { ChevronDown, ChevronRight, MessageSquareText, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { InlineError, LoadingState, StatusBadge } from '@/components/app/ui'
import { Button } from '@/components/ui/button'
import { HistoryMessageNode } from '@/components/run/RunMessageNode'
import { RUN_DETAIL_PAGE_SIZE } from '@/components/run/run-detail-constants'
import { useAsyncData } from '@/hooks/useAsyncData'
import { listHistoryMessageSummariesForAct, toErrorMessage } from '@/lib/api'
import { historyStatusMeta } from '@/lib/format'
import type { deriveEventProgress } from '@/lib/event-structure'
import type { WorkflowHistoryActRecord } from '@/types'

export function HistoryActNode({ act }: { act: WorkflowHistoryActRecord }) {
  const status = historyStatusMeta(act.status)
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState(true)
  const messages = useAsyncData(
    (signal) => listHistoryMessageSummariesForAct(act.id, page, RUN_DETAIL_PAGE_SIZE, signal),
    [act.id, act.attempt, page],
    {
      // History writes can arrive after dispatch reports completion.
      enabled: open,
      pollMs: open ? 5_000 : undefined,
      cacheKey: `history-messages:${act.id}:${act.attempt}:${page}`,
      errorMessage: toErrorMessage,
    },
  )
  const result = messages.data
  const title = act.title || `Act ${act.actIndex + 1}`

  return (
    <section className="min-w-0 border-b border-border last:border-b-0" aria-label={title}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex min-h-14 w-full items-center gap-2 rounded-md px-2 py-3 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {open ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />}
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-medium text-muted-foreground">Act {act.actIndex + 1}</span>
          <span className="mt-0.5 block truncate text-sm font-medium">{title}</span>
        </span>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      </button>
      {open ? <div className="px-2 pb-2">
        <div className="flex min-h-10 items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2" role="status">
            <MessageSquareText className="size-3.5" />
            {result ? `${result.totalItems} 条消息` : '消息'}
          </span>
          <Button type="button" size="sm" variant="ghost" aria-label={`刷新${title}的消息`} disabled={messages.loading || messages.refreshing} onClick={() => void messages.reload()}>
            <RefreshCw className="size-3.5" />刷新
          </Button>
        </div>
        {messages.loading && !result ? <LoadingState label="加载消息…" /> : null}
        {messages.error ? <InlineError>消息加载失败：{messages.error}，请刷新重试。</InlineError> : null}
        {result?.items.length ? (
          <ol aria-label={`${title} 的消息列表`} className="divide-y divide-border">
            {result.items.map((message, index) => <HistoryMessageNode key={message.id} summary={message} messageNumber={(page - 1) * RUN_DETAIL_PAGE_SIZE + index + 1} actTitle={title} />)}
          </ol>
        ) : result && !messages.error ? (
          <p role="status" className="py-5 text-sm text-muted-foreground">暂无消息，新消息将在同步后自动显示。</p>
        ) : null}
        {result && result.totalPages > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
            <span>第 {page} / {result.totalPages} 页</span>
            <span className="flex gap-1">
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</Button>
              <Button size="sm" variant="ghost" disabled={page >= result.totalPages} onClick={() => setPage((value) => value + 1)}>下一页</Button>
            </span>
          </div>
        ) : null}
      </div> : null}
    </section>
  )
}

export function FallbackActNode({ act }: { act: ReturnType<typeof deriveEventProgress>['acts'][number] }) {
  return (
    <section className="border-b border-border px-2 py-3 last:border-b-0">
      <p className="text-[11px] text-muted-foreground">Act {act.id.replace('act-', '')}</p>
      <h3 className="mt-1 text-sm font-medium">{act.title}</h3>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">暂无消息，新消息将在同步后自动显示。</p>
    </section>
  )
}
