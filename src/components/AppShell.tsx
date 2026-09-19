import { Outlet } from 'react-router'
import { AppSidebar } from '@/components/app/AppSidebar'
import { AppTopBar } from '@/components/app/AppTopBar'
import { SidebarInset, SidebarRoot } from '@/components/sidebar'

const SIDEBAR_PERSISTENCE = { key: 'desktop' } as const

export function AppShell() {
  return (
    <SidebarRoot
      className="bg-background text-foreground"
      persistence={SIDEBAR_PERSISTENCE}
      shortcutKey="b"
    >
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <AppTopBar />
        <Outlet />
      </SidebarInset>
    </SidebarRoot>
  )
}
