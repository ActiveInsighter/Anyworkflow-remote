import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { useSidebarContext } from './context'
import { SidebarFixedTop, SidebarFooter, SidebarHeader, SidebarScrollArea } from './layout'
import type { SidebarShellProps } from './types'

const SidebarShellLabelContext = React.createContext<string | null>(null)

export function useSidebarShellLabel() {
  return React.useContext(SidebarShellLabelContext)
}

/**
 * Two presentations from one markup tree:
 * - Desktop stacks the rail and the panel as layers inside a fixed-width `<aside>`.
 *   Only one layer is interactive at a time; the other is `inert` and invisible.
 * - Mobile renders the panel inside a modal drawer and drops the rail entirely.
 */
export const SidebarShell = React.forwardRef<HTMLElement, SidebarShellProps>(function SidebarShell(
  { side = 'left', label, rail, children, className, overlayClassName, popupClassName, ...props },
  forwardedRef,
) {
  const context = useSidebarContext()

  if (context.isMobile) {
    return (
      <SidebarShellLabelContext.Provider value={label}>
        <DialogPrimitive.Root open={context.mobileOpen} onOpenChange={context.setMobileOpen}>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay
              data-slot="sidebar-mobile-overlay"
              className={overlayClassName}
              style={context.mobilePortalStyle}
            />
            <DialogPrimitive.Content
              id={context.mobilePopupId}
              data-slot="sidebar-mobile-popup"
              data-side={side}
              className={popupClassName}
              style={context.mobilePortalStyle}
              onCloseAutoFocus={(event) => {
                const target = context.getMobileFocusReturn()
                if (!target) return
                event.preventDefault()
                target.focus({ preventScroll: true })
              }}
            >
              <DialogPrimitive.Title className="sidebar-sr-only">{label}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="sidebar-sr-only">{label}</DialogPrimitive.Description>
              {children}
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      </SidebarShellLabelContext.Provider>
    )
  }

  return (
    <SidebarShellLabelContext.Provider value={label}>
      <aside
        {...props}
        ref={forwardedRef}
        data-slot="sidebar-shell"
        data-side={side}
        data-state={context.state}
        aria-label={label}
        className={className}
      >
        <div
          ref={(node) => context.registerSurface('rail', node)}
          id={context.railId}
          data-slot="sidebar-layer"
          data-surface="rail"
          data-side={side}
          aria-hidden={context.open}
          inert={context.open || undefined}
        >
          {rail}
        </div>
        <div
          ref={(node) => context.registerSurface('panel', node)}
          data-slot="sidebar-layer"
          data-surface="panel"
          data-side={side}
          aria-hidden={!context.open}
          inert={!context.open || undefined}
        >
          {children}
        </div>
      </aside>
    </SidebarShellLabelContext.Provider>
  )
})

export type SidebarPanelChildren =
  | readonly [React.ReactElement, React.ReactElement, React.ReactElement]
  | readonly [React.ReactElement, React.ReactElement, React.ReactElement, React.ReactElement]

export type SidebarPanelProps = Omit<React.ComponentPropsWithoutRef<'nav'>, 'children'> & {
  children: SidebarPanelChildren
}

const withFixedTop = [SidebarHeader, SidebarFixedTop, SidebarScrollArea, SidebarFooter] as const
const withoutFixedTop = [SidebarHeader, SidebarScrollArea, SidebarFooter] as const

/**
 * Vertical region stack. `children` must be Header, an optional FixedTop, one ScrollArea,
 * and Footer, in that order. The contract is enforced at runtime so panels stay scrollable
 * and pinned regions never silently lose their behaviour.
 */
export const SidebarPanel = React.forwardRef<HTMLElement, SidebarPanelProps>(function SidebarPanel(
  { children, ...props },
  forwardedRef,
) {
  const { panelId } = useSidebarContext()
  const label = useSidebarShellLabel()
  const regions = React.Children.toArray(children)
  const expected = regions.length === withoutFixedTop.length ? withoutFixedTop : withFixedTop

  if (
    regions.length !== expected.length ||
    regions.some(
      (region, index) => !React.isValidElement(region) || region.type !== expected[index],
    )
  ) {
    throw new Error(
      'SidebarPanel requires SidebarHeader, an optional SidebarFixedTop, one SidebarScrollArea, and SidebarFooter in that order.',
    )
  }

  return (
    <nav
      {...props}
      ref={forwardedRef}
      id={panelId}
      data-slot="sidebar-panel"
      aria-label={props['aria-label'] ?? label ?? undefined}
    >
      {children}
    </nav>
  )
})

/** Main content region, rendered as `<main>` so pages keep a single landmark. */
export const SidebarInset = React.forwardRef<HTMLElement, React.ComponentPropsWithoutRef<'main'>>(
  function SidebarInset(props, forwardedRef) {
    return <main ref={forwardedRef} data-slot="sidebar-inset" {...props} />
  },
)
