import { StatusBadge } from '@/components/app/ui'
import { useAsyncData } from '@/hooks/useAsyncData'
import { listAllHistoryMessagesForAct, toErrorMessage } from '@/lib/api'
import { historyStatusMeta } from '@/lib/format'
import type { deriveEventProgress } from '@/lib/event-structure'
import type { WorkflowHistoryActRecord } from '@/types'

export function HistoryActNode({ act }: { act: WorkflowHistoryActRecord }) {
  const status = historyStatusMeta(act.status)
  const messagesState = useAsyncData(
    async () => listAllHistoryMessagesForAct(act.id),
    [act.id, act.attempt],
    { enabled: true, staleMs: 8_000, cacheKey: 'history-messages:' + act.id + ':' + act.attempt, errorMessage: toErrorMessage },
  )

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex min-w-0 items-center gap-2.5 px-3 py-2.5 sm:px-4">
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-[10px] font-semibold tabular-nums text-muted-foreground">
          {act.actIndex + 1}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{act.title || `Act ${act.actIndex + 1}`}</span>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      </div>
      {messagesState.data?.length ? (
        <div className="space-y-2 px-3 pb-3 sm:px-4">
          {messagesState.data.map((message) => (
            <div key={message.id} className="rounded-md border border-border bg-muted/25 p-2.5 text-[11px] leading-5">
              <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
                <span>消息 {message.nodeIndex + 1}</span>
                {message.conversationUrl ? <span className="font-mono">线程 {message.conversationUrl}</span> : null}
              </div>
              <div className="whitespace-pre-wrap break-words text-foreground/90">{message.assistantMarkdown || message.userMarkdown}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function FallbackActNode({ act }: { act: ReturnType<typeof deriveEventProgress>['acts'][number] }) {
  const status = act.state === 'running'
    ? { label: '执行中', tone: 'warning' as const }
    : act.state === 'completed'
      ? { label: '已完成', tone: 'success' as const }
      : { label: '等待执行', tone: 'neutral' as const }

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex min-w-0 items-center gap-2.5 px-3 py-2.5 sm:px-4">
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-[10px] font-semibold tabular-nums text-muted-foreground">
          {act.id.replace('act-', '')}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{act.title}</span>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      </div>
    </div>
  )
}
