import { useMemo, useState } from 'react'
import { FolderPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useAsyncAction } from '@/hooks/use-async-action'
import { createLibraryFolder, deleteLibraryFolder, flattenLibraryFolders, updateLibraryFolder } from '@/lib/api/library'
import type { LibraryFolderRecord, LibraryFolderScope } from '@/types'
import { FolderManagerRow, type FolderRowMode } from './folder-manager-row'
import { FolderSelect } from './folder-select'

const FOLDER_NAME_MAX = 120

/** Create, rename, move and delete the folders of one library scope. */
export function FolderManagerDialog({
  open,
  onOpenChange,
  scope,
  folders,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  scope: LibraryFolderScope
  folders: readonly LibraryFolderRecord[]
  onChanged: () => Promise<void>
}) {
  const [name, setName] = useState('')
  const [parent, setParent] = useState('')
  const [active, setActive] = useState<{ id: string; mode: FolderRowMode } | null>(null)
  const action = useAsyncAction()
  const flat = useMemo(() => flattenLibraryFolders([...folders]), [folders])

  async function mutate(key: string, write: () => Promise<unknown>, success: string, failure: string) {
    const done = await action.run(
      key,
      async () => {
        await write()
        await onChanged()
        return true
      },
      { success, failure },
    )
    return Boolean(done)
  }

  async function create() {
    if (!name.trim()) return
    if (await mutate('create', () => createLibraryFolder(name, scope, parent), '目录已创建', '新建目录失败')) {
      setName('')
      setParent('')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{scope === 'favorite' ? '管理收藏目录' : '管理模板目录'}</DialogTitle>
          <DialogDescription>新建、重命名、移动或删除目录。</DialogDescription>
        </DialogHeader>

        <form
          className="rounded-lg border bg-muted/20 p-3"
          onSubmit={(event) => {
            event.preventDefault()
            void create()
          }}
        >
          <Field>
            <FieldLabel htmlFor="new-folder-name">新建目录</FieldLabel>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9.5rem_auto]">
              <Input
                id="new-folder-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="目录名称"
                maxLength={FOLDER_NAME_MAX}
              />
              <FolderSelect folders={folders} value={parent} onValueChange={setParent} label="上级目录" />
              <Button type="submit" disabled={!name.trim() || action.busy}>
                <FolderPlus data-icon="inline-start" />
                新建
              </Button>
            </div>
          </Field>
        </form>

        <div className="max-h-[52dvh] divide-y overflow-y-auto rounded-lg border">
          {flat.length === 0 ? <p className="p-5 text-center text-xs text-muted-foreground">暂无目录</p> : null}
          {flat.map((folder) => (
            <FolderManagerRow
              key={folder.id}
              folder={folder}
              folders={folders}
              mode={active?.id === folder.id ? active.mode : null}
              busy={action.pending === folder.id}
              onModeChange={(mode) => setActive(mode ? { id: folder.id, mode } : null)}
              onRename={async (next) => {
                if (!next.trim()) return
                if (await mutate(folder.id, () => updateLibraryFolder(folder.id, { name: next }), '目录已重命名', '重命名失败')) {
                  setActive(null)
                }
              }}
              onMove={async (nextParent) => {
                if (await mutate(folder.id, () => updateLibraryFolder(folder.id, { parent: nextParent }), '目录已移动', '移动目录失败')) {
                  setActive(null)
                }
              }}
              onDelete={async () => {
                if (await mutate(folder.id, () => deleteLibraryFolder(folder.id, scope), '目录已删除', '删除目录失败')) {
                  setActive(null)
                }
              }}
            />
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            完成
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
