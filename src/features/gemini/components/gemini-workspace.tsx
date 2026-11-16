import { useCallback, useState } from 'react'
import { AssistantRuntimeProvider } from '@assistant-ui/react'
import { useSearchParams } from 'react-router'
import { History, Plus, RefreshCw, Square } from 'lucide-react'
import { ConfirmDeleteDialog } from '@/components/feedback/confirm-dialog'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { Button } from '@/components/ui/button'
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalTrigger } from '@/components/ui/modal'
import { useAsyncData } from '@/hooks/use-async-data'
import { cancelGemini, getGeminiConfig, getGeminiView } from '@/lib/api/gemini'
import { wakeConverter } from '@/lib/api/converter-dispatcher'
import { geminiTextKind, notifyTasksChanged } from '@/lib/tasks'
import { ModelManagerButton } from '@/features/models/components/saved-model-select'
import { TaskStatusBadge } from '@/features/tasks'
import type { GeminiJob } from '@/types/gemini'
import { useGeminiJobs } from '../hooks/use-gemini-jobs'
import { useGeminiComposer } from '../hooks/use-gemini-composer'
import { useGeminiThread } from '../hooks/use-gemini-thread'
import { GeminiConfigSheet } from './gemini-config-sheet'
import { GeminiComposer } from './gemini-composer'
import { GeminiHistory } from './gemini-history'
import { GeminiJobSettings } from './gemini-job-settings'
import { SegmentNavigation } from './segment-navigation'
import { AssistantThread } from './assistant-thread'

export function GeminiWorkspace() {
  const jobs = useGeminiJobs()
  const config = useAsyncData(getGeminiConfig, [])
  const [params, setParams] = useSearchParams()
  const opened = params.get('job')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [deleting, setDeleting] = useState<GeminiJob | null>(null)
  const [draftKey, setDraftKey] = useState(0)
  function open(id: string | null) {
    setParams(current => { const next = new URLSearchParams(current); if (id) next.set('job', id); else next.delete('job'); return next }, { replace: true })
    setHistoryOpen(false)
    if (opened === id) setDraftKey(key => key + 1)
  }
  return <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-background" data-testid="gemini-workspace">
    <aside className="hidden w-64 shrink-0 flex-col border-e bg-muted/15 xl:flex" aria-label="对话历史">
      <div className="px-5 pt-5 pb-2 text-caption font-medium text-muted-foreground">Gemini 消息</div>
      <GeminiHistory jobs={jobs} opened={opened} onOpen={open} onDelete={setDeleting} />
    </aside>
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex min-h-16 shrink-0 items-center justify-between gap-2 border-b px-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <Modal open={historyOpen} onOpenChange={setHistoryOpen}>
            <ModalTrigger render={<Button variant="ghost" size="icon-touch" className="xl:hidden" aria-label="打开对话历史" />}><History /></ModalTrigger>
            <ModalContent size="sm" height="var(--message-dialog-height)"><ModalHeader><ModalTitle>对话历史</ModalTitle></ModalHeader>
              <GeminiHistory jobs={jobs} opened={opened} onOpen={open} onDelete={setDeleting} />
            </ModalContent>
          </Modal>
          <h1 className="truncate text-body font-semibold">Gemini 消息</h1>
          <Button variant="ghost" size="icon-touch" aria-label="新对话" onClick={() => open(null)}><Plus /></Button>
        </div>
        <div className="flex shrink-0 items-center gap-1"><ModelManagerButton /><GeminiConfigSheet config={config} /></div>
      </header>
      <Conversation key={`${opened || 'new'}-${draftKey}`} id={opened} config={config} jobs={jobs} />
    </div>
    <ConfirmDeleteDialog open={Boolean(deleting)} onOpenChange={value => { if (!value) setDeleting(null) }} title="删除消息"
      description={`删除「${deleting?.title ?? ''}」及其全部回复？`} busy={jobs.action.busy}
      onConfirm={() => { if (deleting) void jobs.remove(deleting).then(done => { if (done) { if (opened === deleting.id) open(null); setDeleting(null) } }) }} />
  </div>
}
function Conversation({ id, config, jobs }: {
  id: string | null; config: ReturnType<typeof useAsyncData<import('@/types/gemini').GeminiConfigRecord>>; jobs: ReturnType<typeof useGeminiJobs>
}) {
  const composer = useGeminiComposer(jobs, config.data?.config ?? null)
  const onSend = useCallback(async (text: string, parentMessage?: string) => { await composer.send(text, parentMessage) }, [composer.send])
  const onCancel = useCallback(async () => {
    if (!id) return
    const view = await getGeminiView(id)
    await cancelGemini(view.job); wakeConverter(); notifyTasksChanged(); await jobs.data.reload()
  }, [id, jobs.data.reload])
  const thread = useGeminiThread(id, onSend, onCancel)
  const { job, segment, view, detail } = thread
  return <AssistantRuntimeProvider runtime={thread.runtime}>
    {job ? <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-2 sm:px-8">
      <div className="min-w-0"><h2 className="truncate text-body font-medium">{job.title}</h2><div className="mt-1 flex flex-wrap items-center gap-2 text-caption text-muted-foreground"><TaskStatusBadge kind={geminiTextKind} record={job} /><span className="truncate">{job.options.agent?.model ?? job.model}</span></div></div>
      <div className="flex shrink-0"><GeminiJobSettings job={job} /><Button variant="ghost" size="icon-touch" aria-label="刷新对话" onClick={() => { void view.reload(); void detail.reload() }}><RefreshCw /></Button>
        {thread.pending ? <Button variant="outline" size="sm" disabled={jobs.action.busy || job.cancelRequested} onClick={() => jobs.cancel(job)}><Square />结束任务</Button> : null}</div>
    </div> : null}
    {(view.data?.messages.length ?? 0) > 1 ? <div className="max-h-40 shrink-0 overflow-auto border-y px-4 py-2">
      <SegmentNavigation compact items={view.data!.messages} value={segment?.id ?? ''} onChange={thread.setSelected} />
    </div> : null}
    <div className="shrink-0 px-4"><ErrorAlert>{config.error || view.error || detail.error}</ErrorAlert>
      {config.error ? <Button variant="outline" onClick={() => void config.reload()}>重新加载消息配置</Button> : null}
      {view.error || detail.error ? <Button variant="outline" onClick={() => { void view.reload(); void detail.reload() }}>重新加载对话</Button> : null}
    </div>
    {id && (view.loading || detail.loading) && !detail.data ? <LoadingState label="加载对话…" /> : <AssistantThread />}
    <div className="mx-auto w-full max-w-3xl shrink-0 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
      <GeminiComposer state={composer} config={config.data?.config ?? null} error={jobs.creating.error} blocked={thread.pending || Boolean(id && (!detail.data?.reply || detail.data.id !== segment?.id))} />
      <p className="mt-2 text-center text-caption text-muted-foreground">{thread.pending ? '正在处理，完成后显示完整回复' : job && detail.data?.reply ? '继续提问将携带当前分段的对话上文' : 'Enter 发送 · Shift + Enter 换行'}</p>
    </div>
  </AssistantRuntimeProvider>
}
