import { useMemo, useRef, useState } from 'react'
import { FileText, FolderPlus, HardDrive, RefreshCw, Upload } from 'lucide-react'
import { DriveActionSheet } from '@/components/drive/drive-action-sheet'
import { DriveBrowser } from '@/components/drive/drive-browser'
import { DriveNameModal } from '@/components/drive/drive-forms'
import { driveChildren, drivePath } from '@/components/drive/drive-sort'
import type { DriveCreateAction, DriveEntry } from '@/components/drive/drive-types'
import { useDriveLocation } from '@/components/drive/use-drive-location'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { Button } from '@/components/ui/button'
import type { LibraryFile, LibraryFileFolder } from '@/lib/api/library-files'
import { formatFileSize, formatShortDate } from '@/lib/format'
import { useFileDrive } from '../hooks/use-file-drive'
import { useUploadQueue } from '../hooks/use-upload-queue'
import { FILE_ROOT_LABEL, fileActions, fileFolderActions } from '../lib/file-actions'
import { UploadPanel } from './upload-panel'

type Target = { kind: 'file' | 'folder'; id: string }

function fileEntry(file: LibraryFile, location?: string): DriveEntry {
  return {
    id: file.id,
    kind: 'item',
    name: file.fileName,
    icon: FileText,
    tone: 'danger',
    meta: [formatFileSize(file.size), formatShortDate(file.updatedAt), location].filter(Boolean).join(' · '),
    href: file.sourceUrl,
    external: true,
    updated: file.updatedAt,
    size: file.size,
  }
}

function folderEntry(folder: LibraryFileFolder, count: number): DriveEntry {
  return {
    id: folder.id,
    kind: 'folder',
    name: folder.name,
    meta: `${count} 项 · ${formatShortDate(folder.updatedAt)}`,
    updated: folder.updatedAt,
  }
}

/** The persistent PDF library as a drive: folders, upload anywhere, actions in a sheet. */
export function FileLibrary() {
  const drive = useFileDrive()
  const { state, files, folders } = drive
  const location = useDriveLocation()
  const input = useRef<HTMLInputElement>(null)
  const [target, setTarget] = useState<Target | null>(null)
  const [creating, setCreating] = useState(false)
  const queue = useUploadQueue((file, folder) => drive.placeUpload(file.id ?? '', folder))

  const folderIds = useMemo(() => new Set(folders.map((folder) => folder.id)), [folders])
  const current = folderIds.has(location.folder) ? location.folder : ''

  const entries = useMemo(() => {
    const placeOf = (folder: string) => (folderIds.has(folder) ? folder : '')
    const count = (id: string) => folders.filter((folder) => folder.parent === id).length + files.filter((file) => file.folder === id).length
    if (location.needle) {
      const name = (id: string) => folders.find((folder) => folder.id === id)?.name ?? FILE_ROOT_LABEL
      return [
        ...folders.filter((folder) => folder.name.toLocaleLowerCase().includes(location.needle)).map((folder) => folderEntry(folder, count(folder.id))),
        ...files.filter((file) => file.fileName.toLocaleLowerCase().includes(location.needle)).map((file) => fileEntry(file, name(placeOf(file.folder)))),
      ]
    }
    return [
      ...driveChildren(current, folders).map((folder) => folderEntry(folder, count(folder.id))),
      ...files.filter((file) => placeOf(file.folder) === current).map((file) => fileEntry(file)),
    ]
  }, [files, folders, folderIds, current, location.needle])

  const targetFile = target?.kind === 'file' ? files.find((file) => file.id === target.id) : undefined
  const targetFolder = target?.kind === 'folder' ? folders.find((folder) => folder.id === target.id) : undefined
  const targetEntry = targetFile ? fileEntry(targetFile) : targetFolder ? folderEntry(targetFolder, 0) : null
  const groups = targetFile
    ? fileActions(targetFile, drive)
    : targetFolder
      ? fileFolderActions(targetFolder, drive, location.openFolder)
      : []
  const description = targetFile
    ? `${formatFileSize(targetFile.size)} · 上传于 ${formatShortDate(targetFile.createdAt)}`
    : targetFolder
      ? `位于 ${drivePath(targetFolder.parent, folders).map((folder) => folder.name).join(' / ') || FILE_ROOT_LABEL}`
      : undefined

  const create: DriveCreateAction[] = [
    { id: 'upload', label: '上传 PDF', icon: Upload, onSelect: () => input.current?.click() },
    { id: 'folder', label: '新建文件夹', icon: FolderPlus, onSelect: () => setCreating(true) },
  ]

  return (
    <DriveBrowser
      title="资料库"
      rootLabel={FILE_ROOT_LABEL}
      prefsScope="files"
      folders={folders}
      currentFolder={current}
      onOpenFolder={location.openFolder}
      onFolderMore={current ? () => setTarget({ kind: 'folder', id: current }) : undefined}
      entries={entries}
      searching={Boolean(location.needle)}
      query={location.query}
      onQueryChange={location.setQuery}
      searchLabel="在资料库中搜索"
      sortFields={['name', 'updated', 'size']}
      itemLabel="文件"
      onMore={(entry) => setTarget({ kind: entry.kind === 'folder' ? 'folder' : 'file', id: entry.id })}
      createActions={create}
      onDropFiles={(dropped) => queue.add(dropped, current)}
      dropLabel={`松开即可上传到「${drivePath(current, folders).at(-1)?.name ?? FILE_ROOT_LABEL}」`}
      headerActions={
        <Button
          variant="ghost"
          size="icon-touch"
          className="rounded-full"
          aria-label="刷新资料库"
          disabled={state.loading || state.refreshing}
          onClick={() => void state.reload()}
        >
          <RefreshCw className={state.refreshing ? 'animate-spin' : undefined} />
        </Button>
      }
      loading={state.loading && !state.data}
      alerts={
        <>
          <ErrorAlert>{state.error}</ErrorAlert>
          {state.data?.unavailable ? (
            <p className="mb-4 text-xs text-muted-foreground">
              {state.data.unavailable} 条历史记录的上传源文件已按旧规则过期，请重新上传需要复用的原文件。
            </p>
          ) : null}
        </>
      }
      empty={{ icon: HardDrive, title: '资料库是空的', description: '上传 PDF 后可在不同转换任务中重复使用' }}
    >
      <input
        ref={input}
        type="file"
        accept=".pdf,application/pdf"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-label="选择 PDF 文件"
        onChange={(event) => {
          const picked = [...(event.target.files ?? [])]
          event.target.value = ''
          queue.add(picked, current)
        }}
      />
      <DriveActionSheet entry={targetEntry} description={description} groups={groups} onClose={() => setTarget(null)} />
      <DriveNameModal
        open={creating}
        onOpenChange={setCreating}
        title="新建文件夹"
        label="文件夹名称"
        initial="未命名文件夹"
        submitLabel="创建"
        onSubmit={(name) => drive.createFolder(name, current)}
      />
      <UploadPanel queue={queue} />
    </DriveBrowser>
  )
}
