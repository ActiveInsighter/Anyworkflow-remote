import {
  AlignLeft,
  Bot,
  Braces,
  Check,
  ClipboardPaste,
  Copy,
  Link as LinkIcon,
  ListTree,
  Maximize2,
  Minimize2,
  Percent,
  Redo2,
  Repeat,
  Save,
  Trash2,
  Undo2,
  Variable,
  Zap,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { StructuredInsertKind } from './anyworkflow-dsl'

interface EditorToolbarProps {
  readOnly: boolean
  canUndo: boolean
  canRedo: boolean
  copied: boolean
  fullscreen: boolean
  onInsertStructured: (kind: StructuredInsertKind) => void
  onInsert: (text: string, cursorOffset?: number, selectionLength?: number) => void
  onInsertVariable: () => void
  onSmartDelete: () => void
  onUndo: () => void
  onRedo: () => void
  onPaste: () => Promise<void>
  onFormat: () => void
  onSave?: () => void
  onCopy: () => Promise<void>
  onToggleFullscreen: () => void
}

function ToolButton({
  icon,
  label,
  hint,
  onClick,
  disabled,
  className,
}: {
  icon: ReactNode
  label: string
  hint?: string
  onClick: () => void
  disabled?: boolean
  className?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          className={cn('size-8 shrink-0 p-0', className)}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{hint ? `${label} · ${hint}` : label}</TooltipContent>
    </Tooltip>
  )
}

function ToolDivider() {
  return <span className="mx-0.5 h-4 w-px shrink-0 bg-cm-border" aria-hidden="true" />
}

export function EditorToolbar({
  readOnly,
  canUndo,
  canRedo,
  copied,
  fullscreen,
  onInsertStructured,
  onInsert,
  onInsertVariable,
  onSmartDelete,
  onUndo,
  onRedo,
  onPaste,
  onFormat,
  onSave,
  onCopy,
  onToggleFullscreen,
}: EditorToolbarProps) {
  return (
    <div className="shrink-0 border-b border-cm-border bg-cm-toolbar-bg">
      <div className="flex min-h-10 items-center gap-1 overflow-x-auto px-2 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {readOnly ? null : (
          <div className="flex shrink-0 items-center gap-0.5">
            <ToolButton
              icon={<Braces className="size-3.5" />}
              label="Task"
              hint="追加到 Run 最外层"
              onClick={() => onInsertStructured('task')}
            />
            <ToolButton
              icon={<Bot className="size-3.5" />}
              label="Codex"
              hint="追加到 Run 最外层，交给云端 Codex"
              onClick={() => onInsertStructured('codex')}
            />
            <ToolButton
              icon={<Zap className="size-3.5" />}
              label="Event"
              hint="添加到光标所在 Task"
              onClick={() => onInsertStructured('event')}
            />
            <ToolButton
              icon={<ListTree className="size-3.5" />}
              label="Act"
              hint="添加到光标所在 Event"
              onClick={() => onInsertStructured('act')}
            />
            <ToolButton
              icon={<Repeat className="size-3.5" />}
              label="循环"
              hint="插入循环"
              onClick={() => onInsert('@for i in range(1, 3) {\n  \n}\n', 5, 1)}
            />
            <ToolButton
              icon={<Variable className="size-3.5" />}
              label="变量"
              hint="添加到光标所在 Task 的变量区"
              onClick={() => onInsertStructured('variable')}
            />
            <ToolButton
              icon={<Percent className="size-3.5" />}
              label="使用变量"
              hint="插入 %% 并选择当前位置可用变量"
              onClick={onInsertVariable}
            />
            <ToolButton
              icon={<Braces className="size-3.5" />}
              label="消息块"
              hint="插入 { }"
              onClick={() => onInsert('{\n\n}', 2)}
            />
            <ToolButton
              icon={<LinkIcon className="size-3.5" />}
              label="链接"
              hint="插入 <>，直接粘贴链接"
              onClick={() => onInsert('<>', 1)}
            />
            <ToolButton
              icon={<Trash2 className="size-3.5" />}
              label="智能删除"
              hint="选中结构括号删除整块，否则删除当前行或选中行"
              onClick={onSmartDelete}
            />
          </div>
        )}
      </div>

      <div className="flex min-h-10 items-center gap-1 overflow-x-auto border-t border-cm-border/70 bg-background/35 px-2 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="ms-auto flex shrink-0 items-center gap-0.5">
          {readOnly ? null : (
            <>
              <ToolButton
                icon={<Undo2 className="size-3.5" />}
                label="撤销"
                hint="Ctrl/⌘ Z"
                onClick={onUndo}
                disabled={!canUndo}
              />
              <ToolButton
                icon={<Redo2 className="size-3.5" />}
                label="重做"
                hint="Ctrl/⌘ Shift Z"
                onClick={onRedo}
                disabled={!canRedo}
              />
              <ToolButton
                icon={<ClipboardPaste className="size-3.5" />}
                label="粘贴"
                hint="粘贴到当前光标位置"
                onClick={() => void onPaste()}
              />
              <ToolDivider />
              <ToolButton
                icon={<AlignLeft className="size-3.5" />}
                label="格式化"
                hint="按块结构重排缩进"
                onClick={onFormat}
              />
              {onSave ? (
                <>
                  <ToolDivider />
                  <ToolButton
                    icon={<Save className="size-3.5" />}
                    label="保存"
                    hint="Ctrl/⌘ S"
                    onClick={onSave}
                    className="bg-primary/70 text-primary-foreground hover:bg-primary"
                  />
                </>
              ) : null}
            </>
          )}
          <ToolButton
            icon={copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            label={copied ? '已复制' : '复制'}
            hint="复制全文"
            onClick={() => void onCopy()}
          />
          <ToolDivider />
          <ToolButton
            icon={fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            label={fullscreen ? '退出全屏' : '全屏'}
            hint="Esc 退出"
            onClick={onToggleFullscreen}
          />
        </div>
      </div>
    </div>
  )
}
