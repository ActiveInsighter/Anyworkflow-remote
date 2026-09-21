import { lazy, Suspense, type ReactNode } from 'react'
import { House } from 'lucide-react'
import { createBrowserRouter, Link, Outlet, RouterProvider } from 'react-router'
import { AppShell } from '@/components/AppShell'
import { AppPage, EmptyState, LoadingState } from '@/components/app/ui'
import { Button } from '@/components/ui/button'
import { useSession } from '@/lib/session'

const DashboardPage = lazy(() => import('@/pages/DashboardPage').then(({ DashboardPage: page }) => ({ default: page })))
const EventDetailPage = lazy(() => import('@/pages/EventDetailPage').then(({ EventDetailPage: page }) => ({ default: page })))
const LibraryPage = lazy(() => import('@/pages/LibraryPage').then(({ LibraryPage: page }) => ({ default: page })))
const TemplateDetailPage = lazy(() => import('@/pages/TemplateDetailPage').then(({ TemplateDetailPage: page }) => ({ default: page })))
const RunDetailPage = lazy(() => import('@/pages/RunDetailPage').then(({ RunDetailPage: page }) => ({ default: page })))
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then(({ SettingsPage: page }) => ({ default: page })))
const TaskDetailPage = lazy(() => import('@/pages/TaskDetailPage').then(({ TaskDetailPage: page }) => ({ default: page })))

const RunEditorPage = lazy(() => import('@/pages/RunEditorPage').then(({ RunEditorPage: page }) => ({ default: page })))

function PageRoute({ children, label = '加载页面…' }: { children: ReactNode; label?: string }) {
  return (
    <Suspense fallback={<AppPage><LoadingState label={label} /></AppPage>}>
      {children}
    </Suspense>
  )
}

function RequireSession() {
  const session = useSession()
  if (session) return <Outlet key={session.record.id} />

  return (
    <AppPage>
      <EmptyState
        title="未连接"
        description="连接 AnyWorkflow 后即可访问工作流与资料库。"
        action={<Button asChild variant="secondary"><Link to="/settings">设置连接</Link></Button>}
      />
    </AppPage>
  )
}

function NotFoundPage() {
  return (
    <AppPage>
      <EmptyState
        title="页面不存在"
        description="这个地址没有对应的页面，可能已被移动或删除。"
        action={<Button asChild><Link to="/"><House />返回工作流</Link></Button>}
      />
    </AppPage>
  )
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      {
        element: <RequireSession />,
        children: [
          { index: true, element: <PageRoute><DashboardPage /></PageRoute> },
          { path: 'runs/new', element: <PageRoute label="加载编辑器…"><RunEditorPage /></PageRoute> },
          { path: 'runs/:runId/edit', element: <PageRoute label="加载编辑器…"><RunEditorPage /></PageRoute> },
          { path: 'runs/:runId', element: <PageRoute><RunDetailPage /></PageRoute> },
          { path: 'tasks/:taskId', element: <PageRoute><TaskDetailPage /></PageRoute> },
          { path: 'events/:eventId', element: <PageRoute><EventDetailPage /></PageRoute> },
          { path: 'library', element: <PageRoute><LibraryPage /></PageRoute> },
          { path: 'templates/:templateId', element: <PageRoute><TemplateDetailPage /></PageRoute> },
        ],
      },
      { path: 'settings', element: <PageRoute><SettingsPage /></PageRoute> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
