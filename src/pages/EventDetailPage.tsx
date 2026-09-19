import { ArrowLeft, Copy, ExternalLink } from 'lucide-react'
import { Link, useParams } from 'react-router'
import {
  AppPage,
  CodeBlock,
  EmptyState,
  ErrorBanner,
  InlineError,
  ListRow,
  LoadingState,
  MetaGrid,
  PageHeader,
  Panel,
  SectionHeading,
  StatusBadge,
} from '@/components/app/ui'
import { Button } from '@/components/ui/button'
import { useAsyncData } from '@/hooks/useAsyncData'
import { getEvent, toErrorMessage } from '@/lib/api'
import { eventProgressLabel, eventStatusMeta, formatDateTime, terminalResultLabel } from '@/lib/format'
import { getEventTitle, parseQueue } from '@/lib/plan'

const queueTypeLabels: Record<string, string> = {
  message: '消息',
  url: '网址',
  act: '动作',
  queue: '队列',
}

export function EventDetailPage() {
  const { eventId = '' } = useParams()
  const state = useAsyncData(
    async () => getEvent(eventId),
    [eventId],
    { enabled: Boolean(eventId), pollMs: 5000, errorMessage: toErrorMessage },
  )

  if (state.loading && !state.data) return <AppPage><LoadingState /></AppPage>
  if (state.error && !state.data) return <AppPage><ErrorBanner>{state.error}</ErrorBanner></AppPage>
  if (!state.data) return null

  const event = state.data
  const status = eventStatusMeta(event.status, event.terminalResult)
  const title = getEventTitle(event.queueTextOverride, 'Event ' + (event.eventIndex + 1))
  const queue = parseQueue(event.queueTextOverride).slice(0, 100)

  async function copyQueue() {
    await navigator.clipboard.writeText(event.queueTextOverride)
  }

  return (
    <AppPage>
      <PageHeader
        eyebrow={
          <Link to={'/tasks/' + event.task} className="outline-none hover:text-foreground focus-visible:underline">
            Task
          </Link>
        }
        title={title}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to={'/tasks/' + event.task}><ArrowLeft />返回 Task</Link>
            </Button>
            <Button variant="outline" onClick={() => void copyQueue()}><Copy />复制队列</Button>
          </>
        }
      />

      {state.error ? <ErrorBanner>{state.error}</ErrorBanner> : null}

      <Panel className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold">{terminalResultLabel(event.terminalResult)}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">终态结果</div>
          </div>
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        </div>
        <div className="mt-4">
          <MetaGrid
            columns={3}
            items={[
              { label: '尝试', value: event.attempt },
              { label: '进度', value: eventProgressLabel(event.status, event.progress) },
              { label: '电脑', value: event.workerId || '—' },
              { label: '标签页', value: event.tabId || '—' },
              { label: '心跳', value: formatDateTime(event.lastHeartbeatAt) },
              { label: '更新', value: formatDateTime(event.updated) },
            ]}
          />
        </div>
        {event.lastError ? <div className="mt-4"><InlineError>{event.lastError}</InlineError></div> : null}
      </Panel>

      <SectionHeading title="Queue" trailing={queue.length} />

      {queue.length ? (
        <Panel>
          {queue.map((item, index) => (
            <ListRow
              key={String(index) + '-' + item.type}
              className="grid gap-3 sm:grid-cols-[44px_minmax(0,1fr)] sm:gap-5"
            >
              <div className="hidden size-9 place-items-center rounded-md bg-muted text-[11px] font-semibold tabular-nums text-muted-foreground sm:grid">
                {String(index + 1).padStart(2, '0')}
              </div>
              <div className="min-w-0">
                <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">
                  {queueTypeLabels[item.type] ?? '队列'}
                </div>
                {item.url ? (
                  <a
                    className="mb-2 inline-flex max-w-full items-center gap-1.5 break-all text-xs text-info hover:underline"
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {item.url}
                    <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                  </a>
                ) : null}
                <pre className="m-0 whitespace-pre-wrap break-words font-mono text-xs leading-6 text-foreground">
                  {item.text.length > 4000 ? item.text.slice(0, 4000) + '\n…' : item.text}
                </pre>
              </div>
            </ListRow>
          ))}
        </Panel>
      ) : (
        <EmptyState title="暂无内容" description="该 Event 的队列为空。" />
      )}

      <SectionHeading title="Runtime" />

      <CodeBlock label="运行时信息">
        {[
          'Lease ID      ' + (event.leaseId || '—'),
          'Lease Until   ' + (event.leaseUntil ? formatDateTime(event.leaseUntil) : '—'),
          'Local Run ID  ' + (event.localRunId || '—'),
          'Local Attempt ' + (event.localAttempt || '—'),
          'Last Seq      ' + event.lastSeq,
          'Created       ' + formatDateTime(event.created),
        ].join('\n')}
      </CodeBlock>
    </AppPage>
  )
}
