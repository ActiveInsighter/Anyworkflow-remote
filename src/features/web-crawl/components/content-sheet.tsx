import { Copy, Download, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { DescriptionList } from '@/components/data-display/description-list'
import { MarkdownReader } from '@/components/data-display/markdown-reader'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { Button } from '@/components/ui/button'
import { Modal, ModalBody, ModalContent, ModalDescription, ModalHeader, ModalTitle } from '@/components/ui/modal'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAsyncData } from '@/hooks/use-async-data'
import { getCrawledContent } from '@/lib/api/web-crawl'
import { formatDateTime } from '@/lib/format'
import { writeClipboard } from '@/lib/platform/clipboard'
import { saveBlob } from '@/lib/platform/download'
import { safeHref } from '@/lib/web-urls'
import type { CrawledContent } from '@/types/web-crawl'
import { contentDocument, contentFilename, contentTitle, contentTypeLabel, metricEntries, platformLabel } from '../lib/crawl-display'

/** Long pages are clipped on screen; copy and download always carry everything. */
const PREVIEW_CHARS = 120_000

function Reading({ content }: { content: CrawledContent }) {
  const clipped = content.content.length > PREVIEW_CHARS
  const text = clipped ? content.content.slice(0, PREVIEW_CHARS) : content.content
  if (!text.trim()) return <p className="text-sm text-muted-foreground">这条内容没有正文，可在「信息」里查看媒体链接。</p>
  return (
    <>
      {content.metadata?.format === 'markdown' ? (
        <MarkdownReader markdown={text} />
      ) : (
        // Posts and selector results are plain text whose line breaks matter.
        <p className="mx-auto max-w-[42rem] text-[0.9375rem]/7 whitespace-pre-wrap [overflow-wrap:anywhere]">{text}</p>
      )}
      {clipped ? <p className="mt-4 text-xs text-muted-foreground">内容较长，这里只显示开头，完整内容请下载。</p> : null}
    </>
  )
}

function MediaLinks({ content }: { content: CrawledContent }) {
  const links = [
    ...(content.media?.images ?? []).map((url, index) => ({ href: safeHref(url), label: `图片 ${index + 1}` })),
    ...(content.media?.videos ?? []).flatMap((video, index) => {
      const url = video.url || video.sources?.[0] || video.poster || ''
      return [{ href: safeHref(url), label: `视频 ${index + 1}` }]
    }),
  ].filter((link): link is { href: string; label: string } => Boolean(link.href))
  if (!links.length) return null
  // Media stays a link: captured pages are untrusted, so nothing of theirs loads here.
  return (
    <section>
      <h3 className="mb-2 text-caption font-medium text-muted-foreground">媒体（{links.length}）</h3>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
        {links.map((link) => (
          <li key={link.href}>
            <a className="text-body text-primary underline-offset-2 hover:underline" href={link.href} target="_blank" rel="noreferrer noopener">{link.label}</a>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Info({ content }: { content: CrawledContent }) {
  const items = [
    { label: '平台', value: platformLabel(content.platform) },
    { label: '分类', value: contentTypeLabel(content.type) },
    { label: '作者', value: content.author ? `${content.author}${content.handle && content.handle !== content.author ? ` ${content.handle}` : ''}` : '' },
    { label: '发布时间', value: content.publishedAt ? formatDateTime(content.publishedAt) : '' },
    { label: '首次保存', value: formatDateTime(content.created) },
    { label: '最近抓取', value: formatDateTime(content.fetchedAt) },
    { label: '内容变化', value: content.changedAt ? formatDateTime(content.changedAt) : '' },
    ...metricEntries(content.metrics),
  ].filter((item) => item.value)
  const source = safeHref(content.canonicalUrl || content.source)
  return (
    <div className="flex flex-col gap-5">
      <DescriptionList columns={3} items={items} />
      <MediaLinks content={content} />
      {source ? (
        <Button size="sm" variant="outline" className="self-start" asChild>
          <a href={source} target="_blank" rel="noreferrer noopener">
            <ExternalLink data-icon="inline-start" />
            打开原页面
          </a>
        </Button>
      ) : null}
    </div>
  )
}

function Actions({ content }: { content: CrawledContent }) {
  async function copy() {
    if (await writeClipboard(content.content)) toast.success('已复制正文')
    else toast.error('复制失败，请改用下载')
  }
  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="ghost" onClick={() => void copy()}>
        <Copy data-icon="inline-start" />
        复制
      </Button>
      <Button size="sm" variant="ghost" onClick={() => saveBlob(new Blob([contentDocument(content)], { type: 'text/markdown;charset=utf-8' }), contentFilename(content))}>
        <Download data-icon="inline-start" />
        下载
      </Button>
    </div>
  )
}

function Body({ id }: { id: string }) {
  const { data, loading, error } = useAsyncData((signal) => getCrawledContent(id, signal), [id])
  if (loading && !data) return <LoadingState label="加载内容…" />
  if (!data) return <ErrorAlert inline>{error}</ErrorAlert>
  return (
    <Tabs defaultValue="read">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList>
          <TabsTrigger value="read">正文</TabsTrigger>
          <TabsTrigger value="info">信息</TabsTrigger>
        </TabsList>
        <Actions content={data} />
      </div>
      <TabsContent value="read"><Reading content={data} /></TabsContent>
      <TabsContent value="info"><Info content={data} /></TabsContent>
    </Tabs>
  )
}

/** One stored content, loaded in full only when opened. */
export function ContentSheet({ content, onClose }: { content: CrawledContent | null; onClose: () => void }) {
  return (
    <Modal open={content !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <ModalContent size="lg" height="fixed">
        <ModalHeader>
          <ModalTitle>{content ? contentTitle(content) : '抓取内容'}</ModalTitle>
          <ModalDescription className="sr-only">抓取到的正文和来源信息</ModalDescription>
        </ModalHeader>
        <ModalBody>{content ? <Body id={content.id} /> : null}</ModalBody>
      </ModalContent>
    </Modal>
  )
}
