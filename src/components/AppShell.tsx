import { Outlet, useLocation } from 'react-router'
import { AppSidebar } from '@/components/app/AppSidebar'
import { AppTopBar } from '@/components/app/AppTopBar'
import { SidebarInset, SidebarRoot } from '@/components/sidebar'
import { Toaster } from '@/components/ui/sonner'

const SIDEBAR_PERSISTENCE = { key: 'desktop' } as const

export function AppShell() {
  const { pathname } = useLocation()
  const isEditorRoute = pathname === '/runs/new' || /^\/runs\/[^/]+\/edit$/u.test(pathname)

  return (
    <>
      <SidebarRoot
        className="bg-background text-foreground"
        persistence={SIDEBAR_PERSISTENCE}
        shortcutKey="b"
      >
        <AppSidebar />
        <SidebarInset className="min-w-0 overflow-hidden">
          <AppTopBar />
          <div data-editor={isEditorRoute ? 'true' : undefined} data-slot="app-page-host">
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarRoot>
      <Toaster position="top-center" />
    </>
  )
}
