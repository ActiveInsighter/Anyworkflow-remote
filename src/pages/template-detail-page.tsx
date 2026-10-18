import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Copy, MoreHorizontal, Pencil, Play, Trash2, Workflow } from 'lucide-react'
import { CodeBlock } from '@/components/data-display/code-block'
import { DescriptionList } from '@/components/data-display/description-list'
import { ConfirmDeleteDialog } from '@/components/feedback/confirm-dialog'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { Page, PageHeader } from '@/components/layout/page'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAsyncAction } from '@/hooks/use-async-action'
import { useAsyncData } from '@/hooks/use-async-data'
import { toErrorMessage } from '@/lib/api'
import { deleteWorkflowTemplate, duplicateWorkflowTemplate, getWorkflowTemplate } from '@/lib/api/library'
import { formatDateTime } from '@/lib/format'
import { templateTitle } from '@/features/library/components/template-row'

export function TemplateDetailPage() {
  const { templateId = '' } = useParams()
  const navigate = useNavigate()
  const action = useAsyncAction()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const state = useAsyncData(() => getWorkflowTemplate(templateId), [templateId], {
    enabled: Boolean(templateId),
    errorMessage: toErrorMessage,
  })
  const template = state.data

  if (!template) {
    return <Page width="detail">{state.error ? <ErrorAlert>{state.error}</ErrorAlert> : <LoadingState />}</Page>
  }

  const useHref = `/runs/new?templateId=${encodeURIComponent(template.id)}`
  const duplicate = () =>
    void action.run(
      'duplicate',
      async () => {
        const copy = await duplicateWorkflowTemplate(template)
        navigate(`/templates/${copy.id}`)
      },
      { success: '模板已复制', failure: '复制模板失败' },
    )
  const remove = async () => {
    const done = await action.run(
      'delete',
      async () => {
        await deleteWorkflowTemplate(template.id)
        return true
      },
      { success: '模板已删除', failure: '删除模板失败' },
    )
    if (done) navigate('/library?tab=templates')
  }

  return (
    <Page width="detail">
      <PageHeader
        wrapTitle
        eyebrow={
          <Link to="/library?tab=templates" className="outline-none hover:text-foreground focus-visible:underline">
            资料库
          </Link>
        }
        title={templateTitle(template)}
        description={template.description || undefined}
        actions={
          <>
            <Button asChild size="touch">
              <Link to={useHref}>
                <Play data-icon="inline-start" />
                使用
              </Link>
            </Button>
            <Button variant="outline" size="touch" asChild>
              <Link to={`${useHref}&mode=edit`}>
                <Pencil data-icon="inline-start" />
                编辑
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-touch" aria-label="更多操作" disabled={action.busy}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={duplicate}>
                  <Copy />
                  复制模板
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                  <Trash2 />
                  删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <ErrorAlert>{state.error}</ErrorAlert>
      <ErrorAlert>{action.error}</ErrorAlert>

      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="flex flex-col gap-3">
            <DescriptionList
              items={[
                { label: '目录', value: template.folderRecord?.name || '未分类' },
                { label: '更新', value: formatDateTime(template.updated) },
                { label: '标签', value: template.tags.join(' · ') || '—' },
                { label: '来源', value: template.sourceRun ? 'Run' : '—' },
              ]}
            />
            {template.sourceRun ? (
              <Button variant="ghost" size="sm" className="-ms-2 self-start" asChild>
                <Link to={`/runs/${template.sourceRun}`}>
                  <Workflow data-icon="inline-start" />
                  查看来源 Run
                </Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
        <CodeBlock label="DSL">{template.planText}</CodeBlock>
      </div>

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="删除模板？"
        description={templateTitle(template)}
        busy={action.pending === 'delete'}
        onConfirm={() => void remove()}
      />
    </Page>
  )
}
