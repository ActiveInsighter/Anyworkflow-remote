import { House } from 'lucide-react'
import { createBrowserRouter, Link, RouterProvider } from 'react-router'
import { AppShell } from '@/components/AppShell'
import { AppPage, EmptyState } from '@/components/app/ui'
import { Button } from '@/components/ui/button'
import { DashboardPage } from '@/pages/DashboardPage'
import { EventDetailPage } from '@/pages/EventDetailPage'
import { LibraryPage } from '@/pages/LibraryPage'
import { TemplateDetailPage } from '@/pages/TemplateDetailPage'
import { RunDetailPage } from '@/pages/RunDetailPage'
import { RunEditorPage } from '@/pages/RunEditorPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { TaskDetailPage } from '@/pages/TaskDetailPage'

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

/** Central route tree keeps deep links and parent navigation deterministic across desktop and mobile. */
const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'runs/new', element: <RunEditorPage /> },
      { path: 'runs/:runId/edit', element: <RunEditorPage /> },
      { path: 'runs/:runId', element: <RunDetailPage /> },
      { path: 'tasks/:taskId', element: <TaskDetailPage /> },
      { path: 'events/:eventId', element: <EventDetailPage /> },
      { path: 'library', element: <LibraryPage /> },
      { path: 'templates/:templateId', element: <TemplateDetailPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
