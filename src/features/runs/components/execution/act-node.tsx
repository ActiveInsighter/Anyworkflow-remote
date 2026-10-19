import type * as React from 'react'
import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { Pager } from '@/components/navigation/pager'
import { Button } from '@/components/ui/button'
import { actStatusMeta } from '@/lib/domain/run-status'
import type { WorkflowHistoryActRecord } from '@/types'
import { useActMessages } from '../../hooks/use-act-messages'
import { expansionKey, useNodeExpansion } from '../../hooks/use-execution-expansion'
import { RUN_HIERARCHY_PAGE_SIZE } from '../../lib/constants'
import { InlineLoading, InlineNote, MetaDot, RecordNode } from './record-node'
import { MessageNode } from './message-node'
import { StatusGlyph, StatusText } from './status-glyph'

/**
 * A persisted Act. Lists message summaries only; bodies load when a message is opened. While
 * following progress only the latest Act is open, so a long Event never polls every Act at once
 * and the open row moves along as new Acts arrive.
 */
export function ActNode({
  act,
  index,
  latest,
  eventActive,
  pollMs,
}: {
  act: WorkflowHistoryActRecord
  index: number
  latest: boolean
  eventActive: boolean
  pollMs: number
}) {
  const [page, setPage] = useState(1)
  const [open, setOpen] = useNodeExpansion(expansionKey.act(act.id), latest)
  // History writes can arrive after dispatch reports completion, so an open Act keeps refreshing.
  const messages = useActMessages(act, page, open, pollMs)
  const result = messages.data
  const title = act.title || `Act ${act.actIndex + 1}`
  const status = actStatusMeta(act.status, eventActive)
  const inFlight = eventActive && act.status === 'unknown'
  const messageCount = result?.totalItems ?? act.messageCount

  return (
    <li className="animate-enter border-b last:border-b-0" style={{ '--stagger-index': index } as React.CSSProperties}>
      <section aria-label={title}>
        <RecordNode
          level="act"
          open={open}
          onOpenChange={setOpen}
          leading={<StatusGlyph size="sm" tone={status.tone} active={inFlight} />}
          title={title}
          meta={
            <>
              <span>Act {act.actIndex + 1}</span>
              <MetaDot />
              <StatusText tone={status.tone}>{status.label}</StatusText>
              {messageCount ? (
                <>
                  <MetaDot />
                  <span>{messageCount} 条消息</span>
                </>
              ) : null}
            </>
          }
        >
          <div className="border-t bg-muted/30 px-3 pt-1 pb-2">
            <div className="flex min-h-9 items-center justify-between gap-2 text-caption text-muted-foreground">
              <span role="status">{result ? `${result.totalItems} 条消息` : '消息'}</span>
              <Button
                size="sm"
                variant="ghost"
                className="-me-2 h-7 px-2 text-caption"
                aria-label={`刷新${title}的消息`}
                disabled={messages.loading || messages.refreshing}
                onClick={() => void messages.reload()}
              >
                <RefreshCw data-icon="inline-start" className={messages.refreshing ? 'animate-spin' : undefined} />
                刷新
              </Button>
            </div>
            {messages.loading && !result ? <InlineLoading className="py-2" label="加载消息…" /> : null}
            {messages.error ? <ErrorAlert inline>消息加载失败：{messages.error}，请刷新重试。</ErrorAlert> : null}
            {result?.items.length ? (
              <ol aria-label={`${title} 的消息列表`} className="flex flex-col gap-1">
                {result.items.map((message, messageIndex) => (
                  <MessageNode
                    key={message.id}
                    summary={message}
                    index={messageIndex}
                    messageNumber={(page - 1) * RUN_HIERARCHY_PAGE_SIZE + messageIndex + 1}
                    actTitle={title}
                    eventActive={eventActive}
                  />
                ))}
              </ol>
            ) : result && !messages.error ? (
              <InlineNote className="py-3">暂无消息，新消息将在同步后自动显示。</InlineNote>
            ) : null}
            {result ? (
              <Pager
                className="mt-2 pt-2"
                label={`${title} 的消息分页`}
                page={page}
                totalPages={result.totalPages}
                onPageChange={setPage}
              />
            ) : null}
          </div>
        </RecordNode>
      </section>
    </li>
  )
}
