import { ArrowLeft, Copy, ExternalLink } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { AppPage, EmptyState, ErrorBanner, LoadingState, MetaGrid, PageHeader, SectionHeading, StatusBadge } from '@/components/app/ui'
import { Button } from '@/components/ui/button'
import { useAsyncData } from '@/hooks/useAsyncData'
import { getEvent, toErrorMessage } from '@/lib/api'
import { eventProgressLabel, eventStatusMeta, formatDateTime, terminalResultLabel } from '@/lib/format'
import { getEventTitle, parseQueue } from '@/lib/plan'

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
        title={title}
        actions={
          <>
            <Button variant="outline" asChild><Link to={'/tasks/' + event.task}><ArrowLeft />Task</Link></Button>
            <Button variant="outline" onClick={() => void copyQueue()}><Copy />复制</Button>
          </>
        }
      />

      {state.error ? <ErrorBanner>{state.error}</ErrorBanner> : null}

      <section className="rounded-lg border bg-card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm font-semibold">{terminalResultLabel(event.terminalResult)}</div>
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        </div>
        <div className="mt-4">
          <MetaGrid items={[
            { label: '尝试', value: event.attempt },
            { label: '进度', value: eventProgressLabel(event.status, event.progress) },
            { label: '电脑', value: event.workerId || '—' },
            { label: '标签页', value: event.tabId || '—' },
            { label: '心跳', value: formatDateTime(event.lastHeartbeatAt) },
            { label: '更新', value: formatDateTime(event.updated) },
          ]} />
        </div>
        {event.lastError ? <div className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive">{event.lastError}</div> : null}
      </section>

      <SectionHeading title="Queue" trailing={queue.length} />

      {queue.length ? (
        <div className="overflow-hidden rounded-lg border bg-card">
          {queue.map((item, index) => (
            <div className="grid gap-3 border-b p-4 last:border-b-0 sm:grid-cols-[44px_minmax(0,1fr)]" key={String(index) + '-' + item.type}>
              <div className="hidden size-9 place-items-center rounded-md bg-muted text-[10px] font-semibold text-muted-foreground sm:grid">
                {String(index + 1).padStart(2, '0')}
              </div>
              <div className="min-w-0">
                <div className="mb-2 text-[10px] font-medium text-muted-foreground">
                  {item.type === 'message' ? '消息' : item.type === 'url' ? '网址' : item.type === 'act' ? item.title : '队列'}
                </div>
                {item.url ? (
                  <a className="mb-2 inline-flex items-center gap-1.5 break-all text-xs text-[var(--info)] hover:underline" href={item.url} target="_blank" rel="noreferrer">
                    {item.url}<ExternalLink className="size-3" />
                  </a>
                ) : null}
                <pre className="m-0 whitespace-pre-wrap break-words font-mono text-xs leading-6 text-foreground">
                  {item.text.length > 4000 ? item.text.slice(0, 4000) + '\n…' : item.text}
                </pre>
              </div>
            </div>
          ))}
        </div>
      ) : <EmptyState title="暂无内容" />}

      <details className="mt-6 rounded-lg border bg-card">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Runtime</summary>
        <div className="border-t px-4 pb-4">
          <MetaGrid items={[
            { label: 'Lease ID', value: event.leaseId || '—' },
            { label: 'Local Run ID', value: event.localRunId || '—' },
            { label: 'Local Attempt', value: event.localAttempt || '—' },
            { label: 'Last Seq', value: event.lastSeq },
          ]} />
        </div>
      </details>
    </AppPage>
  )
}
