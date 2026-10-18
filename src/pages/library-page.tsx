import { useState } from 'react'
import { Link } from 'react-router'
import { FolderCog, FolderOpen, RefreshCw, SearchX, Star, Unplug } from 'lucide-react'
import { ConfirmDeleteDialog } from '@/components/feedback/confirm-dialog'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { SearchField } from '@/components/form/search-field'
import { Page, PageHeader } from '@/components/layout/page'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { runTitle } from '@/lib/domain/run-status'
import type { RunFavoriteRecord, WorkflowTemplateRecord } from '@/types'
import { FavoriteRow } from '@/features/library/components/favorite-row'
import { FolderList } from '@/features/library/components/folder-list'
import { FolderManagerDialog } from '@/features/library/components/folder-manager-dialog'
import { LibraryBreadcrumb } from '@/features/library/components/library-breadcrumb'
import { MoveToFolderDialog } from '@/features/library/components/move-to-folder-dialog'
import { TemplateRow, templateTitle } from '@/features/library/components/template-row'
import { useLibraryActions } from '@/features/library/hooks/use-library-actions'
import { useLibraryView } from '@/features/library/hooks/use-library-view'

type MoveTarget = { kind: 'favorite'; item: RunFavoriteRecord } | { kind: 'template'; item: WorkflowTemplateRecord }

export function LibraryPage() {
  const view = useLibraryView()
  const { state, tab } = view
  const actions = useLibraryActions(state.reload)
  const [folderDialog, setFolderDialog] = useState(false)
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<WorkflowTemplateRecord | null>(null)

  if (!view.session) {
    return (
      <Page>
        <PageHeader title="资料库" />
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

  const noun = tab === 'favorites' ? '收藏' : '模板'
  const items = tab === 'favorites' ? view.favorites : view.templates
  const showEmpty = !state.loading && state.data && items.length === 0 && (view.searching || view.children.length === 0)

  return (
    <Page>
      <PageHeader
        compact
        title="资料库"
        actions={
          <>
            <Button variant="outline" size="touch" onClick={() => setFolderDialog(true)}>
              <FolderCog data-icon="inline-start" />
              管理目录
            </Button>
            <Button
              variant="ghost"
              size="icon-touch"
              onClick={() => {
                actions.clearError()
                void state.reload()
              }}
              disabled={state.loading}
              aria-label="刷新资料库"
            >
              <RefreshCw className={state.refreshing ? 'animate-spin' : undefined} />
            </Button>
          </>
        }
      />

      <ErrorAlert>{state.error}</ErrorAlert>
      <ErrorAlert>{actions.error}</ErrorAlert>

      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Tabs value={tab} onValueChange={(value) => view.changeTab(value === 'templates' ? 'templates' : 'favorites')}>
          <TabsList className="grid w-full grid-cols-2 sm:w-auto">
            <TabsTrigger value="favorites">收藏</TabsTrigger>
            <TabsTrigger value="templates">模板</TabsTrigger>
          </TabsList>
        </Tabs>
        <SearchField
          className="min-w-0 flex-1"
          label={`搜索${noun}`}
          clearLabel="清空搜索"
          value={view.query}
          onValueChange={view.setQuery}
        />
      </div>

      {!view.searching ? <LibraryBreadcrumb rootLabel={noun} path={view.path} onOpen={view.openFolder} /> : null}

      {state.loading && !state.data ? <LoadingState /> : null}

      {!view.searching && view.children.length ? (
        <FolderList folders={view.children} counts={view.folderCounts} onOpen={view.openFolder} />
      ) : null}

      {tab === 'favorites' && view.favorites.length ? (
        <Card className="divide-y">
          {view.favorites.map((item) => (
            <FavoriteRow
              key={item.id}
              item={item}
              busy={actions.pendingId === item.id}
              onMove={() => setMoveTarget({ kind: 'favorite', item })}
              onRemove={() => void actions.removeFavorite(item)}
            />
          ))}
        </Card>
      ) : null}

      {tab === 'templates' && view.templates.length ? (
        <Card className="divide-y">
          {view.templates.map((item) => (
            <TemplateRow
              key={item.id}
              item={item}
              busy={actions.pendingId === item.id}
              onDuplicate={() => void actions.duplicateTemplate(item)}
              onMove={() => setMoveTarget({ kind: 'template', item })}
              onDelete={() => setDeleteTarget(item)}
            />
          ))}
        </Card>
      ) : null}

      {showEmpty ? (
        <EmptyState
          icon={view.searching ? SearchX : view.currentFolder ? FolderOpen : Star}
          title={view.searching ? `没有匹配的${noun}` : view.currentFolder ? '目录为空' : `暂无${noun}`}
        />
      ) : null}

      <MoveToFolderDialog
        open={Boolean(moveTarget)}
        onOpenChange={(open) => {
          if (!open) setMoveTarget(null)
        }}
        folders={view.folders}
        currentFolder={moveTarget?.item.folder || ''}
        title={moveTarget?.kind === 'favorite' ? runTitle(moveTarget.item.runRecord) : templateTitle(moveTarget?.item)}
        busy={Boolean(moveTarget && actions.pendingId === moveTarget.item.id)}
        onMove={async (folder) => {
          if (!moveTarget) return
          if (moveTarget.kind === 'favorite') await actions.moveFavorite(moveTarget.item, folder)
          else await actions.moveTemplate(moveTarget.item, folder)
        }}
      />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="删除模板？"
        description={templateTitle(deleteTarget)}
        busy={Boolean(deleteTarget && actions.pendingId === deleteTarget.id)}
        onConfirm={async () => {
          if (!deleteTarget) return
          await actions.removeTemplate(deleteTarget)
          setDeleteTarget(null)
        }}
      />

      <FolderManagerDialog
        open={folderDialog}
        onOpenChange={setFolderDialog}
        scope={view.scope}
        folders={view.folders}
        onChanged={state.reload}
      />
    </Page>
  )
}
