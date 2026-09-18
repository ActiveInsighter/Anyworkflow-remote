import * as React from 'react'
import { ChevronRight } from 'lucide-react'

type SidebarSectionContextValue = {
  open: boolean
  disabled: boolean
  contentId: string
  toggle: () => void
}

const SidebarSectionContext = React.createContext<SidebarSectionContextValue | null>(null)

function useSidebarSection() {
  const context = React.useContext(SidebarSectionContext)
  if (!context) throw new Error('SidebarSection parts must be used within SidebarSection')
  return context
}

export type SidebarSectionProps = Omit<React.ComponentPropsWithoutRef<'section'>, 'onChange'> & {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  disabled?: boolean
}

/**
 * Collapsible group of navigation items. Uses a `grid-template-rows` transition so the
 * panel animates without measuring heights or animating `height` on every frame.
 */
export function SidebarSection({
  open: openProp,
  defaultOpen = true,
  onOpenChange,
  disabled = false,
  children,
  ...props
}: SidebarSectionProps) {
  const contentId = React.useId()
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen)
  const open = disabled ? false : (openProp ?? uncontrolledOpen)

  const toggle = React.useCallback(() => {
    if (disabled) return
    const next = !open
    if (openProp === undefined) setUncontrolledOpen(next)
    onOpenChange?.(next)
  }, [disabled, onOpenChange, open, openProp])

  const value = React.useMemo<SidebarSectionContextValue>(
    () => ({ open, disabled, contentId, toggle }),
    [contentId, disabled, open, toggle],
  )

  return (
    <SidebarSectionContext.Provider value={value}>
      <section
        {...props}
        data-slot="sidebar-section"
        data-state={open ? 'open' : 'closed'}
        {...(disabled ? { 'data-disabled': '' } : {})}
      >
        {children}
      </section>
    </SidebarSectionContext.Provider>
  )
}

export const SidebarSectionHeader = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'>>(
  function SidebarSectionHeader(props, forwardedRef) {
    return <div ref={forwardedRef} data-slot="sidebar-section-header" {...props} />
  },
)

export const SidebarSectionTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<'button'>
>(function SidebarSectionTrigger({ children, type = 'button', ...props }, forwardedRef) {
  const { open, disabled, contentId, toggle } = useSidebarSection()

  return (
    <button
      {...props}
      ref={forwardedRef}
      type={type}
      data-slot="sidebar-section-trigger"
      aria-expanded={open}
      aria-controls={contentId}
      disabled={disabled}
      onClick={toggle}
    >
      <ChevronRight data-slot="sidebar-section-chevron" aria-hidden="true" />
      <span data-slot="sidebar-section-label">{children}</span>
    </button>
  )
})

export const SidebarSectionActions = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'>>(
  function SidebarSectionActions(props, forwardedRef) {
    return <div ref={forwardedRef} data-slot="sidebar-section-actions" {...props} />
  },
)

export const SidebarSectionContent = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'>>(
  function SidebarSectionContent({ children, ...props }, forwardedRef) {
    const { open, contentId } = useSidebarSection()

    return (
      <div
        {...props}
        ref={forwardedRef}
        id={contentId}
        data-slot="sidebar-section-content"
        data-state={open ? 'open' : 'closed'}
        inert={!open || undefined}
      >
        <div data-slot="sidebar-section-content-inner">{children}</div>
      </div>
    )
  },
)
