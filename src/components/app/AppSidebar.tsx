import { Monitor, Moon, Plus, Sun, Workflow } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { appNavigation, type AppNavItem } from '@/config/navigation'
import {
  SidebarFixedTop,
  SidebarFooter,
  SidebarHeader,
  SidebarIconAnchor,
  SidebarIconButton,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarPanel,
  SidebarRail,
  SidebarRailButton,
  SidebarRailFooter,
  SidebarRailHeader,
  SidebarRailMenu,
  SidebarScrollArea,
  SidebarShell,
  SidebarShortcutHint,
  SidebarTrigger,
  useSidebar,
} from '@/components/sidebar'
import { Button } from '@/components/ui/button'
import { useSession } from '@/lib/session'
import { cycleThemePreference, setThemePreference, themeLabels, useThemePreference } from '@/lib/theme'
import { cn } from '@/lib/utils'

function BrandMark() {
  return (
    <div className="grid size-7 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
      <Workflow className="size-3.5" strokeWidth={2.1} />
    </div>
  )
}

function NewRunButton({ className }: { className?: string }) {
  const { isMobile, setMobileOpen } = useSidebar()
  return (
    <Button asChild size="sm" variant="secondary" className={cn('w-full justify-start', className)}>
      <Link to="/runs/new" onClick={() => { if (isMobile) setMobileOpen(false) }}>
        <Plus />
        新建 Run
      </Link>
    </Button>
  )
}

function ThemeToggle() {
  const preference = useThemePreference()
  const next = cycleThemePreference(preference)
  const Icon = preference === 'light' ? Sun : preference === 'dark' ? Moon : Monitor

  return (
    <SidebarIconButton
      onClick={() => setThemePreference(next)}
      tooltip={`主题：${themeLabels[preference]}，点击切换为${themeLabels[next]}`}
    >
      <Icon />
    </SidebarIconButton>
  )
}

function NavRow({ item, active }: { item: AppNavItem; active: boolean }) {
  const Icon = item.icon
  const { isMobile, setMobileOpen } = useSidebar()
  return (
    <SidebarMenuItem active={active}>
      <SidebarMenuButton
        icon={<Icon />}
        render={<Link to={item.to} />}
        onClick={() => { if (isMobile) setMobileOpen(false) }}
        aria-current={active ? 'page' : undefined}
      >
        {item.label}
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function AccountSummary({ compact = false }: { compact?: boolean }) {
  const session = useSession()

  if (compact) {
    return (
      <div className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground" aria-hidden="true">
        {(session?.record.name || session?.record.email || '?').slice(0, 1).toUpperCase()}
      </div>
    )
  }

  const name = session ? session.record.name || session.record.email || '已登录' : '未连接'
  let host = ''
  if (session?.baseUrl) {
    try { host = new URL(session.baseUrl).host } catch { host = session.baseUrl }
  }

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className={cn('size-2 shrink-0 rounded-full bg-muted-foreground/40', session && 'bg-success')} aria-hidden="true" />
      <div className="min-w-0">
        <div className="truncate text-xs font-medium">{name}</div>
        {host ? <div className="truncate text-[11px] text-muted-foreground">{host}</div> : null}
      </div>
    </div>
  )
}

function AppSidebarPanel() {
  const { pathname } = useLocation()

  return (
    <SidebarPanel>
      <SidebarHeader className="gap-2.5 ps-2.5">
        <BrandMark />
        <div className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-[-0.02em]">AnyWorkflow</div>
        <SidebarIconAnchor><SidebarTrigger surface="panel" /></SidebarIconAnchor>
      </SidebarHeader>

      <SidebarFixedTop className="px-2.5 pb-2">
        <NewRunButton />
      </SidebarFixedTop>

      <SidebarScrollArea className="px-0 pb-2">
        <SidebarMenu>
          {appNavigation.map((item) => <NavRow key={item.id} item={item} active={item.match(pathname)} />)}
        </SidebarMenu>
      </SidebarScrollArea>

      <SidebarFooter className="px-2.5 py-2">
        <div className="hidden items-center justify-between gap-2 pb-1 md:flex">
          <span className="text-[11px] text-muted-foreground">收起导航</span>
          <SidebarShortcutHint keys={['B']} className="text-[10px] font-medium text-muted-foreground" />
        </div>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1"><AccountSummary /></div>
          <ThemeToggle />
        </div>
      </SidebarFooter>
    </SidebarPanel>
  )
}

function AppSidebarRail() {
  const { pathname } = useLocation()
  const session = useSession()

  return (
    <SidebarRail>
      <SidebarRailHeader><SidebarTrigger surface="rail" /></SidebarRailHeader>
      <SidebarRailMenu>
        <SidebarRailButton icon={<Plus />} tooltip="新建 Run" render={<Link to="/runs/new" />} />
        {appNavigation.map((item) => {
          const Icon = item.icon
          const active = item.match(pathname)
          return (
            <SidebarRailButton
              key={item.id}
              active={active}
              aria-current={active ? 'page' : undefined}
              icon={<Icon />}
              tooltip={item.label}
              render={<Link to={item.to} />}
            />
          )
        })}
      </SidebarRailMenu>
      <SidebarRailFooter className="flex-col gap-1 pt-1 pb-2">
        <ThemeToggle />
        <span className={cn('mt-0.5 size-2 rounded-full bg-muted-foreground/40', session && 'bg-success')} title={session ? '已连接' : '未连接'} />
      </SidebarRailFooter>
    </SidebarRail>
  )
}

export function AppSidebar() {
  return (
    <SidebarShell label="主导航" rail={<AppSidebarRail />}>
      <AppSidebarPanel />
    </SidebarShell>
  )
}

export { AccountSummary, BrandMark }
