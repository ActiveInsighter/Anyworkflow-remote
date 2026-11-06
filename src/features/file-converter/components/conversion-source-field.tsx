import { FolderOpen, Link, Upload } from 'lucide-react'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LibraryFilePicker } from '@/features/files/components/library-file-picker'
import { PdfUploadField } from '@/features/files/components/pdf-upload-field'
import type { PdfUploadState } from '@/features/files/hooks/use-pdf-upload'
import type { LibraryFile } from '@/lib/api/library-files'

export type PdfSourceMode = 'link' | 'upload' | 'library'

/** Where the PDF comes from: a link by default, or a file dropped anywhere on the composer. */
export function ConversionSourceField({ mode, onModeChange, sourceUrl, onSourceUrlChange, upload, selectedFile, onSelectFile }: {
  mode: PdfSourceMode
  onModeChange: (mode: PdfSourceMode) => void
  sourceUrl: string
  onSourceUrlChange: (value: string) => void
  upload: PdfUploadState
  selectedFile: LibraryFile | null
  onSelectFile: (file: LibraryFile | null) => void
}) {
  return <Tabs value={mode} onValueChange={value => { if (value === 'link' || value === 'upload' || value === 'library') onModeChange(value) }} className="gap-3">
    <TabsList aria-label="PDF 来源" className="h-touch w-full sm:h-9 sm:w-fit">
      <TabsTrigger value="link"><Link aria-hidden="true" />链接</TabsTrigger>
      <TabsTrigger value="upload"><Upload aria-hidden="true" />上传文件</TabsTrigger>
      <TabsTrigger value="library"><FolderOpen aria-hidden="true" />资料库</TabsTrigger>
    </TabsList>
    <TabsContent value="link" className="flex flex-col gap-1.5">
      <Label htmlFor="pdf-source" className="sr-only">PDF 源文件地址</Label>
      <InputGroup className="h-11">
        <InputGroupAddon><Link aria-hidden="true" /></InputGroupAddon>
        <InputGroupInput id="pdf-source" name="sourceUrl" type="url" required={mode === 'link'} maxLength={4096} placeholder="粘贴 PDF 链接" value={sourceUrl} onChange={event => onSourceUrlChange(event.target.value)} aria-describedby="pdf-source-help" autoComplete="off" />
      </InputGroup>
      <p id="pdf-source-help" className="text-caption text-muted-foreground">公开直链或 Google Drive 分享链接，也可以把 PDF 拖到这里</p>
    </TabsContent>
    <TabsContent value="upload"><PdfUploadField upload={upload} /></TabsContent>
    <TabsContent value="library"><LibraryFilePicker selected={selectedFile} onSelect={onSelectFile} /></TabsContent>
  </Tabs>
}
