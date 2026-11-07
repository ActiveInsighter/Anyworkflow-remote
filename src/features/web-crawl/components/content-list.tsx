import { useState } from 'react'
import { ExternalLink, FileText, Inbox, MessageSquareText, Trash2 } from 'lucide-react'
import { ConfirmDeleteDialog } from '@/components/feedback/confirm-dialog'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { SearchField } from '@/components/form/search-field'
import { Pager } from '@/components/navigation/pager'
import { Badge } from '@/components/ui/badge'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { JobMenu } from '@/features/tasks'
import { formatRelativeTime } from '@/lib/format'
import { safeHref } from '@/lib/web-urls'
import { cn } from '@/lib/utils'
import type { CrawledContent } from '@/types/web-crawl'
import { useCrawledContents } from '../hooks/use-crawl-history'
import { contentTitle, contentTypeLabel, excerptText, platformLabel, wasUpdated } from '../lib/crawl-display'
import { ContentSheet } from './content-sheet'

/** One stored result: what it is, where it came from, and a short excerpt. Opening it loads the rest. */
function ContentRow({ content, busy, onOpen, onDelete }: { content: CrawledContent; busy: boolean; onOpen: () => void; onDelete: () => void }) {
  const title = contentTitle(content)
  const href = safeHref(content.canonicalUrl || content.source)
  const Icon = content.platform === 'x' ? MessageSquareText : FileText
  const updated = wasUpdated(content)
  const excerpt = excerptText(content.content)

  return (
    <article className="-mx-3 grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 rounded-xl px-3 py-3 transition-colors duration-fast hover:bg-subtle">
      <Icon aria-label={platformLabel(content.platform)} role="img" className="mt-0.5 size-4.5 text-muted-foreground" />
      <div className="min-w-0">
        <h3 className="min-w-0 text-body font-medium sm:truncate">
          <button type="button" title={title} onClick={onOpen} className="max-w-full cursor-pointer truncate-sm rounded-sm text-left outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/35">
            {title}
          </button>
        </h3>
        {excerpt ? <p className="mt-0.5 line-clamp-2 text-caption text-muted-foreground [overflow-wrap:anywhere]">{excerpt}</p> : null}
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground tabular-nums">
          <span>{contentTypeLabel(content.type)}</span>
          {content.handle ? <span className="min-w-0 [overflow-wrap:anywhere]">{content.handle}</span> : null}
          <span>{formatRelativeTime(content.fetchedAt)}抓取</span>
          {updated ? <Badge variant="info">有更新</Badge> : null}
        </div>
      </div>
      <JobMenu label={`更多操作 ${title}`}>
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
          删除内容
        </DropdownMenuItem>
      </JobMenu>
    </article>
  )
}

/**
 * Stored contents, newest first. Filtered by category and text; with `target` it shows one
 * page's contents (inside that page's sheet).
 */
export function ContentList({
  target,
  settled,
  categories,
  compact = false,
}: {
  target?: string
  settled: number
  categories: readonly string[]
  compact?: boolean
}) {
  const state = useCrawledContents({ target, settled })
  const { data, loading, refreshing, error } = state.contents
  const [opened, setOpened] = useState<CrawledContent | null>(null)
  const [deleting, setDeleting] = useState<CrawledContent | null>(null)

  return (
    <section className="min-w-0" aria-label="已抓取内容">
      <div className={cn('mb-2 grid min-w-0 gap-2', !compact && 'sm:grid-cols-[minmax(0,1fr)_12rem]')}>
        <SearchField value={state.search} onValueChange={state.setSearch} label="搜索标题、正文或作者" size="touch" />
        {compact ? null : (
          <NativeSelect aria-label="按分类筛选" value={state.type} onChange={(event) => state.chooseType(event.target.value)} className="h-touch sm:h-9">
            <NativeSelectOption value="">全部分类</NativeSelectOption>
            {categories.map((type) => <NativeSelectOption key={type} value={type}>{contentTypeLabel(type)}</NativeSelectOption>)}
          </NativeSelect>
        )}
      </div>

      <ErrorAlert>{error}</ErrorAlert>
      {loading && !data ? <LoadingState label="加载内容…" /> : null}
      {data && !data.items.length ? (
        <EmptyState
          icon={Inbox}
          title={state.filtered ? '没有符合条件的内容' : '还没有抓取到内容'}
          description={state.filtered ? '换个关键词或分类试试。' : '页面抓取成功后，内容会出现在这里。'}
        />
      ) : null}
      {data?.items.length ? (
        <div className="flex min-w-0 flex-col">
          {data.items.map((content) => (
            <ContentRow key={content.id} content={content} busy={state.busy} onOpen={() => setOpened(content)} onDelete={() => setDeleting(content)} />
          ))}
        </div>
      ) : null}
      {data ? <Pager page={state.page} totalPages={data.totalPages} totalItems={data.totalItems} onPageChange={state.setPage} disabled={refreshing} label="内容分页" /> : null}

      <ContentSheet content={opened} onClose={() => setOpened(null)} />
      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="删除内容"
        description={deleting ? `「${contentTitle(deleting)}」会被永久删除；下次抓取到时会重新保存。` : ''}
        busy={state.busy}
        onConfirm={() => {
          if (!deleting) return
          void state.remove(deleting).then((done) => {
            if (done) setDeleting(null)
          })
        }}
      />
    </section>
  )
}
