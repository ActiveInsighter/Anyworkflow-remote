import { FileText, RefreshCw } from 'lucide-react'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { SectionHeader } from '@/components/layout/page'
import { Pager } from '@/components/navigation/pager'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { ConversionJobsState } from '../hooks/use-conversion-jobs'
import { ConversionJobItem } from './conversion-job-item'

/** Conversion history, newest first, polled while the page is open. */
export function ConversionJobList({ jobs }: { jobs: ConversionJobsState }) {
  const { data, loading, refreshing, error, reload } = jobs.jobs

  return (
    <section className="min-w-0" aria-labelledby="conversion-history-title">
      <SectionHeader
        title={<span id="conversion-history-title">转换记录</span>}
        trailing={
          <span className="flex items-center gap-2">
            {data ? `${data.totalItems} 条` : null}
            <Button variant="ghost" size="sm" onClick={() => void reload()} disabled={refreshing}>
              <RefreshCw data-icon="inline-start" className={refreshing ? 'animate-spin' : undefined} />
              刷新
            </Button>
          </span>
        }
      />

      <ErrorAlert>{error || jobs.error}</ErrorAlert>

      {loading && !data ? <LoadingState label="加载转换记录…" /> : null}
      {data?.items.length === 0 ? (
        <EmptyState icon={FileText} title="暂无转换记录" description="提交的转换任务会显示在这里。" />
      ) : null}

      {data && data.items.length > 0 ? (
        <Card className="divide-y">
          {data.items.map((job) => (
            <ConversionJobItem
              key={job.id}
              job={job}
              pending={jobs.pending}
              busy={jobs.busy}
              onCancel={() => jobs.cancel(job)}
              onRerun={() => jobs.rerun(job)}
              onDownload={() => jobs.download(job)}
            />
          ))}
        </Card>
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
    </section>
  )
}
