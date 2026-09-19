import type { LucideIcon } from 'lucide-react'
import {
  BookMarked,
  CircleCheck,
  House,
  LoaderCircle,
  Monitor,
  Moon,
  PenLine,
  Plus,
  Settings,
  Sun,
  Workflow,
} from 'lucide-react'
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
  SidebarSection,
  SidebarSectionContent,
  SidebarSectionHeader,
  SidebarSectionTrigger,
  SidebarShell,
  SidebarShortcutHint,
  SidebarTrigger,
} from '@/components/sidebar'
import { Button } from '@/components/ui/button'
import { useSession } from '@/lib/session'
import { cycleThemePreference, setThemePreference, themeLabels, useThemePreference } from '@/lib/theme'
import { cn } from '@/lib/utils'

type NavEntry = {
  id: string
  label: string
  to: string
  icon: LucideIcon
}

/** Top-level destinations. `path` is the route prefix used to work out the active item. */
const primaryNav: Array<NavEntry & { path: string }> = [
  { id: 'runs', label: '工作流', to: '/', icon: House, path: '/' },
  { id: 'library', label: '资料库', to: '/library', icon: BookMarked, path: '/library' },
]

/** Deep links into the dashboard filter tabs. */
const viewNav: Array<NavEntry & { filter: string }> = [
  { id: 'view-draft', label: '草稿', to: '/?filter=draft', icon: PenLine, filter: 'draft' },
  { id: 'view-active', label: '进行中', to: '/?filter=active', icon: LoaderCircle, filter: 'active' },
  { id: 'view-done', label: '已结束', to: '/?filter=done', icon: CircleCheck, filter: 'done' },
]

function isPathActive(pathname: string, path: string): boolean {
  if (path === '/') return pathname === '/'
  return pathname === path || pathname.startsWith(path + '/')
}

function useNavState() {
  const location = useLocation()
  return {
    pathname: location.pathname,
    filter: new URLSearchParams(location.search).get('filter') ?? 'all',
  }
}

function BrandMark() {
  return (
    <div className="grid size-7 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
      <Workflow className="size-3.5" strokeWidth={2.1} />
    </div>
  )
}

function NewRunButton({ className }: { className?: string }) {
  return (
    <Button asChild size="sm" className={cn('w-full justify-start', className)}>
      <Link to="/runs/new">
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

function NavRow({ item, active }: { item: NavEntry; active: boolean }) {
  const Icon = item.icon
  return (
    <SidebarMenuItem active={active}>
      <SidebarMenuButton icon={<Icon />} render={<Link to={item.to} />} aria-current={active ? 'page' : undefined}>
        {item.label}
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function AccountSummary({ compact = false }: { compact?: boolean }) {
  const session = useSession()

  if (compact) {
    return (
      <div
        className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground"
        aria-hidden="true"
      >
        {(session?.record.name || session?.record.email || '?').slice(0, 1).toUpperCase()}
      </div>
    )
  }

  // The dot already turns green whenever a session exists, so the label must never contradict it:
  // a record without a name or email still means "signed in", not "not connected".
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
        className={cn(
          'size-2 shrink-0 rounded-full bg-muted-foreground/40',
          session && 'bg-success',
        )}
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
  const { pathname, filter } = useNavState()

  return (
    <SidebarPanel>
      <SidebarHeader className="gap-2.5 ps-2.5">
        <BrandMark />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold tracking-[-0.02em]">AnyWorkflow</div>
        </div>
        <SidebarIconAnchor>
          <SidebarTrigger surface="panel" />
        </SidebarIconAnchor>
      </SidebarHeader>

      <SidebarFixedTop className="px-2.5 pb-1.5">
        <NewRunButton />
      </SidebarFixedTop>

      <SidebarScrollArea className="pb-2">
        <SidebarMenu>
          {primaryNav.map((item) => (
            <NavRow key={item.id} item={item} active={isPathActive(pathname, item.path)} />
          ))}
        </SidebarMenu>

        <SidebarSection>
          <SidebarSectionHeader>
            <SidebarSectionTrigger>工作流视图</SidebarSectionTrigger>
          </SidebarSectionHeader>
          <SidebarSectionContent>
            <SidebarMenu>
              {viewNav.map((item) => (
                <NavRow key={item.id} item={item} active={pathname === '/' && filter === item.filter} />
              ))}
            </SidebarMenu>
          </SidebarSectionContent>
        </SidebarSection>

        <SidebarSection>
          <SidebarSectionHeader>
            <SidebarSectionTrigger>系统</SidebarSectionTrigger>
          </SidebarSectionHeader>
          <SidebarSectionContent>
            <SidebarMenu>
              <SidebarMenuItem active={isPathActive(pathname, '/settings')}>
                <SidebarMenuButton icon={<Settings />} render={<Link to="/settings" />}>
                  设置
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarSectionContent>
        </SidebarSection>
      </SidebarScrollArea>

      <SidebarFooter className="px-2.5 py-2">
        {/* The keyboard shortcut only exists on desktop; the drawer never receives Ctrl+B. */}
        <div className="hidden items-center justify-between gap-2 pb-1 md:flex">
          <span className="text-[11px] text-muted-foreground">收起导航</span>
          <SidebarShortcutHint keys={['B']} className="text-[10px] font-medium text-muted-foreground" />
        </div>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <AccountSummary />
          </div>
          <ThemeToggle />
        </div>
      </SidebarFooter>
    </SidebarPanel>
  )
}

function AppSidebarRail() {
  const { pathname } = useNavState()
  const session = useSession()

  return (
    <SidebarRail>
      <SidebarRailHeader>
        <SidebarTrigger surface="rail" />
      </SidebarRailHeader>

      <SidebarRailMenu>
        {primaryNav.map((item) => {
          const Icon = item.icon
          return (
            <SidebarRailButton
              key={item.id}
              active={isPathActive(pathname, item.path)}
              aria-current={isPathActive(pathname, item.path) ? 'page' : undefined}
              icon={<Icon />}
              tooltip={item.label}
              render={<Link to={item.to} />}
            />
          )
        })}
      </SidebarRailMenu>

      <SidebarRailFooter className="flex-col gap-1 pt-1 pb-2">
        <SidebarRailButton
          active={isPathActive(pathname, '/settings')}
          icon={<Settings />}
          tooltip="设置"
          render={<Link to="/settings" />}
        />
        <ThemeToggle />
        <span
          className={cn(
            'mt-0.5 size-2 rounded-full bg-muted-foreground/40',
            session && 'bg-success',
          )}
          title={session ? '已连接' : '未连接'}
        />
        <span className="sidebar-sr-only">{session ? '已连接' : '未连接'}</span>
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
