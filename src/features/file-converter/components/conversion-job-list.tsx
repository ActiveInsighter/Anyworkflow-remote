import { useState } from 'react'
import { FileText, RefreshCw } from 'lucide-react'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { SectionHeader } from '@/components/layout/page'
import { Pager } from '@/components/navigation/pager'
import { Button } from '@/components/ui/button'
import type { ConversionJobsState } from '../hooks/use-conversion-jobs'
import { ConversionJobItem } from './conversion-job-item'
import { ConversionJobSheet } from './conversion-job-sheet'

/** Conversion history, newest first, polled while the page is open. */
export function ConversionJobList({ jobs }: { jobs: ConversionJobsState }) {
  const { data, loading, refreshing, error, reload } = jobs.jobs
  const [openId, setOpenId] = useState<string | null>(null)
  // Read through the list, so an open sheet follows the job as it polls.
  const opened = data?.items.find((job) => job.id === openId) ?? null

  return (
    <section className="mt-8 min-w-0" aria-labelledby="conversion-history-title">
      <SectionHeader
        className="items-center"
        title={<span id="conversion-history-title">转换记录</span>}
        trailing={
          <span className="flex items-center gap-1">
            {data ? `${data.totalItems} 条` : null}
            <Button variant="ghost" size="icon-touch" className="text-muted-foreground sm:size-8" aria-label="刷新" onClick={() => void reload()} disabled={refreshing}>
              <RefreshCw className={refreshing ? 'animate-spin' : undefined} />
            </Button>
          </span>
        }
      />

      <ErrorAlert>{error || jobs.error}</ErrorAlert>

      {loading && !data ? <LoadingState label="加载转换记录…" /> : null}
      {data?.items.length === 0 ? (
        <EmptyState icon={FileText} title="还没有转换记录" description="粘贴一个 PDF 链接或把文件拖到上方，开始第一次转换。" />
      ) : null}

      {data && data.items.length > 0 ? (
        <div className="flex min-w-0 flex-col">
          {data.items.map((job) => (
            <ConversionJobItem
              key={job.id}
              job={job}
              pending={jobs.pending}
              busy={jobs.busy}
              onOpen={() => setOpenId(job.id)}
              onCancel={() => jobs.cancel(job)}
              onRerun={() => jobs.rerun(job)}
              onDownload={() => jobs.download(job)}
            />
          ))}
        </div>
      ) : null}

      {data ? (
        <Pager
          page={jobs.page}
          totalPages={data.totalPages}
          totalItems={data.totalItems}
          onPageChange={jobs.setPage}
          disabled={refreshing}
          label="转换记录分页"
        />
      ) : null}

      <ConversionJobSheet job={opened} onClose={() => setOpenId(null)} />
    </section>
  )
}
