import * as React from 'react'
import { useSidebarShellLabel } from './shell'
import { SidebarTooltip } from './tooltip'
import { cn } from '@/lib/utils'

export const SidebarRail = React.forwardRef<HTMLElement, React.ComponentPropsWithoutRef<'nav'>>(
  function SidebarRail(props, forwardedRef) {
    const label = useSidebarShellLabel()
    return (
      <nav
        {...props}
        ref={forwardedRef}
        data-slot="sidebar-rail"
        aria-label={props['aria-label'] ?? (label ? `${label}（紧凑）` : undefined)}
      />
    )
  },
)

export const SidebarRailHeader = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'>>(
  function SidebarRailHeader(props, forwardedRef) {
    return <div ref={forwardedRef} data-slot="sidebar-rail-header" {...props} />
  },
)

export const SidebarRailMenu = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'>>(
  function SidebarRailMenu(props, forwardedRef) {
    return <div ref={forwardedRef} data-slot="sidebar-rail-menu" {...props} />
  },
)

export const SidebarRailFooter = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'>>(
  function SidebarRailFooter(props, forwardedRef) {
    return <div ref={forwardedRef} data-slot="sidebar-rail-footer" {...props} />
  },
)

export type SidebarRailButtonProps = React.ComponentPropsWithoutRef<'button'> & {
  active?: boolean
  icon?: React.ReactNode
  tooltip?: React.ReactNode
  /** Render as another element, for example a react-router `<Link>`, keeping the styling. */
  render?: React.ReactElement
}

export const SidebarRailButton = React.forwardRef<HTMLElement, SidebarRailButtonProps>(
  function SidebarRailButton(
    { active = false, icon, tooltip, type = 'button', children, className, render, ...props },
    forwardedRef,
  ) {
    const content = icon ?? children

    const button = render ? (
      React.cloneElement(
        render as React.ReactElement<Record<string, unknown>>,
        {
          ...props,
          ref: forwardedRef,
          'data-slot': 'sidebar-rail-button',
          'data-active': active || undefined,
          className: cn((render.props as { className?: string }).className, className),
          'aria-label': props['aria-label'] ?? (typeof tooltip === 'string' ? tooltip : undefined),
        } as unknown as React.Attributes & Record<string, unknown>,
        content,
      )
    ) : (
      <button
        {...props}
        ref={forwardedRef as React.Ref<HTMLButtonElement>}
        type={type}
        data-slot="sidebar-rail-button"
        data-active={active || undefined}
        aria-label={props['aria-label'] ?? (typeof tooltip === 'string' ? tooltip : undefined)}
        className={className}
      >
        {content}
      </button>
    )

    return (
      <SidebarTooltip content={tooltip} side="right">
        {button}
      </SidebarTooltip>
    )
  },
)
