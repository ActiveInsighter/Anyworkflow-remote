import type { LucideIcon } from 'lucide-react'
import { BookMarked, House, Menu, Settings, Workflow } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
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
    'group relative flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground',
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
            <Icon className="size-4" strokeWidth={1.9} />
            <span>{item.label}</span>
          </NavLink>
        )
        return mobile ? <SheetClose asChild key={item.to}>{link}</SheetClose> : link
      })}
    </nav>
  )
}

function AccountState() {
  const session = useSession()
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className={cn('size-2 shrink-0 rounded-full bg-muted-foreground/35', session && 'bg-emerald-500')} />
      <div className="min-w-0">
        <div className="truncate text-xs font-medium">{session?.record.name || session?.record.email || '未连接'}</div>
      </div>
    </div>
  )
}

export function AppShell() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[216px] flex-col border-r bg-background px-3 py-3 md:flex">
        <div className="flex h-11 items-center gap-2.5 px-2">
          <div className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">
            <Workflow className="size-4" strokeWidth={2} />
          </div>
          <div className="text-sm font-semibold tracking-[-0.02em]">AnyWorkflow</div>
        </div>

        <div className="mt-5">
          <NavItems />
        </div>

        <div className="mt-auto border-t px-2 pt-4">
          <AccountState />
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-[52px] items-center gap-2 border-b bg-background/92 px-3 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="size-9" aria-label="打开菜单">
              <Menu className="size-[18px]" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[286px]">
            <SheetHeader className="pb-2">
              <div className="flex items-center gap-2.5 pr-10">
                <div className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">
                  <Workflow className="size-4" />
                </div>
                <SheetTitle>AnyWorkflow</SheetTitle>
                <SheetDescription className="sr-only">菜单</SheetDescription>
              </div>
            </SheetHeader>
            <div className="px-3 pt-3">
              <NavItems mobile />
            </div>
            <div className="mt-auto border-t px-5 pb-[calc(18px+env(safe-area-inset-bottom))] pt-4">
              <AccountState />
            </div>
          </SheetContent>
        </Sheet>

        <div className="min-w-0 flex-1 truncate text-sm font-semibold tracking-[-0.02em]">AnyWorkflow</div>
      </header>

      <main className="min-h-dvh md:pl-[216px]">
        <Outlet />
      </main>
    </div>
  )
}
