import { useState } from 'react'
import { MessageSquareText, RefreshCw } from 'lucide-react'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { Pager } from '@/components/navigation/pager'
import { Button } from '@/components/ui/button'
import { useAsyncData } from '@/hooks/use-async-data'
import { listHistoryMessageSummariesForAct, toErrorMessage } from '@/lib/api'
import type { deriveEventProgress } from '@/lib/domain/event-structure'
import { historyStatusMeta } from '@/lib/domain/run-status'
import type { WorkflowHistoryActRecord } from '@/types'
import { POLL_MS, RUN_HIERARCHY_PAGE_SIZE } from '../../lib/constants'
import { runKeys } from '../../lib/query-keys'
import { HierarchyNode } from './hierarchy-node'
import { HistoryMessageNode } from './message-node'

const EMPTY_MESSAGES = '暂无消息，新消息将在同步后自动显示。'

/** A persisted Act. Lists message summaries only; bodies load when a message is opened. */
export function HistoryActNode({ act }: { act: WorkflowHistoryActRecord }) {
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState(true)
  const messages = useAsyncData(
    (signal) => listHistoryMessageSummariesForAct(act.id, page, RUN_HIERARCHY_PAGE_SIZE, signal),
    [act.id, act.attempt, page],
    {
      // History writes can arrive after dispatch reports completion.
      enabled: open,
      pollMs: open ? POLL_MS.hierarchy : undefined,
      cacheKey: runKeys.historyMessages(act.id, act.attempt, page),
      errorMessage: toErrorMessage,
    },
  )
  const result = messages.data
  const title = act.title || `Act ${act.actIndex + 1}`

  return (
    <section aria-label={title}>
      <HierarchyNode
        size="sm"
        open={open}
        onOpenChange={setOpen}
        eyebrow={`Act ${act.actIndex + 1}`}
        title={title}
        status={historyStatusMeta(act.status)}
      >
        <div className="px-2 pb-2">
          <div className="flex min-h-10 items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2" role="status">
              <MessageSquareText className="size-3.5" aria-hidden="true" />
              {result ? `${result.totalItems} 条消息` : '消息'}
            </span>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`刷新${title}的消息`}
              disabled={messages.loading || messages.refreshing}
              onClick={() => void messages.reload()}
            >
              <RefreshCw data-icon="inline-start" className={messages.refreshing ? 'animate-spin' : undefined} />
              刷新
            </Button>
          </div>
          {messages.loading && !result ? <LoadingState label="加载消息…" /> : null}
          {messages.error ? <ErrorAlert inline>消息加载失败：{messages.error}，请刷新重试。</ErrorAlert> : null}
          {result?.items.length ? (
            <ol aria-label={`${title} 的消息列表`} className="divide-y">
              {result.items.map((message, index) => (
                <HistoryMessageNode
                  key={message.id}
                  summary={message}
                  messageNumber={(page - 1) * RUN_HIERARCHY_PAGE_SIZE + index + 1}
                  actTitle={title}
                />
              ))}
            </ol>
          ) : result && !messages.error ? (
            <p role="status" className="py-5 text-sm text-muted-foreground">
              {EMPTY_MESSAGES}
            </p>
          ) : null}
          {result ? (
            <Pager
              className="mt-1 pt-2"
              label={`${title} 的消息分页`}
              page={page}
              totalPages={result.totalPages}
              onPageChange={setPage}
            />
          ) : null}
        </div>
      </HierarchyNode>
    </section>
  )
}

/** An Act declared in the queue text with no persisted history yet. Never clickable. */
export function FallbackActNode({ act }: { act: ReturnType<typeof deriveEventProgress>['acts'][number] }) {
  return (
    <section className="px-2 py-3">
      <p className="text-caption text-muted-foreground">Act {act.id.replace('act-', '')}</p>
      <h3 className="mt-1 text-sm font-medium">{act.title}</h3>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{EMPTY_MESSAGES}</p>
    </section>
  )
}
