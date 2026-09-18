import { NavLink, Outlet, useLocation } from 'react-router'
import { useSession } from '../lib/session'

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive ? 'nav-link nav-link-active' : 'nav-link'
}

export function AppShell() {
  const session = useSession()
  const location = useLocation()

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">A</div>
          <div className="brand-copy">
            <strong>AnyWorkflow</strong>
            <span>Remote</span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="主导航">
          <NavLink to="/" end className={navClass}>
            <span className="nav-icon">⌂</span>
            <span>工作流</span>
          </NavLink>
          <NavLink to="/runs/new" className={navClass}>
            <span className="nav-icon">＋</span>
            <span>新建 Run</span>
          </NavLink>
          <NavLink to="/settings" className={navClass}>
            <span className="nav-icon">⚙</span>
            <span>连接设置</span>
          </NavLink>
        </nav>

        <div className="sidebar-account">
          <div className={session ? 'connection-dot connection-online' : 'connection-dot'} />
          <div>
            <strong>{session?.record.name || session?.record.email || '未连接'}</strong>
            <span>{session ? 'PocketBase 已连接' : '请先登录 AnyWorkflow'}</span>
          </div>
        </div>
      </aside>

      <main className="main-panel">
        <div className="mobile-topbar">
          <div className="brand compact">
            <div className="brand-mark">A</div>
            <strong>AnyWorkflow</strong>
          </div>
          <span className={session ? 'mobile-status online' : 'mobile-status'}>
            {session ? '已连接' : '未连接'}
          </span>
        </div>

        <div className="content-shell" key={location.pathname}>
          <Outlet />
        </div>
      </main>

      <nav className="mobile-nav" aria-label="移动端导航">
        <NavLink to="/" end className={navClass}>
          <span className="nav-icon">⌂</span>
          <span>工作流</span>
        </NavLink>
        <NavLink to="/runs/new" className={navClass}>
          <span className="nav-icon">＋</span>
          <span>新建</span>
        </NavLink>
        <NavLink to="/settings" className={navClass}>
          <span className="nav-icon">⚙</span>
          <span>设置</span>
        </NavLink>
      </nav>
    </div>
  )
}
