import { PanelLeftClose, PanelLeftOpen, Plus, Workflow } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { appNavigation } from '@/app/navigation'
import { Kbd } from '@/components/ui/kbd'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { NavAccount } from './nav-account'

function SidebarToggle() {
  const { open } = useSidebar()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <SidebarTrigger className="group-data-[collapsible=icon]:size-9">
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

/** Brand, primary action, workspace navigation and account. Collapses to an icon rail on desktop. */
export function AppSidebar() {
  const { pathname } = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()
  const closeDrawer = () => {
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-18 flex-row items-center gap-2.5 px-3.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2">
        <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-xs group-data-[collapsible=icon]:hidden">
          <Workflow className="size-4" strokeWidth={1.8} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
          <div className="truncate text-body font-semibold tracking-heading">AnyWorkflow</div>
          <div className="mt-0.5 text-micro text-muted-foreground">Remote workspace</div>
        </div>
        {isMobile ? null : <SidebarToggle />}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="pt-1 pb-3">
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

        <SidebarGroup>
          <SidebarGroupLabel className="text-caption text-muted-foreground">工作空间</SidebarGroupLabel>
          <SidebarMenu aria-label="主导航">
            {appNavigation.map((item) => {
              const active = item.match(pathname)
              const Icon = item.icon
              return (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                    <Link to={item.to} aria-current={active ? 'page' : undefined} onClick={closeDrawer}>
                      <Icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <NavAccount />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
