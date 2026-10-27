import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { DriveCreateAction } from './drive-types'

/** 新建 on wide screens: one action runs directly, several open a menu. */
export function DriveCreateButton({ actions, className }: { actions: DriveCreateAction[]; className?: string }) {
  if (!actions.length) return null
  if (actions.length === 1) {
    const [action] = actions
    return (
      <Button size="touch" className={cn('rounded-full px-4 sm:h-10', className)} onClick={action.onSelect}>
        <action.icon data-icon="inline-start" />
        {action.label}
      </Button>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="touch" className={cn('rounded-full px-4 sm:h-10', className)}>
          <Plus data-icon="inline-start" />
          新建
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {actions.map((action) => (
          <DropdownMenuItem key={action.id} onSelect={action.onSelect} className="min-h-10 gap-3">
            <action.icon />
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const FAB_POSITION = 'fixed right-4 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] sm:hidden'

/**
 * Floating 新建 for phones, in thumb reach. Several actions unfold above it as a stack of
 * pills over a scrim; the button turns into a close button meanwhile.
 */
export function DriveFab({ actions }: { actions: DriveCreateAction[] }) {
  const [open, setOpen] = useState(false)
  if (!actions.length) return null
  const fabClass = cn(
    FAB_POSITION,
    'z-overlay size-14 rounded-2xl bg-primary text-primary-foreground shadow-lg hover:bg-primary-hover [&_svg]:size-6!',
  )
  if (actions.length === 1) {
    const [action] = actions
    return (
      <Button className={fabClass} aria-label={action.label} onClick={action.onSelect}>
        <action.icon />
      </Button>
    )
  }
  return (
    <>
      {open ? <div aria-hidden="true" className="fixed inset-0 z-overlay bg-background/85 sm:hidden" /> : null}
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button className={fabClass} aria-label={open ? '关闭新建菜单' : '新建'}>
            <Plus className={cn('transition-transform duration-base', open && 'rotate-45')} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="end"
          sideOffset={14}
          className="flex min-w-0 flex-col items-end gap-2.5 overflow-visible border-0 bg-transparent p-0 shadow-none"
        >
          {actions.map((action) => (
            <DropdownMenuItem
              key={action.id}
              onSelect={action.onSelect}
              className="h-13 gap-3 rounded-2xl bg-primary-soft px-5 text-body font-medium text-primary shadow-md focus:bg-primary-soft focus:text-primary focus:ring-2 focus:ring-ring/60 [&_svg]:size-5! [&_svg]:text-primary!"
            >
              <action.icon />
              {action.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
