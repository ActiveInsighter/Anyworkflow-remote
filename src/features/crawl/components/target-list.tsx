import { useState } from 'react'
import { BookmarkPlus, Pause, RefreshCw, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDeleteDialog } from '@/components/feedback/confirm-dialog'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { Pager } from '@/components/navigation/pager'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Spinner } from '@/components/ui/spinner'
import { useNow } from '@/hooks/use-now'
import type { CrawlTarget } from '@/types/crawl'
import type { CrawlState } from '../hooks/use-crawl'
import { targetTitle } from '../lib/crawl-display'
import { TargetRow, type TargetTab } from './target-row'

/**
 * The saved pages. Selecting some turns the header into a bar that crawls, pauses or removes
 * them together; pages already crawling are left out of a new crawl.
 */
export function TargetList({ crawl, onOpen }: { crawl: CrawlState; onOpen: (target: CrawlTarget, tab: TargetTab) => void }) {
  const { data, loading, refreshing, error } = crawl.targets
  const [deleting, setDeleting] = useState<CrawlTarget[] | null>(null)
  const now = useNow()
  const items = data?.items ?? []
  const chosen = items.filter((target) => crawl.selected.has(target.id))
  const allChosen = items.length > 0 && chosen.length === items.length
  const idle = chosen.filter((target) => !crawl.jobByTarget.has(target.id))
  const crawling = items.filter((target) => crawl.jobByTarget.has(target.id)).length
  const pausable = chosen.filter((target) => target.enabled && target.intervalMinutes > 0)

  async function crawlTargets(targets: CrawlTarget[], key: string) {
    const started = await crawl.crawl(targets, key)
    if (started) toast.success(`开始抓取 ${started} 个页面`)
    if (started && key === 'selection') crawl.setSelected(new Set())
  }

  return (
    <section className="min-w-0" aria-label="保存的页面">
      <div className="mb-1 flex min-h-touch flex-wrap items-center gap-x-3 gap-y-2 sm:min-h-9">
        <Checkbox
          checked={allChosen ? true : chosen.length ? 'indeterminate' : false}
          disabled={!items.length}
          onCheckedChange={(checked) => crawl.setSelected(new Set(checked === true ? items.map((target) => target.id) : []))}
          aria-label="选择本页全部页面"
        />
        {chosen.length ? (
          <div role="toolbar" aria-label="所选页面" className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            <span className="me-2 text-body font-medium tabular-nums">已选 {chosen.length} 个</span>
            <Button size="sm" variant="secondary" disabled={crawl.working || !idle.length} onClick={() => void crawlTargets(idle, 'selection')}>
              {crawl.pending === 'selection' ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
              抓取所选
            </Button>
            <Button size="sm" variant="ghost" disabled={crawl.working || !pausable.length} onClick={() => void crawl.pause(pausable)}>
              <Pause data-icon="inline-start" />
              暂停定时
            </Button>
            <Button size="sm" variant="ghost-destructive" disabled={crawl.working} onClick={() => setDeleting(chosen)}>
              <Trash2 data-icon="inline-start" />
              删除
            </Button>
            <Button size="icon-sm" variant="ghost" className="ms-auto text-muted-foreground" aria-label="取消选择" onClick={() => crawl.setSelected(new Set())}>
              <X />
            </Button>
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
            <span className="text-caption text-muted-foreground tabular-nums">
              {data ? `${data.totalItems} 个页面` : '页面'}
              {crawling ? ` · ${crawling} 个正在抓取` : ''}
            </span>
            <Button variant="ghost" size="icon-touch" className="text-muted-foreground sm:size-8" aria-label="刷新" onClick={() => void crawl.refresh()} disabled={refreshing}>
              <RefreshCw className={refreshing ? 'animate-spin' : undefined} />
            </Button>
          </div>
        )}
      </div>

      <ErrorAlert>{error}</ErrorAlert>
      {loading && !data ? <LoadingState label="加载页面…" /> : null}
      {data && !items.length ? (
        <EmptyState icon={BookmarkPlus} title="还没有保存的页面" description="提交链接时打开「保存为页面」，就能按频率重复抓取。" />
      ) : null}

      {items.length ? (
        <div className="flex min-w-0 flex-col">
          {items.map((target) => (
            <TargetRow
              key={target.id}
              target={target}
              job={crawl.jobByTarget.get(target.id)}
              selected={crawl.selected.has(target.id)}
              now={now}
              pending={crawl.pending}
              busy={crawl.working}
              onSelect={(on) => crawl.toggleSelected(target.id, on)}
              onOpen={(tab) => onOpen(target, tab)}
              onCrawl={() => void crawlTargets([target], `${target.id}:crawl`)}
              onCancel={(job) => void crawl.cancel(job)}
              onSchedule={(enabled) => void crawl.setScheduled(target, enabled)}
              onDelete={() => setDeleting([target])}
            />
          ))}
        </div>
      ) : null}

      {data ? <Pager page={crawl.page} totalPages={data.totalPages} totalItems={data.totalItems} onPageChange={crawl.setPage} disabled={refreshing} label="页面分页" /> : null}

      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={deleting && deleting.length > 1 ? `删除 ${deleting.length} 个页面` : '删除页面'}
        description={deleting ? `${deleting.length > 1 ? '所选页面' : `「${targetTitle(deleting[0])}」`}不再抓取，已保存的内容和记录会保留。` : ''}
        busy={crawl.working}
        onConfirm={() => {
          if (!deleting) return
          void crawl.removeTargets(deleting).then((done) => {
            if (done) setDeleting(null)
          })
        }}
      />
    </section>
  )
}
