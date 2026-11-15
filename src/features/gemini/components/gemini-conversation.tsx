import { useState } from 'react'
import { FileText, MessageSquarePlus, RefreshCw, Square } from 'lucide-react'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { Button } from '@/components/ui/button'
import { TaskStatusBadge } from '@/features/tasks'
import { useAsyncAction } from '@/hooks/use-async-action'
import { useAsyncData } from '@/hooks/use-async-data'
import { cancelGemini, getGeminiView } from '@/lib/api/gemini'
import { wakeConverter } from '@/lib/api/converter-dispatcher'
import { isAntigravity } from '@/lib/domain/gemini-agent'
import { formatDateTime } from '@/lib/format'
import { geminiTextKind, notifyTasksChanged } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { GeminiJobSettings } from './gemini-job-settings'
import { GeminiTranscript } from './gemini-transcript'
import { SegmentNavigation } from './segment-navigation'

export function GeminiConversation({ id, onNew }: { id: string; onNew?: () => void }) {
  const [selected, setSelected] = useState('')
  const view = useAsyncData((signal) => getGeminiView(id, signal), [id], {
    pollMs: (data) => data && geminiTextKind.isTerminal(data.job.status) ? 15000 : 3000,
  })
  const action = useAsyncAction()
  const job = view.data?.job
  const messages = view.data?.messages ?? []
  const opened = messages.find((message) => message.id === selected) ?? messages[0]
  const multiple = messages.length > 1

  return <section aria-label="当前消息" className="flex min-h-0 min-w-0 flex-1 flex-col">
    <header className="flex shrink-0 items-start justify-between gap-2 border-b px-4 py-4 sm:px-7">
      <div className="min-w-0">
        <h2 className="break-words text-body font-semibold sm:text-base">{job?.title || '消息对话'}</h2>
        {job ? <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-caption text-muted-foreground">
          <TaskStatusBadge kind={geminiTextKind} record={job} />
          <span className="break-all">{isAntigravity(job.model) ? 'Antigravity Agent' : job.model}</span>
          {multiple ? <span className="tabular-nums">{job.completedChunks} / {job.totalChunks} 段已保存</span> : null}
        </div> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {job ? <GeminiJobSettings job={job} /> : null}
      </div>
    </header>
    {view.error || action.error || job?.error ? <ErrorAlert className="mx-4 mt-3">{view.error || action.error || job?.error}</ErrorAlert> : null}
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden xl:flex-row">
      {multiple ? <aside className="shrink-0 border-b bg-subtle/50 p-3 xl:order-last xl:w-52 xl:overflow-y-auto xl:border-s xl:border-b-0" aria-label="消息分段">
        <div className="mb-3 hidden items-center gap-2 px-2 pt-1 text-caption font-medium text-muted-foreground xl:flex"><FileText className="size-3.5" />分段回复<span className="ms-auto tabular-nums">{messages.length}</span></div>
        <SegmentNavigation items={messages} value={opened?.id ?? ''} onChange={setSelected} compact />
      </aside> : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {job && opened ? <GeminiTranscript key={opened.id} job={job} segment={opened} /> : <div className="flex flex-1 items-center justify-center p-5">
          {view.error ? <Button variant="outline" onClick={() => void view.reload()}>重新加载消息</Button> : job && geminiTextKind.isTerminal(job.status) ? <EmptyState title="没有已保存的消息" description="查看发送设置，或发送一条新消息。" /> : <LoadingState label={job ? '等待消息就绪…' : '加载对话…'} />}
        </div>}
      </div>
    </div>
    <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t bg-subtle/40 px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-7">
      <div className="min-w-0 text-caption text-muted-foreground">
        <span>{multiple ? `第 ${opened?.index ?? 1} 段，共 ${messages.length} 段` : '消息与回复'}</span>
        {job ? <time dateTime={job.created} className="ms-3 hidden sm:inline">{formatDateTime(job.created)}</time> : null}
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="icon-touch" aria-label="刷新对话" disabled={view.refreshing} onClick={() => void view.reload()}><RefreshCw className={cn(view.refreshing && 'animate-spin motion-reduce:animate-none')} /></Button>
        {job && geminiTextKind.isActive(job.status) ? <Button type="button" variant="outline" size="touch" disabled={action.busy || job.cancelRequested} onClick={() => void action.run('cancel', async () => {
          await cancelGemini(job); wakeConverter(); notifyTasksChanged(); await view.reload()
        }, { failure: false })}><Square />{job.cancelRequested ? '结束中…' : '结束任务'}</Button> : null}
        {onNew ? <Button type="button" variant="outline" size="touch" onClick={onNew}><MessageSquarePlus />新消息</Button> : null}
      </div>
    </footer>
  </section>
}
