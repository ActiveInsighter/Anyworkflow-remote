import { useState } from 'react'
import { Link } from 'react-router'
import { Check, FileText, FolderOpen, RefreshCw } from 'lucide-react'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { SearchField } from '@/components/form/search-field'
import { Button } from '@/components/ui/button'
import type { LibraryFile } from '@/lib/api/library-files'
import { formatFileSize, formatShortDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useLibraryFiles } from '../hooks/use-library-files'

function FileOption({ file, checked, onSelect }: { file: LibraryFile; checked: boolean; onSelect: () => void }) {
  return (
    <label
      className={cn(
        'flex min-h-touch min-w-0 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors duration-fast has-focus-visible:ring-[3px] has-focus-visible:ring-ring/35 sm:min-h-10',
        checked ? 'bg-accent text-accent-foreground' : 'hover:bg-subtle',
      )}
    >
      <input type="radio" name="libraryFile" value={file.id} checked={checked} onChange={onSelect} className="sr-only" />
      <FileText aria-hidden="true" className={cn('size-4 shrink-0', checked ? 'text-primary' : 'text-muted-foreground')} />
      <span className="min-w-0 flex-1 truncate text-body">{file.fileName}</span>
      <span className="hidden shrink-0 text-caption text-muted-foreground tabular-nums sm:inline">{formatShortDate(file.updatedAt)}</span>
      <span className="shrink-0 text-caption text-muted-foreground tabular-nums">{formatFileSize(file.size)}</span>
      <Check aria-hidden="true" className={cn('size-4 shrink-0 text-primary', !checked && 'invisible')} />
    </label>
  )
}

/** Choose a stored PDF from a searchable list. The chosen file stays listed whatever the search says. */
export function LibraryFilePicker({ selected, onSelect }: { selected: LibraryFile | null; onSelect: (file: LibraryFile | null) => void }) {
  const [query, setQuery] = useState('')
  const files = useLibraryFiles(query)
  const items = (files.data?.items ?? []).filter(file => file.fileName.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const listed = selected && !items.some(file => file.id === selected.id) ? [selected, ...items] : items
  return <div className="flex min-w-0 flex-col gap-2">
    <div className="flex min-w-0 items-center gap-1">
      <SearchField className="min-w-0 flex-1" label="搜索资料库文件" clearLabel="清空搜索" value={query} onValueChange={setQuery} />
      <Button type="button" variant="ghost" size="icon-touch" className="text-muted-foreground" aria-label="刷新文件" onClick={() => void files.reload()} disabled={files.loading || files.refreshing}>
        <RefreshCw className={files.refreshing ? 'animate-spin' : undefined} aria-hidden="true" />
      </Button>
      <Button asChild variant="ghost" size="icon-touch" className="text-muted-foreground">
        <Link to="/library" aria-label="管理资料库"><FolderOpen aria-hidden="true" /></Link>
      </Button>
    </div>
    {files.loading ? <LoadingState className="min-h-24" /> : null}
    <ErrorAlert inline>{files.error || files.moreError}</ErrorAlert>
    {listed.length ? (
      <div role="radiogroup" aria-label="资料库文件" className="flex max-h-52 min-w-0 flex-col gap-0.5 overflow-y-auto overscroll-contain">
        {listed.map(file => <FileOption key={file.id} file={file} checked={selected?.id === file.id} onSelect={() => onSelect(file)} />)}
        {files.data?.cursor ? <Button type="button" variant="ghost" size="sm" className="self-start text-muted-foreground" onClick={() => void files.loadMore()} disabled={files.loadingMore}>加载更多文件</Button> : null}
      </div>
    ) : null}
    {files.data && !listed.length ? <p className="px-2.5 py-3 text-body text-muted-foreground">{query ? '没有匹配的文件' : '资料库暂无文件，先上传一个 PDF。'}</p> : null}
  </div>
}
