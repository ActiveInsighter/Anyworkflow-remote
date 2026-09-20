import { Outlet } from 'react-router'
import { AppSidebar } from '@/components/app/AppSidebar'
import { AppTopBar } from '@/components/app/AppTopBar'
import { SidebarInset, SidebarRoot } from '@/components/sidebar'
import { Toaster } from '@/components/ui/sonner'

const SIDEBAR_PERSISTENCE = { key: 'desktop' } as const

export function AppShell() {
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
          <div data-slot="app-page-host">
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarRoot>
      <Toaster position="top-center" />
    </>
  )
}
