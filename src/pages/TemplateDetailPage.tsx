import { Copy, Pencil, Play, Trash2, Workflow } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { AppPage, ErrorBanner, LoadingState, MetaGrid, PageHeader } from '@/components/app/ui'
import { ConfirmDeleteDialog } from '@/components/app/confirm-delete-dialog'
import { Button } from '@/components/ui/button'
import { useAsyncData } from '@/hooks/useAsyncData'
import { toErrorMessage } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { deleteWorkflowTemplate, duplicateWorkflowTemplate, getWorkflowTemplate } from '@/lib/library'

export function TemplateDetailPage() {
  const { templateId = '' } = useParams()
  const navigate = useNavigate()
  const [acting, setActing] = useState(false)
  const [error, setError] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)

  const state = useAsyncData(
    () => getWorkflowTemplate(templateId),
    [templateId],
    { enabled: Boolean(templateId), errorMessage: toErrorMessage },
  )

  if (state.loading && !state.data) return <AppPage><LoadingState /></AppPage>
  if (state.error && !state.data) return <AppPage><ErrorBanner>{state.error}</ErrorBanner></AppPage>
  if (!state.data) return null
  const template = state.data

  async function copy() {
    if (acting) return
    setActing(true)
    setError('')
    try {
      const result = await duplicateWorkflowTemplate(template)
      navigate('/templates/' + result.id)
    } catch (cause) {
      setError(toErrorMessage(cause))
    } finally {
      setActing(false)
    }
  }

  async function remove() {
    if (acting) return
    setActing(true)
    setError('')
    try {
      await deleteWorkflowTemplate(template.id)
      navigate('/library')
    } catch (cause) {
      setError(toErrorMessage(cause))
      setActing(false)
    }
  }

  return (
    <AppPage>
      <PageHeader
        title={template.title || '未命名模板'}
        actions={
          <>
            <Button asChild><Link to={'/runs/new?templateId=' + encodeURIComponent(template.id)}><Play />使用</Link></Button>
            <Button variant="outline" asChild><Link to={'/runs/new?templateId=' + encodeURIComponent(template.id) + '&mode=edit'}><Pencil />编辑</Link></Button>
          </>
        }
      />

      {state.error ? <ErrorBanner>{state.error}</ErrorBanner> : null}
      {error ? <ErrorBanner>{error}</ErrorBanner> : null}

      <section className="rounded-lg border bg-card p-4 sm:p-5">
        <MetaGrid items={[
          { label: '目录', value: template.folderRecord?.name || '未分类' },
          { label: '更新', value: formatDateTime(template.updated) },
          { label: '标签', value: template.tags.join(' · ') || '—' },
          { label: '来源', value: template.sourceRun ? 'Run' : '—' },
        ]} />
        {template.sourceRun ? (
          <Button variant="ghost" size="sm" className="mt-3" asChild>
            <Link to={'/runs/' + template.sourceRun}><Workflow />来源 Run</Link>
          </Button>
        ) : null}
      </section>

      <div className="mt-5 overflow-hidden rounded-lg border bg-card">
        <div className="border-b px-4 py-2.5 text-xs font-medium text-muted-foreground">DSL</div>
        <pre className="m-0 max-h-[620px] overflow-auto whitespace-pre-wrap break-words bg-[var(--cm-bg)] p-4 font-mono text-xs leading-6 text-[var(--cm-fg)]">
          {template.planText}
        </pre>
      </div>

      <div className="mt-3 flex flex-wrap justify-end gap-1 border-t pt-3">
        <Button variant="ghost" onClick={() => void copy()} disabled={acting}><Copy />复制</Button>
        <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)} disabled={acting}><Trash2 />删除</Button>
      </div>

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="删除模板？"
        description={template.title || '未命名模板'}
        busy={acting}
        onConfirm={() => void remove()}
      />
    </AppPage>
  )
}
