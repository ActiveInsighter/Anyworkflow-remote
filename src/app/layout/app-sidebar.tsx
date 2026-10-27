import { PanelLeftClose, PanelLeftOpen, Plus, Workflow } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { appNavigationGroups, settingsNavItem, type AppNavItem } from '@/app/navigation'
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
        <SidebarMenuBadge className="top-2! rounded-full bg-primary-soft px-1.5 font-mono text-micro text-primary" aria-label={`${running} 个进行中`}>
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
      <SidebarHeader className="h-16 flex-row items-center gap-2.5 px-2.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-1">
        <div className="grid size-8 shrink-0 place-items-center rounded-[0.6rem] bg-linear-to-br from-primary to-primary-hover text-primary-foreground shadow-sm ring-1 ring-black/5 group-data-[collapsible=icon]:hidden">
          <Workflow className="size-4" strokeWidth={2} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
          <div className="truncate text-sm font-semibold tracking-heading">AnyWorkflow</div>
          <div className="text-micro text-muted-foreground">Remote</div>
        </div>
        {isMobile ? null : <SidebarToggle />}
      </SidebarHeader>

      <SidebarContent className="gap-1">
        <SidebarGroup className="pt-0 pb-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild variant="primary" tooltip="新建工作流" className="justify-center group-data-[collapsible=icon]:justify-start">
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
              <SidebarGroupLabel className="h-7 text-caption font-medium text-muted-foreground/80">{group.label}</SidebarGroupLabel>
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
