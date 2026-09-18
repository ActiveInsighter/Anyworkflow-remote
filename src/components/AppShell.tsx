import type { LucideIcon } from 'lucide-react'
import { House, Plus, Settings, Workflow } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useSession } from '@/lib/session'

interface NavItem {
  to: string
  label: string
  mobileLabel?: string
  icon: LucideIcon
  end?: boolean
}

const navItems: NavItem[] = [
  { to: '/', label: '工作流', icon: House, end: true },
  { to: '/runs/new', label: '新建 Run', mobileLabel: '新建', icon: Plus },
  { to: '/settings', label: '连接设置', mobileLabel: '设置', icon: Settings },
]

function navClass({ isActive }: { isActive: boolean }) {
  return cn(
    'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
    isActive && 'bg-accent text-accent-foreground',
  )
}

export function AppShell() {
  const session = useSession()

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-card/95 px-3 py-4 backdrop-blur md:flex">
        <div className="flex items-center gap-3 px-2 pb-5 pt-1">
          <div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Workflow className="size-[18px]" strokeWidth={2.1} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight">AnyWorkflow</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">Remote Console</div>
          </div>
        </div>

        <nav className="grid gap-1" aria-label="主导航">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
                <Icon className="size-4" strokeWidth={2} />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="mt-auto rounded-xl border bg-muted/30 p-3">
          <div className="flex items-start gap-2.5">
            <span className={cn('mt-1 size-2 shrink-0 rounded-full bg-muted-foreground/50', session && 'bg-emerald-500')} />
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold">{session?.record.name || session?.record.email || '未连接'}</div>
              <div className="mt-1 text-[10px] leading-4 text-muted-foreground">{session ? 'PocketBase 已连接' : '连接账号后同步工作流'}</div>
            </div>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex min-h-14 items-center justify-between border-b bg-background/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
        <div className="flex items-center gap-2.5">
          <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Workflow className="size-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight">AnyWorkflow</span>
        </div>
        <Badge variant={session ? 'secondary' : 'outline'} className="rounded-full px-2.5 text-[10px]">
          {session ? '已连接' : '未连接'}
        </Badge>
      </header>

      <main className="min-h-dvh md:pl-64">
        <Outlet />
      </main>

      <nav
        className="fixed inset-x-3 bottom-[calc(10px+env(safe-area-inset-bottom))] z-40 grid h-16 grid-cols-3 rounded-2xl border bg-card/95 p-1.5 shadow-lg backdrop-blur md:hidden"
        aria-label="移动端导航"
      >
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-medium text-muted-foreground transition-colors',
                  isActive && 'bg-accent text-accent-foreground',
                )
              }
            >
              <Icon className="size-[18px]" strokeWidth={2} />
              <span>{item.mobileLabel || item.label}</span>
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
