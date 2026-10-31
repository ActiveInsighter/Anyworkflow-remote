import { useState } from 'react'
import { ChevronDown, Repeat } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { keepEditorFocus, useToolbarMenuFocus } from '../hooks/use-editor-focus'
import { editorCommand, type EditorCommandId } from '../lib/editor-command-registry'
import { COMMAND_ICONS } from './command-icons'
import { TOOL_LABEL_CLASS } from './editor-tool-button'

const TEMPLATES: Array<{ id: EditorCommandId; sample: string }> = [
  { id: 'insert.loop', sample: '@for i in range(1, 3)' },
  { id: 'insert.loop-list', sample: '@for item in [甲, 乙, 丙]' },
  { id: 'insert.loop-outline', sample: '@for ch, title, secs in [(1, 第一章, [小节一, 小节二]) …]' },
]

/**
 * The 循环 tool: three starting points, from repeating with a number to chapters that each carry
 * their own sections. A popover rather than a menu, so it opens without taking focus from the text
 * (a phone keeps its keyboard and the page stays still).
 */
export function EditorLoopMenu({ onRun }: { onRun: (id: EditorCommandId) => void }) {
  const [open, setOpen] = useState(false)
  const focus = useToolbarMenuFocus()
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" onMouseDown={keepEditorFocus} className={TOOL_LABEL_CLASS}>
          <Repeat aria-hidden="true" />
          循环
          <ChevronDown className="size-3.5 opacity-60" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(21rem,calc(100vw-1.5rem))] p-1.5" {...focus}>
        <p className="px-2 pt-1 pb-1.5 text-micro text-muted-foreground">插入到光标处，循环最多嵌套 3 层</p>
        <ul className="flex flex-col">
          {TEMPLATES.map(({ id, sample }) => {
            const command = editorCommand(id)
            const Icon = COMMAND_ICONS[id]
            return (
              <li key={id}>
                <button
                  type="button"
                  onMouseDown={keepEditorFocus}
                  onClick={() => {
                    setOpen(false)
                    onRun(id)
                  }}
                  className="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left outline-none hover:bg-accent focus-visible:bg-accent"
                >
                  <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-medium">{command.label}</span>
                    <span className="text-caption text-muted-foreground">{command.hint}</span>
                    <code className="truncate font-mono text-micro text-muted-foreground/90">{sample}</code>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
