import { Link } from 'react-router'
import { Unplug } from 'lucide-react'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorAlert } from '@/components/feedback/error-alert'
import { LoadingState } from '@/components/feedback/loading-state'
import { Page } from '@/components/layout/page'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { MAX_TITLE_LENGTH } from '@/lib/domain/limits'
import { AnyWorkflowEditor } from '@/features/editor/components/anyworkflow-editor'
import { useRunEditor } from '../hooks/use-run-editor'
import { DraftRestoreBanner } from './draft-restore-banner'
import { RunEditorActionBar } from './run-editor-action-bar'
import { RunEditorHeader } from './run-editor-header'
import { RuntimeConfigDialog } from './runtime-config-dialog'

/** Full-height editing workspace for a Run, a draft, or a template. */
export function RunEditor() {
  const editor = useRunEditor()
  const { target, loadedRun, runtime } = editor

  if (!editor.session) {
    return (
      <Page>
        <EmptyState
          icon={Unplug}
          title="未连接"
          action={
            <Button asChild variant="secondary">
              <Link to="/settings/connection">设置连接</Link>
            </Button>
          }
        />
      </Page>
    )
  }
  if (editor.loading) {
    return (
      <Page>
        <LoadingState />
      </Page>
    )
  }
  if (!editor.starterReady) {
    return (
      <Page>
        <ErrorAlert inline>{editor.error || '无法生成默认名称'}</ErrorAlert>
        <Button className="mt-3" variant="outline" onClick={() => window.location.reload()}>
          重试
        </Button>
      </Page>
    )
  }
  if (target.runId && !loadedRun) {
    return (
      <Page>
        <ErrorAlert inline>{editor.error || '无法加载 Run'}</ErrorAlert>
        <Button asChild variant="outline" className="mt-3">
          <Link to={`/runs/${target.runId}`}>返回 Run</Link>
        </Button>
      </Page>
    )
  }

  return (
    <Page className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pt-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-6 sm:pb-4 lg:px-8 lg:pt-6">
      <RunEditorHeader editor={editor} />

      {editor.error ? (
        <ErrorAlert inline className="mb-2 shrink-0">
          {editor.error}
        </ErrorAlert>
      ) : null}
      {runtime.error ? (
        <div className="mb-2 flex shrink-0 flex-col items-start gap-2">
          <ErrorAlert inline className="w-full">
            {runtime.error}
          </ErrorAlert>
          <Button size="sm" variant="outline" onClick={runtime.reloadDefaults}>
            重试配置加载
          </Button>
        </div>
      ) : null}

      {editor.draft.restorable ? (
        <DraftRestoreBanner
          draft={editor.draft.restorable}
          legacy={editor.draft.legacy}
          onRestore={editor.restoreDraft}
          onDiscard={editor.draft.discard}
        />
      ) : null}

      {target.templateMode === 'edit' ? (
        <Card className="mb-2 shrink-0 p-2.5">
          <Field>
            <FieldLabel htmlFor="template-title">模板名称</FieldLabel>
            <Input
              id="template-title"
              name="template-title"
              value={editor.templateTitle}
              maxLength={MAX_TITLE_LENGTH}
              onChange={(event) => editor.changeTemplateTitle(event.target.value)}
            />
          </Field>
        </Card>
      ) : null}

      <AnyWorkflowEditor
        ref={editor.editorRef}
        value={editor.source}
        onChange={editor.changeSource}
        onSave={() => void editor.persist(false)}
        className="h-auto min-h-0 flex-1 sm:h-auto sm:min-h-0"
      />

      <RunEditorActionBar editor={editor} />

      <RuntimeConfigDialog
        open={editor.runtimeOpen}
        onOpenChange={editor.setRuntimeOpen}
        runtime={runtime}
        locked={editor.runtimeLocked}
        disabled={editor.saving}
        onChange={editor.changeRuntimeConfig}
      />
    </Page>
  )
}
