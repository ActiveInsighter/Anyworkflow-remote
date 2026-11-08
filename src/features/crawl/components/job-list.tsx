import { useState } from 'react'
import { History, RefreshCw } from 'lucide-react'
import { ConfirmDeleteDialog } from '@/components/feedback/confirm-dialog'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { Pager } from '@/components/navigation/pager'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useNow } from '@/hooks/use-now'
import type { CrawlJob } from '@/types/crawl'
import type { CrawlState } from '../hooks/use-crawl'
import { useCrawlJobs } from '../hooks/use-crawl-history'
import { jobTitle } from '../lib/crawl-display'
import { DocumentSheet } from './document-sheet'
import { JobItem } from './job-item'

/** Crawl history, newest first: everything, or one saved page's (`target`, inside its sheet). */
export function JobList({ crawl, target }: { crawl: CrawlState; target?: string }) {
  const { jobs, page, setPage } = useCrawlJobs({ target, revision: crawl.revision })
  const { data, loading, refreshing, error, reload } = jobs
  const now = useNow()
  const [opened, setOpened] = useState<{ id: string; title: string } | null>(null)
  const [deleting, setDeleting] = useState<CrawlJob | null>(null)
  const offline = crawl.workers.data !== null && !crawl.online.length && crawl.waitingForBrowser

  return (
    <section className="min-w-0" aria-label="抓取记录">
      <div className="mb-1 flex min-h-touch items-center justify-between gap-3 sm:min-h-9">
        <span className="text-caption text-muted-foreground tabular-nums">
          {data ? `${data.totalItems} 次抓取` : '抓取记录'}
          {!target && crawl.activeJobs.length ? ` · ${crawl.activeJobs.length} 个进行中` : ''}
        </span>
        <Button variant="ghost" size="icon-touch" className="text-muted-foreground sm:size-8" aria-label="刷新" onClick={() => void reload()} disabled={refreshing}>
          <RefreshCw className={refreshing ? 'animate-spin' : undefined} />
        </Button>
      </div>

      <ErrorAlert>{error}</ErrorAlert>
      {offline ? (
        <Alert variant="warning" size="sm" className="mb-3">
          <AlertDescription>浏览器扩展不在线，浏览器任务会在它上线后开始。</AlertDescription>
        </Alert>
      ) : null}

      {loading && !data ? <LoadingState label="加载抓取记录…" /> : null}
      {data && !data.items.length ? (
        <EmptyState icon={History} title="还没有抓取记录" description={target ? '抓取一次后，结果会记在这里。' : '把链接粘贴到上方，开始第一次抓取。'} />
      ) : null}

      {data?.items.length ? (
        <div className="flex min-w-0 flex-col">
          {data.items.map((job) => (
            <JobItem
              key={job.id}
              job={job}
              now={now}
              pending={crawl.pending}
              busy={crawl.working}
              onOpen={() => setOpened({ id: job.document, title: jobTitle(job) })}
              onCancel={() => void crawl.cancel(job).then(() => reload())}
              onRerun={(runner) => void crawl.rerun(job, runner)}
              onDelete={() => setDeleting(job)}
            />
          ))}
        </div>
      ) : null}

      {data ? <Pager page={page} totalPages={data.totalPages} totalItems={data.totalItems} onPageChange={setPage} disabled={refreshing} label="抓取记录分页" /> : null}

      <DocumentSheet opened={opened} onClose={() => setOpened(null)} />
      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="删除抓取记录"
        description={deleting ? `「${jobTitle(deleting)}」这次抓取的记录会被删除，已保存的内容不受影响。` : ''}
        busy={crawl.working}
        onConfirm={() => {
          if (!deleting) return
          void crawl.removeJob(deleting).then((done) => {
            if (done) setDeleting(null)
          })
        }}
      />
    </section>
  )
}
