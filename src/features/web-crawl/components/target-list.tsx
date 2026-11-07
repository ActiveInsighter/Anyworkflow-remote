import { useState } from 'react'
import { Pause, Radar, RefreshCw, Trash2, X } from 'lucide-react'
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
import type { CrawlTarget } from '@/types/web-crawl'
import type { WebCrawlState } from '../hooks/use-web-crawl'
import { targetTitle } from '../lib/crawl-display'
import { TargetRow } from './target-row'

export type TargetTab = 'contents' | 'runs' | 'settings'

/**
 * The saved pages. Selecting some turns the header into a bar that crawls, pauses or removes
 * them together; a crawl of more than 10 pages is split into several runs.
 */
export function TargetList({ crawl, onOpen }: { crawl: WebCrawlState; onOpen: (target: CrawlTarget, tab: TargetTab) => void }) {
  const { data, loading, refreshing, error } = crawl.targets
  const [deleting, setDeleting] = useState<CrawlTarget[] | null>(null)
  const now = useNow()
  const items = data?.items ?? []
  const chosen = items.filter((target) => crawl.selected.has(target.id))
  const allChosen = items.length > 0 && chosen.length === items.length
  const idle = chosen.filter((target) => !crawl.busy.has(target.id))

  async function crawlTargets(targets: CrawlTarget[], key: string) {
    const started = await crawl.crawl(targets.map((target) => target.id), key)
    if (started) toast.success(`开始抓取 ${started} 个页面`)
    if (started && key === 'selection') crawl.setSelected(new Set())
  }

  async function pauseSelection() {
    for (const target of chosen.filter((item) => item.enabled && item.intervalMinutes > 0)) await crawl.update(target, { enabled: false })
    toast.success('已暂停所选页面的定时抓取')
  }

  return (
    <section className="min-w-0" aria-label="抓取页面">
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
            <Button size="sm" variant="ghost" disabled={crawl.working || !chosen.some((target) => target.enabled && target.intervalMinutes > 0)} onClick={() => void pauseSelection()}>
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
              {crawl.active.length ? ` · ${crawl.busy.size} 个正在抓取` : ''}
            </span>
            <Button variant="ghost" size="icon-touch" className="text-muted-foreground sm:size-8" aria-label="刷新" onClick={() => void crawl.refresh()} disabled={refreshing}>
              <RefreshCw className={refreshing ? 'animate-spin' : undefined} />
            </Button>
          </div>
        )}
      </div>

      <ErrorAlert>{error}</ErrorAlert>
      {loading && !data ? <LoadingState label="加载抓取页面…" /> : null}
      {data && !items.length ? (
        <EmptyState icon={Radar} title="还没有抓取页面" description="把页面链接粘贴到上方，选择频率后添加。" />
      ) : null}

      {items.length ? (
        <div className="flex min-w-0 flex-col">
          {items.map((target) => (
            <TargetRow
              key={target.id}
              target={target}
              run={crawl.runByTarget.get(target.id)}
              selected={crawl.selected.has(target.id)}
              now={now}
              pending={crawl.pending}
              busy={crawl.working}
              onSelect={(on) => crawl.toggleSelected(target.id, on)}
              onOpen={(tab) => onOpen(target, tab)}
              onCrawl={() => void crawlTargets([target], `${target.id}:crawl`)}
              onSchedule={(enabled) => void crawl.setScheduled(target, enabled)}
              onDelete={() => setDeleting([target])}
            />
          ))}
        </div>
      ) : null}

      {data ? (
        <Pager page={crawl.page} totalPages={data.totalPages} totalItems={data.totalItems} onPageChange={crawl.setPage} disabled={refreshing} label="抓取页面分页" />
      ) : null}

      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={deleting && deleting.length > 1 ? `删除 ${deleting.length} 个页面` : '删除抓取页面'}
        description={
          deleting
            ? `${deleting.length > 1 ? '所选页面' : `「${targetTitle(deleting[0])}」`}不再抓取，已保存的内容会保留。`
            : ''
        }
        busy={crawl.working}
        onConfirm={() => {
          if (!deleting) return
          void crawl.remove(deleting).then((done) => {
            if (done) setDeleting(null)
          })
        }}
      />
    </section>
  )
}
