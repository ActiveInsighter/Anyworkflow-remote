import { Copy, Link, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { writeClipboard } from '@/lib/platform/clipboard'
import type { PdfUploadState } from '../hooks/use-pdf-upload'

export type PdfSourceMode = 'link' | 'upload'

export function ConversionSourceField({ mode, onModeChange, sourceUrl, onSourceUrlChange, upload }: {
  mode: PdfSourceMode
  onModeChange: (mode: PdfSourceMode) => void
  sourceUrl: string
  onSourceUrlChange: (value: string) => void
  upload: PdfUploadState
}) {
  async function copyLink() {
    if (!upload.uploaded) return
    if (await writeClipboard(upload.uploaded.sourceUrl)) toast.success('链接已复制')
    else toast.error('复制失败，请选择链接手动复制')
  }

  return (
    <Tabs value={mode} onValueChange={(value) => { if (value === 'link' || value === 'upload') onModeChange(value) }} className="gap-3">
      <TabsList aria-label="PDF 来源" className="h-touch w-full">
        <TabsTrigger value="link" className="h-9!">
          <Link aria-hidden="true" />链接
        </TabsTrigger>
        <TabsTrigger value="upload" className="h-9!">
          <Upload aria-hidden="true" />上传文件
        </TabsTrigger>
      </TabsList>
      <TabsContent value="link">
        <Field>
          <FieldLabel htmlFor="pdf-source">PDF 源文件地址</FieldLabel>
          <Input
            id="pdf-source"
            name="sourceUrl"
            type="url"
            required={mode === 'link'}
            maxLength={4096}
            placeholder="https://…"
            value={sourceUrl}
            onChange={(event) => onSourceUrlChange(event.target.value)}
            aria-describedby="pdf-source-help"
          />
          <FieldDescription id="pdf-source-help">
            支持公开 PDF 直链或 Google Drive 分享链接，源文件不会存入文件库。
          </FieldDescription>
        </Field>
      </TabsContent>
      <TabsContent value="upload" className="space-y-3">
        <Field>
          <FieldLabel htmlFor="pdf-upload">选择 PDF 文件</FieldLabel>
          <Input
            id="pdf-upload"
            type="file"
            accept=".pdf,application/pdf"
            className="h-touch cursor-pointer text-sm file:mr-3 file:h-full file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void upload.upload(file)
            }}
            aria-describedby="pdf-upload-help"
            aria-invalid={Boolean(upload.error)}
          />
          <FieldDescription id="pdf-upload-help">最大 90 MiB。生成临时公开链接，持有链接者可访问；约 1 天后自动清理。</FieldDescription>
        </Field>
        {upload.uploading ? (
          <div className="space-y-2" role="status" aria-live="polite">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 break-all text-xs text-muted-foreground">
                {upload.progress === 100 ? '正在生成链接…' : `上传中 ${upload.progress}%`} · {upload.fileName}
              </p>
              <Button type="button" variant="ghost" size="icon-touch" aria-label="取消上传" onClick={upload.cancel}>
                <X aria-hidden="true" />
              </Button>
            </div>
            <Progress value={upload.progress} aria-label="文件上传进度" />
          </div>
        ) : upload.uploaded ? (
          <Field>
            <FieldLabel htmlFor="pdf-uploaded-source">上传文件链接</FieldLabel>
            <div className="flex min-w-0 items-center gap-2">
              <Input id="pdf-uploaded-source" readOnly value={upload.uploaded.sourceUrl} className="min-w-0 flex-1" />
              <Button type="button" variant="outline" size="icon-touch" aria-label="复制上传链接" onClick={() => void copyLink()}>
                <Copy aria-hidden="true" />
              </Button>
            </div>
            <FieldDescription role="status" className="break-all">已上传 · {upload.uploaded.fileName}</FieldDescription>
          </Field>
        ) : null}
        <ErrorAlert inline>{upload.error}</ErrorAlert>
      </TabsContent>
    </Tabs>
  )
}
