import { Check, Copy } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { IS_APPLE_PLATFORM } from '@/lib/platform/keyboard'
import { cn } from '@/lib/utils'
import { editorCommand, formatKey, type EditorCommandId } from '../lib/editor-command-registry'
import { COMMAND_ICONS } from './command-icons'

/** The inserts worth one tap; the rest are in the 更多 menu and completion. */
const INSERTS: EditorCommandId[] = ['insert.task', 'insert.event', 'insert.act', 'insert.loop', 'insert.variable', 'insert.wait', 'insert.variable-ref']

export function commandTooltip(id: EditorCommandId): string {
  const command = editorCommand(id)
  const keys = command.key ? ` · ${formatKey(command.key, IS_APPLE_PLATFORM)}` : ''
  return `${command.label} · ${command.hint}${keys}`
}

/** One registry command as a toolbar button; labelled buttons keep their text visible. */
export function CommandButton({
  id,
  onRun,
  labelled = false,
  disabled,
  pressed,
  className,
}: {
  id: EditorCommandId
  onRun: (id: EditorCommandId) => void
  labelled?: boolean
  disabled?: boolean
  pressed?: boolean
  className?: string
}) {
  const command = editorCommand(id)
  const Icon = COMMAND_ICONS[id]
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size={labelled ? 'sm' : 'icon-sm'}
          variant="ghost"
          onClick={() => onRun(id)}
          disabled={disabled}
          aria-pressed={pressed}
          aria-label={labelled ? undefined : command.label}
          className={cn(
            labelled
              ? 'h-touch shrink-0 gap-1.5 px-2.5 text-xs font-medium sm:h-8'
              : 'h-touch min-w-9 flex-1 shrink-0 sm:size-8 sm:min-w-0 sm:flex-none',
            className,
          )}
        >
          <Icon aria-hidden="true" />
          {labelled ? command.label : null}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{commandTooltip(id)}</TooltipContent>
    </Tooltip>
  )
}

function ToolSeparator({ className }: { className?: string }) {
  return <Separator orientation="vertical" className={cn('mx-0.5 h-4! bg-cm-border', className)} />
}

/**
 * Two rows on narrow containers (labelled inserts, then editing tools), one row when the editor
 * is wide enough. Each row scrolls instead of clipping, so no tool is ever unreachable.
 */
export function EditorToolbar({
  readOnly,
  canUndo,
  canRedo,
  copied,
  onRun,
  startPage,
  trailing,
}: {
  readOnly: boolean
  canUndo: boolean
  canRedo: boolean
  copied: boolean
  onRun: (id: EditorCommandId) => void
  /** Start page menu, first in the insert row. */
  startPage?: ReactNode
  /** View controls at the end of the tools row: more menu, outline, fullscreen. */
  trailing: ReactNode
}) {
  return (
    <div className="flex shrink-0 flex-col border-b border-cm-border bg-cm-toolbar-bg @min-[60rem]:flex-row @min-[60rem]:items-center">
      {readOnly ? null : (
        <div
          role="toolbar"
          aria-label="插入"
          className="flex min-h-11 min-w-0 items-center gap-0.5 overflow-x-auto px-1.5 py-1 pe-8 scrollbar-none [mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)] @min-[60rem]:pe-1.5 @min-[60rem]:[mask-image:none]"
        >
          {startPage ? (
            <>
              {startPage}
              <ToolSeparator />
            </>
          ) : null}
          {INSERTS.map((id) => (
            <CommandButton key={id} id={id} onRun={onRun} labelled />
          ))}
        </div>
      )}
      <div
        role="toolbar"
        aria-label="编辑"
        className="flex min-h-11 min-w-0 items-center gap-0.5 overflow-x-auto border-t border-cm-border/70 bg-background/35 px-1.5 py-1 scrollbar-none @min-[60rem]:ms-auto @min-[60rem]:border-t-0 @min-[60rem]:bg-transparent"
      >
        {readOnly ? null : (
          <>
            <CommandButton id="history.undo" onRun={onRun} disabled={!canUndo} />
            <CommandButton id="history.redo" onRun={onRun} disabled={!canRedo} />
            <ToolSeparator />
          </>
        )}
        <CopyButton copied={copied} onRun={onRun} />
        {readOnly ? null : (
          <>
            <CommandButton id="structure.delete" onRun={onRun} />
            {/* Phones reach 格式化 through 更多, keeping this row within 320px. */}
            <ToolSeparator className="max-sm:hidden" />
            <CommandButton id="structure.format" onRun={onRun} className="max-sm:hidden" />
          </>
        )}
        <ToolSeparator />
        {trailing}
      </div>
    </div>
  )
}

function CopyButton({ copied, onRun }: { copied: boolean; onRun: (id: EditorCommandId) => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={() => onRun('clipboard.copy')}
          aria-label={copied ? '已复制' : '智能复制'}
          className="h-touch min-w-9 flex-1 shrink-0 sm:size-8 sm:min-w-0 sm:flex-none"
        >
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{commandTooltip('clipboard.copy')}</TooltipContent>
    </Tooltip>
  )
}
