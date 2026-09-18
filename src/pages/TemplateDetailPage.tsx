import { Copy, Pencil, Play, Trash2, Workflow } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { AppPage, ErrorBanner, LoadingState, MetaGrid, PageHeader } from '@/components/app/ui'
import { ConfirmDeleteDialog } from '@/components/app/confirm-delete-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
      navigate(`/templates/${result.id}`)
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
        eyebrow="模板"
        title={template.title || '未命名模板'}
        actions={
          <>
            <Button asChild><Link to={`/runs/new?templateId=${encodeURIComponent(template.id)}`}><Play />使用</Link></Button>
            <Button variant="outline" asChild><Link to={`/runs/new?templateId=${encodeURIComponent(template.id)}&mode=edit`}><Pencil />编辑</Link></Button>
          </>
        }
      />
      {state.error ? <ErrorBanner>{state.error}</ErrorBanner> : null}
      {error ? <ErrorBanner>{error}</ErrorBanner> : null}

      <Card>
        <CardContent className="p-4 sm:p-5">
          <MetaGrid items={[
            { label: '目录', value: template.folderRecord?.name || '未分类' },
            { label: '更新', value: formatDateTime(template.updated) },
            { label: '标签', value: template.tags.join(' · ') || '—' },
            { label: '来源', value: template.sourceRun ? 'Run' : '—' },
          ]} />
          {template.sourceRun ? <Button variant="ghost" className="mt-3" asChild><Link to={`/runs/${template.sourceRun}`}><Workflow />来源 Run</Link></Button> : null}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader><CardTitle className="text-base">DSL</CardTitle></CardHeader>
        <CardContent>
          <pre className="m-0 max-h-[560px] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[#08090a] p-4 font-mono text-xs leading-6 text-zinc-100">{template.planText}</pre>
        </CardContent>
      </Card>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={() => void copy()} disabled={acting}><Copy />复制</Button>
        <Button variant="destructive" onClick={() => setDeleteOpen(true)} disabled={acting}><Trash2 />删除</Button>
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
