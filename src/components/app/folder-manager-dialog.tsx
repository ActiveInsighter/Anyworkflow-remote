import { Check, Folder, FolderInput, FolderPlus, Pencil, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { createLibraryFolder, deleteLibraryFolder, flattenLibraryFolders, updateLibraryFolder } from '@/lib/library'
import { toErrorMessage } from '@/lib/api'
import type { LibraryFolderRecord, LibraryFolderScope } from '@/types'

function canMoveInto(folderId: string, candidateId: string, folders: LibraryFolderRecord[]): boolean {
  if (!candidateId) return true
  if (candidateId === folderId) return false
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const seen = new Set<string>()
  let current = byId.get(candidateId)
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    if (current.parent === folderId) return false
    current = current.parent ? byId.get(current.parent) : undefined
  }
  return true
}

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
  const [moving, setMoving] = useState('')
  const [movingParent, setMovingParent] = useState('')
  const [confirming, setConfirming] = useState('')
  const flat = useMemo(() => flattenLibraryFolders(folders), [folders])
  const title = scope === 'favorite' ? '管理收藏目录' : '管理模板目录'

  async function create() {
    if (!name.trim() || busy) return
    setBusy('create')
    try {
      await createLibraryFolder(name, scope, parent)
      setName('')
      setParent('')
      await onChanged()
      toast.success('目录已创建')
    } catch (error) {
      toast.error('新建目录失败', { description: toErrorMessage(error) })
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
      toast.success('目录已重命名')
    } catch (error) {
      toast.error('重命名失败', { description: toErrorMessage(error) })
    } finally {
      setBusy('')
    }
  }

  async function move(id: string) {
    if (busy) return
    setBusy(id)
    try {
      await updateLibraryFolder(id, { parent: movingParent })
      setMoving('')
      setMovingParent('')
      await onChanged()
      toast.success('目录已移动')
    } catch (error) {
      toast.error('移动目录失败', { description: toErrorMessage(error) })
    } finally {
      setBusy('')
    }
  }

  async function remove(id: string) {
    if (busy) return
    setBusy(id)
    try {
      await deleteLibraryFolder(id, scope)
      setConfirming('')
      await onChanged()
      toast.success('目录已删除')
    } catch (error) {
      toast.error('删除目录失败', { description: toErrorMessage(error) })
    } finally {
      setBusy('')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium">
            <FolderPlus className="size-4 text-muted-foreground" />
            新建目录
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_auto]">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="目录名称"
              maxLength={120}
              className="h-9"
              onKeyDown={(event) => {
                if (event.key === 'Enter') void create()
              }}
            />
            <Select value={parent} onChange={(event) => setParent(event.target.value)} containerClassName="w-full" aria-label="上级目录">
              <option value="">根目录</option>
              {flat.map((folder) => (
                <option key={folder.id} value={folder.id}>{'　'.repeat(folder.depth)}{folder.name}</option>
              ))}
            </Select>
            <Button size="sm" className="h-9" onClick={() => void create()} disabled={!name.trim() || Boolean(busy)}>
              <FolderPlus className="size-4" />
              新建
            </Button>
          </div>
        </div>

        <div className="max-h-[52vh] overflow-y-auto rounded-lg border border-border">
          {flat.length === 0 ? (
            <div className="p-5 text-center text-xs text-muted-foreground">暂无目录</div>
          ) : null}

          {flat.map((folder) => {
            const isEditing = editing === folder.id
            const isMoving = moving === folder.id
            const isConfirming = confirming === folder.id

            return (
              <div key={folder.id} className="border-b border-border last:border-b-0">
                <div
                  className="flex items-center gap-2 px-3 py-2.5"
                  style={{ paddingLeft: 12 + folder.depth * 14 }}
                >
                  <Folder className="size-4 shrink-0 text-muted-foreground" />
                  {isEditing ? (
                    <Input
                      autoFocus
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      className="h-8 min-w-0 flex-1"
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void rename(folder.id)
                        if (event.key === 'Escape') setEditing('')
                      }}
                    />
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">{folder.name}</span>
                  )}

                  {isEditing ? (
                    <>
                      <Button size="icon" variant="ghost" className="size-8" onClick={() => void rename(folder.id)} aria-label="保存重命名">
                        <Check className="size-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="size-8" onClick={() => setEditing('')} aria-label="取消重命名">
                        <X className="size-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        onClick={() => {
                          setEditing(folder.id)
                          setEditingName(folder.name)
                          setMoving('')
                          setConfirming('')
                        }}
                        aria-label="重命名目录"
                        title="重命名"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        onClick={() => {
                          setMoving(folder.id)
                          setMovingParent(folder.parent)
                          setEditing('')
                          setConfirming('')
                        }}
                        aria-label="移动目录"
                        title="移动"
                      >
                        <FolderInput className="size-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-destructive hover:text-destructive"
                        onClick={() => {
                          setConfirming(folder.id)
                          setEditing('')
                          setMoving('')
                        }}
                        aria-label="删除目录"
                        title="删除"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </>
                  )}
                </div>

                {isMoving ? (
                  <div className="flex items-center gap-2 border-t border-border bg-muted/20 px-3 py-2">
                    <Select
                      value={movingParent}
                      onChange={(event) => setMovingParent(event.target.value)}
                      containerClassName="min-w-0 flex-1"
                      aria-label="移动到"
                    >
                      <option value="">根目录</option>
                      {flat.filter((candidate) => canMoveInto(folder.id, candidate.id, folders)).map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {'　'.repeat(candidate.depth)}{candidate.name}
                        </option>
                      ))}
                    </Select>
                    <Button size="sm" onClick={() => void move(folder.id)} disabled={busy === folder.id || movingParent === folder.parent}>移动</Button>
                    <Button size="sm" variant="ghost" onClick={() => setMoving('')}>取消</Button>
                  </div>
                ) : null}

                {isConfirming ? (
                  <div className="flex items-center justify-end gap-2 border-t border-border bg-danger-soft/50 px-3 py-2">
                    <span className="me-auto text-[11px] text-destructive">删除后，内容会回到根目录。</span>
                    <Button size="sm" variant="ghost" onClick={() => setConfirming('')}>取消</Button>
                    <Button size="sm" variant="destructive" onClick={() => void remove(folder.id)} disabled={busy === folder.id}>删除</Button>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>完成</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
