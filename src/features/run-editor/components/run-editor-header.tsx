import { CircleCheck, CloudOff, GitBranch } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { runVersionLabel } from '@/lib/domain/run-status'
import type { RunEditorModel } from '../hooks/use-run-editor'

/** Title with save state: unsaved local edits, an unsaved fork of a finished Run, or saved. */
export function RunEditorHeader({ editor }: { editor: RunEditorModel }) {
  const { target, loadedRun, dirty } = editor
  const editingCompleted = Boolean(loadedRun && loadedRun.status !== 'draft')
  const title = editor.editingTemplate
    ? editor.templateTitle || '编辑模板'
    : editor.meta.title || (target.kind === 'run' ? '未命名 Run' : '新建 Run')

  return (
    <header className="mb-3 flex shrink-0 flex-col gap-1 sm:mb-4">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <h1 className="min-w-0 truncate text-xl font-semibold tracking-heading sm:text-title">{title}</h1>
        {dirty ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="warning" tabIndex={0}>
                <CloudOff aria-hidden="true" />
                本地草稿
              </Badge>
            </TooltipTrigger>
            <TooltipContent>修改已自动暂存在本机，保存后才会同步</TooltipContent>
          </Tooltip>
        ) : editingCompleted ? (
          <Badge variant="secondary">未保存</Badge>
        ) : target.kind === 'run' || editor.editingTemplate ? (
          <Badge variant="secondary">
            <CircleCheck aria-hidden="true" />
            已保存
          </Badge>
        ) : null}
        {editor.editingTemplate ? <Badge variant="secondary">模板</Badge> : null}
      </div>
      {editingCompleted && loadedRun ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <GitBranch className="size-3.5 shrink-0" aria-hidden="true" />
          基于 {runVersionLabel(loadedRun)} 编辑，保存或运行时创建新大版本。
        </p>
      ) : null}
    </header>
  )
}
