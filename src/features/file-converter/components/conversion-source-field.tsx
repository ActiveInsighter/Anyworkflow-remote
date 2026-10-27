import { FolderOpen, Link, Upload } from 'lucide-react'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LibraryFilePicker } from '@/features/files/components/library-file-picker'
import { PdfUploadField } from '@/features/files/components/pdf-upload-field'
import type { PdfUploadState } from '@/features/files/hooks/use-pdf-upload'
import type { LibraryFile } from '@/lib/api/library-files'

export type PdfSourceMode = 'link' | 'upload' | 'library'

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
    <TabsList aria-label="PDF 来源" className="h-touch w-full">
      <TabsTrigger value="link" className="h-9!"><Link aria-hidden="true" />链接</TabsTrigger>
      <TabsTrigger value="upload" className="h-9!"><Upload aria-hidden="true" />上传文件</TabsTrigger>
      <TabsTrigger value="library" className="h-9!"><FolderOpen aria-hidden="true" />资料库</TabsTrigger>
    </TabsList>
    <TabsContent value="link"><Field>
      <FieldLabel htmlFor="pdf-source">PDF 源文件地址</FieldLabel>
      <Input id="pdf-source" name="sourceUrl" type="url" required={mode === 'link'} maxLength={4096} placeholder="https://…" value={sourceUrl} onChange={event => onSourceUrlChange(event.target.value)} aria-describedby="pdf-source-help" />
      <FieldDescription id="pdf-source-help">公开 PDF 直链或 Google Drive 分享链接</FieldDescription>
    </Field></TabsContent>
    <TabsContent value="upload"><PdfUploadField upload={upload} /></TabsContent>
    <TabsContent value="library"><LibraryFilePicker selected={selectedFile} onSelect={onSelectFile} /></TabsContent>
  </Tabs>
}
