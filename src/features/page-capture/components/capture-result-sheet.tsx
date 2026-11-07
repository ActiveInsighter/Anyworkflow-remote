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
import { getCaptureResult } from '@/lib/api/page-capture'
import { formatDateTime } from '@/lib/format'
import { writeClipboard } from '@/lib/platform/clipboard'
import { saveBlob } from '@/lib/platform/download'
import type { CaptureJob, CaptureResult } from '@/types/page-capture'
import { captureDocument, captureFilename, extractorLabel, jobTitle, markdownPreview, safeHref, warningLabel } from '../lib/capture-display'

function ResultActions({ result }: { result: CaptureResult }) {
  async function copy() {
    const copied = await writeClipboard(result.markdown)
    if (copied) toast.success('已复制 Markdown')
    else toast.error('复制失败，请改用下载')
  }
  function download() {
    saveBlob(new Blob([captureDocument(result)], { type: 'text/markdown;charset=utf-8' }), captureFilename(result.title))
  }
  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="ghost" onClick={() => void copy()}>
        <Copy data-icon="inline-start" />
        复制
      </Button>
      <Button size="sm" variant="ghost" onClick={download}>
        <Download data-icon="inline-start" />
        下载
      </Button>
    </div>
  )
}

function ClippedNote({ clipped }: { clipped: boolean }) {
  return clipped ? <p className="mt-4 text-xs text-muted-foreground">内容较长，这里只显示开头，完整内容请下载。</p> : null
}

function ReadTab({ result }: { result: CaptureResult }) {
  const preview = markdownPreview(result.markdown)
  return (
    <>
      <MarkdownReader markdown={preview.text} />
      <ClippedNote clipped={preview.clipped} />
    </>
  )
}

function SourceTab({ result }: { result: CaptureResult }) {
  const preview = markdownPreview(result.markdown)
  return (
    <>
      <CodeBlock>{preview.text}</CodeBlock>
      <ClippedNote clipped={preview.clipped} />
    </>
  )
}

function InfoTab({ result }: { result: CaptureResult }) {
  const source = safeHref(result.canonicalUrl || result.url)
  const items = [
    { label: '作者', value: result.byline },
    { label: '站点', value: result.siteName || result.host },
    { label: '发布时间', value: result.publishedAt ? formatDateTime(result.publishedAt) : '' },
    { label: '语言', value: result.language },
    { label: '字数', value: result.wordCount ? result.wordCount.toLocaleString('zh-CN') : '' },
    { label: '质量评分', value: String(result.qualityScore) },
    { label: '解析方式', value: extractorLabel(result.extractor) },
    { label: '站点规则', value: result.profile },
    { label: '采集时间', value: formatDateTime(result.created) },
    { label: 'HTTP 状态', value: result.httpStatus ? String(result.httpStatus) : '' },
    { label: '扩展版本', value: result.extensionVersion },
  ].filter((item) => item.value)
  return (
    <div className="flex flex-col gap-5">
      {result.warnings?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {result.warnings.map((code) => (
            <Badge key={code} variant="neutral">{warningLabel(code)}</Badge>
          ))}
        </div>
      ) : null}
      {result.description ? <p className="text-sm text-muted-foreground">{result.description}</p> : null}
      <DescriptionList columns={3} items={items} />
      {source ? (
        <Button size="sm" variant="outline" className="self-start" asChild>
          <a href={source} target="_blank" rel="noreferrer noopener">
            <ExternalLink data-icon="inline-start" />
            打开原页面
          </a>
        </Button>
      ) : null}
      {result.structuredData?.length ? (
        <CodeBlock label="结构化数据">{JSON.stringify(result.structuredData, null, 2)}</CodeBlock>
      ) : null}
      {result.extras && Object.keys(result.extras).length ? (
        <CodeBlock label="站点字段">{JSON.stringify(result.extras, null, 2)}</CodeBlock>
      ) : null}
    </div>
  )
}

function LinksTab({ result }: { result: CaptureResult }) {
  const links = (result.links ?? []).flatMap((link) => {
    const href = safeHref(link.href)
    return href ? [{ href, text: link.text }] : []
  })
  const images = (result.images ?? []).flatMap((image) => {
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
              <a className="text-primary underline-offset-2 hover:underline" href={entry.href} target="_blank" rel="noreferrer noopener">
                {entry.text || entry.href}
              </a>
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

function ResultBody({ jobId }: { jobId: string }) {
  const { data, loading, error } = useAsyncData((signal) => getCaptureResult(jobId, signal), [jobId])
  if (loading && !data) return <LoadingState label="加载内容…" />
  if (!data) return <ErrorAlert inline>{error}</ErrorAlert>
  return (
    <Tabs defaultValue="read">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList>
          <TabsTrigger value="read">正文</TabsTrigger>
          <TabsTrigger value="source">Markdown</TabsTrigger>
          <TabsTrigger value="info">信息</TabsTrigger>
          <TabsTrigger value="links">链接</TabsTrigger>
        </TabsList>
        <ResultActions result={data} />
      </div>
      <TabsContent value="read" className="pt-3"><ReadTab result={data} /></TabsContent>
      <TabsContent value="source" className="pt-1"><SourceTab result={data} /></TabsContent>
      <TabsContent value="info" className="pt-3"><InfoTab result={data} /></TabsContent>
      <TabsContent value="links" className="pt-3"><LinksTab result={data} /></TabsContent>
    </Tabs>
  )
}

/** The captured content, loaded only when opened: results can be megabytes, jobs never are. */
export function CaptureResultSheet({ job, onClose }: { job: CaptureJob | null; onClose: () => void }) {
  return (
    <Modal open={job !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <ModalContent size="lg" height="fixed">
        <ModalHeader>
          <ModalTitle>{job ? jobTitle(job) : '采集内容'}</ModalTitle>
          <ModalDescription className="sr-only">采集到的正文、页面信息和链接</ModalDescription>
        </ModalHeader>
        <ModalBody>{job ? <ResultBody jobId={job.id} /> : null}</ModalBody>
      </ModalContent>
    </Modal>
  )
}
