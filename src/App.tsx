import { BrowserRouter, Link, Route, Routes } from 'react-router'
import { AppShell } from './components/AppShell'
import { DashboardPage } from './pages/DashboardPage'
import { EventDetailPage } from './pages/EventDetailPage'
import { RunDetailPage } from './pages/RunDetailPage'
import { RunEditorPage } from './pages/RunEditorPage'
import { SettingsPage } from './pages/SettingsPage'
import { TaskDetailPage } from './pages/TaskDetailPage'
import { Button, Card } from './components/ui'

function NotFoundPage() {
  return (
    <Card className="empty-state">
      <div className="empty-symbol">404</div>
      <h2>页面不存在</h2>
      <p>这个地址没有对应的 AnyWorkflow 页面。</p>
      <Button variant="primary" asChild><Link to="/">返回工作流</Link></Button>
    </Card>
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
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
