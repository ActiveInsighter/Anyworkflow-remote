import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { MessageSquare, RefreshCw } from 'lucide-react'
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
import { JobNote, JobRow } from '@/features/tasks'
import { geminiTextKind } from '@/lib/tasks'
import { formatDateTime } from '@/lib/format'
import { useGeminiJobs } from '../hooks/use-gemini-jobs'
import { GeminiComposer } from './gemini-composer'
import { GeminiJobSheet } from './gemini-job-sheet'

export function GeminiWorkspace() {
  const jobs = useGeminiJobs()
  const config = useAsyncData(getGeminiConfig, [])
  const [params] = useSearchParams()
  const [opened, setOpened] = useState<string | null>(() => params.get('job'))
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
        {jobs.data.data?.items.map((job) => (
          <JobRow
            key={job.id}
            kind={geminiTextKind}
            record={job}
            title={job.title}
            onOpen={() => setOpened(job.id)}
            meta={[
              formatDateTime(job.created),
              `${job.completedChunks} / ${job.totalChunks} 段已保存`,
              job.failedChunks ? `${job.failedChunks} 段失败` : '',
              job.model,
            ]}
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
            {job.error ? <JobNote>{job.error}</JobNote> : null}
          </JobRow>
        ))}
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
      <GeminiJobSheet jobId={opened} onClose={() => setOpened(null)} />
    </>
  )
}
