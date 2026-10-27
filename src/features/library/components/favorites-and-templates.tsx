import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { FolderPlus, LayoutTemplate, RefreshCw, Star, Unplug, Workflow } from 'lucide-react'
import { DriveActionSheet } from '@/components/drive/drive-action-sheet'
import { DriveBrowser } from '@/components/drive/drive-browser'
import { DriveNameModal } from '@/components/drive/drive-forms'
import { driveChildren, drivePath } from '@/components/drive/drive-sort'
import type { DriveEntry } from '@/components/drive/drive-types'
import { StatusBadge } from '@/components/data-display/status-badge'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { Page, PageHeader } from '@/components/layout/page'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { runStatusMeta, runTitle } from '@/lib/domain/run-status'
import { formatShortDate } from '@/lib/format'
import type { LibraryFolderRecord, RunFavoriteRecord, WorkflowTemplateRecord } from '@/types'
import { useLibraryDrive } from '../hooks/use-library-drive'
import { favoriteActions, libraryFolderActions, rootLabel, templateActions } from '../lib/library-actions'
import { templateTitle } from '../lib/template-title'

type Target = { kind: 'folder' | 'item'; id: string }

const matches = (needle: string, parts: string[]) => parts.join(' ').toLocaleLowerCase().includes(needle)

function favoriteEntry(item: RunFavoriteRecord, location?: string): DriveEntry {
  const run = item.runRecord
  const status = run ? runStatusMeta(run.status, run.requestedAction) : { label: '不可用', tone: 'neutral' as const }
  const updated = run?.updated || item.updated
  return {
    id: item.id,
    kind: 'item',
    name: runTitle(run),
    icon: Workflow,
    tone: 'primary',
    badge: <StatusBadge tone={status.tone} className="h-5 text-micro">{status.label}</StatusBadge>,
    meta: [formatShortDate(updated), location].filter(Boolean).join(' · '),
    href: `/runs/${item.run}`,
    updated,
  }
}

function templateEntry(item: WorkflowTemplateRecord, location?: string): DriveEntry {
  return {
    id: item.id,
    kind: 'item',
    name: templateTitle(item),
    icon: LayoutTemplate,
    tone: 'primary',
    meta: [formatShortDate(item.updated), item.tags.slice(0, 3).join('、'), location].filter(Boolean).join(' · '),
    href: `/templates/${item.id}`,
    updated: item.updated,
  }
}

function folderEntry(folder: LibraryFolderRecord, count: number): DriveEntry {
  return { id: folder.id, kind: 'folder', name: folder.name, meta: `${count} 项 · ${formatShortDate(folder.updated)}`, updated: folder.updated }
}

/** Favorite Runs and workflow templates, each browsed as a drive with its own folders. */
export function FavoritesAndTemplates() {
  const drive = useLibraryDrive()
  const { state, tab, folders, favorites, templates, current, location } = drive
  const [target, setTarget] = useState<Target | null>(null)
  const [creating, setCreating] = useState(false)
  const root = rootLabel(drive)

  const entries = useMemo(() => {
    const needle = location.needle
    const ids = new Set(folders.map((folder) => folder.id))
    const place = (folder: string) => (ids.has(folder) ? folder : '')
    const where = (folder: string) => (needle ? folders.find((item) => item.id === place(folder))?.name ?? root : undefined)
    const visible = (folder: string, text: string[]) => (needle ? matches(needle, text) : place(folder) === current)
    const filed = (tab === 'favorites' ? favorites : templates).map((item) => item.folder)
    const count = (id: string) =>
      folders.filter((folder) => folder.parent === id && folder.id !== id).length + filed.filter((folder) => folder === id).length
    const items =
      tab === 'favorites'
        ? favorites
            .filter((item) => visible(item.folder, [runTitle(item.runRecord), item.note]))
            .map((item) => favoriteEntry(item, where(item.folder)))
        : templates
            .filter((item) => visible(item.folder, [item.title, item.description, item.tags.join(' ')]))
            .map((item) => templateEntry(item, where(item.folder)))
    const shown = needle ? folders.filter((folder) => matches(needle, [folder.name])) : driveChildren(current, folders)
    return [...shown.map((folder) => folderEntry(folder, count(folder.id))), ...items]
  }, [folders, favorites, templates, tab, current, location.needle, root])

  if (!drive.session) {
    return (
      <Page>
        <PageHeader title="收藏和模板" />
        <EmptyState
          icon={Unplug}
          title="未连接"
          action={
            <Button asChild variant="secondary">
              <Link to="/settings">设置连接</Link>
            </Button>
          }
        />
      </Page>
    )
  }

  const targetFolder = target?.kind === 'folder' ? folders.find((folder) => folder.id === target.id) : undefined
  const targetFavorite = target?.kind === 'item' && tab === 'favorites' ? favorites.find((item) => item.id === target.id) : undefined
  const targetTemplate = target?.kind === 'item' && tab === 'templates' ? templates.find((item) => item.id === target.id) : undefined
  const targetEntry = targetFolder
    ? folderEntry(targetFolder, 0)
    : targetFavorite
      ? favoriteEntry(targetFavorite)
      : targetTemplate
        ? templateEntry(targetTemplate)
        : null
  const groups = targetFolder
    ? libraryFolderActions(targetFolder, drive)
    : targetFavorite
      ? favoriteActions(targetFavorite, drive)
      : targetTemplate
        ? templateActions(targetTemplate, drive)
        : []
  const placed = targetFolder?.parent ?? targetFavorite?.folder ?? targetTemplate?.folder ?? ''
  const description = targetEntry
    ? `位于 ${drivePath(placed, folders).map((folder) => folder.name).join(' / ') || root}`
    : undefined

  return (
    <DriveBrowser
      title="收藏和模板"
      rootLabel={root}
      prefsScope="library"
      tabs={
        <Tabs value={tab} onValueChange={(value) => drive.changeTab(value === 'templates' ? 'templates' : 'favorites')}>
          <TabsList variant="line" className="grid w-full grid-cols-2 gap-0">
            <TabsTrigger value="favorites" className="gap-2">
              <Star aria-hidden="true" />
              收藏
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-2">
              <LayoutTemplate aria-hidden="true" />
              模板
            </TabsTrigger>
          </TabsList>
        </Tabs>
      }
      folders={folders}
      currentFolder={current}
      onOpenFolder={location.openFolder}
      onFolderMore={current ? () => setTarget({ kind: 'folder', id: current }) : undefined}
      entries={entries}
      searching={Boolean(location.needle)}
      query={location.query}
      onQueryChange={location.setQuery}
      searchLabel={tab === 'favorites' ? '搜索收藏' : '搜索模板'}
      itemLabel={tab === 'favorites' ? '收藏' : '模板'}
      onMore={(entry) => setTarget({ kind: entry.kind, id: entry.id })}
      createActions={[{ id: 'folder', label: '新建文件夹', icon: FolderPlus, onSelect: () => setCreating(true) }]}
      headerActions={
        <Button
          variant="ghost"
          size="icon-touch"
          className="rounded-full"
          aria-label="刷新收藏和模板"
          disabled={state.loading || state.refreshing}
          onClick={() => void state.reload()}
        >
          <RefreshCw className={state.refreshing ? 'animate-spin' : undefined} />
        </Button>
      }
      loading={state.loading && !state.data}
      alerts={<ErrorAlert>{state.error}</ErrorAlert>}
      empty={
        tab === 'favorites'
          ? { icon: Star, title: '暂无收藏', description: '在 Run 详情中点击收藏，常用的工作流会出现在这里' }
          : { icon: LayoutTemplate, title: '暂无模板', description: '在 Run 详情中保存为模板，之后可一键复用' }
      }
    >
      <DriveActionSheet entry={targetEntry} description={description} groups={groups} onClose={() => setTarget(null)} />
      <DriveNameModal
        open={creating}
        onOpenChange={setCreating}
        title="新建文件夹"
        label="文件夹名称"
        initial="未命名文件夹"
        submitLabel="创建"
        onSubmit={(name) => drive.createFolder(name, current)}
      />
    </DriveBrowser>
  )
}
