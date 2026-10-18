import { Fragment } from 'react'
import { Home } from 'lucide-react'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import type { LibraryFolderRecord } from '@/types'

/** Folder trail from the tab root to the open folder; scrolls horizontally when deep. */
export function LibraryBreadcrumb({
  rootLabel,
  path,
  onOpen,
}: {
  rootLabel: string
  path: readonly LibraryFolderRecord[]
  onOpen: (folderId: string) => void
}) {
  const last = path.at(-1)
  return (
    <Breadcrumb aria-label="资料库目录" className="mb-2 min-w-0 overflow-x-auto scrollbar-none">
      <BreadcrumbList className="min-h-9 flex-nowrap whitespace-nowrap">
        <BreadcrumbItem>
          {last ? (
            <BreadcrumbLink asChild>
              <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-md px-1.5" onClick={() => onOpen('')}>
                <Home className="size-3.5" aria-hidden="true" />
                {rootLabel}
              </button>
            </BreadcrumbLink>
          ) : (
            <BreadcrumbPage className="inline-flex h-8 items-center gap-1.5 px-1.5">
              <Home className="size-3.5" aria-hidden="true" />
              {rootLabel}
            </BreadcrumbPage>
          )}
        </BreadcrumbItem>
        {path.map((folder) => (
          <Fragment key={folder.id}>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
            {folder === last ? (
              <BreadcrumbPage className="max-w-56 truncate px-1.5">{folder.name}</BreadcrumbPage>
            ) : (
              <BreadcrumbLink asChild>
                <button type="button" className="h-8 max-w-56 truncate rounded-md px-1.5" onClick={() => onOpen(folder.id)}>
                  {folder.name}
                </button>
              </BreadcrumbLink>
            )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
