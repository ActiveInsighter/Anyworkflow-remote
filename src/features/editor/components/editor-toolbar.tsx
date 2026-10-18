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
  type LucideIcon,
} from 'lucide-react'
import { Fragment } from 'react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { StructuredInsertKind } from '../lib/anyworkflow-dsl'

export interface EditorToolbarActions {
  insertStructured: (kind: StructuredInsertKind) => void
  insert: (text: string, cursorOffset?: number, selectionLength?: number) => void
  insertVariable: () => void
  smartDelete: () => void
  undo: () => void
  redo: () => void
  paste: () => Promise<void>
  format: () => void
  copy: () => Promise<void>
  toggleFullscreen: () => void
  save?: () => void
}

interface ToolItem {
  icon: LucideIcon
  label: string
  hint?: string
  run: (actions: EditorToolbarActions) => void
  disabled?: boolean
  primary?: boolean
}

/** Insert tools, in DSL nesting order. Hidden for read-only editors. */
const INSERT_TOOLS: ToolItem[] = [
  { icon: Braces, label: 'Task', hint: '追加到 Run 最外层', run: (a) => a.insertStructured('task') },
  { icon: Bot, label: 'Codex', hint: '追加到 Run 最外层，交给云端 Codex', run: (a) => a.insertStructured('codex') },
  { icon: Zap, label: 'Event', hint: '添加到光标所在 Task', run: (a) => a.insertStructured('event') },
  { icon: ListTree, label: 'Act', hint: '添加到光标所在 Event', run: (a) => a.insertStructured('act') },
  { icon: Repeat, label: '循环', hint: '插入循环', run: (a) => a.insert('@for i in range(1, 3) {\n  \n}\n', 5, 1) },
  { icon: Variable, label: '变量', hint: '添加到光标所在 Task 的变量区', run: (a) => a.insertStructured('variable') },
  { icon: Percent, label: '使用变量', hint: '插入 %% 并选择当前位置可用变量', run: (a) => a.insertVariable() },
  { icon: Braces, label: '消息块', hint: '插入 { }', run: (a) => a.insert('{\n\n}', 2) },
  { icon: LinkIcon, label: '链接', hint: '插入 <>，直接粘贴链接', run: (a) => a.insert('<>', 1) },
  {
    icon: Trash2,
    label: '智能删除',
    hint: '选中结构括号删除整块，否则删除当前行或选中行',
    run: (a) => a.smartDelete(),
  },
]

function ToolButton({ item, actions }: { item: ToolItem; actions: EditorToolbarActions }) {
  const Icon = item.icon
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon-sm"
          variant={item.primary ? 'default' : 'ghost'}
          onClick={() => item.run(actions)}
          disabled={item.disabled}
          aria-label={item.label}
          className={cn('size-10 shrink-0 sm:size-8', item.primary && 'bg-primary/80')}
        >
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{item.hint ? `${item.label} · ${item.hint}` : item.label}</TooltipContent>
    </Tooltip>
  )
}

function ToolRow({ groups, actions, className }: { groups: ToolItem[][]; actions: EditorToolbarActions; className?: string }) {
  const visible = groups.filter((group) => group.length)
  return (
    <div className={cn('flex min-h-10 items-center gap-0.5 overflow-x-auto px-2 py-1 scrollbar-none', className)}>
      {visible.map((group, index) => (
        <Fragment key={index}>
          {index > 0 ? <Separator orientation="vertical" className="mx-0.5 h-4! bg-cm-border" /> : null}
          {group.map((item) => (
            <ToolButton key={item.label} item={item} actions={actions} />
          ))}
        </Fragment>
      ))}
    </div>
  )
}

/**
 * Two rows: structural inserts on top, history/clipboard/view tools right-aligned below. The
 * lower row uses safe alignment so narrow screens scroll it instead of clipping its first tools.
 */
export function EditorToolbar({
  readOnly,
  canUndo,
  canRedo,
  copied,
  fullscreen,
  actions,
}: {
  readOnly: boolean
  canUndo: boolean
  canRedo: boolean
  copied: boolean
  fullscreen: boolean
  actions: EditorToolbarActions
}) {
  const editTools: ToolItem[][] = readOnly
    ? []
    : [
        [
          { icon: Undo2, label: '撤销', hint: 'Ctrl/⌘ Z', run: (a) => a.undo(), disabled: !canUndo },
          { icon: Redo2, label: '重做', hint: 'Ctrl/⌘ Shift Z', run: (a) => a.redo(), disabled: !canRedo },
          { icon: ClipboardPaste, label: '粘贴', hint: '粘贴到当前光标位置', run: (a) => void a.paste() },
        ],
        [{ icon: AlignLeft, label: '格式化', hint: '按块结构重排缩进', run: (a) => a.format() }],
        actions.save ? [{ icon: Save, label: '保存', hint: 'Ctrl/⌘ S', run: (a) => a.save?.(), primary: true }] : [],
      ]
  const copyTool: ToolItem = {
    icon: copied ? Check : Copy,
    label: copied ? '已复制' : '智能复制',
    hint: '选中结构括号复制整块，否则复制当前行或选中行',
    run: (a) => void a.copy(),
  }
  const viewTool: ToolItem = {
    icon: fullscreen ? Minimize2 : Maximize2,
    label: fullscreen ? '退出全屏' : '全屏',
    hint: 'Esc 退出',
    run: (a) => a.toggleFullscreen(),
  }
  return (
    <div className="shrink-0 border-b border-cm-border bg-cm-toolbar-bg">
      {readOnly ? null : <ToolRow groups={[INSERT_TOOLS]} actions={actions} />}
      <ToolRow
        className="justify-end-safe border-t border-cm-border/70 bg-background/35"
        groups={[...editTools, [copyTool], [viewTool]]}
        actions={actions}
      />
    </div>
  )
}
