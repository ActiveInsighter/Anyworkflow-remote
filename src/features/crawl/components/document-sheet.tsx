import { Copy, Download, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { CodeBlock } from '@/components/data-display/code-block'
import { DescriptionList } from '@/components/data-display/description-list'
import { MarkdownReader } from '@/components/data-display/markdown-reader'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Modal, ModalBody, ModalContent, ModalDescription, ModalHeader, ModalTitle } from '@/components/ui/modal'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAsyncData } from '@/hooks/use-async-data'
import { getCrawlDocument } from '@/lib/api/crawl'
import { formatDateTime } from '@/lib/format'
import { writeClipboard } from '@/lib/platform/clipboard'
import { saveBlob } from '@/lib/platform/download'
import { safeHref } from '@/lib/web-urls'
import type { CrawlDocument, CrawlItem } from '@/types/crawl'
import {
  RUNNER_LABELS,
  categoryLabel,
  documentFilename,
  documentMarkdown,
  extractorLabel,
  itemByline,
  markdownPreview,
  metricEntries,
  warningLabel,
} from '../lib/crawl-display'

const ROUTE_LABELS: Record<string, string> = { http: '静态读取', browser: '浏览器渲染', live: '已登录的浏览器' }

function Actions({ document }: { document: CrawlDocument }) {
  async function copy() {
    if (await writeClipboard(document.markdown)) toast.success('已复制 Markdown')
    else toast.error('复制失败，请改用下载')
  }
  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="ghost" onClick={() => void copy()}>
        <Copy data-icon="inline-start" />
        复制
      </Button>
      <Button size="sm" variant="ghost" onClick={() => saveBlob(new Blob([documentMarkdown(document)], { type: 'text/markdown;charset=utf-8' }), documentFilename(document))}>
        <Download data-icon="inline-start" />
        下载
      </Button>
    </div>
  )
}

function ClippedNote({ clipped }: { clipped: boolean }) {
  return clipped ? <p className="mt-4 text-xs text-muted-foreground">内容较长，这里只显示开头，完整内容请下载。</p> : null
}

function ReadTab({ document }: { document: CrawlDocument }) {
  const preview = markdownPreview(document.markdown)
  return (
    <>
      <MarkdownReader markdown={preview.text} />
      <ClippedNote clipped={preview.clipped} />
    </>
  )
}

function SourceTab({ document }: { document: CrawlDocument }) {
  const preview = markdownPreview(document.markdown)
  return (
    <>
      <CodeBlock>{preview.text}</CodeBlock>
      <ClippedNote clipped={preview.clipped} />
    </>
  )
}

/** One structured entry, such as a post: who, when, what, and its numbers. Media stays a link. */
function Item({ item }: { item: CrawlItem }) {
  const href = typeof item.url === 'string' ? safeHref(item.url) : undefined
  const images = (Array.isArray(item.images) ? item.images : []).flatMap((src) => {
    const link = typeof src === 'string' ? safeHref(src) : undefined
    return link ? [link] : []
  })
  const metrics = metricEntries(item.metrics)
  const byline = itemByline(item)
  return (
    <li className="flex min-w-0 flex-col gap-1.5 py-4 first:pt-1">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted-foreground tabular-nums">
        {byline ? <span className="font-medium text-foreground [overflow-wrap:anywhere]">{byline}</span> : null}
        {typeof item.postedAt === 'string' && item.postedAt ? <span>{formatDateTime(item.postedAt)}</span> : null}
        {item.relation === 'target' ? <Badge variant="info">链接指向</Badge> : null}
      </div>
      {typeof item.text === 'string' && item.text ? <p className="text-body whitespace-pre-wrap [overflow-wrap:anywhere]">{item.text}</p> : null}
      {metrics.length ? (
        <p className="flex flex-wrap gap-x-3 text-caption text-muted-foreground tabular-nums">
          {metrics.map((metric) => <span key={metric.label}>{metric.label} {metric.value}</span>)}
        </p>
      ) : null}
      {href || images.length ? (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-caption">
          {href ? <a className="text-primary underline-offset-2 hover:underline" href={href} target="_blank" rel="noreferrer noopener">打开原帖</a> : null}
          {images.map((src, index) => (
            <a key={src} className="text-primary underline-offset-2 hover:underline" href={src} target="_blank" rel="noreferrer noopener">图片 {index + 1}</a>
          ))}
        </p>
      ) : null}
    </li>
  )
}

function ItemsTab({ items }: { items: CrawlItem[] }) {
  return <ul className="flex flex-col divide-y divide-border">{items.map((item, index) => <Item key={typeof item.id === 'string' ? item.id : index} item={item} />)}</ul>
}

function InfoTab({ document }: { document: CrawlDocument }) {
  const source = safeHref(document.canonicalUrl || document.url)
  const route = document.trace?.route ?? ''
  const items = [
    { label: '执行位置', value: RUNNER_LABELS[document.runner] ?? document.runner },
    { label: '读取方式', value: ROUTE_LABELS[route] ?? route },
    { label: '分类', value: categoryLabel(document.category) },
    { label: '作者', value: document.byline },
    { label: '站点', value: document.siteName || document.host },
    { label: '发布时间', value: document.publishedAt ? formatDateTime(document.publishedAt) : '' },
    { label: '语言', value: document.language },
    { label: '字数', value: document.wordCount ? document.wordCount.toLocaleString('zh-CN') : '' },
    { label: '质量评分', value: String(document.qualityScore) },
    { label: '解析方式', value: extractorLabel(document.extractor) },
    { label: '首次保存', value: formatDateTime(document.created) },
    { label: '最近抓取', value: formatDateTime(document.fetchedAt) },
    { label: '内容变化', value: document.changedAt ? formatDateTime(document.changedAt) : '' },
    { label: 'HTTP 状态', value: document.httpStatus ? String(document.httpStatus) : '' },
    { label: '抓取器版本', value: document.crawlerVersion },
  ].filter((item) => item.value)
  return (
    <div className="flex flex-col gap-5">
      {document.warnings?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {document.warnings.map((code) => <Badge key={code} variant="neutral">{warningLabel(code)}</Badge>)}
        </div>
      ) : null}
      {document.description ? <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{document.description}</p> : null}
      <DescriptionList columns={3} items={items} />
      {source ? (
        <Button size="sm" variant="outline" className="self-start" asChild>
          <a href={source} target="_blank" rel="noreferrer noopener">
            <ExternalLink data-icon="inline-start" />
            打开原页面
          </a>
        </Button>
      ) : null}
      {document.structuredData?.length ? <CodeBlock label="结构化数据">{JSON.stringify(document.structuredData, null, 2)}</CodeBlock> : null}
      {document.extras && Object.keys(document.extras).length ? <CodeBlock label="站点字段">{JSON.stringify(document.extras, null, 2)}</CodeBlock> : null}
    </div>
  )
}

function LinksTab({ document }: { document: CrawlDocument }) {
  const links = (document.links ?? []).flatMap((link) => {
    const href = safeHref(link.href)
    return href ? [{ href, text: link.text }] : []
  })
  const images = (document.images ?? []).flatMap((image) => {
    const href = safeHref(image.src)
    return href ? [{ href, text: image.alt }] : []
  })
  if (!links.length && !images.length) return <p className="text-sm text-muted-foreground">正文中没有链接或图片。</p>
  const section = (title: string, entries: { href: string; text: string }[]) =>
    entries.length ? (
      <section>
        <h3 className="mb-2 text-caption font-medium text-muted-foreground">{title}（{entries.length}）</h3>
        <ul className="flex flex-col gap-1.5">
          {entries.map((entry) => (
            <li key={entry.href} className="min-w-0 text-body break-all">
              <a className="text-primary underline-offset-2 hover:underline" href={entry.href} target="_blank" rel="noreferrer noopener">{entry.text || entry.href}</a>
            </li>
          ))}
        </ul>
      </section>
    ) : null
  return (
    <div className="flex flex-col gap-5">
      {section('链接', links)}
      {section('图片', images)}
    </div>
  )
}

function Body({ id }: { id: string }) {
  const { data, loading, error } = useAsyncData((signal) => getCrawlDocument(id, signal), [id])
  if (loading && !data) return <LoadingState label="加载内容…" />
  if (!data) return <ErrorAlert inline>{error}</ErrorAlert>
  const items = (data.items ?? []).filter((item) => item && typeof item === 'object')
  return (
    <Tabs defaultValue={items.length > 1 ? 'items' : 'read'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList className="max-w-full overflow-x-auto">
          <TabsTrigger value="read">正文</TabsTrigger>
          {items.length ? <TabsTrigger value="items">条目 {items.length}</TabsTrigger> : null}
          <TabsTrigger value="source">Markdown</TabsTrigger>
          <TabsTrigger value="info">信息</TabsTrigger>
          <TabsTrigger value="links">链接</TabsTrigger>
        </TabsList>
        <Actions document={data} />
      </div>
      <TabsContent value="read" className="pt-3"><ReadTab document={data} /></TabsContent>
      {items.length ? <TabsContent value="items" className="pt-1"><ItemsTab items={items} /></TabsContent> : null}
      <TabsContent value="source" className="pt-1"><SourceTab document={data} /></TabsContent>
      <TabsContent value="info" className="pt-3"><InfoTab document={data} /></TabsContent>
      <TabsContent value="links" className="pt-3"><LinksTab document={data} /></TabsContent>
    </Tabs>
  )
}

/** One stored document, loaded in full only when opened: documents can be megabytes, lists never are. */
export function DocumentSheet({ opened, onClose }: { opened: { id: string; title: string } | null; onClose: () => void }) {
  return (
    <Modal open={opened !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <ModalContent size="lg" height="fixed">
        <ModalHeader>
          <ModalTitle>{opened?.title || '采集内容'}</ModalTitle>
          <ModalDescription className="sr-only">采集到的正文、条目、页面信息和链接</ModalDescription>
        </ModalHeader>
        <ModalBody>{opened ? <Body id={opened.id} /> : null}</ModalBody>
      </ModalContent>
    </Modal>
  )
}
