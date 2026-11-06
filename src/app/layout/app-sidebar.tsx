import { PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { appNavigationGroups, settingsNavItem, type AppNavItem } from '@/app/navigation'
import { LogoMark } from '@/components/brand/logo-mark'
import { Kbd } from '@/components/ui/kbd'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTaskCenter } from '@/features/tasks'
import { NavAccount } from './nav-account'

function SidebarToggle() {
  const { open } = useSidebar()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <SidebarTrigger className="text-muted-foreground group-data-[collapsible=icon]:size-9">
          {open ? <PanelLeftClose /> : <PanelLeftOpen />}
        </SidebarTrigger>
      </TooltipTrigger>
      <TooltipContent side="right" className="flex items-center gap-2">
        {open ? '收起导航' : '展开导航'}
        <Kbd>Ctrl B</Kbd>
      </TooltipContent>
    </Tooltip>
  )
}

function NavItem({ item, pathname, running, onNavigate }: { item: AppNavItem; pathname: string; running: number; onNavigate: () => void }) {
  const active = item.match(pathname)
  const Icon = item.icon
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={running ? `${item.label} · ${running} 个进行中` : item.label}>
        <Link to={item.to} aria-current={active ? 'page' : undefined} onClick={onNavigate}>
          <Icon />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
      {running ? (
        <SidebarMenuBadge className="top-2! rounded-full bg-primary-soft px-1.5 text-micro font-semibold text-primary tabular-nums" aria-label={`${running} 个进行中`}>
          {running}
        </SidebarMenuBadge>
      ) : null}
    </SidebarMenuItem>
  )
}

/** Brand, primary action, grouped workspace navigation and account. Collapses to an icon rail. */
export function AppSidebar() {
  const { pathname } = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()
  const { active } = useTaskCenter()
  const closeDrawer = () => {
    if (isMobile) setOpenMobile(false)
  }
  const running = (item: AppNavItem) => (item.taskKind ? active.filter((task) => task.kind.id === item.taskKind).length : 0)

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="h-14 flex-row items-center gap-2.5 px-2.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-1">
        <LogoMark className="size-7 group-data-[collapsible=icon]:hidden" />
        <div className="min-w-0 flex-1 truncate text-sm font-semibold tracking-heading group-data-[collapsible=icon]:hidden">AnyWorkflow</div>
        {isMobile ? null : <SidebarToggle />}
      </SidebarHeader>

      <SidebarContent className="gap-1">
        <SidebarGroup className="pt-0 pb-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild variant="primary" tooltip="新建工作流">
                <Link to="/runs/new" onClick={closeDrawer}>
                  <Plus />
                  <span>新建工作流</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <nav aria-label="主导航" className="contents">
          {appNavigationGroups.map((group) => (
            <SidebarGroup key={group.id} className="py-1">
              <SidebarGroupLabel className="h-7 text-caption font-medium text-muted-foreground">{group.label}</SidebarGroupLabel>
              <SidebarMenu>
                {group.items.map((item) => (
                  <NavItem key={item.id} item={item} pathname={pathname} running={running(item)} onNavigate={closeDrawer} />
                ))}
              </SidebarMenu>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>

      <SidebarFooter className="gap-1 pb-3">
        <SidebarMenu>
          <NavItem item={settingsNavItem} pathname={pathname} running={0} onNavigate={closeDrawer} />
        </SidebarMenu>
        <NavAccount />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
