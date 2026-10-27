import { Fragment } from 'react'
import { ArrowLeft, Menu } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar'
import { TaskCenter } from '@/features/tasks'
import { useSession } from '@/lib/api/session'
import { breadcrumbsFor, fallbackParent } from '@/app/breadcrumbs'

/** Location bar: drawer trigger (mobile), back, breadcrumb trail and the task center. */
export function AppTopBar() {
  const location = useLocation()
  const navigate = useNavigate()
  const session = useSession()
  const { isMobile } = useSidebar()
  const crumbs = breadcrumbsFor(location.pathname)
  const currentTitle = crumbs.at(-1)?.label

  function goBack() {
    if (location.pathname.startsWith('/settings/')) navigate(fallbackParent(location.pathname))
    else if (location.key && location.key !== 'default') navigate(-1)
    else navigate(fallbackParent(location.pathname), { replace: true })
  }

  return (
    <header className="flex h-[calc(var(--spacing-header)+env(safe-area-inset-top))] shrink-0 items-center gap-1 border-b border-border/70 px-2.5 pt-[env(safe-area-inset-top)] sm:px-4">
      <title>{currentTitle ? `${currentTitle} · AnyWorkflow Remote` : 'AnyWorkflow Remote'}</title>
      {isMobile ? (
        <SidebarTrigger size="icon-touch" className="text-foreground">
          <Menu />
        </SidebarTrigger>
      ) : null}

      {location.pathname !== '/' ? (
        <Button variant="ghost" size="icon-touch" onClick={goBack} aria-label="返回" className="text-muted-foreground sm:size-8">
          <ArrowLeft />
        </Button>
      ) : null}

      <Breadcrumb aria-label="当前位置" className="min-w-0 flex-1 overflow-hidden px-1">
        <BreadcrumbList className="flex-nowrap gap-1 text-xs sm:gap-1.5 sm:text-body">
          {crumbs.map((crumb, index) => {
            const current = index === crumbs.length - 1
            return (
              <Fragment key={`${crumb.label}-${index}`}>
                {index > 0 ? <BreadcrumbSeparator /> : null}
                <BreadcrumbItem className="min-w-0">
                  {crumb.to && !current ? (
                    <BreadcrumbLink asChild className="max-w-[32vw] truncate rounded-md px-1.5 py-1 hover:bg-muted sm:max-w-64">
                      <Link to={crumb.to}>{crumb.label}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage className="max-w-[44vw] truncate px-1 py-1 font-medium sm:max-w-96">
                      {crumb.label}
                    </BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </Fragment>
            )
          })}
        </BreadcrumbList>
      </Breadcrumb>

      {session ? <TaskCenter /> : null}
    </header>
  )
}
