import { CircleCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { runVersionLabel } from '@/lib/domain/run-status'
import type { RunEditorModel } from '../hooks/use-run-editor'

/** Title with save state: local draft, unsaved fork, or saved; plus a DSL error count. */
export function RunEditorHeader({ editor }: { editor: RunEditorModel }) {
  const { target, loadedRun, dirty, errorCount } = editor
  const editingCompleted = Boolean(loadedRun && loadedRun.status !== 'draft')
  const title =
    target.templateMode === 'edit'
      ? editor.templateTitle || '编辑模板'
      : editor.meta.title || (target.runId ? '未命名 Run' : '新建 Run')

  return (
    <div className="mb-4 flex shrink-0 flex-col gap-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <h1 className="min-w-0 truncate text-xl font-semibold tracking-heading sm:text-title">{title}</h1>
        {dirty ? (
          <Badge variant="warning">本地草稿</Badge>
        ) : editingCompleted ? (
          <Badge variant="secondary">未保存</Badge>
        ) : target.runId || target.templateMode === 'edit' ? (
          <Badge variant="secondary">
            <CircleCheck aria-hidden="true" />
            已保存
          </Badge>
        ) : null}
        {errorCount > 0 ? <Badge variant="danger">{errorCount} 错误</Badge> : null}
      </div>
      {editingCompleted && loadedRun ? (
        <p className="text-xs text-muted-foreground">
          基于 {runVersionLabel(loadedRun)} 编辑，保存或运行时创建新大版本。
        </p>
      ) : null}
    </div>
  )
}
