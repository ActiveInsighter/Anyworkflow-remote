import { Copy, FolderCog, Library, RefreshCw, Search, Star, Trash2, Workflow } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { AppPage, EmptyState, ErrorBanner, LoadingState, PageHeader, StatusBadge } from '@/components/app/ui'
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
  const [tab, setTab] = useState<Tab>('favorites')
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
      return [item.title, item.description, item.tags.join(' '), item.folderRecord?.name || ''].join(' ').toLocaleLowerCase().includes(normalized)
    })
  }, [state.data?.templates, query, templateFolder])

  async function reload() {
    setActionError('')
    await state.reload()
  }

  async function removeFavorite(item: RunFavoriteRecord) {
    if (busy) return
    setBusy(item.id)
    setActionError('')
    try {
      await deleteRunFavorite(item.id)
      await state.reload()
    } catch (error) {
      setActionError(toErrorMessage(error))
    } finally {
      setBusy('')
    }
  }

  async function moveFavorite(item: RunFavoriteRecord, folder: string) {
    if (busy) return
    setBusy(item.id)
    try {
      await moveRunFavorite(item.id, folder)
      await state.reload()
    } catch (error) {
      setActionError(toErrorMessage(error))
    } finally {
      setBusy('')
    }
  }

  async function duplicateTemplate(item: WorkflowTemplateRecord) {
    if (busy) return
    setBusy(item.id)
    try {
      const copy = await duplicateWorkflowTemplate(item)
      navigate('/templates/' + copy.id)
    } catch (error) {
      setActionError(toErrorMessage(error))
    } finally {
      setBusy('')
    }
  }

  async function moveTemplate(item: WorkflowTemplateRecord, folder: string) {
    if (busy) return
    setBusy(item.id)
    try {
      await updateWorkflowTemplate(item.id, { folder })
      await state.reload()
    } catch (error) {
      setActionError(toErrorMessage(error))
    } finally {
      setBusy('')
    }
  }

  async function removeTemplate(item: WorkflowTemplateRecord) {
    if (busy) return
    setBusy(item.id)
    try {
      await deleteWorkflowTemplate(item.id)
      await state.reload()
    } catch (error) {
      setActionError(toErrorMessage(error))
    } finally {
      setBusy('')
    }
  }

  if (!session) {
    return <AppPage><EmptyState title="未连接" action={<Button asChild><Link to="/settings">连接</Link></Button>} /></AppPage>
  }

  const scope: LibraryFolderScope = tab === 'favorites' ? 'favorite' : 'template'
  const activeFolders: LibraryFolderRecord[] = tab === 'favorites'
    ? state.data?.favoriteFolders ?? []
    : state.data?.templateFolders ?? []

  return (
    <AppPage>
      <PageHeader
        title="资料库"
        actions={
          <>
            <Button variant="outline" onClick={() => setFolderDialog(true)}><FolderCog />目录</Button>
            <Button variant="ghost" size="icon" onClick={() => void reload()} disabled={state.loading} aria-label="刷新">
              <RefreshCw className={state.loading ? 'animate-spin' : ''} />
            </Button>
          </>
        }
      />

      {state.error ? <ErrorBanner>{state.error}</ErrorBanner> : null}
      {actionError ? <ErrorBanner>{actionError}</ErrorBanner> : null}

      <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center">
        <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="favorites">收藏</TabsTrigger>
            <TabsTrigger value="templates">模板</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} className="h-9 pl-8" placeholder="搜索" />
        </div>

        <select
          value={tab === 'favorites' ? favoriteFolder : templateFolder}
          onChange={(event) => tab === 'favorites' ? setFavoriteFolder(event.target.value) : setTemplateFolder(event.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-xs outline-none focus:border-ring"
        >
          <option value="">全部目录</option>
          {(tab === 'favorites' ? favoriteFolders : templateFolders).map((folder) => (
            <option key={folder.id} value={folder.id}>{'　'.repeat(folder.depth)}{folder.name}</option>
          ))}
        </select>
      </div>

      {state.loading && !state.data ? <div className="mt-4"><LoadingState /></div> : null}

      {tab === 'favorites' && favorites.length ? (
        <div className="mt-4 overflow-hidden rounded-lg border bg-card">
          {favorites.map((item) => {
            const run = item.runRecord
            const status = run ? runStatusMeta(run.status, run.requestedAction) : { label: '不可用', tone: 'neutral' as const }
            return (
              <div key={item.id} className="grid gap-3 border-b p-4 last:border-b-0 hover:bg-muted/20 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-500" />
                    <Link to={'/runs/' + item.run} className="truncate text-sm font-medium hover:underline">{run?.title || '未命名 Run'}</Link>
                    <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {(item.folderRecord?.name || '未分类') + ' · ' + formatDateTime(item.updated)}
                  </div>
                </div>

                <select
                  value={item.folder}
                  onChange={(event) => void moveFavorite(item, event.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2.5 text-xs"
                  disabled={busy === item.id}
                >
                  <option value="">未分类</option>
                  {favoriteFolders.map((folder) => <option key={folder.id} value={folder.id}>{'　'.repeat(folder.depth)}{folder.name}</option>)}
                </select>

                <div className="flex items-center gap-1 sm:justify-end">
                  <Button size="sm" variant="ghost" asChild><Link to={'/runs/' + item.run}><Workflow />打开</Link></Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void removeFavorite(item)} disabled={busy === item.id}>
                    <Trash2 /><span className="sm:hidden">取消收藏</span>
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}

      {tab === 'templates' && templates.length ? (
        <div className="mt-4 overflow-hidden rounded-lg border bg-card">
          {templates.map((item) => (
            <div key={item.id} className="grid gap-3 border-b p-4 last:border-b-0 hover:bg-muted/20 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-center">
              <div className="min-w-0">
                <Link to={'/templates/' + item.id} className="truncate text-sm font-medium hover:underline">{item.title || '未命名模板'}</Link>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {(item.folderRecord?.name || '未分类') + ' · ' + formatDateTime(item.updated)}
                </div>
                {item.tags.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {item.tags.map((tag) => <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{tag}</span>)}
                  </div>
                ) : null}
              </div>

              <select
                value={item.folder}
                onChange={(event) => void moveTemplate(item, event.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2.5 text-xs"
                disabled={busy === item.id}
              >
                <option value="">未分类</option>
                {templateFolders.map((folder) => <option key={folder.id} value={folder.id}>{'　'.repeat(folder.depth)}{folder.name}</option>)}
              </select>

              <div className="flex flex-wrap items-center gap-1 sm:justify-end">
                <Button size="sm" variant="ghost" asChild><Link to={'/runs/new?templateId=' + encodeURIComponent(item.id)}><Library />使用</Link></Button>
                <Button size="sm" variant="ghost" onClick={() => void duplicateTemplate(item)} disabled={busy === item.id}><Copy />复制</Button>
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void removeTemplate(item)} disabled={busy === item.id}><Trash2 /></Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {!state.loading && tab === 'favorites' && favorites.length === 0 ? <div className="mt-4"><EmptyState title="暂无收藏" /></div> : null}
      {!state.loading && tab === 'templates' && templates.length === 0 ? <div className="mt-4"><EmptyState title="暂无模板" /></div> : null}

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
