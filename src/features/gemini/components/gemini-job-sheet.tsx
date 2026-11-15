import { useState } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw, Square } from 'lucide-react'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { Button } from '@/components/ui/button'
import { Modal, ModalContent, ModalHeader, ModalTag, ModalTags, ModalTitle, ModalToolbar } from '@/components/ui/modal'
import { TaskStatusBadge } from '@/features/tasks'
import { useAsyncAction } from '@/hooks/use-async-action'
import { useAsyncData } from '@/hooks/use-async-data'
import { cancelGemini, getGeminiView } from '@/lib/api/gemini'
import { wakeConverter } from '@/lib/api/converter-dispatcher'
import { geminiTextKind, notifyTasksChanged } from '@/lib/tasks'
import { GeminiJobSettings } from './gemini-job-settings'
import { GeminiTranscript } from './gemini-transcript'
import { SegmentNavigation } from './segment-navigation'

export function GeminiJobSheet({ jobId, onClose }: { jobId: string | null; onClose: () => void }) {
  return <Modal open={Boolean(jobId)} onOpenChange={(open) => { if (!open) onClose() }}>
    <ModalContent size="lg" height="var(--message-dialog-height)">
      {jobId ? <JobContents key={jobId} id={jobId} /> : <ModalHeader><ModalTitle>消息对话</ModalTitle></ModalHeader>}
    </ModalContent>
  </Modal>
}

function JobContents({ id }: { id: string }) {
  const [selected, setSelected] = useState('')
  const view = useAsyncData((signal) => getGeminiView(id, signal), [id], {
    pollMs: (data) => data && geminiTextKind.isTerminal(data.job.status) ? 15000 : 3000,
  })
  const action = useAsyncAction()
  const job = view.data?.job
  const messages = view.data?.messages ?? []
  const openedIndex = Math.max(0, messages.findIndex((message) => message.id === selected))
  const opened = messages[openedIndex] ?? messages[0]
  const multiple = messages.length > 1
  const prevSegment = openedIndex > 0 ? messages[openedIndex - 1] : null
  const nextSegment = openedIndex < messages.length - 1 ? messages[openedIndex + 1] : null
  return <>
    <ModalHeader>
      <ModalTitle>{job?.title || '消息对话'}</ModalTitle>
      {job ? <ModalTags>
        <TaskStatusBadge kind={geminiTextKind} record={job} />
        {multiple ? <ModalTag>{job.completedChunks} / {job.totalChunks} 段已保存</ModalTag> : null}
      </ModalTags> : null}
      <ModalToolbar>{job ? <GeminiJobSettings job={job} /> : null}</ModalToolbar>
    </ModalHeader>
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:flex-row">
      {multiple ? <aside className="shrink-0 border-b bg-subtle p-3 md:w-60 md:overflow-y-auto md:border-e md:border-b-0" aria-label="消息分段">
        <SegmentNavigation items={messages} value={opened?.id ?? ''} onChange={setSelected} />
      </aside> : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {view.error || action.error ? <ErrorAlert className="mx-4 mt-3">{view.error || action.error}</ErrorAlert> : null}
        {job && opened ? <GeminiTranscript key={opened.id} job={job} segment={opened} /> : <div className="p-5">
          {view.error ? <Button variant="outline" onClick={() => void view.reload()}>重新加载消息</Button> : <LoadingState label="加载对话…" />}
        </div>}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t bg-subtle/60 px-4 py-2">
          {multiple ? (
            <div className="flex min-w-0 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-touch"
                className="sm:size-8"
                aria-label="上一段"
                disabled={!prevSegment}
                onClick={() => prevSegment && setSelected(prevSegment.id)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="truncate px-1 text-caption font-medium text-muted-foreground tabular-nums">
                第 {opened?.index ?? 1} / {messages.length} 段
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-touch"
                className="sm:size-8"
                aria-label="下一段"
                disabled={!nextSegment}
                onClick={() => nextSegment && setSelected(nextSegment.id)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          ) : (
            <span className="truncate text-caption text-muted-foreground">消息与回复</span>
          )}
          <div className="flex items-center gap-1.5">
            <Button type="button" variant="ghost" size="icon-touch" className="sm:size-8" aria-label="刷新对话" disabled={view.refreshing} onClick={() => void view.reload()}><RefreshCw className="size-4" /></Button>
            {job && geminiTextKind.isActive(job.status) ? <Button type="button" variant="outline" size="sm" disabled={action.busy} onClick={() => void action.run('cancel', async () => {
              await cancelGemini(job); wakeConverter(); notifyTasksChanged(); await view.reload()
            }, { failure: false })}><Square />结束任务</Button> : null}
          </div>
        </div>
      </div>
    </div>
  </>
}
