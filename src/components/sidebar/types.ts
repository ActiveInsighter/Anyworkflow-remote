import type * as React from 'react'

export type SidebarSide = 'left' | 'right'

/** Which surface owns a control: the expanded panel, the collapsed rail, or outside the shell. */
export type SidebarSurface = 'panel' | 'rail' | 'external'

export type SidebarRootState = 'expanded' | 'collapsed'

export type SidebarPublicContextValue = {
  state: SidebarRootState
  open: boolean
  mobileOpen: boolean
  isMobile: boolean
  modifierHeld: boolean
  modifierKey: 'control' | 'meta' | null
  panelId: string
  mobilePopupId: string
  setOpen: (open: boolean) => void
  setMobileOpen: (open: boolean) => void
  toggle: () => void
}

export type SidebarTokenName =
  | '--sidebar-width'
  | '--sidebar-rail-width'
  | '--sidebar-header-height'
  | '--sidebar-item-height'
  | '--sidebar-icon-button-size'
  | '--sidebar-icon-size'
  | '--sidebar-inline-margin'
  | '--sidebar-inline-padding'
  | '--sidebar-item-radius'
  | '--sidebar-font-size'
  | '--sidebar-line-height'
  | '--sidebar-scrollbar-size'
  | '--sidebar-motion-duration'
  | '--sidebar-motion-fast-duration'
  | '--sidebar-motion-easing'
  | '--sidebar-surface'
  | '--sidebar-foreground'
  | '--sidebar-muted-foreground'
  | '--sidebar-row-highlight'
  | '--sidebar-row-active'
  | '--sidebar-border'
  | '--sidebar-focus-ring'
  | '--sidebar-overlay'
  | '--sidebar-shadow'

export type SidebarTokenOverrides = Partial<Record<SidebarTokenName, string>>

export type SidebarStyle = React.CSSProperties & SidebarTokenOverrides

export type SidebarPersistenceOptions = {
  /** localStorage key used to remember the desktop expanded state. */
  key: string
}

export type SidebarRootProps = Omit<React.ComponentPropsWithoutRef<'div'>, 'style'> & {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  mobileOpen?: boolean
  defaultMobileOpen?: boolean
  onMobileOpenChange?: (open: boolean) => void
  /** Keyboard shortcut letter toggled with Ctrl/Cmd. Pass null to disable. */
  shortcutKey?: string | null
  persistence?: SidebarPersistenceOptions | false
  tokens?: SidebarTokenOverrides
  style?: SidebarStyle
}

export type SidebarShellProps = Omit<React.ComponentPropsWithoutRef<'aside'>, 'children'> & {
  side?: SidebarSide
  /** Accessible name for the navigation landmark. */
  label: string
  /** Contents shown when the sidebar is collapsed. */
  rail: React.ReactNode
  children: React.ReactNode
  overlayClassName?: string
  popupClassName?: string
}
