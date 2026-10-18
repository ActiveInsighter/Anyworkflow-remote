import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { LibraryFolderRecord } from '@/types'
import { FolderSelect } from './folder-select'

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
  folders: readonly LibraryFolderRecord[]
  currentFolder: string
  title: string
  busy?: boolean
  onMove: (folder: string) => Promise<unknown>
}) {
  const [target, setTarget] = useState(currentFolder)

  useEffect(() => {
    if (open) setTarget(currentFolder)
  }, [open, currentFolder])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>移动到目录</DialogTitle>
          <DialogDescription className="truncate">{title}</DialogDescription>
        </DialogHeader>
        <FolderSelect folders={folders} value={target} onValueChange={setTarget} label="选择目标目录" />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            取消
          </Button>
          <Button
            onClick={async () => {
              await onMove(target)
              onOpenChange(false)
            }}
            disabled={busy || target === currentFolder}
          >
            移动
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
