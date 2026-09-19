import {
  ChevronRight,
  Copy,
  Folder,
  FolderCog,
  Home,
  Library,
  RefreshCw,
  Search,
  Star,
  Trash2,
  Workflow,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import {
  AppPage,
  EmptyState,
  ErrorBanner,
  ListRow,
  LoadingState,
  PageHeader,
  Panel,
  SelectInput,
  StatusBadge,
  Toolbar,
} from '@/components/app/ui'
import { FolderManagerDialog } from '@/components/app/folder-manager-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAsyncData } from '@/hooks/useAsyncData'
import { toErrorMessage } from '@/lib/api'
import { formatDateTime, runStatusMeta } from '@/lib/format'
import {
  deleteRunFavorite,
  deleteWorkflowTemplate,
  duplicateWorkflowTemplate,
  flattenLibraryFolders,
  listLibrary,
  moveRunFavorite,
  updateWorkflowTemplate,
} from '@/lib/library'
import { useSession } from '@/lib/session'
import type {
  FlattenedLibraryFolder,
  LibraryFolderRecord,
  LibraryFolderScope,
  RunFavoriteRecord,
  WorkflowTemplateRecord,
} from '@/types'
import { toast } from 'sonner'

type Tab = 'favorites' | 'templates'

function folderSort(a: LibraryFolderRecord, b: LibraryFolderRecord) {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'zh-CN')
}

function folderPath(folderId: string, folders: LibraryFolderRecord[]): LibraryFolderRecord[] {
  if (!folderId) return []
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const path: LibraryFolderRecord[] = []
  const seen = new Set<string>()
  let current = byId.get(folderId)

  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    path.unshift(current)
    current = current.parent ? byId.get(current.parent) : undefined
  }

  return path
}

function folderLabel(folder: FlattenedLibraryFolder) {
  return '　'.repeat(folder.depth) + folder.name
}

export function LibraryPage() {
  const session = useSession()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab: Tab = searchParams.get('tab') === 'templates' ? 'templates' : 'favorites'
  const requestedFolder = searchParams.get('folder') || ''
  const [query, setQuery] = useState('')
  const [folderDialog, setFolderDialog] = useState(false)
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState('')

  const state = useAsyncData(
    () => listLibrary(),
    [session?.record.id],
    {
      enabled: Boolean(session),
      staleMs: 15_000,
      cacheKey: session ? `library:${session.record.id}` : undefined,
      errorMessage: toErrorMessage,
    },
  )

  const activeFolders = useMemo(
    () => tab === 'favorites' ? state.data?.favoriteFolders ?? [] : state.data?.templateFolders ?? [],
    [state.data?.favoriteFolders, state.data?.templateFolders, tab],
  )
  const flattenedFolders = useMemo(() => flattenLibraryFolders(activeFolders), [activeFolders])
  const activeFolder = activeFolders.find((folder) => folder.id === requestedFolder)
  const currentFolder = activeFolder?.id || ''
  const path = useMemo(() => folderPath(currentFolder, activeFolders), [currentFolder, activeFolders])
  const childFolders = useMemo(
    () => activeFolders.filter((folder) => folder.parent === currentFolder).slice().sort(folderSort),
    [activeFolders, currentFolder],
  )
  const normalizedQuery = query.trim().toLocaleLowerCase()

  const favorites = useMemo(() => {
    return (state.data?.favorites ?? []).filter((item) => {
      if (!normalizedQuery && item.folder !== currentFolder) return false
      if (!normalizedQuery) return true
      const title = item.runRecord?.title || ''
      return [title, item.note, item.folderRecord?.name || ''].join(' ').toLocaleLowerCase().includes(normalizedQuery)
    })
  }, [state.data?.favorites, normalizedQuery, currentFolder])

  const templates = useMemo(() => {
    return (state.data?.templates ?? []).filter((item) => {
      if (!normalizedQuery && item.folder !== currentFolder) return false
      if (!normalizedQuery) return true
      return [item.title, item.description, item.tags.join(' '), item.folderRecord?.name || '']
        .join(' ')
        .toLocaleLowerCase()
        .includes(normalizedQuery)
    })
  }, [state.data?.templates, normalizedQuery, currentFolder])

  function changeTab(next: Tab) {
    const params = new URLSearchParams(searchParams)
    if (next === 'favorites') params.delete('tab')
    else params.set('tab', next)
    params.delete('folder')
    setQuery('')
    setSearchParams(params)
  }

  function openFolder(folder: string) {
    const params = new URLSearchParams(searchParams)
    if (folder) params.set('folder', folder)
    else params.delete('folder')
    setQuery('')
    setSearchParams(params)
  }

  async function reload() {
    setActionError('')
    await state.reload()
  }

  async function guard(id: string, action: () => Promise<void>, success?: string) {
    if (busy) return
    setBusy(id)
    setActionError('')
    try {
      await action()
      if (success) toast.success(success)
    } catch (error) {
      const message = toErrorMessage(error)
      setActionError(message)
      toast.error('操作失败', { description: message })
    } finally {
      setBusy('')
    }
  }

  const removeFavorite = (item: RunFavoriteRecord) =>
    guard(item.id, async () => {
      await deleteRunFavorite(item.id)
      await state.reload()
    }, '已取消收藏')

  const moveFavorite = (item: RunFavoriteRecord, folder: string) =>
    guard(item.id, async () => {
      await moveRunFavorite(item.id, folder)
      await state.reload()
    }, '收藏已移动')

  const duplicateTemplate = (item: WorkflowTemplateRecord) =>
    guard(item.id, async () => {
      const copy = await duplicateWorkflowTemplate(item)
      toast.success('模板已复制')
      navigate('/templates/' + copy.id)
    })

  const moveTemplate = (item: WorkflowTemplateRecord, folder: string) =>
    guard(item.id, async () => {
      await updateWorkflowTemplate(item.id, { folder })
      await state.reload()
    }, '模板已移动')

  const removeTemplate = (item: WorkflowTemplateRecord) =>
    guard(item.id, async () => {
      await deleteWorkflowTemplate(item.id)
      await state.reload()
    }, '模板已删除')

  if (!session) {
    return (
      <AppPage>
        <PageHeader title="资料库" />
        <EmptyState title="未连接" action={<Button asChild variant="secondary"><Link to="/settings">设置连接</Link></Button>} />
      </AppPage>
    )
  }

  const scope: LibraryFolderScope = tab === 'favorites' ? 'favorite' : 'template'
  const rootLabel = tab === 'favorites' ? '收藏' : '模板'

  return (
    <AppPage>
      <PageHeader
        title="资料库"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setFolderDialog(true)}>
              <FolderCog />
              管理目录
            </Button>
            <Button variant="ghost" size="icon" onClick={() => void reload()} disabled={state.loading} aria-label="刷新资料库">
              <RefreshCw className={state.loading ? 'animate-spin' : undefined} />
            </Button>
          </>
        }
      />

      {state.error ? <ErrorBanner>{state.error}</ErrorBanner> : null}
      {actionError ? <ErrorBanner>{actionError}</ErrorBanner> : null}

      <Toolbar className="mb-3">
        <Tabs value={tab} onValueChange={(value) => changeTab(value === 'templates' ? 'templates' : 'favorites')}>
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="favorites">收藏</TabsTrigger>
            <TabsTrigger value="templates">模板</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-9 pe-9 ps-[34px]"
            placeholder={tab === 'favorites' ? '搜索收藏' : '搜索模板'}
            aria-label={tab === 'favorites' ? '搜索收藏' : '搜索模板'}
          />
          {query ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute end-1 top-1/2 size-7 -translate-y-1/2"
              onClick={() => setQuery('')}
              aria-label="清空搜索"
            >
              <X className="size-3.5" />
            </Button>
          ) : null}
        </div>
      </Toolbar>

      {!normalizedQuery ? (
        <nav
          aria-label="资料库目录"
          className="mb-2 flex min-h-9 min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap text-[12px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <button
            type="button"
            onClick={() => openFolder('')}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 font-medium hover:bg-muted"
            aria-current={!currentFolder ? 'page' : undefined}
          >
            <Home className="size-3.5" />
            {rootLabel}
          </button>
          {path.map((folder) => (
            <span key={folder.id} className="flex shrink-0 items-center gap-1">
              <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <button
                type="button"
                onClick={() => openFolder(folder.id)}
                className="h-8 max-w-[220px] truncate rounded-md px-2 font-medium hover:bg-muted"
                aria-current={folder.id === currentFolder ? 'page' : undefined}
              >
                {folder.name}
              </button>
            </span>
          ))}
        </nav>
      ) : null}

      {state.loading && !state.data ? <LoadingState /> : null}

      {!normalizedQuery && childFolders.length ? (
        <Panel className="mb-3">
          {childFolders.map((folder) => {
            const directItemCount = tab === 'favorites'
              ? (state.data?.favorites ?? []).filter((item) => item.folder === folder.id).length
              : (state.data?.templates ?? []).filter((item) => item.folder === folder.id).length
            const childCount = activeFolders.filter((candidate) => candidate.parent === folder.id).length

            return (
              <button
                key={folder.id}
                type="button"
                onClick={() => openFolder(folder.id)}
                className="flex w-full items-center gap-3 border-b border-border px-3 py-3 text-left outline-none last:border-b-0 hover:bg-muted/40 focus-visible:bg-muted/50 sm:px-4"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <Folder className="size-5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{folder.name}</span>
                {directItemCount + childCount > 0 ? (
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                    {childCount ? `${childCount} 目录` : ''}
                    {childCount && directItemCount ? ' · ' : ''}
                    {directItemCount ? `${directItemCount} 项` : ''}
                  </span>
                ) : null}
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            )
          })}
        </Panel>
      ) : null}

      {tab === 'favorites' && favorites.length ? (
        <Panel>
          {favorites.map((item) => {
            const run = item.runRecord
            const status = run ? runStatusMeta(run.status, run.requestedAction) : { label: '不可用', tone: 'neutral' as const }
            return (
              <ListRow key={item.id} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px_auto] sm:items-center sm:gap-5">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <Star className="size-3.5 shrink-0 fill-warning text-warning" aria-hidden="true" />
                    <Link to={'/runs/' + item.run} className="truncate text-[13px] font-medium outline-none hover:underline focus-visible:underline">
                      {run?.title || '未命名 Run'}
                    </Link>
                    <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                  </div>
                  <div className="mt-1 truncate text-[10px] text-muted-foreground">
                    {normalizedQuery && item.folderRecord?.name ? item.folderRecord.name + ' · ' : ''}{formatDateTime(item.updated)}
                  </div>
                </div>

                <SelectInput
                  value={item.folder}
                  onChange={(event) => void moveFavorite(item, event.target.value)}
                  disabled={busy === item.id}
                  aria-label="移动收藏"
                >
                  <option value="">根目录</option>
                  {flattenedFolders.map((folder) => (
                    <option key={folder.id} value={folder.id}>{folderLabel(folder)}</option>
                  ))}
                </SelectInput>

                <div className="flex items-center gap-1 sm:justify-end">
                  <Button size="sm" variant="ghost" asChild><Link to={'/runs/' + item.run}><Workflow />打开</Link></Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => void removeFavorite(item)}
                    disabled={busy === item.id}
                    aria-label="取消收藏"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </ListRow>
            )
          })}
        </Panel>
      ) : null}

      {tab === 'templates' && templates.length ? (
        <Panel>
          {templates.map((item) => (
            <ListRow key={item.id} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px_auto] sm:items-center sm:gap-5">
              <div className="min-w-0">
                <Link to={'/templates/' + item.id} className="block truncate text-[13px] font-medium outline-none hover:underline focus-visible:underline">
                  {item.title || '未命名模板'}
                </Link>
                <div className="mt-1 truncate text-[10px] text-muted-foreground">
                  {normalizedQuery && item.folderRecord?.name ? item.folderRecord.name + ' · ' : ''}{formatDateTime(item.updated)}
                </div>
                {item.tags.length ? (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {item.tags.map((tag) => (
                      <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{tag}</span>
                    ))}
                  </div>
                ) : null}
              </div>

              <SelectInput
                value={item.folder}
                onChange={(event) => void moveTemplate(item, event.target.value)}
                disabled={busy === item.id}
                aria-label="移动模板"
              >
                <option value="">根目录</option>
                {flattenedFolders.map((folder) => (
                  <option key={folder.id} value={folder.id}>{folderLabel(folder)}</option>
                ))}
              </SelectInput>

              <div className="flex items-center gap-1 sm:justify-end">
                <Button size="sm" variant="ghost" asChild>
                  <Link to={'/runs/new?templateId=' + encodeURIComponent(item.id)}><Library />使用</Link>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void duplicateTemplate(item)} disabled={busy === item.id}>
                  <Copy />复制
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => void removeTemplate(item)}
                  disabled={busy === item.id}
                  aria-label={'删除模板 ' + (item.title || '未命名模板')}
                >
                  <Trash2 />
                </Button>
              </div>
            </ListRow>
          ))}
        </Panel>
      ) : null}

      {!state.loading && (normalizedQuery || childFolders.length === 0) && tab === 'favorites' && favorites.length === 0 ? (
        <EmptyState title={normalizedQuery ? '没有匹配的收藏' : currentFolder ? '目录为空' : '暂无收藏'} />
      ) : null}
      {!state.loading && (normalizedQuery || childFolders.length === 0) && tab === 'templates' && templates.length === 0 ? (
        <EmptyState title={normalizedQuery ? '没有匹配的模板' : currentFolder ? '目录为空' : '暂无模板'} />
      ) : null}

      <FolderManagerDialog
        open={folderDialog}
        onOpenChange={setFolderDialog}
        scope={scope}
        folders={activeFolders}
        onChanged={reload}
      />
    </AppPage>
  )
}
