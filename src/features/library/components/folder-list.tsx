import { ChevronRight, Folder } from 'lucide-react'
import { Card } from '@/components/ui/card'
import type { LibraryFolderRecord } from '@/types'

/** Sub-folders of the open folder, each with its direct contents count. */
export function FolderList({
  folders,
  counts,
  onOpen,
}: {
  folders: readonly LibraryFolderRecord[]
  counts: (folderId: string) => { items: number; folders: number }
  onOpen: (folderId: string) => void
}) {
  return (
    <Card className="mb-3 divide-y">
      {folders.map((folder) => {
        const count = counts(folder.id)
        const parts = [count.folders ? `${count.folders} 目录` : '', count.items ? `${count.items} 项` : ''].filter(Boolean)
        return (
          <button
            key={folder.id}
            type="button"
            onClick={() => onOpen(folder.id)}
            className="flex w-full items-center gap-3 px-3 py-3 text-left outline-none hover:bg-muted/40 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-4"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
              <Folder className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1 truncate text-body font-medium">{folder.name}</span>
            {parts.length ? (
              <span className="shrink-0 text-micro text-muted-foreground tabular-nums">{parts.join(' · ')}</span>
            ) : null}
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        )
      })}
    </Card>
  )
}
