import type { LucideIcon } from 'lucide-react'
import { BookMarked, House, Monitor, Moon, Plus, Settings, Sun, Workflow } from 'lucide-react'
import { Link, useLocation } from 'react-router'
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
  SidebarTrigger,
  useSidebar,
} from '@/components/sidebar'
import { Button } from '@/components/ui/button'
import { useSession } from '@/lib/session'
import { cycleThemePreference, setThemePreference, themeLabels, useThemePreference } from '@/lib/theme'
import { cn } from '@/lib/utils'

type NavEntry = {
  id: string
  label: string
  to: string
  path: string
  icon: LucideIcon
}

const primaryNav: NavEntry[] = [
  { id: 'runs', label: '工作流', to: '/', path: '/', icon: House },
  { id: 'library', label: '资料库', to: '/library', path: '/library', icon: BookMarked },
]

function isPathActive(pathname: string, path: string): boolean {
  if (path === '/') return pathname === '/' || pathname.startsWith('/runs/') || pathname.startsWith('/tasks/') || pathname.startsWith('/events/')
  return pathname === path || pathname.startsWith(path + '/') || (path === '/library' && pathname.startsWith('/templates/'))
}

function BrandMark() {
  return (
    <div className="grid size-7 shrink-0 place-items-center rounded-md border border-border bg-accent text-accent-foreground">
      <Workflow className="size-3.5" strokeWidth={2.1} />
    </div>
  )
}

function NewRunButton({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Button asChild size="sm" variant="secondary" className="w-full justify-start border border-border bg-accent text-accent-foreground hover:bg-accent/75">
      <Link to="/runs/new" onClick={onNavigate}>
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

function NavRow({ item, active, onNavigate }: { item: NavEntry; active: boolean; onNavigate?: () => void }) {
  const Icon = item.icon
  return (
    <SidebarMenuItem active={active}>
      <SidebarMenuButton icon={<Icon />} render={<Link to={item.to} />} onClick={onNavigate} aria-current={active ? 'page' : undefined}>
        {item.label}
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function AccountSummary() {
  const session = useSession()
  const name = session ? session.record.name || session.record.email || '已登录' : '未连接'
  let host = ''
  if (session?.baseUrl) {
    try {
      host = new URL(session.baseUrl).host
    } catch {
      host = session.baseUrl
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        className={cn('size-2 shrink-0 rounded-full bg-muted-foreground/40', session && 'bg-success')}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <div className="truncate text-xs font-medium">{name}</div>
        {host ? <div className="truncate text-[11px] text-muted-foreground">{host}</div> : null}
      </div>
    </div>
  )
}

function AppSidebarPanel() {
  const { pathname } = useLocation()
  const { isMobile, setMobileOpen } = useSidebar()
  const closeAfterNavigate = () => { if (isMobile) setMobileOpen(false) }

  return (
    <SidebarPanel>
      <SidebarHeader className="gap-2.5 ps-2.5">
        <BrandMark />
        <div className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-[-0.02em]">AnyWorkflow</div>
        <SidebarIconAnchor>
          <SidebarTrigger surface="panel" />
        </SidebarIconAnchor>
      </SidebarHeader>

      <SidebarFixedTop className="px-2.5 pb-2">
        <NewRunButton onNavigate={closeAfterNavigate} />
      </SidebarFixedTop>

      <SidebarScrollArea className="px-0 pb-2">
        <SidebarMenu>
          {primaryNav.map((item) => (
            <NavRow key={item.id} item={item} active={isPathActive(pathname, item.path)} onNavigate={closeAfterNavigate} />
          ))}
        </SidebarMenu>
      </SidebarScrollArea>

      <SidebarFooter className="gap-2 px-2.5 py-2">
        <SidebarMenu>
          <SidebarMenuItem active={pathname === '/settings'}>
            <SidebarMenuButton icon={<Settings />} render={<Link to="/settings" />} onClick={closeAfterNavigate} aria-current={pathname === '/settings' ? 'page' : undefined}>
              设置
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="flex items-center gap-2 border-t border-border pt-2">
          <div className="min-w-0 flex-1"><AccountSummary /></div>
          <ThemeToggle />
        </div>
      </SidebarFooter>
    </SidebarPanel>
  )
}

function AppSidebarRail() {
  const { pathname } = useLocation()

  return (
    <SidebarRail>
      <SidebarRailHeader>
        <SidebarTrigger surface="rail" />
      </SidebarRailHeader>
      <SidebarRailMenu>
        {primaryNav.map((item) => {
          const Icon = item.icon
          const active = isPathActive(pathname, item.path)
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
      <SidebarRailFooter className="flex-col gap-1 pb-2">
        <SidebarRailButton
          active={pathname === '/settings'}
          icon={<Settings />}
          tooltip="设置"
          render={<Link to="/settings" />}
        />
        <ThemeToggle />
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
