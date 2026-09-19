import { Copy, Pencil, Play, Trash2, Workflow } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  AppPage,
  CodeBlock,
  ErrorBanner,
  LoadingState,
  MetaGrid,
  PageHeader,
  Panel,
} from '@/components/app/ui'
import { ConfirmDeleteDialog } from '@/components/app/confirm-delete-dialog'
import { Button } from '@/components/ui/button'
import { useAsyncData } from '@/hooks/useAsyncData'
import { toErrorMessage } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { deleteWorkflowTemplate, duplicateWorkflowTemplate, getWorkflowTemplate } from '@/lib/library'
import { toast } from 'sonner'

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
      toast.success('模板已复制')
      navigate('/templates/' + result.id)
    } catch (cause) {
      const message = toErrorMessage(cause)
      setError(message)
      toast.error('复制模板失败', { description: message })
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
      toast.success('模板已删除')
      navigate('/library?tab=templates')
    } catch (cause) {
      const message = toErrorMessage(cause)
      setError(message)
      toast.error('删除模板失败', { description: message })
      setActing(false)
    }
  }

  const useHref = '/runs/new?templateId=' + encodeURIComponent(template.id)

  return (
    <AppPage>
      <PageHeader
        eyebrow={
          <Link to="/library?tab=templates" className="outline-none hover:text-foreground focus-visible:underline">
            资料库
          </Link>
        }
        title={template.title || '未命名模板'}
        description={template.description || undefined}
        actions={
          <>
            <Button asChild><Link to={useHref}><Play />使用</Link></Button>
            <Button variant="outline" asChild>
              <Link to={useHref + '&mode=edit'}><Pencil />编辑</Link>
            </Button>
          </>
        }
      />

      {state.error ? <ErrorBanner>{state.error}</ErrorBanner> : null}
      {error ? <ErrorBanner>{error}</ErrorBanner> : null}

      <Panel className="p-4 sm:p-5">
        <MetaGrid
          items={[
            { label: '目录', value: template.folderRecord?.name || '未分类' },
            { label: '更新', value: formatDateTime(template.updated) },
            { label: '标签', value: template.tags.join(' · ') || '—' },
            { label: '来源', value: template.sourceRun ? 'Run' : '—' },
          ]}
        />
        {template.sourceRun ? (
          <Button variant="ghost" size="sm" className="mt-3 -ms-2" asChild>
            <Link to={'/runs/' + template.sourceRun}><Workflow />查看来源 Run</Link>
          </Button>
        ) : null}
      </Panel>

      <div className="mt-4">
        <CodeBlock
          label="DSL"
          actions={
            <>
              <Button variant="ghost" size="sm" onClick={() => void copy()} disabled={acting}>
                <Copy />复制模板
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
                disabled={acting}
              >
                <Trash2 />删除
              </Button>
            </>
          }
        >
          {template.planText}
        </CodeBlock>
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
