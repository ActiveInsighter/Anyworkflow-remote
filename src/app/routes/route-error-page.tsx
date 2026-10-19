import { CloudDownload, RotateCcw, TriangleAlert } from 'lucide-react'
import { isRouteErrorResponse, useRouteError } from 'react-router'
import { EmptyState } from '@/components/feedback/empty-state'
import { Page } from '@/components/layout/page'
import { Button } from '@/components/ui/button'
import { isChunkLoadError } from '@/lib/platform/chunk-reload'

function errorText(error: unknown): string {
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}`.trim()
  if (error instanceof Error) return error.message
  return ''
}

/** Route-level failure inside the app shell. A stale build asks for a refresh instead of a stack trace. */
export function RouteErrorPage() {
  const error = useRouteError()
  const staleBuild = isChunkLoadError(error)
  const reload = (
    <Button onClick={() => window.location.reload()}>
      <RotateCcw data-icon="inline-start" />
      刷新页面
    </Button>
  )

  return (
    <Page>
      {staleBuild ? (
        <EmptyState icon={CloudDownload} title="已发布新版本" description="刷新后即可继续使用。" action={reload} />
      ) : (
        <EmptyState icon={TriangleAlert} title="页面加载失败" description={errorText(error) || undefined} action={reload} />
      )}
    </Page>
  )
}
