import type { LucideIcon } from 'lucide-react'
import { BookMarked, House, Menu, Settings, Workflow } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { useSession } from '@/lib/session'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

const navItems: NavItem[] = [
  { to: '/', label: '工作流', icon: House, end: true },
  { to: '/library', label: '资料库', icon: BookMarked },
  { to: '/settings', label: '设置', icon: Settings },
]

function navClass({ isActive }: { isActive: boolean }) {
  return cn(
    'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
    isActive && 'bg-muted text-foreground',
  )
}

function NavItems({ mobile = false }: { mobile?: boolean }) {
  return (
    <nav className="grid gap-1" aria-label={mobile ? '菜单' : '主导航'}>
      {navItems.map((item) => {
        const Icon = item.icon
        const link = (
          <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
            <Icon className="size-4" strokeWidth={2} />
            <span>{item.label}</span>
          </NavLink>
        )
        return mobile ? <SheetClose asChild key={item.to}>{link}</SheetClose> : link
      })}
    </nav>
  )
}

export function AppShell() {
  const session = useSession()

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-card px-3 py-4 md:flex">
        <div className="flex items-center gap-3 px-2 pb-6 pt-1">
          <div className="grid size-9 place-items-center rounded-lg bg-[var(--ui-primary)] text-[var(--ui-primary-foreground)]">
            <Workflow className="size-[18px]" strokeWidth={2.1} />
          </div>
          <div className="text-sm font-semibold tracking-tight">AnyWorkflow</div>
        </div>

        <NavItems />

        <div className="mt-auto border-t px-2 pt-4">
          <div className="flex items-center gap-2.5">
            <span className={cn('size-2 shrink-0 rounded-full bg-muted-foreground/40', session && 'bg-emerald-500')} />
            <div className="truncate text-xs font-semibold">{session?.record.name || session?.record.email || '未连接'}</div>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex min-h-14 items-center gap-3 border-b bg-background/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="打开菜单">
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left">
            <SheetHeader>
              <div className="mb-3 flex items-center gap-2.5 pr-10">
                <div className="grid size-9 place-items-center rounded-lg bg-[var(--ui-primary)] text-[var(--ui-primary-foreground)]">
                  <Workflow className="size-[18px]" />
                </div>
                <SheetTitle>AnyWorkflow</SheetTitle>
                <SheetDescription className="sr-only">菜单</SheetDescription>
              </div>
            </SheetHeader>
            <div className="px-3">
              <NavItems mobile />
            </div>
            <div className="mt-auto border-t px-5 pb-[calc(18px+env(safe-area-inset-bottom))] pt-4">
              <div className="flex items-center gap-2.5">
                <span className={cn('size-2 rounded-full bg-muted-foreground/40', session && 'bg-emerald-500')} />
                <div className="truncate text-xs font-semibold">{session?.record.name || session?.record.email || '未连接'}</div>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        <div className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">AnyWorkflow</div>
        <Badge variant={session ? 'secondary' : 'outline'} className="rounded-full px-2.5 text-[10px]">
          {session ? '已连接' : '未连接'}
        </Badge>
      </header>

      <main className="min-h-dvh md:pl-60">
        <Outlet />
      </main>
    </div>
  )
}
