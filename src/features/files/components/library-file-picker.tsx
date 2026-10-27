import { useState } from 'react'
import { Link } from 'react-router'
import { FolderOpen, RefreshCw } from 'lucide-react'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { SearchField } from '@/components/form/search-field'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import type { LibraryFile } from '@/lib/api/library-files'
import { formatFileSize } from '@/lib/format'
import { useLibraryFiles } from '../hooks/use-library-files'

export function LibraryFilePicker({ selected, onSelect }: { selected: LibraryFile | null; onSelect: (file: LibraryFile | null) => void }) {
  const [query, setQuery] = useState('')
  const files = useLibraryFiles(query)
  const items = (files.data?.items ?? []).filter(file => file.fileName.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  return <div className="flex min-w-0 flex-col gap-3">
    <SearchField label="搜索资料库文件" clearLabel="清空搜索" value={query} onValueChange={setQuery} />
    {files.loading ? <LoadingState /> : null}
    <ErrorAlert inline>{files.error || files.moreError}</ErrorAlert>
    <Field>
      <FieldLabel htmlFor="library-file">资料库文件</FieldLabel>
      <NativeSelect id="library-file" name="libraryFile" value={selected?.id ?? ''} onChange={event => onSelect(files.data?.items.find(file => file.id === event.target.value) ?? null)}>
        <NativeSelectOption value="">选择已上传的 PDF</NativeSelectOption>
        {selected && !items.some(file => file.id === selected.id) ? <NativeSelectOption value={selected.id}>{selected.fileName}</NativeSelectOption> : null}
        {items.map(file => <NativeSelectOption key={file.id} value={file.id}>{file.fileName} · {formatFileSize(file.size)}</NativeSelectOption>)}
      </NativeSelect>
    </Field>
    {files.data && !items.length ? <p className="text-xs text-muted-foreground">{query ? '没有匹配的文件' : '资料库暂无文件'}</p> : null}
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="ghost" size="sm" onClick={() => void files.reload()} disabled={files.loading || files.refreshing}><RefreshCw aria-hidden="true" />刷新文件</Button>
      {files.data?.cursor ? <Button type="button" variant="outline" size="sm" onClick={() => void files.loadMore()} disabled={files.loadingMore}>加载更多文件</Button> : null}
      <Button asChild variant="link" size="sm"><Link to="/library"><FolderOpen aria-hidden="true" />管理资料库</Link></Button>
    </div>
  </div>
}
