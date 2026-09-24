import { MessageSquareText } from 'lucide-react'
import { useState } from 'react'
import { StatusBadge } from '@/components/app/ui'
import { Button } from '@/components/ui/button'
import { HistoryMessageNode } from '@/components/run/RunMessageNode'
import { RUN_DETAIL_PAGE_SIZE } from '@/components/run/run-detail-constants'
import { historyStatusMeta } from '@/lib/format'
import type { deriveEventProgress } from '@/lib/event-structure'
import type { DispatchEventRecord, WorkflowHistoryActRecord } from '@/types'

const MAX_VISIBLE_MESSAGES_PER_ACT = 1_000

function safeMessageCount(value: number): number {
  return Number.isSafeInteger(value) && value > 0
    ? Math.min(value, MAX_VISIBLE_MESSAGES_PER_ACT)
    : 0
}

export function HistoryActNode({ act }: { act: WorkflowHistoryActRecord }) {
  const status = historyStatusMeta(act.status)
  const messageCount = safeMessageCount(act.messageCount)
  const [messagePage, setMessagePage] = useState(1)
  const pageSize = RUN_DETAIL_PAGE_SIZE
  const totalPages = Math.max(1, Math.ceil(messageCount / pageSize))
  const currentPage = Math.min(messagePage, totalPages)
  const firstMessageIndex = (currentPage - 1) * pageSize
  const visibleMessageCount = Math.min(pageSize, messageCount - firstMessageIndex)

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex min-w-0 items-center gap-2.5 px-3 py-2.5 sm:px-4">
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-[10px] font-semibold tabular-nums text-muted-foreground">
          {act.actIndex + 1}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{act.title || `Act ${act.actIndex + 1}`}</span>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      </div>

      <div className="ms-8 mb-3 border-s border-border ps-3 sm:ms-10 sm:ps-4">
        <div className="flex items-center justify-between gap-3 py-1 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <MessageSquareText className="size-3.5" />消息
          </span>
          <span className="tabular-nums">{messageCount} 条</span>
        </div>

        <ol aria-label={`${act.title || `Act ${act.actIndex + 1}`} 的消息列表`} className="divide-y divide-border/70">
          {Array.from({ length: messageCount > 0 ? visibleMessageCount : 1 }, (_, offset) => {
            const nodeIndex = messageCount > 0 ? firstMessageIndex + offset : null
            return (
              <HistoryMessageNode
                key={`${act.id}:${act.attempt}:${nodeIndex ?? 'first'}`}
                actId={act.id}
                actTitle={act.title || `Act ${act.actIndex + 1}`}
                nodeIndex={nodeIndex}
              />
            )
          })}
        </ol>

        {totalPages > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 py-2 text-[10px] text-muted-foreground">
            <span>消息 {firstMessageIndex + 1}–{firstMessageIndex + visibleMessageCount} / {messageCount}</span>
            <span className="flex items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="min-h-10 sm:min-h-9"
                aria-label="上一页消息"
                disabled={currentPage <= 1}
                onClick={() => setMessagePage((value) => Math.max(1, value - 1))}
              >
                上一页
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="min-h-10 sm:min-h-9"
                aria-label="下一页消息"
                disabled={currentPage >= totalPages}
                onClick={() => setMessagePage((value) => Math.min(totalPages, value + 1))}
              >
                下一页
              </Button>
            </span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function FallbackActNode({ act, event }: {
  act: ReturnType<typeof deriveEventProgress>['acts'][number]
  event: DispatchEventRecord
}) {
  const status = act.state === 'running'
    ? { label: '执行中', tone: 'warning' as const }
    : act.state === 'completed'
      ? { label: '已完成', tone: 'success' as const }
      : { label: '等待执行', tone: 'neutral' as const }
  const messageCount = safeMessageCount(act.messageCount)
  const [messagePage, setMessagePage] = useState(1)
  const pageSize = RUN_DETAIL_PAGE_SIZE
  const totalPages = Math.max(1, Math.ceil(messageCount / pageSize))
  const currentPage = Math.min(messagePage, totalPages)
  const firstMessageIndex = (currentPage - 1) * pageSize
  const visibleMessageCount = Math.min(pageSize, messageCount - firstMessageIndex)
  const parsedActIndex = Number(act.id.replace(/^act-/u, '')) - 1
  const historyActIndex = Number.isSafeInteger(parsedActIndex) && parsedActIndex >= 0 ? parsedActIndex : 0

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex min-w-0 items-center gap-2.5 px-3 py-2.5 sm:px-4">
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-[10px] font-semibold tabular-nums text-muted-foreground">
          {act.id.replace('act-', '')}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{act.title}</span>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      </div>

      <div className="ms-8 mb-3 border-s border-border ps-3 sm:ms-10 sm:ps-4">
        <div className="flex items-center justify-between gap-3 py-1 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <MessageSquareText className="size-3.5" />消息
          </span>
          <span className="tabular-nums">{messageCount} 条</span>
        </div>

        {messageCount > 0 ? (
          <ol aria-label={`${act.title} 的消息列表`} className="divide-y divide-border/70">
            {Array.from({ length: visibleMessageCount }, (_, offset) => {
              const nodeIndex = firstMessageIndex + offset
              return (
                <HistoryMessageNode
                  key={`${event.id}:${act.id}:${nodeIndex}`}
                  actTitle={act.title}
                  nodeIndex={nodeIndex}
                  dispatchEvent={event}
                  actIndex={historyActIndex}
                />
              )
            })}
          </ol>
        ) : (
          <p className="py-2 text-[11px] text-muted-foreground">该 Act 暂无消息节点</p>
        )}

        {totalPages > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 py-2 text-[10px] text-muted-foreground">
            <span>消息 {firstMessageIndex + 1}–{firstMessageIndex + visibleMessageCount} / {messageCount}</span>
            <span className="flex items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="min-h-10 sm:min-h-9"
                aria-label="上一页消息"
                disabled={currentPage <= 1}
                onClick={() => setMessagePage((value) => Math.max(1, value - 1))}
              >
                上一页
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="min-h-10 sm:min-h-9"
                aria-label="下一页消息"
                disabled={currentPage >= totalPages}
                onClick={() => setMessagePage((value) => Math.min(totalPages, value + 1))}
              >
                下一页
              </Button>
            </span>
          </div>
        ) : null}
      </div>
    </div>
  )
}
