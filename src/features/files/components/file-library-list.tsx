import { Copy, FileText, Play, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { LibraryFile } from '@/lib/api/library-files'
import { formatFileSize } from '@/lib/format'
import { writeClipboard } from '@/lib/platform/clipboard'

export function FileLibraryList({ files, pendingId, onDelete }: { files: LibraryFile[]; pendingId: string; onDelete: (file: LibraryFile) => void }) {
  return <Card className="min-w-0 divide-y">
    {files.map(file => <div key={file.id} className="flex min-w-0 flex-wrap items-center gap-3 p-4">
      <FileText aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 basis-36">
        <p className="truncate text-body font-medium" title={file.fileName}>{file.fileName}</p>
        <p className="text-xs text-muted-foreground">{formatFileSize(file.size)} · {new Date(file.createdAt).toLocaleDateString()}</p>
      </div>
      <div className="flex w-full items-center justify-end gap-1 sm:w-auto">
        <Button asChild variant="outline" size="touch"><Link to={`/file-converter?file=${encodeURIComponent(file.id)}`}><Play aria-hidden="true" />转换</Link></Button>
        <Button variant="ghost" size="icon-touch" aria-label={`复制 ${file.fileName} 链接`} onClick={async () => {
          if (await writeClipboard(file.sourceUrl)) toast.success('链接已复制')
          else toast.error('复制失败，请重试')
        }}><Copy aria-hidden="true" /></Button>
        <Button variant="ghost" size="icon-touch" disabled={pendingId === file.id} aria-label={`删除 ${file.fileName}`} onClick={() => onDelete(file)}><Trash2 aria-hidden="true" /></Button>
      </div>
    </div>)}
  </Card>
}
