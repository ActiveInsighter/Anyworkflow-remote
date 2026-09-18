import { House } from 'lucide-react'
import { BrowserRouter, Link, Route, Routes } from 'react-router'
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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="runs/new" element={<RunEditorPage />} />
          <Route path="runs/:runId/edit" element={<RunEditorPage />} />
          <Route path="runs/:runId" element={<RunDetailPage />} />
          <Route path="tasks/:taskId" element={<TaskDetailPage />} />
          <Route path="events/:eventId" element={<EventDetailPage />} />
          <Route path="library" element={<LibraryPage />} />
          <Route path="templates/:templateId" element={<TemplateDetailPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
