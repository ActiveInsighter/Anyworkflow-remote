import { useState } from 'react'
import { Globe, RefreshCw } from 'lucide-react'
import { ConfirmDeleteDialog } from '@/components/feedback/confirm-dialog'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { SectionHeader } from '@/components/layout/page'
import { Pager } from '@/components/navigation/pager'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { CaptureJob } from '@/types/page-capture'
import type { CaptureJobsState } from '../hooks/use-capture-jobs'
import { jobTitle } from '../lib/capture-display'
import { CaptureJobItem } from './capture-job-item'
import { CaptureResultSheet } from './capture-result-sheet'
import { onlineWorkers } from './capture-worker-status'

/** Capture history, newest first, polled while the page is open. */
export function CaptureJobList({ capture }: { capture: CaptureJobsState }) {
  const { data, loading, refreshing, error, reload } = capture.jobs
  const [opened, setOpened] = useState<CaptureJob | null>(null)
  const [deleting, setDeleting] = useState<CaptureJob | null>(null)
  const waiting = data?.items.some((job) => job.status === 'queued') ?? false
  const offline = capture.workers.data !== null && onlineWorkers(capture.workers.data).length === 0

  return (
    <section className="min-w-0" aria-labelledby="capture-history-title">
      <SectionHeader
        title={<span id="capture-history-title">采集记录</span>}
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

      <ErrorAlert>{error || capture.error}</ErrorAlert>

      {waiting && offline ? (
        <Alert variant="warning" size="sm" className="mb-3">
          <AlertDescription>采集扩展不在线，任务会在扩展上线后开始。</AlertDescription>
        </Alert>
      ) : null}

      {loading && !data ? <LoadingState label="加载采集记录…" /> : null}
      {data?.items.length === 0 ? (
        <EmptyState icon={Globe} title="暂无采集记录" description="提交的链接会显示在这里。" />
      ) : null}

      {data && data.items.length > 0 ? (
        <Card className="divide-y">
          {data.items.map((job) => (
            <CaptureJobItem
              key={job.id}
              job={job}
              pending={capture.pending}
              busy={capture.busy}
              onOpen={() => setOpened(job)}
              onCancel={() => capture.cancel(job)}
              onRerun={() => capture.rerun(job)}
              onDelete={() => setDeleting(job)}
            />
          ))}
        </Card>
      ) : null}

      {data ? (
        <Pager
          page={capture.page}
          totalPages={data.totalPages}
          totalItems={data.totalItems}
          onPageChange={capture.setPage}
          disabled={refreshing}
          label="采集记录分页"
        />
      ) : null}

      <CaptureResultSheet job={opened} onClose={() => setOpened(null)} />
      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="删除采集记录"
        description={deleting ? `「${jobTitle(deleting)}」及其内容会被永久删除。` : ''}
        busy={capture.busy}
        onConfirm={() => {
          if (!deleting) return
          void capture.remove(deleting).then((done) => {
            if (done) setDeleting(null)
          })
        }}
      />
    </section>
  )
}
