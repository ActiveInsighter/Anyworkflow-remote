import { ArrowLeft, ChevronRight, Menu } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { SidebarTrigger } from '@/components/sidebar'
import { breadcrumbsFor, fallbackParent } from '@/lib/navigation'
import { useSession } from '@/lib/session'

export function AppTopBar() {
  const location = useLocation()
  const navigate = useNavigate()
  const session = useSession()
  const crumbs = breadcrumbsFor(location.pathname)
  const showBack = location.pathname !== '/'

  useEffect(() => {
    const current = crumbs.at(-1)?.label
    document.title = current ? `${current} · AnyWorkflow Remote` : 'AnyWorkflow Remote'
  }, [crumbs])

  function goBack() {
    if (location.key && location.key !== 'default') navigate(-1)
    else navigate(fallbackParent(location.pathname), { replace: true })
  }

  return (
    <header className="sticky top-0 z-40 flex h-[52px] shrink-0 items-center border-b border-border bg-background/92 px-2.5 pt-[env(safe-area-inset-top)] backdrop-blur sm:px-3">
      <SidebarTrigger
        surface="external"
        tooltip=""
        className="-ms-1 size-10 shrink-0 text-foreground md:hidden"
      >
        <Menu />
      </SidebarTrigger>

      {showBack ? (
        <button
          type="button"
          onClick={goBack}
          className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
          aria-label="返回"
        >
          <ArrowLeft className="size-4" />
        </button>
      ) : null}

      <nav aria-label="当前位置" className="min-w-0 flex-1 overflow-hidden px-1">
        <ol className="flex min-w-0 items-center gap-1 text-[12px] sm:text-[13px]">
          <li className="hidden shrink-0 font-semibold tracking-[-0.02em] text-foreground sm:block">AnyWorkflow</li>
          <li className="hidden shrink-0 text-muted-foreground sm:block"><ChevronRight className="size-3.5" /></li>
          {crumbs.map((crumb, index) => {
            const current = index === crumbs.length - 1
            return (
              <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1">
                {index > 0 ? <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/70" aria-hidden="true" /> : null}
                {crumb.to && !current ? (
                  <Link to={crumb.to} className="max-w-[32vw] truncate rounded px-1 py-1 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 sm:max-w-[260px]">
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    aria-current={current ? 'page' : undefined}
                    className="max-w-[44vw] truncate px-1 py-1 font-medium text-foreground sm:max-w-[360px]"
                  >
                    {crumb.label}
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      </nav>

      <span className="flex shrink-0 items-center gap-1.5 px-1 text-[11px] text-muted-foreground" title={session ? '已连接' : '未连接'}>
        <span className={session ? 'size-2 rounded-full bg-success' : 'size-2 rounded-full bg-muted-foreground/35'} aria-hidden="true" />
        <span className="hidden sm:inline">{session ? '已连接' : '未连接'}</span>
      </span>
    </header>
  )
}
