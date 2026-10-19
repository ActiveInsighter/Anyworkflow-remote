import { useState } from 'react'
import { MessageSquareText, RefreshCw } from 'lucide-react'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { Pager } from '@/components/navigation/pager'
import { Button } from '@/components/ui/button'
import { actStatusMeta } from '@/lib/domain/run-status'
import type { WorkflowHistoryActRecord } from '@/types'
import { useActMessages } from '../../hooks/use-act-messages'
import { RUN_HIERARCHY_PAGE_SIZE } from '../../lib/constants'
import { InlineLoading, InlineNote, RecordNode } from './record-node'
import { MessageNode } from './message-node'

/**
 * A persisted Act. Lists message summaries only; bodies load when a message is opened.
 * `defaultOpen` picks which Acts start expanded, so a long Event does not poll every Act at once.
 */
export function ActNode({
  act,
  defaultOpen,
  eventActive,
  pollMs,
}: {
  act: WorkflowHistoryActRecord
  defaultOpen: boolean
  eventActive: boolean
  pollMs: number
}) {
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState(defaultOpen)
  // History writes can arrive after dispatch reports completion, so an open Act keeps refreshing.
  const messages = useActMessages(act, page, open, pollMs)
  const result = messages.data
  const title = act.title || `Act ${act.actIndex + 1}`

  return (
    <section aria-label={title}>
      <RecordNode
        size="sm"
        open={open}
        onOpenChange={setOpen}
        eyebrow={`Act ${act.actIndex + 1}`}
        title={title}
        status={actStatusMeta(act.status, eventActive)}
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
          {messages.loading && !result ? <InlineLoading label="加载消息…" /> : null}
          {messages.error ? <ErrorAlert inline>消息加载失败：{messages.error}，请刷新重试。</ErrorAlert> : null}
          {result?.items.length ? (
            <ol aria-label={`${title} 的消息列表`} className="divide-y">
              {result.items.map((message, index) => (
                <MessageNode
                  key={message.id}
                  summary={message}
                  messageNumber={(page - 1) * RUN_HIERARCHY_PAGE_SIZE + index + 1}
                  actTitle={title}
                  eventActive={eventActive}
                />
              ))}
            </ol>
          ) : result && !messages.error ? (
            <InlineNote className="py-5 text-sm">暂无消息，新消息将在同步后自动显示。</InlineNote>
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
      </RecordNode>
    </section>
  )
}
