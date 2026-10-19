import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import { createBrowserRouter, type RouteObject } from 'react-router'
import { isChunkLoadError, reloadForNewBuild } from '@/lib/platform/chunk-reload'
import { AppShell } from './layout/app-shell'
import type { RouteHandle } from './route-handle'
import { NotFoundPage } from './routes/not-found-page'
import { RequireSession } from './routes/require-session'
import { RouteErrorPage } from './routes/route-error-page'
import { RouteFallback } from './routes/route-fallback'

/**
 * Code-split a named page export. A chunk removed by a newer deploy reloads the document instead
 * of failing; the pending promise keeps the Suspense fallback on screen until the reload lands.
 */
function page<K extends string>(
  load: () => Promise<Record<K, ComponentType>>,
  name: K,
): LazyExoticComponent<ComponentType> {
  return lazy(() =>
    load().then(
      (module) => ({ default: module[name] }),
      (error: unknown) => {
        if (isChunkLoadError(error) && reloadForNewBuild()) return new Promise<never>(() => {})
        throw error
      },
    ),
  )
}

const DashboardPage = page(() => import('@/pages/dashboard-page'), 'DashboardPage')
const RunDetailPage = page(() => import('@/pages/run-detail-page'), 'RunDetailPage')
const RunEditorPage = page(() => import('@/pages/run-editor-page'), 'RunEditorPage')
const TaskRedirectPage = page(() => import('@/pages/task-redirect-page'), 'TaskRedirectPage')
const EventRedirectPage = page(() => import('@/pages/event-redirect-page'), 'EventRedirectPage')
const SchedulesPage = page(() => import('@/pages/schedules-page'), 'SchedulesPage')
const LibraryPage = page(() => import('@/pages/library-page'), 'LibraryPage')
const TemplateDetailPage = page(() => import('@/pages/template-detail-page'), 'TemplateDetailPage')
const FileConverterPage = page(() => import('@/pages/file-converter-page'), 'FileConverterPage')
const RuntimeSettingsPage = page(() => import('@/pages/settings-detail-page'), 'RuntimeSettingsPage')
const SettingsDetailPage = page(() => import('@/pages/settings-detail-page'), 'SettingsDetailPage')
const SettingsPage = page(() => import('@/pages/settings-page'), 'SettingsPage')

const editorHandle: RouteHandle = { workspace: true }

function route(path: string, Page: LazyExoticComponent<ComponentType>, extra: Partial<RouteObject> = {}): RouteObject {
  const label = extra.handle === editorHandle ? '加载编辑器…' : undefined
  return {
    path,
    element: (
      <RouteFallback label={label}>
        <Page />
      </RouteFallback>
    ),
    ...extra,
  } as RouteObject
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        // Page errors render inside the shell, so navigation stays usable.
        errorElement: <RouteErrorPage />,
        children: [
          {
            element: <RequireSession />,
            children: [
              {
                index: true,
                element: (
                  <RouteFallback>
                    <DashboardPage />
                  </RouteFallback>
                ),
              },
              route('runs/new', RunEditorPage, { handle: editorHandle }),
              route('runs/:runId/edit', RunEditorPage, { handle: editorHandle }),
              route('runs/:runId', RunDetailPage),
              // Legacy deep links: Task and Event detail now live inside the Run hierarchy.
              route('tasks/:taskId', TaskRedirectPage),
              route('events/:eventId', EventRedirectPage),
              route('schedules', SchedulesPage),
              route('library', LibraryPage),
              route('templates/:templateId', TemplateDetailPage),
              route('file-converter', FileConverterPage),
              route('pdf-to-md', FileConverterPage),
            ],
          },
          route('settings', SettingsPage),
          route('settings/runtime/:pageId?', RuntimeSettingsPage),
          route('settings/:section', SettingsDetailPage),
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
])
