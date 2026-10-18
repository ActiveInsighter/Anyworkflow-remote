import { ChevronsUpDown, LogOut, PlugZap, Settings } from 'lucide-react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { StatusDot } from '@/components/data-display/status-badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar'
import { clearSession, useSession } from '@/lib/api/session'
import { ThemeMenuItems } from './theme-menu'

function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host
  } catch {
    return baseUrl
  }
}

/** Sidebar footer: who is connected, to which backend, plus theme and session actions. */
export function NavAccount() {
  const session = useSession()
  const { isMobile, setOpenMobile } = useSidebar()
  const name = session ? session.record.name || session.record.email || '已登录' : '未连接'
  const host = session ? hostOf(session.baseUrl) : '未连接后端'
  const closeDrawer = () => setOpenMobile(false)

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" tooltip={`${name} · ${session ? '已连接' : '未连接'}`} className="text-foreground">
              <span
                aria-hidden="true"
                className="relative grid size-8 shrink-0 place-items-center rounded-full border bg-secondary text-xs font-semibold text-secondary-foreground"
              >
                {name.slice(0, 1).toLocaleUpperCase()}
                <StatusDot
                  tone={session ? 'success' : 'neutral'}
                  className="absolute -right-0.5 -bottom-0.5 size-2.5 border-2 border-sidebar"
                />
              </span>
              <span className="grid min-w-0 flex-1 leading-tight">
                <span className="truncate text-xs font-medium">{name}</span>
                <span className="truncate text-caption text-muted-foreground">{host}</span>
              </span>
              <ChevronsUpDown className="ml-auto text-muted-foreground" aria-hidden="true" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side={isMobile ? 'top' : 'right'} align="end" sideOffset={8} className="w-56">
            <DropdownMenuLabel className="grid gap-0.5 font-normal">
              <span className="truncate text-xs font-medium text-foreground">{name}</span>
              <span className="truncate">{session ? session.record.email : '尚未连接 AnyWorkflow'}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <ThemeMenuItems />
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link to="/settings" onClick={closeDrawer}>
                  {session ? <Settings /> : <PlugZap />}
                  {session ? '设置' : '设置连接'}
                </Link>
              </DropdownMenuItem>
              {session ? (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => {
                    clearSession()
                    toast.success('已退出登录')
                  }}
                >
                  <LogOut />
                  退出登录
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
