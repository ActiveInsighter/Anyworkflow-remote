import { Menu } from 'lucide-react'
import { Outlet } from 'react-router'
import { AppSidebar } from '@/components/app/AppSidebar'
import { SidebarInset, SidebarRoot, SidebarTrigger } from '@/components/sidebar'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'

function ConnectionDot({ className }: { className?: string }) {
  const session = useSession()
  const label = session ? '已连接' : '未连接'

  return (
    <>
      <span
        className={cn('size-2 rounded-full bg-muted-foreground/40', session && 'bg-success', className)}
        aria-hidden="true"
      />
      <span className="sidebar-sr-only">{label}</span>
    </>
  )
}

/**
 * Compact bar shown below the sidebar breakpoint. It hosts the drawer trigger so the
 * navigation stays reachable with one thumb and respects the safe-area inset.
 */
function MobileTopBar() {
  return (
    <header className="sticky top-0 z-40 flex h-[52px] items-center gap-1 border-b bg-background/90 px-2.5 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
      <SidebarTrigger
        surface="external"
        tooltip=""
        className="-ms-1 size-10 shrink-0 text-foreground"
      >
        <Menu className="size-[18px]" />
      </SidebarTrigger>
      <div className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-[-0.02em]">AnyWorkflow</div>
      <span className="flex items-center gap-2 pe-1.5">
        <ConnectionDot />
      </span>
    </header>
  )
}

/** Module scope keeps the object identity stable so the persistence effect only runs on change. */
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
        <MobileTopBar />
        <Outlet />
      </SidebarInset>
    </SidebarRoot>
  )
}
