import { useState } from 'react'
import { FolderOpen, RefreshCw, SearchX } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDeleteDialog } from '@/components/feedback/confirm-dialog'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { SearchField } from '@/components/form/search-field'
import { Page, PageHeader } from '@/components/layout/page'
import { Button } from '@/components/ui/button'
import { deleteLibraryFile, type LibraryFile } from '@/lib/api/library-files'
import { toErrorMessage } from '@/lib/api/errors'
import { useLibraryFiles } from '../hooks/use-library-files'
import { usePdfUpload } from '../hooks/use-pdf-upload'
import { FileLibraryList } from './file-library-list'
import { PdfUploadField } from './pdf-upload-field'

export function FileLibrary() {
  const [query, setQuery] = useState('')
  const files = useLibraryFiles(query)
  const upload = usePdfUpload(() => { void files.reload() })
  const [target, setTarget] = useState<LibraryFile | null>(null)
  const [pendingId, setPendingId] = useState('')
  const [error, setError] = useState('')
  const items = (files.data?.items ?? []).filter(file => file.fileName.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  async function remove() {
    if (!target || pendingId) return
    setPendingId(target.id)
    setError('')
    try {
      await deleteLibraryFile(target.id)
      if (upload.uploaded?.id === target.id) upload.clear()
      setTarget(null)
      toast.success('文件已删除')
      await files.reload()
    } catch (cause) { setError(toErrorMessage(cause)) }
    finally { setPendingId('') }
  }

  return <Page>
    <PageHeader compact title="资料库" description="保存原文件，供不同转换任务重复使用。" actions={
      <Button variant="ghost" size="icon-touch" aria-label="刷新资料库" disabled={files.loading || files.refreshing} onClick={() => void files.reload()}><RefreshCw aria-hidden="true" className={files.refreshing ? 'animate-spin' : undefined} /></Button>
    } />
    <div className="mb-6"><PdfUploadField upload={upload} /></div>
    <SearchField label="搜索文件" clearLabel="清空搜索" value={query} onValueChange={setQuery} className="mb-4" />
    <ErrorAlert>{files.error || files.moreError}</ErrorAlert>
    {files.data?.unavailable ? <p className="mb-4 text-xs text-muted-foreground">{files.data.unavailable} 条历史记录的上传源文件已按旧规则过期，请重新上传需要复用的原文件。</p> : null}
    {!target ? <ErrorAlert>{error}</ErrorAlert> : null}
    {files.loading && !files.data ? <LoadingState /> : null}
    {items.length ? <FileLibraryList files={items} pendingId={pendingId} onDelete={file => { setError(''); setTarget(file) }} /> : !files.loading && files.data ? <EmptyState icon={query ? SearchX : FolderOpen} title={query ? '没有匹配的文件' : '暂无文件'} /> : null}
    {files.data?.cursor ? <Button variant="outline" size="touch" className="mt-4" disabled={files.loadingMore} onClick={() => void files.loadMore()}>{files.loadingMore ? '加载中…' : '加载更多文件'}</Button> : null}
    <ConfirmDeleteDialog open={Boolean(target)} onOpenChange={open => { if (!open) { setTarget(null); setError('') } }} title="删除文件？" description={`${target?.fileName ?? ''}。删除后无法用于新的转换、重跑或尚未读取原文件的任务；已生成的结果保留。${error ? ` ${error}` : ''}`} busy={Boolean(pendingId)} onConfirm={() => void remove()} />
  </Page>
}
