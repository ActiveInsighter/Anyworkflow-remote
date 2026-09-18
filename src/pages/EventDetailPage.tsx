import { ArrowLeft, Copy, ExternalLink } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { AppPage, ErrorBanner, LoadingState, MetaGrid, PageHeader, SectionHeading, StatusBadge } from '@/components/app/ui'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

  if (state.loading && !state.data) return <AppPage><LoadingState label="正在读取 Event…" /></AppPage>
  if (state.error && !state.data) return <AppPage><ErrorBanner>{state.error}</ErrorBanner></AppPage>
  if (!state.data) return null

  const event = state.data
  const status = eventStatusMeta(event.status, event.terminalResult)
  const title = getEventTitle(event.queueTextOverride, `Event ${event.eventIndex + 1}`)
  const queue = parseQueue(event.queueTextOverride).slice(0, 100)

  async function copyQueue() {
    await navigator.clipboard.writeText(event.queueTextOverride)
  }

  return (
    <AppPage>
      <PageHeader
        eyebrow="Event"
        title={title}
        description="执行器接收到的队列与当前运行状态。"
        actions={
          <>
            <Button variant="outline" asChild><Link to={`/tasks/${event.task}`}><ArrowLeft />返回 Task</Link></Button>
            <Button variant="outline" onClick={() => void copyQueue()}><Copy />复制完整队列</Button>
          </>
        }
      />

      {state.error ? <ErrorBanner>{state.error}</ErrorBanner> : null}

      <Card>
        <CardHeader className="gap-4 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">执行状态</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">{terminalResultLabel(event.terminalResult)}</h2>
            </div>
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0 sm:px-5 sm:pb-5">
          <MetaGrid items={[
            { label: '尝试次数', value: event.attempt },
            { label: '当前进度', value: eventProgressLabel(event.status, event.progress) },
            { label: '执行电脑', value: event.workerId || '尚未分配' },
            { label: '标签页', value: event.tabId || '—' },
            { label: '最后心跳', value: formatDateTime(event.lastHeartbeatAt) },
            { label: '更新时间', value: formatDateTime(event.updated) },
          ]} />
          {event.lastError ? <div className="mt-4 rounded-lg bg-destructive/10 p-3 text-xs leading-5 text-destructive">{event.lastError}</div> : null}
        </CardContent>
      </Card>

      <SectionHeading eyebrow="Queue" title="执行队列" trailing={`${queue.length} 项`} />

      <div className="grid gap-2.5">
        {queue.map((item, index) => (
          <Card key={`${index}-${item.type}`} className="overflow-hidden">
            <CardHeader className="flex flex-row items-start gap-3 p-4 pb-2">
              <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-[10px] font-semibold text-muted-foreground">
                {String(index + 1).padStart(2, '0')}
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {item.type === 'message' ? '消息' : item.type === 'url' ? '网址' : item.type === 'act' ? `动作 · ${item.title}` : '原始队列'}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-1 sm:pl-[60px]">
              {item.url ? (
                <a className="mb-2 inline-flex items-center gap-1.5 break-all text-xs text-blue-600 hover:underline dark:text-blue-400" href={item.url} target="_blank" rel="noreferrer">
                  {item.url}<ExternalLink className="size-3" />
                </a>
              ) : null}
              <pre className="m-0 whitespace-pre-wrap break-words font-mono text-xs leading-6 text-foreground">{item.text.length > 4000 ? `${item.text.slice(0, 4000)}\n…` : item.text}</pre>
            </CardContent>
          </Card>
        ))}
      </div>

      {!queue.length ? <Card className="border-dashed bg-muted/20 p-5 text-center text-xs text-muted-foreground">暂无执行内容。</Card> : null}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">运行时标识</CardTitle>
        </CardHeader>
        <CardContent>
          <MetaGrid items={[
            { label: 'Lease ID', value: event.leaseId || '—' },
            { label: 'Local Run ID', value: event.localRunId || '—' },
            { label: 'Local Attempt', value: event.localAttempt || '—' },
            { label: 'Last Seq', value: event.lastSeq },
          ]} />
        </CardContent>
      </Card>
    </AppPage>
  )
}
