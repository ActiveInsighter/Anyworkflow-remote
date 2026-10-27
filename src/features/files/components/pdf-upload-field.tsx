import { useState, type DragEvent } from 'react'
import { Copy, FileText, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { formatFileSize } from '@/lib/format'
import { writeClipboard } from '@/lib/platform/clipboard'
import { cn } from '@/lib/utils'
import type { PdfUploadState } from '../hooks/use-pdf-upload'

const LINK_FETCH_LIMIT = 200 * 1000 * 1000

export function PdfUploadField({ upload }: { upload: PdfUploadState }) {
  return (
      <div className="flex flex-col gap-3">
        {/* Always mounted, before the drop zone: the zone's focus ring follows it as a peer. */}
        <input
          id="pdf-upload"
          type="file"
          accept=".pdf,application/pdf"
          className="peer sr-only"
          aria-label="选择 PDF 文件"
          aria-describedby="pdf-upload-help"
          aria-invalid={Boolean(upload.error)}
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void upload.upload(file)
          }}
        />
        {upload.uploading || upload.uploaded ? <UploadedFile upload={upload} /> : <DropZone upload={upload} />}
        <ErrorAlert inline>{upload.error}</ErrorAlert>
      </div>
  )
}

function DropZone({ upload }: { upload: PdfUploadState }) {
  const [dragging, setDragging] = useState(false)

  function drop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files[0]
    if (file) void upload.upload(file)
  }

  return (
    <label
      htmlFor="pdf-upload"
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={drop}
      className={cn(
        'flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-input px-4 py-6 text-center transition-colors duration-fast',
        'hover:border-ring hover:bg-muted/50 peer-focus-visible:border-ring peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50',
        dragging && 'border-primary bg-primary/5',
      )}
    >
      <span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Upload aria-hidden="true" className="size-4" />
      </span>
      <span className="text-body font-medium">选择 PDF 文件</span>
      <span id="pdf-upload-help" className="text-xs text-muted-foreground">
        或拖到这里 · 最大 2 GiB · 保存到资料库，可重复使用
      </span>
    </label>
  )
}

function UploadedFile({ upload }: { upload: PdfUploadState }) {
  const { uploaded } = upload

  async function copyLink() {
    if (!uploaded) return
    if (await writeClipboard(uploaded.sourceUrl)) toast.success('链接已复制')
    else toast.error('复制失败，请选择链接手动复制')
  }

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground ring-1 ring-border">
          <FileText aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-medium">{uploaded?.fileName || upload.fileName}</p>
          <p className="text-xs text-muted-foreground tabular-nums" role="status" aria-live="polite">
            {uploaded
              ? `已上传 · ${formatFileSize(uploaded.size)}`
              : upload.progress === 100 ? '正在生成链接…' : `上传中 ${upload.progress}%`}
          </p>
        </div>
        {uploaded ? (
          <Button type="button" variant="ghost" size="icon-touch" aria-label="复制上传链接" onClick={() => void copyLink()}>
            <Copy aria-hidden="true" />
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-touch"
          aria-label={uploaded ? '取消选择文件' : '取消上传'}
          onClick={upload.uploading ? upload.cancel : upload.clear}
        >
          <X aria-hidden="true" />
        </Button>
      </div>
      {upload.uploading ? <Progress value={upload.progress} aria-label="文件上传进度" /> : null}
      {uploaded ? (
        <>
          <Input
            readOnly
            aria-label="上传文件链接"
            value={uploaded.sourceUrl}
            className="h-8 bg-background font-mono text-xs md:text-xs"
            onFocus={(event) => event.currentTarget.select()}
          />
          {uploaded.size > LINK_FETCH_LIMIT ? (
            <p className="text-xs text-muted-foreground">
              文件超过 200 MB，识别时会分段中转，耗时比小文件长。
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
