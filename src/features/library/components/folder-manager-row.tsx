import { useState } from 'react'
import { Check, Folder, FolderInput, MoreHorizontal, Pencil, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import type { FlattenedLibraryFolder, LibraryFolderRecord } from '@/types'
import { canMoveInto } from '../lib/folder-tree'
import { FolderSelect } from './folder-select'

export type FolderRowMode = 'rename' | 'move' | 'confirm'

/** One folder in the manager: a menu of actions, each opening an inline editor under the row. */
export function FolderManagerRow({
  folder,
  folders,
  mode,
  busy,
  onModeChange,
  onRename,
  onMove,
  onDelete,
}: {
  folder: FlattenedLibraryFolder
  folders: readonly LibraryFolderRecord[]
  mode: FolderRowMode | null
  busy: boolean
  onModeChange: (mode: FolderRowMode | null) => void
  onRename: (name: string) => void
  onMove: (parent: string) => void
  onDelete: () => void
}) {
  const [name, setName] = useState(folder.name)
  const [parent, setParent] = useState(folder.parent)

  function open(next: FolderRowMode) {
    setName(folder.name)
    setParent(folder.parent)
    onModeChange(next)
  }

  return (
    <div>
      <div className="flex min-h-12 items-center gap-2 py-1.5 pe-1.5" style={{ paddingInlineStart: 12 + folder.depth * 14 }}>
        <Folder className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        {mode === 'rename' ? (
          <>
            <Input
              autoFocus
              aria-label="目录名称"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-8 min-w-0 flex-1"
              onKeyDown={(event) => {
                if (event.key === 'Enter') onRename(name)
                if (event.key === 'Escape') {
                  event.stopPropagation()
                  onModeChange(null)
                }
              }}
            />
            <Button size="icon-sm" variant="ghost" onClick={() => onRename(name)} disabled={busy || !name.trim()} aria-label="保存重命名">
              <Check />
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={() => onModeChange(null)} aria-label="取消重命名">
              <X />
            </Button>
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate text-xs font-medium">{folder.name}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon-touch" variant="ghost" aria-label={`操作目录 ${folder.name}`} disabled={busy}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem onSelect={() => open('rename')}>
                    <Pencil />
                    重命名
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => open('move')}>
                    <FolderInput />
                    移动到…
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => open('confirm')}>
                  <Trash2 />
                  删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>

      {mode === 'move' ? (
        <div className="flex flex-wrap items-center gap-2 border-t bg-muted/20 px-3 py-2">
          <FolderSelect
            className="min-w-40 flex-1"
            folders={folders}
            value={parent}
            onValueChange={setParent}
            label="移动到"
            exclude={(candidate) => !canMoveInto(folder.id, candidate, folders)}
          />
          <div className="flex gap-1">
            <Button size="sm" onClick={() => onMove(parent)} disabled={busy || parent === folder.parent}>
              移动
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onModeChange(null)}>
              取消
            </Button>
          </div>
        </div>
      ) : null}

      {mode === 'confirm' ? (
        <div role="alert" className="flex flex-wrap items-center justify-end gap-2 border-t bg-danger-soft/50 px-3 py-2">
          <span className="me-auto text-caption text-danger">删除后，内容会回到根目录。</span>
          <Button size="sm" variant="ghost" onClick={() => onModeChange(null)}>
            取消
          </Button>
          <Button size="sm" variant="destructive" onClick={onDelete} disabled={busy}>
            删除
          </Button>
        </div>
      ) : null}
    </div>
  )
}
