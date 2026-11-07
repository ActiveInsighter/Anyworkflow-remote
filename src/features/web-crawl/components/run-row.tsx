import { CircleStop, ExternalLink, ListChecks, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { Spinner } from '@/components/ui/spinner'
import { JobMenu, JobNote, JobRow } from '@/features/tasks'
import { crawlRunUrl, isCrawlRunActive } from '@/lib/api/web-crawl'
import { formatDateTime } from '@/lib/format'
import { webCrawlKind } from '@/lib/tasks'
import type { CrawlRun } from '@/types/web-crawl'
import { runOutcomeText, runTitle } from '../lib/crawl-display'

/** One crawl run: what it covered, how it went, and cancel while it runs or its results after. */
export function RunRow({
  run,
  pending,
  busy,
  onOpen,
  onCancel,
  onDelete,
}: {
  run: CrawlRun
  /** Key of the running row action, `${runId}:${action}`. */
  pending: string | null
  busy: boolean
  onOpen: () => void
  onCancel: () => void
  onDelete: () => void
}) {
  const title = runTitle(run)
  const active = isCrawlRunActive(run)
  const canceling = run.cancelRequested || pending === `${run.id}:cancel`
  const github = crawlRunUrl(run)

  return (
    <JobRow
      kind={webCrawlKind}
      record={run}
      title={title}
      onOpen={onOpen}
      meta={[run.trigger === 'schedule' ? '定时' : '手动', formatDateTime(run.created), runOutcomeText(run)]}
      action={
        active ? (
          <Button size="sm" variant="secondary" disabled={busy || run.cancelRequested} onClick={onCancel}>
            {pending === `${run.id}:cancel` ? <Spinner data-icon="inline-start" /> : <CircleStop data-icon="inline-start" />}
            {canceling ? '取消中…' : '取消'}
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={onOpen}>
            <ListChecks data-icon="inline-start" />
            查看结果
          </Button>
        )
      }
      menu={
        github || !active ? (
          <JobMenu label={`更多操作 ${title}`}>
            {github ? (
              <DropdownMenuItem asChild>
                <a href={github} target="_blank" rel="noreferrer noopener">
                  <ExternalLink />
                  查看 GitHub 运行
                </a>
              </DropdownMenuItem>
            ) : null}
            {!active ? (
              <>
                {github ? <DropdownMenuSeparator /> : null}
                <DropdownMenuItem variant="destructive" disabled={busy} onSelect={onDelete}>
                  <Trash2 />
                  删除记录
                </DropdownMenuItem>
              </>
            ) : null}
          </JobMenu>
        ) : null
      }
    >
      {run.error && !active ? <JobNote tone={run.status === 'partial' ? 'warning' : 'danger'}>{run.error}</JobNote> : null}
    </JobRow>
  )
}
