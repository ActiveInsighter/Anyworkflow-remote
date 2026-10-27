import { Fragment, useMemo, useRef, useState } from 'react'
import type * as React from 'react'
import { ChevronRight, FolderOpen, MoreVertical, SearchX, Upload, type LucideIcon } from 'lucide-react'
import { EmptyState } from '@/components/feedback/empty-state'
import { LoadingState } from '@/components/feedback/loading-state'
import { Page, PageHeader } from '@/components/layout/page'
import { Button } from '@/components/ui/button'
import { DriveCreateButton, DriveFab } from './drive-create'
import { drivePath, sortEntries } from './drive-sort'
import { DriveSearch, DriveSortBar } from './drive-toolbar'
import type { DriveCreateAction, DriveEntry, DriveFolder, DriveSortField } from './drive-types'
import { DriveView } from './drive-view'
import { useDrivePrefs } from './use-drive-prefs'

/** Ancestors of the open folder as links, above its name. */
function Trail({ rootLabel, path, onOpen }: { rootLabel: string; path: readonly DriveFolder[]; onOpen: (id: string) => void }) {
  const ancestors = path.slice(0, -1)
  return (
    <nav aria-label="文件夹路径" className="-ms-1.5 flex min-w-0 items-center gap-0.5 overflow-x-auto scrollbar-none">
      {[{ id: '', name: rootLabel }, ...ancestors].map((folder, index) => (
        <Fragment key={folder.id || 'root'}>
          {index > 0 ? <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" /> : null}
          <button
            type="button"
            className="h-7 max-w-40 shrink-0 truncate rounded-md px-1.5 outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
            onClick={() => onOpen(folder.id)}
          >
            {folder.name}
          </button>
        </Fragment>
      ))}
    </nav>
  )
}

/**
 * A drive-like browser: search, sort and view switch on top; folders and items below; a
 * 新建 button (floating on phones); every entry's actions in a sheet. Callers own the data
 * and the sheets; the browser owns layout, sorting and the remembered view preferences.
 */
export function DriveBrowser({
  title,
  rootLabel,
  prefsScope,
  tabs,
  folders,
  currentFolder,
  onOpenFolder,
  onFolderMore,
  entries,
  searching,
  query,
  onQueryChange,
  searchLabel,
  sortFields,
  itemLabel,
  onMore,
  createActions,
  onDropFiles,
  dropLabel = '松开即可上传',
  headerActions,
  loading,
  alerts,
  empty,
  children,
}: {
  title: string
  /** Name of the top level in the trail and the move picker. */
  rootLabel: string
  prefsScope: string
  /** Optional switch between sibling libraries, under the search field. */
  tabs?: React.ReactNode
  folders: readonly DriveFolder[]
  currentFolder: string
  onOpenFolder: (id: string) => void
  /** Actions of the open folder itself (the button beside its name). */
  onFolderMore?: () => void
  /** Entries to show: the open folder's contents, or the search results. */
  entries: readonly DriveEntry[]
  searching: boolean
  query: string
  onQueryChange: (value: string) => void
  searchLabel: string
  sortFields?: DriveSortField[]
  itemLabel: string
  onMore: (entry: DriveEntry) => void
  createActions: DriveCreateAction[]
  /** Accept files dragged onto the page (desktop). */
  onDropFiles?: (files: File[]) => void
  dropLabel?: string
  headerActions?: React.ReactNode
  loading: boolean
  alerts?: React.ReactNode
  empty: { icon: LucideIcon; title: string; description?: string }
  /** Sheets and dialogs owned by the caller. */
  children?: React.ReactNode
}) {
  const prefs = useDrivePrefs(prefsScope)
  const path = useMemo(() => drivePath(currentFolder, folders), [currentFolder, folders])
  const here = path.at(-1)
  const sorted = useMemo(() => sortEntries(entries, prefs.sort), [entries, prefs.sort])
  const inFolder = Boolean(here) && !searching
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)
  const hasFiles = (event: React.DragEvent) => event.dataTransfer.types.includes('Files')
  const dropHandlers = onDropFiles
    ? {
        onDragEnter: (event: React.DragEvent) => {
          if (!hasFiles(event)) return
          event.preventDefault()
          depth.current++
          setDragging(true)
        },
        onDragOver: (event: React.DragEvent) => {
          if (hasFiles(event)) event.preventDefault()
        },
        onDragLeave: () => {
          depth.current = Math.max(0, depth.current - 1)
          if (!depth.current) setDragging(false)
        },
        onDrop: (event: React.DragEvent) => {
          if (!hasFiles(event)) return
          event.preventDefault()
          depth.current = 0
          setDragging(false)
          onDropFiles([...event.dataTransfer.files])
        },
      }
    : {}

  return (
    <Page className="relative min-h-full pb-[calc(7rem+env(safe-area-inset-bottom))] sm:pb-16" {...dropHandlers}>
      {dragging ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-2 z-raised grid place-items-center rounded-2xl border-2 border-dashed border-primary bg-primary-soft/70"
        >
          <span className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-md">
            <Upload className="size-4" />
            {dropLabel}
          </span>
        </div>
      ) : null}
      <PageHeader
        compact
        title={
          inFolder ? (
            <span className="flex min-w-0 items-center gap-1">
              <span className="truncate">{here!.name}</span>
              {onFolderMore ? (
                <Button
                  variant="ghost"
                  size="icon-touch"
                  className="shrink-0 rounded-full text-muted-foreground sm:size-9"
                  aria-label={`文件夹操作：${here!.name}`}
                  onClick={onFolderMore}
                >
                  <MoreVertical />
                </Button>
              ) : null}
            </span>
          ) : (
            title
          )
        }
        eyebrow={inFolder ? <Trail rootLabel={rootLabel} path={path} onOpen={onOpenFolder} /> : undefined}
        actions={
          <>
            {headerActions}
            <DriveCreateButton actions={createActions} className="hidden sm:inline-flex" />
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3">
        <DriveSearch value={query} onValueChange={onQueryChange} label={searchLabel} />
        {tabs}
        <DriveSortBar
          sort={prefs.sort}
          onSortChange={prefs.setSort}
          fields={sortFields}
          view={prefs.view}
          onViewChange={prefs.setView}
        />
      </div>

      {alerts}

      {loading ? (
        <LoadingState />
      ) : sorted.length ? (
        <DriveView entries={sorted} view={prefs.view} itemLabel={itemLabel} onOpenFolder={onOpenFolder} onMore={onMore} />
      ) : (
        <EmptyState
          icon={searching ? SearchX : here ? FolderOpen : empty.icon}
          title={searching ? '没有匹配的结果' : here ? '文件夹是空的' : empty.title}
          description={searching ? '搜索包含所有文件夹' : here ? undefined : empty.description}
        />
      )}

      <DriveFab actions={createActions} />
      {children}
    </Page>
  )
}
