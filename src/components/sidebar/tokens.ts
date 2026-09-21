import type { SidebarStyle, SidebarTokenName, SidebarTokenOverrides } from './types'

/**
 * Below this width the sidebar becomes a modal drawer.
 * Chosen to match Tailwind's `md` breakpoint so CSS and JS agree exactly.
 */
export const SIDEBAR_MOBILE_QUERY = '(max-width: 767.98px)'

/** Space reserved for the desktop sidebar so page content can offset itself. */
export const sidebarLayoutVars = {
  expanded: 'var(--sidebar-width)',
  collapsed: 'var(--sidebar-rail-width)',
} as const

/**
 * Every visual token resolves through the app's semantic `--ui-*` variables, so the sidebar
 * follows the light/dark theme automatically and never hardcodes a one-off color.
 */
export const sidebarDefaultTokens = {
  '--sidebar-width': '15.5rem',
  '--sidebar-rail-width': '3.25rem',
  '--sidebar-header-height': '3.25rem',
  '--sidebar-item-height': '2.25rem',
  '--sidebar-icon-button-size': '2.25rem',
  '--sidebar-icon-size': '1.125rem',
  '--sidebar-inline-margin': '0.5rem',
  '--sidebar-inline-padding': '0.625rem',
  '--sidebar-item-radius': '0.5rem',
  '--sidebar-font-size': '0.8125rem',
  '--sidebar-line-height': '1.25rem',
  '--sidebar-scrollbar-size': '0.5rem',
  '--sidebar-motion-duration': '240ms',
  '--sidebar-motion-fast-duration': '140ms',
  '--sidebar-motion-easing': 'cubic-bezier(0.32, 0.72, 0, 1)',
  '--sidebar-surface': 'var(--ui-sidebar)',
  '--sidebar-foreground': 'var(--ui-foreground)',
  '--sidebar-muted-foreground': 'var(--ui-muted-foreground)',
  '--sidebar-row-highlight': 'var(--ui-sidebar-hover)',
  '--sidebar-row-active': 'var(--ui-sidebar-active)',
  '--sidebar-border': 'var(--ui-border)',
  '--sidebar-focus-ring': 'var(--ui-ring)',
  '--sidebar-overlay': 'var(--ui-overlay)',
  '--sidebar-shadow': 'var(--ui-shadow-lg)',
} satisfies Record<SidebarTokenName, string>

export function createSidebarTokenStyle(tokens?: SidebarTokenOverrides): SidebarStyle {
  return {
    ...sidebarDefaultTokens,
    ...tokens,
  }
}

/**
 * Larger hit targets while the sidebar is a touch drawer. Applied through inline style rather
 * than a CSS rule because the drawer is portalled outside the root, and inline tokens would
 * otherwise win over any stylesheet override.
 */
export const sidebarMobileTokens = {
  '--sidebar-item-height': '2.75rem',
  '--sidebar-icon-button-size': '2.75rem',
  '--sidebar-icon-size': '1.25rem',
  '--sidebar-font-size': '0.9375rem',
  '--sidebar-line-height': '1.375rem',
  '--sidebar-inline-margin': '0.625rem',
} satisfies SidebarTokenOverrides

export function createSidebarMobileTokenStyle(tokens?: SidebarTokenOverrides): SidebarStyle {
  return {
    ...sidebarDefaultTokens,
    ...sidebarMobileTokens,
    // Explicit caller overrides still win over the touch defaults.
    ...tokens,
  }
}

export function pickSidebarTokenStyle(style?: SidebarStyle): SidebarTokenOverrides {
  if (!style) return {}

  const tokens: SidebarTokenOverrides = {}
  for (const [name, value] of Object.entries(style)) {
    if (name.startsWith('--sidebar-') && typeof value === 'string') {
      tokens[name as SidebarTokenName] = value as string
    }
  }
  return tokens
}
