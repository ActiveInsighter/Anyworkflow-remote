import { MessageSquareText, RefreshCw } from 'lucide-react'
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
  const messages = useAsyncData(
    (signal) => listHistoryMessageSummariesForAct(act.id, page, RUN_DETAIL_PAGE_SIZE, signal),
    [act.id, act.attempt, page],
    {
      // History writes can arrive after dispatch reports completion.
      pollMs: 5_000,
      cacheKey: `history-messages:${act.id}:${act.attempt}:${page}`,
      errorMessage: toErrorMessage,
    },
  )
  const result = messages.data
  const title = act.title || `Act ${act.actIndex + 1}`

  return (
    <section className="min-w-0 border-b border-border last:border-b-0" aria-label={title}>
      <div className="flex min-w-0 items-center gap-2 px-3 pt-4 pb-2 sm:px-5">
        <span className="text-xs font-medium tabular-nums text-muted-foreground">{act.actIndex + 1}</span>
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h3>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      </div>
      <div className="px-3 pb-3 sm:px-5">
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
            {result.items.map((message) => <HistoryMessageNode key={message.id} summary={message} actTitle={title} />)}
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
      </div>
    </section>
  )
}

export function FallbackActNode({ act }: { act: ReturnType<typeof deriveEventProgress>['acts'][number] }) {
  return (
    <section className="border-b border-border px-3 py-4 last:border-b-0 sm:px-5">
      <h3 className="text-sm font-medium">{act.title}</h3>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">暂无消息，新消息将在同步后自动显示。</p>
    </section>
  )
}
