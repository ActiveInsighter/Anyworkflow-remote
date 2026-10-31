import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { keepEditorFocus } from '../hooks/use-editor-focus'

/** Square tool size: a touch target on phones, compact from `sm`. */
export const TOOL_ICON_CLASS = 'h-touch min-w-9 flex-1 shrink-0 sm:size-8 sm:min-w-0 sm:flex-none'
/** Labelled tool size. */
export const TOOL_LABEL_CLASS = 'h-touch shrink-0 gap-1.5 px-2.5 text-xs font-medium sm:h-8'

/** An icon tool with a tooltip; pressing it never takes focus from the text. */
export function ToolIconButton({
  label,
  hint,
  pressed,
  disabled,
  onClick,
  className,
  children,
}: {
  label: string
  hint: string
  pressed?: boolean
  disabled?: boolean
  onClick: () => void
  className?: string
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={label}
          aria-pressed={pressed}
          disabled={disabled}
          onMouseDown={keepEditorFocus}
          onClick={onClick}
          className={cn(TOOL_ICON_CLASS, 'aria-pressed:bg-muted', className)}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{hint}</TooltipContent>
    </Tooltip>
  )
}
