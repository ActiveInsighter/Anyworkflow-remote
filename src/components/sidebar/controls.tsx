import * as React from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useSidebarContext } from './context'
import { SidebarTooltip } from './tooltip'
import type { SidebarSurface } from './types'

export type SidebarIconButtonProps = React.ComponentPropsWithoutRef<'button'> & {
  tooltip?: React.ReactNode
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left'
}

export const SidebarIconButton = React.forwardRef<HTMLButtonElement, SidebarIconButtonProps>(
  function SidebarIconButton({ tooltip, tooltipSide = 'right', type = 'button', children, ...props }, forwardedRef) {
    const button = (
      <button
        {...props}
        ref={forwardedRef}
        type={type}
        data-slot="sidebar-icon-button"
        aria-label={props['aria-label'] ?? (typeof tooltip === 'string' ? tooltip : undefined)}
      >
        {children}
      </button>
    )

    return (
      <SidebarTooltip content={tooltip} side={tooltipSide}>
        {button}
      </SidebarTooltip>
    )
  },
)

export type SidebarTriggerProps = Omit<React.ComponentPropsWithoutRef<'button'>, 'children'> & {
  /** Which surface the trigger lives on. `external` is used by the mobile top bar. */
  surface: SidebarSurface
  tooltip?: React.ReactNode
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left'
  children?: React.ReactNode
}

/**
 * Expands or collapses the sidebar. On mobile it opens the drawer instead.
 * The icon and the accessible name both follow the resulting state.
 */
export const SidebarTrigger = React.forwardRef<HTMLButtonElement, SidebarTriggerProps>(
  function SidebarTrigger(
    { surface, tooltip, tooltipSide = 'right', onClick, children, type = 'button', ...props },
    forwardedRef,
  ) {
    const context = useSidebarContext()
    const expanded = context.isMobile ? context.mobileOpen : context.open

    const setTriggerRef = React.useCallback(
      (node: HTMLButtonElement | null) => {
        if (typeof forwardedRef === 'function') forwardedRef(node)
        else if (forwardedRef) forwardedRef.current = node
        context.registerTrigger(surface, node)
      },
      [context, forwardedRef, surface],
    )

    const label = expanded ? '收起导航' : '展开导航'

    return (
      <SidebarTooltip
        content={tooltip ?? (expanded ? '收起 (Ctrl+B)' : '展开 (Ctrl+B)')}
        side={tooltipSide}
      >
        <button
          {...props}
          ref={setTriggerRef}
          type={type}
          data-slot="sidebar-trigger"
          aria-label={props['aria-label'] ?? (typeof tooltip === 'string' ? tooltip : label)}
          aria-controls={context.isMobile ? context.mobilePopupId : context.panelId}
          aria-expanded={expanded}
          onClick={(event) => {
            onClick?.(event)
            if (!event.defaultPrevented) context.toggleFromTrigger(event.currentTarget)
          }}
        >
          {children ?? (expanded ? <PanelLeftClose /> : <PanelLeftOpen />)}
          <span className="sidebar-sr-only">{label}</span>
        </button>
      </SidebarTooltip>
    )
  },
)
