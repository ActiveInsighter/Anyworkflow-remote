import { Link, useParams } from 'react-router'
import { Button, Card, ErrorBanner, LoadingState, MetaGrid, PageHeader, StatusBadge } from '../components/ui'
import { getEvent, toErrorMessage } from '../lib/api'
import { eventProgressLabel, eventStatusMeta, formatDateTime, terminalResultLabel } from '../lib/format'
import { getEventTitle, parseQueue } from '../lib/plan'
import { useAsyncData } from '../hooks/useAsyncData'

export function EventDetailPage() {
  const { eventId = '' } = useParams()
  const state = useAsyncData(
    async () => getEvent(eventId),
    [eventId],
    { enabled: Boolean(eventId), pollMs: 5000, errorMessage: toErrorMessage },
  )

  if (state.loading && !state.data) return <LoadingState label="正在读取 Event…" />
  if (state.error && !state.data) return <ErrorBanner>{state.error}</ErrorBanner>
  if (!state.data) return null

  const event = state.data
  const status = eventStatusMeta(event.status, event.terminalResult)
  const title = getEventTitle(event.queueTextOverride, `Event ${event.eventIndex + 1}`)
  const queue = parseQueue(event.queueTextOverride).slice(0, 100)

  async function copyQueue() {
    await navigator.clipboard.writeText(event.queueTextOverride)
  }

  return (
    <>
      <PageHeader
        eyebrow="Event"
        title={title}
        description="执行器接收到的队列与当前运行状态。"
        actions={
          <>
            <Button variant="secondary" asChild><Link to={`/tasks/${event.task}`}>返回 Task</Link></Button>
            <Button variant="secondary" onClick={() => void copyQueue()}>复制完整队列</Button>
          </>
        }
      />

      {state.error ? <ErrorBanner>{state.error}</ErrorBanner> : null}

      <Card className="summary-card">
        <div className="summary-top">
          <div>
            <span className="eyebrow">执行状态</span>
            <h2>{terminalResultLabel(event.terminalResult)}</h2>
          </div>
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        </div>
        <MetaGrid items={[
          { label: '尝试次数', value: event.attempt },
          { label: '当前进度', value: eventProgressLabel(event.status, event.progress) },
          { label: '执行电脑', value: event.workerId || '尚未分配' },
          { label: '标签页', value: event.tabId || '—' },
          { label: '最后心跳', value: formatDateTime(event.lastHeartbeatAt) },
          { label: '更新时间', value: formatDateTime(event.updated) },
        ]} />
        {event.lastError ? <div className="inline-error">{event.lastError}</div> : null}
      </Card>

      <div className="section-bar">
        <div>
          <span className="eyebrow">Queue</span>
          <h2>执行队列</h2>
        </div>
        <span>{queue.length} 项</span>
      </div>

      <div className="queue-list">
        {queue.map((item, index) => (
          <Card className="queue-step" key={`${index}-${item.type}`}>
            <div className="queue-step-number">{String(index + 1).padStart(2, '0')}</div>
            <div className="queue-step-body">
              <span className="queue-kind">
                {item.type === 'message' ? '消息' : item.type === 'url' ? '网址' : item.type === 'act' ? `动作 · ${item.title}` : '原始队列'}
              </span>
              {item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.url}</a> : null}
              <pre>{item.text.length > 4000 ? `${item.text.slice(0, 4000)}\n…` : item.text}</pre>
            </div>
          </Card>
        ))}
      </div>

      {!queue.length ? <Card className="soft-card">暂无执行内容。</Card> : null}

      <Card className="runtime-card">
        <div>
          <span className="eyebrow">Runtime</span>
          <h2>执行标识</h2>
        </div>
        <MetaGrid items={[
          { label: 'Lease ID', value: event.leaseId || '—' },
          { label: 'Local Run ID', value: event.localRunId || '—' },
          { label: 'Local Attempt', value: event.localAttempt || '—' },
          { label: 'Last Seq', value: event.lastSeq },
        ]} />
      </Card>
    </>
  )
}
