import { ArrowLeft, ChevronRight, Menu } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { SidebarTrigger } from '@/components/sidebar'
import { cn } from '@/lib/utils'

type Crumb = { label: string; to?: string }

function shortId(value: string) {
  return value.length > 10 ? `${value.slice(0, 8)}…` : value
}

function routeCrumbs(pathname: string): Crumb[] {
  if (pathname === '/') return [{ label: '工作流' }]
  if (pathname === '/runs/new') return [{ label: '工作流', to: '/' }, { label: '新建' }]

  const runEdit = pathname.match(/^\/runs\/([^/]+)\/edit$/u)
  if (runEdit) {
    return [
      { label: '工作流', to: '/' },
      { label: shortId(runEdit[1]), to: `/runs/${runEdit[1]}` },
      { label: '编辑' },
    ]
  }

  const run = pathname.match(/^\/runs\/([^/]+)$/u)
  if (run) return [{ label: '工作流', to: '/' }, { label: shortId(run[1]) }]

  if (pathname === '/library') return [{ label: '资料库' }]

  const template = pathname.match(/^\/templates\/([^/]+)$/u)
  if (template) return [{ label: '资料库', to: '/library?tab=templates' }, { label: shortId(template[1]) }]

  const task = pathname.match(/^\/tasks\/([^/]+)$/u)
  if (task) return [{ label: '工作流', to: '/' }, { label: `Task ${shortId(task[1])}` }]

  const event = pathname.match(/^\/events\/([^/]+)$/u)
  if (event) return [{ label: '工作流', to: '/' }, { label: `Event ${shortId(event[1])}` }]

  if (pathname === '/settings') return [{ label: '设置' }]
  return [{ label: 'AnyWorkflow' }]
}

function parentHref(pathname: string): string | null {
  if (pathname === '/runs/new') return '/'
  const runEdit = pathname.match(/^\/runs\/([^/]+)\/edit$/u)
  if (runEdit) return `/runs/${runEdit[1]}`
  if (/^\/runs\/[^/]+$/u.test(pathname)) return '/'
  if (/^\/templates\/[^/]+$/u.test(pathname)) return '/library?tab=templates'
  return null
}

export function AppTopBar() {
  const { pathname } = useLocation()
  const crumbs = routeCrumbs(pathname)
  const parent = parentHref(pathname)

  return (
    <header className="sticky top-0 z-30 flex h-[52px] items-center border-b border-border bg-background/92 px-2.5 pt-[env(safe-area-inset-top)] backdrop-blur md:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <SidebarTrigger
          surface="external"
          tooltip=""
          className="-ms-1 size-10 shrink-0 text-foreground md:hidden"
        >
          <Menu className="size-[18px]" />
        </SidebarTrigger>

        {parent ? (
          <Link
            to={parent}
            aria-label="返回上一级"
            className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/35"
          >
            <ArrowLeft className="size-4" />
          </Link>
        ) : null}

        <nav aria-label="当前位置" className="flex min-w-0 items-center gap-1 text-[13px]">
          {crumbs.map((crumb, index) => {
            const current = index === crumbs.length - 1
            return (
              <span key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1">
                {index > 0 ? <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/70" aria-hidden="true" /> : null}
                {crumb.to && !current ? (
                  <Link
                    to={crumb.to}
                    className="max-w-36 truncate rounded px-1.5 py-1 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/35 sm:max-w-56"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    aria-current={current ? 'page' : undefined}
                    className={cn(
                      'max-w-40 truncate px-1.5 py-1 sm:max-w-72',
                      current ? 'font-medium text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {crumb.label}
                  </span>
                )}
              </span>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
