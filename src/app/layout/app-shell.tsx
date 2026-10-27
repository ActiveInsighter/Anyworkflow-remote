import { Outlet, useMatches } from 'react-router'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { TaskCenterProvider } from '@/features/tasks'
import type { RouteHandle } from '../route-handle'
import { AppSidebar } from './app-sidebar'
import { AppTopBar } from './app-top-bar'

/**
 * Viewport frame: the sidebar on the canvas, and the routed page on a raised panel with its top
 * bar and one scroll host. Routes that declare `handle.workspace` (the editor) fill the panel and
 * manage their own scrolling. The task center follows async work for every page in the frame.
 */
export function AppShell() {
  const workspace = useMatches().some((match) => (match.handle as RouteHandle | undefined)?.workspace)

  return (
    <TaskCenterProvider>
      <SidebarProvider className="h-dvh min-h-0 overflow-hidden bg-canvas">
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
    </TaskCenterProvider>
  )
}
