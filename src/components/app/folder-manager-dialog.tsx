import { FolderPlus, Pencil, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { createLibraryFolder, deleteLibraryFolder, flattenLibraryFolders, updateLibraryFolder } from '@/lib/library'
import type { LibraryFolderRecord, LibraryFolderScope } from '@/types'

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
  folders: LibraryFolderRecord[]
  onChanged: () => Promise<void>
}) {
  const [name, setName] = useState('')
  const [parent, setParent] = useState('')
  const [busy, setBusy] = useState('')
  const [editing, setEditing] = useState('')
  const [editingName, setEditingName] = useState('')
  const flat = useMemo(() => flattenLibraryFolders(folders), [folders])

  async function create() {
    if (!name.trim() || busy) return
    setBusy('create')
    try {
      await createLibraryFolder(name, scope, parent)
      setName('')
      setParent('')
      await onChanged()
    } finally {
      setBusy('')
    }
  }

  async function rename(id: string) {
    if (!editingName.trim() || busy) return
    setBusy(id)
    try {
      await updateLibraryFolder(id, { name: editingName })
      setEditing('')
      setEditingName('')
      await onChanged()
    } finally {
      setBusy('')
    }
  }

  async function remove(id: string) {
    if (busy) return
    setBusy(id)
    try {
      await deleteLibraryFolder(id)
      await onChanged()
    } finally {
      setBusy('')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>目录</DialogTitle>
        </DialogHeader>

        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px_auto]">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="目录名称"
            maxLength={120}
            aria-label="目录名称"
            className="h-9"
          />
          <Select
            value={parent}
            onChange={(event) => setParent(event.target.value)}
            aria-label="上级目录"
            containerClassName="w-full"
          >
            <option value="">根目录</option>
            {flat.map((folder) => (
              <option key={folder.id} value={folder.id}>{'　'.repeat(folder.depth)}{folder.name}</option>
            ))}
          </Select>
          <Button size="sm" className="h-9" onClick={() => void create()} disabled={!name.trim() || Boolean(busy)}>
            <FolderPlus />新建
          </Button>
        </div>

        <div className="max-h-72 overflow-y-auto rounded-md border border-border">
          {flat.length === 0 ? <div className="p-4 text-xs text-muted-foreground">暂无目录</div> : null}
          {flat.map((folder) => (
            <div
              key={folder.id}
              className="flex items-center gap-2 border-b border-border px-2 py-2 transition-colors last:border-b-0 hover:bg-muted/40"
              style={{ paddingLeft: 8 + folder.depth * 14 }}
            >
              {editing === folder.id ? (
                <Input
                  autoFocus
                  value={editingName}
                  onChange={(event) => setEditingName(event.target.value)}
                  className="h-8 flex-1"
                  aria-label={'重命名 ' + folder.name}
                />
              ) : (
                <span className="min-w-0 flex-1 truncate text-xs">{folder.name}</span>
              )}
              {editing === folder.id ? (
                <Button size="sm" onClick={() => void rename(folder.id)} disabled={busy === folder.id}>保存</Button>
              ) : (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  onClick={() => {
                    setEditing(folder.id)
                    setEditingName(folder.name)
                  }}
                  aria-label={'重命名 ' + folder.name}
                >
                  <Pencil className="size-3.5" />
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="size-7 text-destructive hover:text-destructive"
                onClick={() => void remove(folder.id)}
                disabled={busy === folder.id}
                aria-label={'删除 ' + folder.name}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>完成</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
