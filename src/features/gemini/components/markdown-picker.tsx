import { useState } from 'react'
import { Link } from 'react-router'
import { FolderOpen, RefreshCw } from 'lucide-react'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { SearchField } from '@/components/form/search-field'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTrigger,
} from '@/components/ui/modal'
import { useLibraryFiles } from '@/features/files/hooks/use-library-files'
import type { LibraryFile } from '@/lib/api/library-files'
import { formatFileSize } from '@/lib/format'

export function MarkdownPicker({
  selected,
  onToggle,
  disabled,
}: {
  selected: LibraryFile[]
  onToggle: (file: LibraryFile) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <Modal open={open} onOpenChange={setOpen}>
      <ModalTrigger render={<Button type="button" variant="ghost" size="icon-touch" aria-label="添加 Markdown" disabled={disabled} />}>
        <FolderOpen data-icon="inline-start" />
        <span className="sr-only">添加 Markdown</span>
      </ModalTrigger>
      <ModalContent size="md">
        <ModalHeader>
          <ModalTitle>添加资料库文件</ModalTitle>
        </ModalHeader>
        <ModalBody>{open ? <MarkdownOptions selected={selected} onToggle={onToggle} /> : null}</ModalBody>
        <ModalFooter>
          <Button type="button" onClick={() => setOpen(false)}>
            完成选择（{selected.length}）
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

function MarkdownOptions({
  selected,
  onToggle,
}: {
  selected: LibraryFile[]
  onToggle: (file: LibraryFile) => void
}) {
  const [query, setQuery] = useState('')
  const files = useLibraryFiles(query, 'md')
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex items-center gap-2">
        <SearchField
          className="min-w-0 flex-1"
          label="搜索 Markdown 文件"
          clearLabel="清空搜索"
          value={query}
          onValueChange={setQuery}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-touch"
          aria-label="刷新 Markdown 文件"
          onClick={() => void files.reload()}
          disabled={files.loading || files.refreshing}
        >
          <RefreshCw />
        </Button>
      </div>
      <ErrorAlert>{files.error || files.moreError}</ErrorAlert>
      {files.loading ? <LoadingState label="加载 Markdown 文件…" /> : null}
      <FieldGroup>
        {(files.data?.items ?? [])
          .filter((file) => file.id.endsWith('.md'))
          .map((file) => (
            <Field key={file.id} orientation="horizontal">
              <Checkbox
                id={`md-${file.id}`}
                checked={selected.some((item) => item.id === file.id)}
                onCheckedChange={() => onToggle(file)}
                disabled={!selected.some((item) => item.id === file.id) && selected.length >= 20}
              />
              <FieldLabel htmlFor={`md-${file.id}`} className="min-h-touch min-w-0 flex-1">
                <span className="min-w-0 flex-1 break-all">{file.fileName}</span>
                <span className="shrink-0 text-muted-foreground">{formatFileSize(file.size)}</span>
              </FieldLabel>
            </Field>
          ))}
      </FieldGroup>
      {files.data?.cursor ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => void files.loadMore()}
          disabled={files.loadingMore}
        >
          加载更多文件
        </Button>
      ) : null}
      {files.data && !files.data.items.length ? (
        <p className="text-body text-muted-foreground">
          {query ? '没有匹配的 Markdown 文件。' : '请先在资料库上传 UTF-8 编码的 .md 文件。'}
        </p>
      ) : null}
      <Button asChild variant="link">
        <Link to="/library">管理资料库</Link>
      </Button>
    </div>
  )
}
