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
import { cn } from '@/lib/utils'
import { safeHref } from '@/lib/web-urls'
import type { CrawlDocument } from '@/types/crawl'
import { useCrawlDocuments } from '../hooks/use-crawl-history'
import { categoryLabel, documentRef, documentTitle, excerptText, wasUpdated } from '../lib/crawl-display'
import { DocumentSheet } from './document-sheet'
import { RunnerTag } from './runner-field'

/** One stored document: what it is, where it came from, a short excerpt. Opening it loads the rest. */
function DocumentRow({ document, busy, onOpen, onDelete }: { document: CrawlDocument; busy: boolean; onOpen: () => void; onDelete: () => void }) {
  const title = documentTitle(document)
  const href = safeHref(document.canonicalUrl || document.url)
  const post = document.profile === 'x'
  const Icon = post ? MessageSquareText : FileText
  const excerpt = excerptText(document.markdown)

  return (
    <article className="-mx-3 grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 rounded-xl px-3 py-3 transition-colors duration-fast hover:bg-subtle">
      <Icon aria-label={post ? '帖子' : '网页'} role="img" className="mt-0.5 size-4.5 text-muted-foreground" />
      <div className="min-w-0">
        <h3 className="min-w-0 text-body font-medium sm:truncate">
          <button type="button" title={title} onClick={onOpen} className="max-w-full cursor-pointer truncate-sm rounded-sm text-left outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/35">
            {title}
          </button>
        </h3>
        {excerpt ? <p className="mt-0.5 line-clamp-2 text-caption text-muted-foreground [overflow-wrap:anywhere]">{excerpt}</p> : null}
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground tabular-nums">
          <span>{categoryLabel(document.category)}</span>
          <RunnerTag runner={document.runner} />
          <span className="min-w-0 [overflow-wrap:anywhere]">{document.siteName || document.host}</span>
          <span>{formatRelativeTime(document.fetchedAt)}抓取</span>
          {wasUpdated(document) ? <Badge variant="info">有更新</Badge> : null}
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
 * Stored documents, newest first, one per page or post. Filtered by category and text; with
 * `target` it shows one saved page's documents (inside that page's sheet).
 */
export function DocumentList({
  target,
  revision,
  categories,
  compact = false,
}: {
  target?: string
  revision: number
  categories: readonly string[]
  compact?: boolean
}) {
  const state = useCrawlDocuments({ target, revision })
  const { data, loading, refreshing, error } = state.documents
  const [opened, setOpened] = useState<{ id: string; title: string } | null>(null)
  const [deleting, setDeleting] = useState<CrawlDocument | null>(null)

  return (
    <section className="min-w-0" aria-label="采集内容">
      <div className={cn('mb-2 grid min-w-0 gap-2', !compact && 'sm:grid-cols-[minmax(0,1fr)_12rem]')}>
        <SearchField value={state.search} onValueChange={state.setSearch} label="搜索标题、正文或作者" size="touch" />
        {compact ? null : (
          <NativeSelect aria-label="按分类筛选" value={state.category} onChange={(event) => state.chooseCategory(event.target.value)} className="h-touch sm:h-9">
            <NativeSelectOption value="">全部分类</NativeSelectOption>
            {categories.map((category) => <NativeSelectOption key={category} value={category}>{categoryLabel(category)}</NativeSelectOption>)}
          </NativeSelect>
        )}
      </div>

      <ErrorAlert>{error}</ErrorAlert>
      {loading && !data ? <LoadingState label="加载内容…" /> : null}
      {data && !data.items.length ? (
        <EmptyState
          icon={Inbox}
          title={state.filtered ? '没有符合条件的内容' : '还没有采集到内容'}
          description={state.filtered ? '换个关键词或分类试试。' : '抓取成功后，内容按页面或帖子保存在这里，重复抓取只更新变化。'}
        />
      ) : null}
      {data?.items.length ? (
        <div className="flex min-w-0 flex-col">
          {data.items.map((document) => (
            <DocumentRow key={document.id} document={document} busy={state.busy} onOpen={() => setOpened(documentRef(document))} onDelete={() => setDeleting(document)} />
          ))}
        </div>
      ) : null}
      {data ? <Pager page={state.page} totalPages={data.totalPages} totalItems={data.totalItems} onPageChange={state.setPage} disabled={refreshing} label="内容分页" /> : null}

      <DocumentSheet opened={opened} onClose={() => setOpened(null)} />
      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="删除内容"
        description={deleting ? `「${documentTitle(deleting)}」会被永久删除；下次抓取到时会重新保存。` : ''}
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
