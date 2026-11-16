import { MessageSquare, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { Button } from '@/components/ui/button'
import { Pager } from '@/components/navigation/pager'
import { TaskStatusBadge } from '@/features/tasks'
import { geminiTextKind } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import type { GeminiJob } from '@/types/gemini'
import type { useGeminiJobs } from '../hooks/use-gemini-jobs'

export function GeminiHistory({ jobs, opened, onOpen, onDelete }: {
  jobs: ReturnType<typeof useGeminiJobs>; opened: string | null; onOpen: (id: string | null) => void; onDelete: (job: GeminiJob) => void
}) {
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    <div className="flex items-center gap-2 p-3">
      <Button variant="outline" className="flex-1 justify-start" size="touch" onClick={() => onOpen(null)}><Plus />新对话</Button>
      <Button variant="ghost" size="icon-touch" aria-label="刷新消息记录" disabled={jobs.data.refreshing} onClick={() => void jobs.data.reload()}><RefreshCw /></Button>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" aria-label="消息记录">
      <ErrorAlert>{jobs.data.error || jobs.action.error}</ErrorAlert>
      {jobs.data.loading && !jobs.data.data ? <LoadingState label="加载消息记录…" /> : null}
      {jobs.data.data?.items.length === 0 ? <div className="px-3 py-8 text-caption text-muted-foreground"><MessageSquare className="mb-3 size-5" />还没有消息记录</div> : null}
      {jobs.data.data?.items.map(job => <div key={job.id} className={cn('group flex min-w-0 items-center rounded-lg', opened === job.id ? 'bg-muted' : 'hover:bg-muted/60')}>
        <button type="button" aria-current={opened === job.id ? 'page' : undefined} onClick={() => onOpen(job.id)} className="min-h-touch min-w-0 flex-1 rounded-lg px-3 py-3 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="block truncate text-body font-medium">{job.title}</span>
          <span className="mt-1.5 flex min-w-0 items-center gap-2 text-caption text-muted-foreground"><TaskStatusBadge kind={geminiTextKind} record={job} />{job.totalChunks > 1 ? `${job.completedChunks}/${job.totalChunks} 段` : null}</span>
        </button>
        {geminiTextKind.isTerminal(job.status) ? <Button variant="ghost" size="icon-touch" className="shrink-0" aria-label={`删除 ${job.title}`} onClick={() => onDelete(job)}><Trash2 /></Button> : null}
      </div>)}
    </div>
    {jobs.data.data && jobs.data.data.totalPages > 1 ? <div className="border-t p-2"><Pager page={jobs.page} totalPages={jobs.data.data.totalPages} totalItems={jobs.data.data.totalItems} onPageChange={jobs.setPage} disabled={jobs.data.refreshing} label="消息记录分页" /></div> : null}
  </div>
}
