import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { useSidebarContext } from './context'

export type SidebarTooltipProps = {
  content?: React.ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
  children: React.ReactElement
}

/**
 * Tooltip used by the collapsed rail and by icon-only controls.
 * Renders `children` untouched when there is nothing to show.
 */
export function SidebarTooltip({
  content,
  side = 'right',
  align = 'center',
  sideOffset = 8,
  children,
}: SidebarTooltipProps) {
  const { portalStyle } = useSidebarContext()

  if (!content) return children

  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          data-slot="sidebar-tooltip"
          side={side}
          align={align}
          sideOffset={sideOffset}
          style={portalStyle}
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
