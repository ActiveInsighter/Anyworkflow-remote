import { Copy, FolderCog, Library, RefreshCw, Search, Star, Trash2, X, Workflow } from 'lucide-react'
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
import { toErrorMessage } from '@/lib/api'
import { useSession } from '@/lib/session'
import type { LibraryFolderRecord, LibraryFolderScope, RunFavoriteRecord, WorkflowTemplateRecord } from '@/types'

type Tab = 'favorites' | 'templates'

export function LibraryPage() {
  const session = useSession()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab: Tab = searchParams.get('tab') === 'templates' ? 'templates' : 'favorites'
  const [query, setQuery] = useState('')
  const [favoriteFolder, setFavoriteFolder] = useState('')
  const [templateFolder, setTemplateFolder] = useState('')
  const [folderDialog, setFolderDialog] = useState(false)
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState('')

  const state = useAsyncData(
    () => listLibrary(),
    [session?.record.id],
    { enabled: Boolean(session), errorMessage: toErrorMessage },
  )

  const favoriteFolders = useMemo(() => flattenLibraryFolders(state.data?.favoriteFolders ?? []), [state.data?.favoriteFolders])
  const templateFolders = useMemo(() => flattenLibraryFolders(state.data?.templateFolders ?? []), [state.data?.templateFolders])

  const favorites = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return (state.data?.favorites ?? []).filter((item) => {
      if (favoriteFolder && item.folder !== favoriteFolder) return false
      if (!normalized) return true
      const title = item.runRecord?.title || ''
      return [title, item.note, item.folderRecord?.name || ''].join(' ').toLocaleLowerCase().includes(normalized)
    })
  }, [state.data?.favorites, query, favoriteFolder])

  const templates = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return (state.data?.templates ?? []).filter((item) => {
      if (templateFolder && item.folder !== templateFolder) return false
      if (!normalized) return true
      return [item.title, item.description, item.tags.join(' '), item.folderRecord?.name || '']
        .join(' ')
        .toLocaleLowerCase()
        .includes(normalized)
    })
  }, [state.data?.templates, query, templateFolder])

  function changeTab(next: Tab) {
    const params = new URLSearchParams(searchParams)
    if (next === 'favorites') params.delete('tab')
    else params.set('tab', next)
    setSearchParams(params, { replace: true })
  }

  async function reload() {
    setActionError('')
    await state.reload()
  }

  async function guard(id: string, action: () => Promise<void>) {
    if (busy) return
    setBusy(id)
    setActionError('')
    try {
      await action()
    } catch (error) {
      setActionError(toErrorMessage(error))
    } finally {
      setBusy('')
    }
  }

  const removeFavorite = (item: RunFavoriteRecord) =>
    guard(item.id, async () => {
      await deleteRunFavorite(item.id)
      await state.reload()
    })

  const moveFavorite = (item: RunFavoriteRecord, folder: string) =>
    guard(item.id, async () => {
      await moveRunFavorite(item.id, folder)
      await state.reload()
    })

  const duplicateTemplate = (item: WorkflowTemplateRecord) =>
    guard(item.id, async () => {
      const copy = await duplicateWorkflowTemplate(item)
      navigate('/templates/' + copy.id)
    })

  const moveTemplate = (item: WorkflowTemplateRecord, folder: string) =>
    guard(item.id, async () => {
      await updateWorkflowTemplate(item.id, { folder })
      await state.reload()
    })

  const removeTemplate = (item: WorkflowTemplateRecord) =>
    guard(item.id, async () => {
      await deleteWorkflowTemplate(item.id)
      await state.reload()
    })

  if (!session) {
    return (
      <AppPage>
        <PageHeader title="资料库" />
        <EmptyState
          title="未连接"
          description="连接 AnyWorkflow 后端后才能查看收藏与模板。"
          action={<Button asChild><Link to="/settings">前往设置</Link></Button>}
        />
      </AppPage>
    )
  }

  const scope: LibraryFolderScope = tab === 'favorites' ? 'favorite' : 'template'
  const activeFolders: LibraryFolderRecord[] = tab === 'favorites'
    ? state.data?.favoriteFolders ?? []
    : state.data?.templateFolders ?? []
  const folderOptions = tab === 'favorites' ? favoriteFolders : templateFolders

  function folderLabel(folder: { depth: number; name: string }) {
    return '　'.repeat(folder.depth) + folder.name
  }

  return (
    <AppPage>
      <PageHeader
        title="资料库"
        description="收藏常用的 Run，沉淀可复用的工作流模板。"
        actions={
          <>
            <Button variant="outline" onClick={() => setFolderDialog(true)}><FolderCog />目录</Button>
            <Button variant="outline" size="icon" onClick={() => void reload()} disabled={state.loading} aria-label="刷新">
              <RefreshCw className={state.loading ? 'animate-spin' : undefined} />
            </Button>
          </>
        }
      />

      {state.error ? <ErrorBanner>{state.error}</ErrorBanner> : null}
      {actionError ? <ErrorBanner>{actionError}</ErrorBanner> : null}

      <Toolbar className="mb-4">
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

        <SelectInput
          containerClassName="sm:w-44"
          value={tab === 'favorites' ? favoriteFolder : templateFolder}
          onChange={(event) =>
            tab === 'favorites' ? setFavoriteFolder(event.target.value) : setTemplateFolder(event.target.value)
          }
          aria-label="按目录筛选"
        >
          <option value="">全部目录</option>
          {folderOptions.map((folder) => (
            <option key={folder.id} value={folder.id}>{folderLabel(folder)}</option>
          ))}
        </SelectInput>
      </Toolbar>

      {state.loading && !state.data ? <LoadingState /> : null}

      {tab === 'favorites' && favorites.length ? (
        <Panel>
          {favorites.map((item) => {
            const run = item.runRecord
            const status = run ? runStatusMeta(run.status, run.requestedAction) : { label: '不可用', tone: 'neutral' as const }
            return (
              <ListRow
                key={item.id}
                className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px_auto] sm:items-center sm:gap-5"
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <Star className="size-3.5 shrink-0 fill-[var(--warning)] text-[var(--warning)]" aria-hidden="true" />
                    <Link
                      to={'/runs/' + item.run}
                      className="truncate text-[13px] font-medium outline-none hover:underline focus-visible:underline"
                    >
                      {run?.title || '未命名 Run'}
                    </Link>
                    <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                  </div>
                  <div className="mt-1 truncate text-[11px] text-muted-foreground">
                    {(item.folderRecord?.name || '未分类') + ' · ' + formatDateTime(item.updated)}
                  </div>
                </div>

                <SelectInput
                  value={item.folder}
                  onChange={(event) => void moveFavorite(item, event.target.value)}
                  disabled={busy === item.id}
                  aria-label="移动到目录"
                >
                  <option value="">未分类</option>
                  {favoriteFolders.map((folder) => (
                    <option key={folder.id} value={folder.id}>{folderLabel(folder)}</option>
                  ))}
                </SelectInput>

                <div className="flex items-center gap-1 sm:justify-end">
                  <Button size="sm" variant="ghost" asChild>
                    <Link to={'/runs/' + item.run}><Workflow />打开</Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => void removeFavorite(item)}
                    disabled={busy === item.id}
                    aria-label="取消收藏"
                  >
                    <Trash2 />
                    <span className="sm:hidden">取消收藏</span>
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
            <ListRow
              key={item.id}
              className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px_auto] sm:items-center sm:gap-5"
            >
              <div className="min-w-0">
                <Link
                  to={'/templates/' + item.id}
                  className="block truncate text-[13px] font-medium outline-none hover:underline focus-visible:underline"
                >
                  {item.title || '未命名模板'}
                </Link>
                <div className="mt-1 truncate text-[11px] text-muted-foreground">
                  {(item.folderRecord?.name || '未分类') + ' · ' + formatDateTime(item.updated)}
                </div>
                {item.tags.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {item.tags.map((tag) => (
                      <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <SelectInput
                value={item.folder}
                onChange={(event) => void moveTemplate(item, event.target.value)}
                disabled={busy === item.id}
                aria-label="移动到目录"
              >
                <option value="">未分类</option>
                {templateFolders.map((folder) => (
                  <option key={folder.id} value={folder.id}>{folderLabel(folder)}</option>
                ))}
              </SelectInput>

              <div className="flex flex-wrap items-center gap-1 sm:justify-end">
                <Button size="sm" variant="ghost" asChild>
                  <Link to={'/runs/new?templateId=' + encodeURIComponent(item.id)}><Library />使用</Link>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void duplicateTemplate(item)} disabled={busy === item.id}>
                  <Copy />复制
                </Button>
                <Button
                  size="sm"
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

      {!state.loading && tab === 'favorites' && favorites.length === 0 ? (
        <EmptyState
          title={query || favoriteFolder ? '没有匹配的收藏' : '暂无收藏'}
          description={query || favoriteFolder ? '换个关键词或目录试试。' : '在 Run 详情页点击收藏即可加入这里。'}
        />
      ) : null}
      {!state.loading && tab === 'templates' && templates.length === 0 ? (
        <EmptyState
          title={query || templateFolder ? '没有匹配的模板' : '暂无模板'}
          description={query || templateFolder ? '换个关键词或目录试试。' : '在 Run 详情页保存为模板，就能在这里复用。'}
        />
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
