import { FolderInput } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
import { flattenLibraryFolders } from '@/lib/library'
import type { LibraryFolderRecord } from '@/types'

export function MoveToFolderDialog({
  open,
  onOpenChange,
  folders,
  currentFolder,
  title,
  busy,
  onMove,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  folders: LibraryFolderRecord[]
  currentFolder: string
  title: string
  busy?: boolean
  onMove: (folder: string) => Promise<void>
}) {
  const [target, setTarget] = useState(currentFolder)
  const flat = useMemo(() => flattenLibraryFolders(folders), [folders])

  useEffect(() => {
    if (open) setTarget(currentFolder)
  }, [open, currentFolder])

  async function submit() {
    await onMove(target)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FolderInput className="size-4 text-muted-foreground" />
            移动
          </DialogTitle>
        </DialogHeader>

        <div className="min-w-0 truncate text-xs text-muted-foreground">{title}</div>

        <Select
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          containerClassName="w-full"
          aria-label="选择目标目录"
        >
          <option value="">根目录</option>
          {flat.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {'　'.repeat(folder.depth)}{folder.name}
            </option>
          ))}
        </Select>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>取消</Button>
          <Button onClick={() => void submit()} disabled={busy || target === currentFolder}>移动</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
