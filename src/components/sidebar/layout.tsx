import * as React from 'react'

export const SidebarHeader = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'>>(
  function SidebarHeader(props, forwardedRef) {
    return <div ref={forwardedRef} data-slot="sidebar-header" {...props} />
  },
)

/** Pinned region directly below the header; stays visible while the scroll area scrolls. */
export const SidebarFixedTop = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'>>(
  function SidebarFixedTop(props, forwardedRef) {
    return <div ref={forwardedRef} data-slot="sidebar-fixed-top" {...props} />
  },
)

export const SidebarScrollArea = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'>>(
  function SidebarScrollArea(props, forwardedRef) {
    return <div ref={forwardedRef} data-slot="sidebar-scroll-area" {...props} />
  },
)

export const SidebarFooter = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'>>(
  function SidebarFooter(props, forwardedRef) {
    return <div ref={forwardedRef} data-slot="sidebar-footer" {...props} />
  },
)

/**
 * Fixed-width slot that keeps an icon column aligned with the collapsed rail buttons.
 * Anything placed here stays horizontally stable when the sidebar expands or collapses.
 */
export const SidebarIconAnchor = React.forwardRef<HTMLSpanElement, React.ComponentPropsWithoutRef<'span'>>(
  function SidebarIconAnchor(props, forwardedRef) {
    return <span ref={forwardedRef} data-slot="sidebar-icon-anchor" {...props} />
  },
)
