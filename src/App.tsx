import { House } from 'lucide-react'
import { createBrowserRouter, Link, Outlet, RouterProvider } from 'react-router'
import { AppShell } from '@/components/AppShell'
import { AppPage, EmptyState } from '@/components/app/ui'
import { Button } from '@/components/ui/button'
import { useSession } from '@/lib/session'
import { DashboardPage } from '@/pages/DashboardPage'
import { EventDetailPage } from '@/pages/EventDetailPage'
import { LibraryPage } from '@/pages/LibraryPage'
import { TemplateDetailPage } from '@/pages/TemplateDetailPage'
import { RunDetailPage } from '@/pages/RunDetailPage'
import { RunEditorPage } from '@/pages/RunEditorPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { TaskDetailPage } from '@/pages/TaskDetailPage'

function RequireSession() {
  const session = useSession()
  if (session) return <Outlet />

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
          { index: true, element: <DashboardPage /> },
          { path: 'runs/new', element: <RunEditorPage /> },
          { path: 'runs/:runId/edit', element: <RunEditorPage /> },
          { path: 'runs/:runId', element: <RunDetailPage /> },
          { path: 'tasks/:taskId', element: <TaskDetailPage /> },
          { path: 'events/:eventId', element: <EventDetailPage /> },
          { path: 'library', element: <LibraryPage /> },
          { path: 'templates/:templateId', element: <TemplateDetailPage /> },
        ],
      },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
