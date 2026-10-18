import { Outlet, useMatches } from 'react-router'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import type { RouteHandle } from '../route-handle'
import { AppSidebar } from './app-sidebar'
import { AppTopBar } from './app-top-bar'

/**
 * Viewport frame: sidebar, top bar and one scroll host for the routed page. Routes that declare
 * `handle.workspace` (the editor) fill the viewport instead and manage their own scrolling.
 */
export function AppShell() {
  const workspace = useMatches().some((match) => (match.handle as RouteHandle | undefined)?.workspace)

  return (
    <SidebarProvider className="h-dvh min-h-0 overflow-hidden">
      <AppSidebar />
      <SidebarInset className="min-w-0 overflow-hidden">
        <AppTopBar />
        <div
          data-slot="page-host"
          data-workspace={workspace || undefined}
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-clip overflow-y-auto overscroll-contain [scrollbar-gutter:stable] data-workspace:overflow-hidden data-workspace:overscroll-none data-workspace:[scrollbar-gutter:auto]"
        >
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
