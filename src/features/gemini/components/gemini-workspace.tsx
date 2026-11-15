import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { MessageSquare, RefreshCw, Trash2 } from 'lucide-react'
import { ConfirmDeleteDialog } from '@/components/feedback/confirm-dialog'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import type { GeminiJob } from '@/types/gemini'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { EmptyState } from '@/components/feedback/empty-state'
import { LoadingState } from '@/components/feedback/loading-state'
import { useAsyncData } from '@/hooks/use-async-data'
import { getGeminiConfig } from '@/lib/api/gemini'
import { ModelManagerButton } from '@/features/models/components/saved-model-select'
import { GeminiConfigSheet } from './gemini-config-sheet'
import { PageHeader, SectionHeader } from '@/components/layout/page'
import { Pager } from '@/components/navigation/pager'
import { Button } from '@/components/ui/button'
import { SegmentRail } from '@/components/data-display/segment-rail'
import { JobMenu, JobNote, JobRow } from '@/features/tasks'
import { geminiTextKind, taskStatusMeta } from '@/lib/tasks'
import { formatDateTime } from '@/lib/format'
import { useGeminiJobs } from '../hooks/use-gemini-jobs'
import { GeminiComposer } from './gemini-composer'
import { GeminiJobSheet } from './gemini-job-sheet'

export function GeminiWorkspace() {
  const jobs = useGeminiJobs()
  const [deleting, setDeleting] = useState<GeminiJob | null>(null)
  const config = useAsyncData(getGeminiConfig, [])
  const [params, setParams] = useSearchParams()
  const opened = params.get('job')
  function setOpened(id: string | null) {
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (id) next.set('job', id)
      else next.delete('job')
      return next
    }, { replace: true })
  }
  return (
    <>
      <PageHeader
        compact
        title="Gemini 消息"
        actions={
          <>
            <ModelManagerButton showLabel />
            <GeminiConfigSheet config={config} />
          </>
        }
      />
      <ErrorAlert>{config.error}</ErrorAlert>
      {config.error ? (
        <Button type="button" variant="outline" onClick={() => void config.reload()}>
          重新加载消息配置
        </Button>
      ) : null}
      <GeminiComposer jobs={jobs} config={config.data?.config ?? null} />
      <section className="mt-8 min-w-0" aria-label="消息记录">
        <SectionHeader
          title="消息记录"
          trailing={
            <Button
              type="button"
              variant="ghost"
              size="icon-touch"
              aria-label="刷新消息记录"
              onClick={() => void jobs.data.reload()}
              disabled={jobs.data.refreshing}
            >
              <RefreshCw />
            </Button>
          }
        />
        <ErrorAlert>{jobs.data.error || jobs.action.error}</ErrorAlert>
        {jobs.data.loading && !jobs.data.data ? <LoadingState label="加载消息记录…" /> : null}
        {jobs.data.data?.items.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="还没有消息记录"
            description="直接提问，或添加 Markdown 文件批量处理。"
          />
        ) : null}
        {jobs.data.data?.items.map((job) => {
          const tone = taskStatusMeta(geminiTextKind, job).tone
          return (
            <JobRow
              key={job.id}
              kind={geminiTextKind}
              record={job}
              title={job.title}
              onOpen={() => setOpened(job.id)}
              meta={[
                formatDateTime(job.created),
                job.totalChunks > 1 ? `${job.completedChunks} / ${job.totalChunks} 段已保存` : '',
                job.failedChunks ? `${job.failedChunks} 段失败` : '',
                job.model,
              ]}
              menu={geminiTextKind.isTerminal(job.status) ? <JobMenu label={`消息操作 ${job.title}`}>
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(job)}><Trash2 />删除消息</DropdownMenuItem>
              </JobMenu> : undefined}
              action={
                geminiTextKind.isActive(job.status) ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => jobs.cancel(job)}
                    disabled={jobs.action.busy || job.cancelRequested}
                  >
                    {job.cancelRequested ? '结束中…' : '结束任务'}
                  </Button>
                ) : (
                  <Button type="button" size="sm" variant="secondary" onClick={() => setOpened(job.id)}>
                    查看回复
                  </Button>
                )
              }
            >
              {job.totalChunks > 1 ? (
                <SegmentRail
                  total={job.totalChunks}
                  done={job.completedChunks}
                  live={geminiTextKind.isActive(job.status)}
                  tone={tone}
                  label={`${job.title} 分段进度`}
                  className="max-w-md"
                />
              ) : null}
              {job.error ? <JobNote>{job.error}</JobNote> : null}
            </JobRow>
          )
        })}
        {jobs.data.data ? (
          <Pager
            page={jobs.page}
            totalPages={jobs.data.data.totalPages}
            totalItems={jobs.data.data.totalItems}
            onPageChange={jobs.setPage}
            disabled={jobs.data.refreshing}
            label="消息记录分页"
          />
        ) : null}
      </section>
      <ConfirmDeleteDialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open) setDeleting(null) }}
        title="删除消息" description={`删除「${deleting?.title ?? ''}」及其全部回复？`} busy={jobs.action.busy}
        onConfirm={() => { if (deleting) void jobs.remove(deleting).then((done) => { if (done) setDeleting(null) }) }} />
      <GeminiJobSheet jobId={opened} onClose={() => setOpened(null)} />
    </>
  )
}
