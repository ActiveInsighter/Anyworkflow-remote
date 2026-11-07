import { useState } from 'react'
import { History, RefreshCw } from 'lucide-react'
import { ConfirmDeleteDialog } from '@/components/feedback/confirm-dialog'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { Pager } from '@/components/navigation/pager'
import { Button } from '@/components/ui/button'
import type { CrawlRun } from '@/types/web-crawl'
import { useCrawlRuns } from '../hooks/use-crawl-history'
import type { WebCrawlState } from '../hooks/use-web-crawl'
import { runTitle } from '../lib/crawl-display'
import { RunRow } from './run-row'
import { RunSheet } from './run-sheet'

/** Every crawl run, manual and scheduled, newest first. */
export function RunList({ crawl }: { crawl: WebCrawlState }) {
  const history = useCrawlRuns({ settled: crawl.settled })
  const { data, loading, refreshing, error, reload } = history.runs
  const [openedId, setOpenedId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<CrawlRun | null>(null)
  // The open sheet follows the polled list, so it updates while a run is still going.
  const opened = data?.items.find((run) => run.id === openedId) ?? null

  async function cancel(run: CrawlRun) {
    await crawl.cancel(run)
    await reload()
  }

  return (
    <section className="min-w-0" aria-label="抓取记录">
      <div className="mb-1 flex min-h-touch items-center justify-between gap-3 sm:min-h-9">
        <span className="text-caption text-muted-foreground tabular-nums">{data ? `${data.totalItems} 次抓取` : '抓取记录'}</span>
        <Button variant="ghost" size="icon-touch" className="text-muted-foreground sm:size-8" aria-label="刷新" onClick={() => void reload()} disabled={refreshing}>
          <RefreshCw className={refreshing ? 'animate-spin' : undefined} />
        </Button>
      </div>

      <ErrorAlert>{error}</ErrorAlert>
      {loading && !data ? <LoadingState label="加载抓取记录…" /> : null}
      {data && !data.items.length ? <EmptyState icon={History} title="还没有抓取记录" description="手动或定时抓取后，每一次都会记在这里。" /> : null}
      {data?.items.length ? (
        <div className="flex min-w-0 flex-col">
          {data.items.map((run) => (
            <RunRow
              key={run.id}
              run={run}
              pending={crawl.pending ?? history.pending}
              busy={crawl.working || history.busy}
              onOpen={() => setOpenedId(run.id)}
              onCancel={() => void cancel(run)}
              onDelete={() => setDeleting(run)}
            />
          ))}
        </div>
      ) : null}
      {data ? <Pager page={history.page} totalPages={data.totalPages} totalItems={data.totalItems} onPageChange={history.setPage} disabled={refreshing} label="抓取记录分页" /> : null}

      <RunSheet run={opened} onClose={() => setOpenedId(null)} />
      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="删除抓取记录"
        description={deleting ? `「${runTitle(deleting)}」的记录会被删除，抓到的内容会保留。` : ''}
        busy={history.busy}
        onConfirm={() => {
          if (!deleting) return
          void history.remove(deleting).then((done) => {
            if (done) setDeleting(null)
          })
        }}
      />
    </section>
  )
}
