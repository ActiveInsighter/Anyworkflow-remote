import { Download, ExternalLink, FileOutput, FolderInput, FolderOpen, Link2, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { DriveConfirm, DriveFolderPicker, DriveNameForm } from '@/components/drive/drive-forms'
import { canMoveFolderInto } from '@/components/drive/drive-sort'
import type { DriveAction } from '@/components/drive/drive-types'
import type { LibraryFile, LibraryFileFolder } from '@/lib/api/library-files'
import { writeClipboard } from '@/lib/platform/clipboard'
import type { FileDrive } from '../hooks/use-file-drive'

export const FILE_ROOT_LABEL = '我的文件'

export function fileActions(file: LibraryFile, drive: FileDrive): DriveAction[][] {
  return [
    [
      { kind: 'link', id: 'open', label: '打开', icon: ExternalLink, href: file.sourceUrl, external: true },
      { kind: 'link', id: 'convert', label: '转换为 Markdown', icon: FileOutput, href: `/file-converter?file=${encodeURIComponent(file.id)}` },
    ],
    [
      {
        kind: 'run',
        id: 'copy',
        label: '复制链接',
        icon: Link2,
        onSelect: async () => {
          if (await writeClipboard(file.sourceUrl)) toast.success('链接已复制')
          else toast.error('复制失败，请重试')
        },
      },
      { kind: 'link', id: 'download', label: '下载', icon: Download, href: file.sourceUrl, download: file.fileName },
    ],
    [
      {
        kind: 'page',
        id: 'rename',
        label: '重命名',
        icon: Pencil,
        title: '重命名',
        render: (close) => (
          <DriveNameForm
            initial={file.fileName}
            label="文件名"
            submitLabel="保存"
            maxLength={240}
            keepExtension
            onSubmit={(name) => drive.renameFile(file, name)}
            onDone={close}
          />
        ),
      },
      {
        kind: 'page',
        id: 'move',
        label: '移动',
        icon: FolderInput,
        title: '移动到',
        render: (close) => (
          <DriveFolderPicker
            folders={drive.folders}
            current={file.folder}
            rootLabel={FILE_ROOT_LABEL}
            onMove={(folder) => drive.moveFile(file, folder)}
            onDone={close}
          />
        ),
      },
    ],
    [
      {
        kind: 'page',
        id: 'delete',
        label: '删除',
        icon: Trash2,
        destructive: true,
        title: '删除文件？',
        render: (close) => (
          <DriveConfirm
            message="删除后无法用于新的转换、重跑或尚未读取原文件的任务；已生成的结果保留。"
            confirmLabel="确认删除"
            onConfirm={() => drive.deleteFile(file)}
            onDone={close}
          />
        ),
      },
    ],
  ]
}

export function fileFolderActions(folder: LibraryFileFolder, drive: FileDrive, openFolder: (id: string) => void): DriveAction[][] {
  return [
    [{ kind: 'run', id: 'open', label: '打开', icon: FolderOpen, onSelect: () => openFolder(folder.id) }],
    [
      {
        kind: 'page',
        id: 'rename',
        label: '重命名',
        icon: Pencil,
        title: '重命名',
        render: (close) => (
          <DriveNameForm initial={folder.name} label="文件夹名称" submitLabel="保存" onSubmit={(name) => drive.renameFolder(folder, name)} onDone={close} />
        ),
      },
      {
        kind: 'page',
        id: 'move',
        label: '移动',
        icon: FolderInput,
        title: '移动到',
        render: (close) => (
          <DriveFolderPicker
            folders={drive.folders}
            current={folder.parent}
            exclude={(id) => !canMoveFolderInto(folder.id, id, drive.folders)}
            rootLabel={FILE_ROOT_LABEL}
            onMove={(parent) => drive.moveFolder(folder, parent)}
            onDone={close}
          />
        ),
      },
    ],
    [
      {
        kind: 'page',
        id: 'delete',
        label: '删除',
        icon: Trash2,
        destructive: true,
        title: '删除文件夹？',
        render: (close) => (
          <DriveConfirm
            message="其中的文件和子文件夹会移到上一级，不会被删除。"
            confirmLabel="删除文件夹"
            onConfirm={() => drive.deleteFolder(folder)}
            onDone={close}
          />
        ),
      },
    ],
  ]
}
