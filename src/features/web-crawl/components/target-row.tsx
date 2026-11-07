import { CircleCheck, CircleDashed, CircleDot, CircleX, ExternalLink, FileText, Pause, Play, RefreshCw, Settings2, Trash2, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { Spinner } from '@/components/ui/spinner'
import { JobMenu, JobNote, TaskProgress } from '@/features/tasks'
import { taskStatusMeta, webCrawlKind } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { safeHref } from '@/lib/web-urls'
import type { CrawlRun, CrawlTarget } from '@/types/web-crawl'
import { contentTypeLabel, crawlErrorText, lastOutcomeText, scheduleText, targetTitle } from '../lib/crawl-display'

function mark(target: CrawlTarget, crawling: boolean): { icon: LucideIcon; className: string; label: string } {
  if (crawling) return { icon: CircleDot, className: 'text-info', label: '正在抓取' }
  if (target.lastStatus === 'succeeded') return { icon: CircleCheck, className: 'text-success', label: '上次抓取成功' }
  if (target.lastStatus === 'failed') return { icon: CircleX, className: 'text-danger', label: '上次抓取失败' }
  return { icon: CircleDashed, className: 'text-muted-foreground', label: '尚未抓取' }
}

/**
 * One saved page: whether it is selected, how it last went, its schedule, and the one action its
 * state puts first (crawl now, unless a run already has it). Settings, contents and removal live
 * in its menu.
 */
export function TargetRow({
  target,
  run,
  selected,
  now,
  pending,
  busy,
  onSelect,
  onOpen,
  onCrawl,
  onSchedule,
  onDelete,
}: {
  target: CrawlTarget
  /** The active run crawling this page, if any. */
  run: CrawlRun | undefined
  selected: boolean
  now: number
  pending: string | null
  busy: boolean
  onSelect: (selected: boolean) => void
  onOpen: (tab: 'contents' | 'runs' | 'settings') => void
  onCrawl: () => void
  onSchedule: (enabled: boolean) => void
  onDelete: () => void
}) {
  const title = targetTitle(target)
  const href = safeHref(target.url)
  const crawling = Boolean(run)
  const state = mark(target, crawling)
  const Mark = state.icon
  const starting = pending === `${target.id}:crawl`
  const view = run ? webCrawlKind.describe(run) : null
  const scheduled = target.intervalMinutes > 0

  return (
    <article
      data-selected={selected || undefined}
      className="-mx-3 grid min-w-0 grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] items-start gap-x-3 rounded-xl px-3 py-3 transition-colors duration-fast hover:bg-subtle data-selected:bg-subtle"
    >
      <Checkbox className="col-start-1 row-start-1 mt-0.5" checked={selected} onCheckedChange={(checked) => onSelect(checked === true)} aria-label={`选择 ${title}`} />
      <Mark aria-label={state.label} role="img" className={cn('col-start-2 row-start-1 mt-0.5 size-4.5 shrink-0', state.className)} />

      <div className="col-span-2 col-start-3 row-start-1 min-w-0 sm:col-span-1">
        <h3 className="min-w-0 text-body font-medium [overflow-wrap:anywhere] sm:truncate">
          <button
            type="button"
            title={target.url}
            onClick={() => onOpen('contents')}
            className="max-w-full cursor-pointer truncate-sm rounded-sm text-left outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/35"
          >
            {title}
          </button>
        </h3>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-3 text-caption text-muted-foreground tabular-nums">
          <span className="min-w-0 [overflow-wrap:anywhere]">{target.host}</span>
          <span>{scheduleText(target, now)}</span>
          <span className={cn(target.lastStatus === 'failed' && !crawling && 'text-danger')}>
            {run && view ? (view.stopping ? '正在取消' : taskStatusMeta(webCrawlKind, run).label) : lastOutcomeText(target, now)}
          </span>
          <span>{contentTypeLabel(target.contentType)}</span>
        </div>
        {view?.state === 'running' ? <TaskProgress view={view} className="mt-2 max-w-64" /> : null}
        {target.lastStatus === 'failed' && !crawling ? (
          <div className="mt-1.5">
            <JobNote>{crawlErrorText(target.lastErrorCode, target.lastError)}</JobNote>
          </div>
        ) : null}
      </div>

      {/* While a run has it, the status line and rail say so; there is nothing to start. */}
      {crawling ? null : (
        <div className="col-span-2 col-start-3 row-start-2 mt-2 flex items-center sm:col-span-1 sm:col-start-4 sm:row-start-1 sm:mt-0">
          <Button size="sm" variant="secondary" disabled={busy} onClick={onCrawl}>
            {starting ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
            抓取
          </Button>
        </div>
      )}
      <div className="col-start-5 row-start-1 -my-1 sm:my-0">
        <JobMenu label={`更多操作 ${title}`}>
          <DropdownMenuItem onSelect={() => onOpen('contents')}>
            <FileText />
            查看内容
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onOpen('settings')}>
            <Settings2 />
            抓取设置
          </DropdownMenuItem>
          {scheduled ? (
            <DropdownMenuItem disabled={busy} onSelect={() => onSchedule(!target.enabled)}>
              {target.enabled ? <Pause /> : <Play />}
              {target.enabled ? '暂停定时' : '恢复定时'}
            </DropdownMenuItem>
          ) : null}
          {href ? (
            <DropdownMenuItem asChild>
              <a href={href} target="_blank" rel="noreferrer noopener">
                <ExternalLink />
                打开原页面
              </a>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" disabled={busy} onSelect={onDelete}>
            <Trash2 />
            删除页面
          </DropdownMenuItem>
        </JobMenu>
      </div>
    </article>
  )
}
