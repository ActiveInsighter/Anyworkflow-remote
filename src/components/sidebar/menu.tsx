import * as React from 'react'
import { useSidebarContext } from './context'
import { cn } from '@/lib/utils'

type SidebarMenuItemContextValue = { active: boolean }

const SidebarMenuItemContext = React.createContext<SidebarMenuItemContextValue>({ active: false })

export const SidebarMenu = React.forwardRef<HTMLUListElement, React.ComponentPropsWithoutRef<'ul'>>(
  function SidebarMenu(props, forwardedRef) {
    return <ul ref={forwardedRef} data-slot="sidebar-menu" {...props} />
  },
)

export type SidebarMenuItemProps = React.ComponentPropsWithoutRef<'li'> & {
  active?: boolean
}

export const SidebarMenuItem = React.forwardRef<HTMLLIElement, SidebarMenuItemProps>(
  function SidebarMenuItem({ active = false, children, ...props }, forwardedRef) {
    const value = React.useMemo(() => ({ active }), [active])

    return (
      <SidebarMenuItemContext.Provider value={value}>
        <li ref={forwardedRef} data-slot="sidebar-menu-item" data-active={active || undefined} {...props}>
          {children}
        </li>
      </SidebarMenuItemContext.Provider>
    )
  },
)

export type SidebarMenuButtonProps = Omit<React.ComponentPropsWithoutRef<'button'>, 'children'> & {
  icon?: React.ReactNode
  trailing?: React.ReactNode
  children: React.ReactNode
  /** Render as another element, for example a react-router `<Link>`, keeping the styling. */
  render?: React.ReactElement
}

export const SidebarMenuButton = React.forwardRef<HTMLElement, SidebarMenuButtonProps>(
  function SidebarMenuButton(
    { render, icon, trailing, children, disabled = false, type = 'button', onClick, className, ...props },
    forwardedRef,
  ) {
    const { active } = React.useContext(SidebarMenuItemContext)

    const handleClick = (event: React.MouseEvent<HTMLElement>) => {
      if (disabled) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      onClick?.(event as React.MouseEvent<HTMLButtonElement>)
    }

    const content = (
      <>
        {icon ? (
          <span data-slot="sidebar-menu-icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <span data-slot="sidebar-menu-label">{children}</span>
        {trailing ? <span data-slot="sidebar-menu-trailing">{trailing}</span> : null}
      </>
    )

    if (render) {
      const renderClassName = (render.props as { className?: string }).className
      const renderProps = {
        ...props,
        ref: forwardedRef,
        'data-slot': 'sidebar-menu-button',
        'data-has-icon': icon ? '' : undefined,
        'data-active': active || undefined,
        'aria-disabled': disabled || undefined,
        tabIndex: disabled ? -1 : props.tabIndex,
        className: cn(renderClassName, className),
        onClick: handleClick,
      } as unknown as React.Attributes & Record<string, unknown>
      return React.cloneElement(
        render as React.ReactElement<Record<string, unknown>>,
        renderProps,
        content,
      )
    }

    return (
      <button
        {...props}
        ref={forwardedRef as React.Ref<HTMLButtonElement>}
        type={type}
        disabled={disabled}
        data-slot="sidebar-menu-button"
        data-has-icon={icon ? '' : undefined}
        data-active={active || undefined}
        className={className}
        onClick={handleClick}
      >
        {content}
      </button>
    )
  },
)

export type SidebarShortcutHintProps = Omit<React.ComponentPropsWithoutRef<'kbd'>, 'children'> & {
  keys: readonly React.ReactNode[]
  primaryKey?: React.ReactNode
}

/** Keyboard hint that stays invisible until the platform modifier is held. */
export const SidebarShortcutHint = React.forwardRef<HTMLElement, SidebarShortcutHintProps>(
  function SidebarShortcutHint({ keys, primaryKey, ...props }, forwardedRef) {
    const { modifierHeld, modifierKey } = useSidebarContext()
    const resolvedPrimaryKey = primaryKey ?? (modifierKey === 'meta' ? '⌘' : 'Ctrl')

    return (
      <kbd
        {...props}
        ref={forwardedRef}
        data-slot="sidebar-shortcut-hint"
        data-visible={modifierHeld || undefined}
        aria-hidden={!modifierHeld}
      >
        <span>{resolvedPrimaryKey}</span>
        {keys.map((key, index) => (
          <React.Fragment key={index}>
            <span aria-hidden="true">+</span>
            <span>{key}</span>
          </React.Fragment>
        ))}
      </kbd>
    )
  },
)
