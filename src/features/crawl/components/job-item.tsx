import { AppWindow, CircleStop, ExternalLink, FileText, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { Spinner } from '@/components/ui/spinner'
import { JobMenu, JobNote, JobRow } from '@/features/tasks'
import { hasCrawlDocument, isCrawlJobActive } from '@/lib/api/crawl'
import { formatRelativeTime } from '@/lib/format'
import { crawlJobKind } from '@/lib/tasks'
import { safeHref } from '@/lib/web-urls'
import type { CrawlJob, CrawlRunner } from '@/types/crawl'
import { crawlErrorText, extractorLabel, jobTitle, mayNeedLogin } from '../lib/crawl-display'
import { RunnerTag } from './runner-field'

function retrying(job: CrawlJob): boolean {
  return job.status === 'queued' && job.attempts > 0
}

/** A saved page's crawl says whether it brought anything new; a one-off crawl is always new. */
function changeText(job: CrawlJob): string {
  if (!job.target || !hasCrawlDocument(job)) return ''
  return job.changed ? '内容有变化' : '内容无变化'
}

/**
 * One crawl: where it stands, where it ran, what it found, and the action its state puts first
 * (read the result, cancel, or try again). A cloud crawl stopped by a login can move to the
 * owner's browser in one step.
 */
export function JobItem({
  job,
  now,
  pending,
  busy,
  onOpen,
  onCancel,
  onRerun,
  onDelete,
}: {
  job: CrawlJob
  now: number
  /** Key of the running row action, `${jobId}:${action}`. */
  pending: string | null
  busy: boolean
  onOpen: () => void
  onCancel: () => void
  onRerun: (runner?: CrawlRunner) => void
  onDelete: () => void
}) {
  const is = (action: string) => pending === `${job.id}:${action}`
  const href = safeHref(job.url)
  const title = jobTitle(job)
  const hasDocument = hasCrawlDocument(job)
  const active = isCrawlJobActive(job)
  const toBrowser = mayNeedLogin(job)

  return (
    <JobRow
      kind={crawlJobKind}
      record={job}
      title={title}
      onOpen={hasDocument ? onOpen : undefined}
      meta={[
        <RunnerTag key="runner" runner={job.runner} />,
        job.host,
        job.trigger === 'schedule' ? '定时' : '',
        formatRelativeTime(job.created, now),
        job.wordCount > 0 ? `${job.wordCount.toLocaleString('zh-CN')} 字` : '',
        job.itemCount > 1 ? `${job.itemCount} 条` : '',
        job.extractor ? extractorLabel(job.extractor) : '',
        changeText(job),
      ]}
      action={
        hasDocument ? (
          <Button size="sm" variant="secondary" disabled={busy} onClick={onOpen}>
            <FileText data-icon="inline-start" />
            查看内容
          </Button>
        ) : active ? (
          <Button size="sm" variant="secondary" disabled={busy || job.cancelRequested} onClick={onCancel}>
            {is('cancel') ? <Spinner data-icon="inline-start" /> : <CircleStop data-icon="inline-start" />}
            {job.cancelRequested || is('cancel') ? '取消中…' : '取消'}
          </Button>
        ) : toBrowser ? (
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => onRerun('browser')}>
            {is('rerun') ? <Spinner data-icon="inline-start" /> : <AppWindow data-icon="inline-start" />}
            用浏览器抓取
          </Button>
        ) : (
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => onRerun()}>
            {is('rerun') ? <Spinner data-icon="inline-start" /> : <RotateCcw data-icon="inline-start" />}
            {is('rerun') ? '提交中…' : '重新抓取'}
          </Button>
        )
      }
      menu={
        <JobMenu label={`更多操作 ${title}`}>
          {href ? (
            <DropdownMenuItem asChild>
              <a href={href} target="_blank" rel="noreferrer noopener">
                <ExternalLink />
                打开原页面
              </a>
            </DropdownMenuItem>
          ) : null}
          {!active && (hasDocument || toBrowser) ? (
            <DropdownMenuItem disabled={busy} onSelect={() => onRerun()}>
              <RotateCcw />
              重新抓取
            </DropdownMenuItem>
          ) : null}
          {!active ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" disabled={busy} onSelect={onDelete}>
                <Trash2 />
                删除记录
              </DropdownMenuItem>
            </>
          ) : null}
        </JobMenu>
      }
    >
      {job.errorCode && (job.status === 'failed' || retrying(job)) ? (
        <JobNote tone={retrying(job) ? 'warning' : 'danger'}>
          {retrying(job) ? `第 ${job.attempts} 次没有成功，稍后自动重试：` : ''}
          {crawlErrorText(job.errorCode, job.runner, job.error)}
        </JobNote>
      ) : null}
    </JobRow>
  )
}
