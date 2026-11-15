import { useState } from 'react'
import { FileText, MessageSquare, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { SearchField } from '@/components/form/search-field'
import { Pager } from '@/components/navigation/pager'
import { Button } from '@/components/ui/button'
import { DropdownMenuGroup, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { JobMenu, TaskStatusBadge } from '@/features/tasks'
import { formatDateTime, formatShortDate } from '@/lib/format'
import { geminiTextKind } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import type { GeminiJob } from '@/types/gemini'
import type { useGeminiJobs } from '../hooks/use-gemini-jobs'

export function GeminiHistory({ jobs, opened, onOpen, onNew, onDelete }: {
  jobs: ReturnType<typeof useGeminiJobs>
  opened: string | null
  onOpen: (id: string) => void
  onNew: () => void
  onDelete: (job: GeminiJob) => void
}) {
  const [query, setQuery] = useState('')
  const items = jobs.data.data?.items ?? []
  const matches = items.filter((job) => `${job.title} ${job.prompt} ${job.model}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))

  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex shrink-0 flex-col gap-4 p-4">
      <Button type="button" variant="outline" size="touch" className="w-full justify-start" onClick={onNew}><Plus />新消息</Button>
      <SearchField value={query} onValueChange={setQuery} label="搜索本页消息" size="touch" />
    </div>
    <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-2">
      <h2 className="text-caption font-medium text-muted-foreground">消息记录{jobs.data.data ? <span className="ms-2 tabular-nums">{jobs.data.data.totalItems}</span> : null}</h2>
      <Button type="button" variant="ghost" size="icon-touch" aria-label="刷新消息记录" disabled={jobs.data.refreshing} onClick={() => void jobs.data.reload()}>
        <RefreshCw className={cn(jobs.data.refreshing && 'animate-spin motion-reduce:animate-none')} />
      </Button>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
      <ErrorAlert className="mx-2">{jobs.data.error || jobs.action.error}</ErrorAlert>
      {jobs.data.error ? <Button variant="ghost" className="mx-2" onClick={() => void jobs.data.reload()}>重新加载记录</Button> : null}
      {jobs.data.loading && !jobs.data.data ? <LoadingState label="加载消息记录…" /> : null}
      {jobs.data.data && matches.length === 0 ? <EmptyState icon={MessageSquare} title={query ? '没有匹配的消息' : '还没有消息记录'} description={query ? '试试其他关键词，或切换记录页。' : '发送第一条消息后，记录会保存在这里。'} className="min-h-44 px-3 py-6" /> : null}
      <ul className="flex flex-col gap-1" aria-label="会话列表">
        {matches.map((job) => <li key={job.id} className={cn('group relative flex min-w-0 rounded-xl border border-transparent', job.id === opened ? 'border-border bg-background shadow-xs' : 'hover:bg-muted')}>
          <button type="button" aria-label={job.title} aria-current={job.id === opened ? 'true' : undefined} onClick={() => onOpen(job.id)}
            className="flex min-w-0 flex-1 flex-col gap-2 rounded-xl p-3 pe-11 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="flex w-full min-w-0 items-center gap-2">
              {job.sources?.length ? <FileText className="size-3.5 shrink-0 text-muted-foreground" /> : <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />}
              <span className="truncate text-body font-medium">{job.title}</span>
            </span>
            <span className="line-clamp-2 break-words text-caption leading-relaxed text-muted-foreground">{job.prompt || job.sources?.map((source) => source.name).join('、') || job.model}</span>
            <span className="flex w-full flex-wrap items-center gap-x-2 gap-y-1">
              <TaskStatusBadge kind={geminiTextKind} record={job} />
              <time dateTime={job.created} title={formatDateTime(job.created)} className="text-caption text-muted-foreground">{formatShortDate(job.created)}</time>
              {job.totalChunks > 1 ? <span className="text-caption tabular-nums text-muted-foreground">{job.completedChunks}/{job.totalChunks} 段</span> : null}
            </span>
          </button>
          {geminiTextKind.isTerminal(job.status) ? <div className="absolute top-1.5 end-1">
            <JobMenu label={`消息操作 ${job.title}`}><DropdownMenuGroup>
              <DropdownMenuItem variant="destructive" onSelect={() => onDelete(job)}><Trash2 />删除消息</DropdownMenuItem>
            </DropdownMenuGroup></JobMenu>
          </div> : null}
        </li>)}
      </ul>
    </div>
    {jobs.data.data ? <Pager page={jobs.page} totalPages={jobs.data.data.totalPages} onPageChange={(page) => { setQuery(''); jobs.setPage(page) }} disabled={jobs.data.refreshing} label="消息记录分页" className="mt-0 shrink-0 border-t p-3" /> : null}
  </div>
}
