import { Copy, Eye, FolderInput, FolderOpen, Link2, Pencil, Play, StarOff, Trash2, Workflow } from 'lucide-react'
import { toast } from 'sonner'
import { DriveConfirm, DriveFolderPicker, DriveNameForm } from '@/components/drive/drive-forms'
import { canMoveFolderInto } from '@/components/drive/drive-sort'
import type { DriveAction } from '@/components/drive/drive-types'
import { MAX_TITLE_LENGTH } from '@/lib/domain/limits'
import { writeClipboard } from '@/lib/platform/clipboard'
import type { LibraryFolderRecord, RunFavoriteRecord, WorkflowTemplateRecord } from '@/types'
import type { LibraryDrive } from '../hooks/use-library-drive'
import { templateTitle } from './template-title'

export function rootLabel(drive: Pick<LibraryDrive, 'tab'>) {
  return drive.tab === 'favorites' ? '全部收藏' : '全部模板'
}

function movePage(drive: LibraryDrive, current: string, onMove: (folder: string) => Promise<unknown>, exclude?: (id: string) => boolean): DriveAction {
  return {
    kind: 'page',
    id: 'move',
    label: '移动',
    icon: FolderInput,
    title: '移动到',
    render: (close) => (
      <DriveFolderPicker folders={drive.folders} current={current} exclude={exclude} rootLabel={rootLabel(drive)} onMove={onMove} onDone={close} />
    ),
  }
}

function copyLinkAction(path: string): DriveAction {
  return {
    kind: 'run',
    id: 'copy',
    label: '复制链接',
    icon: Link2,
    onSelect: async () => {
      if (await writeClipboard(new URL(path, window.location.origin).href)) toast.success('链接已复制')
      else toast.error('复制失败，请重试')
    },
  }
}

export function favoriteActions(item: RunFavoriteRecord, drive: LibraryDrive): DriveAction[][] {
  return [
    [{ kind: 'link', id: 'open', label: '打开 Run', icon: Workflow, href: `/runs/${item.run}` }],
    [copyLinkAction(`/runs/${item.run}`), movePage(drive, item.folder, (folder) => drive.moveFavorite(item, folder))],
    [{ kind: 'run', id: 'remove', label: '取消收藏', icon: StarOff, destructive: true, onSelect: () => void drive.removeFavorite(item) }],
  ]
}

export function templateActions(item: WorkflowTemplateRecord, drive: LibraryDrive): DriveAction[][] {
  const title = templateTitle(item)
  return [
    [
      { kind: 'link', id: 'use', label: '使用模板', icon: Play, href: `/runs/new?templateId=${encodeURIComponent(item.id)}` },
      { kind: 'link', id: 'open', label: '查看详情', icon: Eye, href: `/templates/${item.id}` },
    ],
    [
      {
        kind: 'page',
        id: 'rename',
        label: '重命名',
        icon: Pencil,
        title: '重命名',
        render: (close) => (
          <DriveNameForm initial={title} label="模板名称" submitLabel="保存" maxLength={MAX_TITLE_LENGTH} onSubmit={(name) => drive.renameTemplate(item, name)} onDone={close} />
        ),
      },
      { kind: 'run', id: 'duplicate', label: '创建副本', icon: Copy, onSelect: () => void drive.duplicateTemplate(item) },
      movePage(drive, item.folder, (folder) => drive.moveTemplate(item, folder)),
    ],
    [
      {
        kind: 'page',
        id: 'delete',
        label: '删除',
        icon: Trash2,
        destructive: true,
        title: '删除模板？',
        render: (close) => (
          <DriveConfirm message="删除后无法恢复。用它创建的 Run 不受影响。" confirmLabel="确认删除" onConfirm={() => drive.deleteTemplate(item)} onDone={close} />
        ),
      },
    ],
  ]
}

export function libraryFolderActions(folder: LibraryFolderRecord, drive: LibraryDrive): DriveAction[][] {
  return [
    [{ kind: 'run', id: 'open', label: '打开', icon: FolderOpen, onSelect: () => drive.location.openFolder(folder.id) }],
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
      movePage(drive, folder.parent, (parent) => drive.moveFolder(folder, parent), (id) => !canMoveFolderInto(folder.id, id, drive.folders)),
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
            message={`其中的${drive.tab === 'favorites' ? '收藏' : '模板'}和子文件夹会移到上一级，不会被删除。`}
            confirmLabel="删除文件夹"
            onConfirm={() => drive.deleteFolder(folder)}
            onDone={close}
          />
        ),
      },
    ],
  ]
}
